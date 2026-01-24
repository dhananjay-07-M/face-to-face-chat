// ===============================
// VISIO - SCRIPT.JS (PART 1)
// Core Room + Mode + Firebase + Peer Setup (Glitch-Free)
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

// GLOBAL STATE
let CURRENT_MODE = "";
let ROOM_ID = "";
let ROOM_NAME = "";
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

const roomNameInput = document.getElementById("room-name");
const roomIdInput = document.getElementById("room-id");
const maxUsersInput = document.getElementById("max-users");
const joinRoomIdInput = document.getElementById("join-room-id");
const modeTitle = document.getElementById("mode-title");

// ---------- USERNAME ----------
function getValidUsername() {
    const regex = /^[A-Za-z0-9 ]{1,15}$/;
    while (true) {
        let name = prompt("Enter your name (max 15 chars):");
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
        mode === "text" ? "TEXT CHAT ROOM" :
        mode === "video" ? "VIDEO CALL ROOM" :
        "VIDEO + TEXT ROOM";
}

// ---------- SCREEN NAV ----------
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

// ---------- CREATE ----------
function createRoom() {
    ROOM_NAME = roomNameInput.value.trim();
    ROOM_ID = roomIdInput.value.trim();
    MAX_USERS = parseInt(maxUsersInput.value);

    const idRegex = /^[A-Za-z0-9]+$/;

    if (!ROOM_NAME || ROOM_NAME.length < 3) return alert("Room name too short");
    if (!ROOM_ID || !idRegex.test(ROOM_ID)) return alert("Room ID only letters & numbers");
    if (!MAX_USERS || MAX_USERS < 2 || MAX_USERS > 20) return alert("Max users 2-20");

    startRoom(true);
}

// ---------- JOIN ----------
function joinRoom() {
    ROOM_ID = joinRoomIdInput.value.trim();
    const idRegex = /^[A-Za-z0-9]+$/;

    if (!ROOM_ID || !idRegex.test(ROOM_ID)) return alert("Invalid Room ID");

    startRoom(false);
}

// ---------- START ROOM ----------
function startRoom(isCreator) {
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
                    alert("Room mode mismatch!");
                    location.reload();
                    return;
                }

                if (Object.keys(data.users || {}).length >= data.maxUsers) {
                    alert("Room Full!");
                    location.reload();
                    return;
                }

                CREATOR_ID = data.creator;
                ROOM_NAME = data.roomName;
                MAX_USERS = data.maxUsers;

            } else {
                if (!isCreator) {
                    alert("Room not found!");
                    location.reload();
                    return;
                }

                CREATOR_ID = id;

                roomRef.set({
                    roomId: ROOM_ID,
                    roomName: ROOM_NAME,
                    mode: CURRENT_MODE,
                    maxUsers: MAX_USERS,
                    creator: id
                });
            }

            roomRef.child("users/" + id).set({
                name: DISPLAY_NAME,
                peerId: id
            });

            roomRef.child("users/" + id).onDisconnect().remove();

            roomRef.child("users").on("child_added", snap => {
                const user = snap.val();
                userNames[user.peerId] = user.name;

                if (user.peerId !== id) {
                    connectToPeer(user.peerId);
                    if (CURRENT_MODE !== "text") callPeer(user.peerId);
                }
            });

            setupRoomHeader();
        });
    });

    if (CURRENT_MODE !== "text") {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            localStream = stream;
            document.getElementById("local-video").srcObject = stream;
        });
    }

    peer.on("call", call => {
        if (CURRENT_MODE === "text") return;
        call.answer(localStream);
        call.on("stream", stream => addVideoStream(call.peer, stream));
    });

    peer.on("connection", setupDataConnection);
}

// ---------- ROOM HEADER ----------
function setupRoomHeader() {
    const bar = document.createElement("div");
    bar.className = "room-info-bar";
    bar.innerHTML = `
        <span>Room: ${ROOM_NAME}</span>
        <span>ID: ${ROOM_ID}</span>
        <span>${myPeerId === CREATOR_ID ? "👑 Creator" : "Member"}</span>
    `;
    document.body.insertBefore(bar, document.getElementById("app-container"));
}
// ===============================
// VISIO - SCRIPT.JS (PART 2)
// Video, Audio, Online Users, Mode UI Control
// ===============================

