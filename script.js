// ===============================
// VISIO - SCRIPT.JS (PART 1)
// Room System + Creator + Mode Lock + Firebase
// ===============================

const firebaseConfig = {
    apiKey: "AIzaSyDkrzN0604XsYRipUbPF9iiLXy8aaOji3o",
    authDomain: "dhananjay-chat-app.firebaseapp.com",
    databaseURL: "https://dhananjay-chat-app-default-rtdb.firebaseio.com",
    projectId: "dhananjay-chat-app",
    storageBucket: "dhananjay-chat-app.firebasestorage.app",
    messagingSenderId: "319061629483",
    appId: "1:319061629483:web:6c2d52351a764662a6286e"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let CURRENT_MODE = "";
let ROOM_NAME = "";
let ROOM_ID = "";
let MAX_USERS = 0;
let DISPLAY_NAME = "";
let CREATOR_ID = "";
let peer, myPeerId, localStream;

const connections = {};
const userNames = {};

// UI
const joinScreen = document.getElementById("join-screen");
const actionScreen = document.getElementById("action-screen");
const createScreen = document.getElementById("create-screen");
const joinRoomScreen = document.getElementById("join-room-screen");
const mainApp = document.getElementById("main-app");
const onlineUsersList = document.getElementById("online-users-list");

// Inputs
const roomNameInput = document.getElementById("room-name");
const roomIdInput = document.getElementById("room-id");
const maxUsersInput = document.getElementById("max-users");
const joinRoomIdInput = document.getElementById("join-room-id");
const modeTitle = document.getElementById("mode-title");

// ---------- USERNAME ----------
function getValidUsername() {
    const regex = /^[A-Za-z0-9 ]{1,15}$/;
    while (true) {
        let name = prompt("Enter your name (max 15 characters):");
        if (!name) continue;
        name = name.trim();
        if (regex.test(name)) return name;
        alert("Invalid name!");
    }
}

// ---------- MODE ----------
function selectMode(mode) {
    CURRENT_MODE = mode;
    joinScreen.style.display = "none";
    actionScreen.style.display = "flex";

    modeTitle.innerText =
        mode === "text" ? "Text Chat Mode" :
        mode === "video" ? "Video Call Mode" :
        "Video + Text Mode";
}

// ---------- UI FLOW ----------
function showCreate() {
    actionScreen.style.display = "none";
    createScreen.style.display = "flex";
}

function showJoin() {
    actionScreen.style.display = "none";
    joinRoomScreen.style.display = "flex";
}

function backToMode() {
    actionScreen.style.display = "none";
    joinScreen.style.display = "flex";
}

function backToAction() {
    createScreen.style.display = "none";
    joinRoomScreen.style.display = "none";
    actionScreen.style.display = "flex";
}

// ---------- CREATE ROOM ----------
function createRoom() {
    ROOM_NAME = roomNameInput.value.trim();
    ROOM_ID = roomIdInput.value.trim();
    MAX_USERS = parseInt(maxUsersInput.value);

    if (!ROOM_NAME || ROOM_NAME.length < 3) return alert("Room name min 3 chars");
    if (!ROOM_ID || !/^[A-Za-z0-9]+$/.test(ROOM_ID)) return alert("Room ID only letters & numbers");
    if (!MAX_USERS || MAX_USERS < 2 || MAX_USERS > 20) return alert("Max users 2 to 20");

    startRoom(true);
}

// ---------- JOIN ROOM ----------
function joinRoom() {
    ROOM_ID = joinRoomIdInput.value.trim();
    if (!ROOM_ID || !/^[A-Za-z0-9]+$/.test(ROOM_ID)) return alert("Enter valid Room ID");

    startRoom(false);
}

// ---------- START ROOM ----------
function startRoom(isCreate) {
    DISPLAY_NAME = getValidUsername();

    createScreen.style.display = "none";
    joinRoomScreen.style.display = "none";
    actionScreen.style.display = "none";
    mainApp.style.display = "block";

    myPeerId = "visio_" + Math.random().toString(36).substr(2, 9);
    peer = new Peer(myPeerId);

    const roomRef = database.ref("rooms/" + ROOM_ID);

    peer.on("open", id => {
        roomRef.once("value", snap => {

            if (snap.exists()) {
                const data = snap.val();

                if (data.mode !== CURRENT_MODE) {
                    alert("This room is for another mode!");
                    location.reload();
                    return;
                }

                if (Object.keys(data.users || {}).length >= data.maxUsers) {
                    alert("Room Full!");
                    location.reload();
                    return;
                }

            } else {
                if (!isCreate) {
                    alert("Room not found!");
                    location.reload();
                    return;
                }

                CREATOR_ID = id;

                roomRef.set({
                    roomName: ROOM_NAME,
                    roomId: ROOM_ID,
                    mode: CURRENT_MODE,
                    maxUsers: MAX_USERS,
                    creator: DISPLAY_NAME,
                    creatorId: id
                });
            }

            roomRef.child("users/" + id).set({
                name: DISPLAY_NAME,
                peerId: id,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            });

            roomRef.child("users/" + id).onDisconnect().remove();

            roomRef.child("users").on("value", snap => {
                onlineUsersList.innerHTML = "";
                const users = snap.val() || {};

                Object.values(users).forEach(u => {
                    userNames[u.peerId] = u.name;
                    addOnlineUser(u.peerId, u.name);
                });
            });

        });
    });
}
// ===============================
// VISIO - SCRIPT.JS (PART 2)
// Media Setup + Mode Isolation + Peer Calls
// ===============================

const videoGrid = document.getElementById("video-grid");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const micToggle = document.getElementById("mic-toggle");
const videoToggle = document.getElementById("video-toggle");
const leaveCall = document.getElementById("leave-call");
const fileInput = document.getElementById("file-input");
const fileBtn = document.getElementById("file-btn");

// ---------- MEDIA INIT ----------
async function initMedia() {
    if (CURRENT_MODE === "text") {
        document.body.classList.add("text-only");
        return;
    }

    document.body.classList.add(CURRENT_MODE === "video" ? "video-only" : "both-mode");

    localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: { echoCancellation: true, noiseSuppression: true }
    });

    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    await localVideo.play();
}

// ---------- PEER CALL ----------
function callPeer(peerId) {
    if (connections[peerId]?.media) return;

    const call = peer.call(peerId, localStream);
    connections[peerId] = connections[peerId] || {};
    connections[peerId].media = call;

    call.on("stream", stream => addVideoStream(peerId, stream));
}

// ---------- CONNECT DATA ----------
function connectToPeer(peerId) {
    if (connections[peerId]?.data) return;

    const conn = peer.connect(peerId, { reliable: true });
    connections[peerId] = connections[peerId] || {};
    connections[peerId].data = conn;

    setupDataConnection(conn);
}

// ---------- INCOMING CALL ----------
peer?.on("call", call => {
    if (CURRENT_MODE === "text") return;

    call.answer(localStream);
    call.on("stream", stream => addVideoStream(call.peer, stream));
});

// ---------- VIDEO UI ----------
function addVideoStream(id, stream) {
    if (document.getElementById("wrap-" + id)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";
    wrapper.id = "wrap-" + id;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    const name = document.createElement("div");
    name.className = "name-label";
    name.innerText = userNames[id] || "User";

    const status = document.createElement("div");
    status.className = "media-status";
    status.id = "status-" + id;

    wrapper.append(video, name, status);
    videoGrid.appendChild(wrapper);
}

// ---------- MIC & CAMERA ----------
function broadcastStatus() {
    if (!localStream) return;

    const mic = localStream.getAudioTracks()[0].enabled;
    const cam = localStream.getVideoTracks()[0].enabled;

    Object.values(connections).forEach(c =>
        c.data?.send({ type: "media_status", peerId: myPeerId, mic, cam })
    );
}

micToggle.onclick = () => {
    localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
    broadcastStatus();
};

videoToggle.onclick = () => {
    localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
    broadcastStatus();
};

// ---------- USER LIST ----------
function addOnlineUser(id, name) {
    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;
    onlineUsersList.appendChild(p);
}
// ===============================
// VISIO - SCRIPT.JS (PART 3)
// Chat + Files + Room Info + Creator + Exit
// ===============================

const onlineUsersList = document.getElementById("online-users-list");
const roomInfoBar = document.createElement("div");
roomInfoBar.className = "room-info-bar";
document.getElementById("main-app").prepend(roomInfoBar);

const receivedFiles = {};
const CHUNK_SIZE = 16000;

// ---------- ROOM INFO ----------
function showRoomInfo(roomName, roomId, creator) {
    roomInfoBar.innerHTML = `
        <span>Room: ${roomName}</span>
        <span>ID: ${roomId}</span>
        <span>Host: ${creator} <span class="creator-badge">Creator</span></span>
    `;
}

// ---------- DATA CHANNEL ----------
function setupDataConnection(conn) {
    conn.on("data", data => {

        if (data.type === "chat" && CURRENT_MODE !== "video") {
            displayMessage(data.user, data.text, false);
        }

        if (data.type === "image") {
            displayMessage(data.user, data.dataURL, false);
        }

        if (data.type === "file_meta") {
            receivedFiles[data.peerId] = { ...data, chunks: [], received: 0 };
            displayMessage("System", `${data.sender} is sending ${data.name}`, false);
        }

        if (data.type === "file_chunk") {
            const file = receivedFiles[data.peerId];
            file.chunks.push(data.chunk);
            file.received += data.chunk.byteLength;

            if (file.received >= file.size) {
                const blob = new Blob(file.chunks, { type: file.mime });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = file.name;
                a.textContent = "⬇ Download " + file.name;
                a.style.color = "#38bdf8";

                messagesContainer.appendChild(a);
                delete receivedFiles[data.peerId];
            }
        }

        if (data.type === "media_status") {
            updateMediaStatus(data.peerId, data.mic, data.cam);
        }
    });
}

// ---------- CHAT ----------
function displayMessage(user, text, mine) {
    const div = document.createElement("div");
    div.className = mine ? "my-message" : "remote-message";

    if (typeof text === "string" && text.startsWith("data:image")) {
        const img = document.createElement("img");
        img.src = text;
        img.style.maxWidth = "200px";
        img.style.borderRadius = "8px";
        div.innerHTML = `<b>${user}</b><br>`;
        div.appendChild(img);
    } else {
        div.innerHTML = `<b>${user}</b>: ${text}`;
    }

    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

messageForm.onsubmit = e => {
    e.preventDefault();
    if (CURRENT_MODE === "video") return;

    const msg = messageInput.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);

    Object.values(connections).forEach(c =>
        c.data?.send({ type: "chat", user: DISPLAY_NAME, text: msg })
    );

    messageInput.value = "";
};

// ---------- FILE SEND ----------
fileBtn.onclick = () => fileInput.click();

fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = e => {
            Object.values(connections).forEach(c =>
                c.data?.send({ type: "image", user: DISPLAY_NAME, dataURL: e.target.result })
            );
            displayMessage(DISPLAY_NAME, e.target.result, true);
        };
        reader.readAsDataURL(file);
    }

    const meta = {
        type: "file_meta",
        name: file.name,
        size: file.size,
        mime: file.type,
        sender: DISPLAY_NAME,
        peerId: myPeerId
    };

    Object.values(connections).forEach(c => c.data?.send(meta));

    const reader = new FileReader();
    let offset = 0;

    reader.onload = e => {
        Object.values(connections).forEach(c =>
            c.data?.send({ type: "file_chunk", peerId: myPeerId, chunk: e.target.result })
        );
        offset += e.target.result.byteLength;
        if (offset < file.size) readNextChunk();
    };

    function readNextChunk() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }

    readNextChunk();
};

// ---------- EXIT ----------
function leaveRoom() {
    if (peer) peer.destroy();
    location.reload();
}

leaveCall.onclick = leaveRoom;