const videoGrid = document.getElementById("video-grid");
const onlineUsersList = document.getElementById("online-users-list");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const micToggle = document.getElementById("mic-toggle");
const videoToggle = document.getElementById("video-toggle");
const leaveCall = document.getElementById("leave-call");

function applyModeUI() {
    document.body.classList.remove("text-only", "video-only");

    if (CURRENT_MODE === "text") {
        document.body.classList.add("text-only");
    }
    if (CURRENT_MODE === "video") {
        document.body.classList.add("video-only");
    }
}

// ---------- VIDEO STREAM ----------
function addVideoStream(peerId, stream) {
    if (document.getElementById("wrap-" + peerId)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";
    wrapper.id = "wrap-" + peerId;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    const name = document.createElement("div");
    name.className = "name-label";
    name.innerText = userNames[peerId] || "User";

    const status = document.createElement("div");
    status.className = "media-status";
    status.id = "status-" + peerId;

    wrapper.append(video, name, status);
    videoGrid.appendChild(wrapper);
}

// ---------- MEDIA TOGGLES ----------
function broadcastStatus() {
    if (!localStream) return;

    const mic = localStream.getAudioTracks()[0].enabled;
    const cam = localStream.getVideoTracks()[0].enabled;

    Object.values(connections).forEach(c => {
        c.data?.send({
            type: "media_status",
            peerId: myPeerId,
            mic,
            cam
        });
    });
}

micToggle.onclick = () => {
    localStream.getAudioTracks()[0].enabled =
        !localStream.getAudioTracks()[0].enabled;
    broadcastStatus();
};

videoToggle.onclick = () => {
    localStream.getVideoTracks()[0].enabled =
        !localStream.getVideoTracks()[0].enabled;
    broadcastStatus();
};

// ---------- ONLINE USERS ----------
function addOnlineUser(id, name) {
    if (document.getElementById("user-" + id)) return;

    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;
    onlineUsersList.appendChild(p);
}

function removeOnlineUser(id) {
    const el = document.getElementById("user-" + id);
    if (el) el.remove();
}

// ---------- CONNECTION HANDLERS ----------
function callPeer(id) {
    if (connections[id]?.media) return;

    const call = peer.call(id, localStream);
    connections[id] = { media: call };

    call.on("stream", stream => addVideoStream(id, stream));
}

function connectToPeer(id) {
    if (connections[id]?.data) return;

    const conn = peer.connect(id, { reliable: true });
    connections[id] = { ...connections[id], data: conn };
    setupDataConnection(conn);
}

// ---------- EXIT ----------
function leaveRoom() {
    if (peer) peer.destroy();
    location.reload();
}

leaveCall.onclick = leaveRoom;
// ===============================
// VISIO - SCRIPT.JS (PART 3)
// Chat, Files, Camera Switch, Media Status Sync
// ===============================

const fileInput = document.getElementById("file-input");
const fileBtn = document.getElementById("file-btn");

const receivedFiles = {};
const CHUNK_SIZE = 16000;

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
            displayMessage("System", `${data.sender} sent ${data.name}`, false);
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

// ---------- IMAGE & FILE SEND ----------
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

// ---------- CAMERA SWITCH (FRONT / BACK) ----------
let currentCamera = "user";

async function switchCamera() {
    if (!localStream) return;

    currentCamera = currentCamera === "user" ? "environment" : "user";

    const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentCamera },
        audio: true
    });

    localStream.getTracks().forEach(t => t.stop());
    localStream = newStream;

    document.getElementById("local-video").srcObject = newStream;

    Object.values(connections).forEach(c => {
        if (c.media) {
            const sender = c.media.peerConnection.getSenders()
                .find(s => s.track.kind === "video");
            sender.replaceTrack(newStream.getVideoTracks()[0]);
        }
    });
}
