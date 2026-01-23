// ===============================
// VISIO - SCRIPT.JS (PART 1)
// Mode + Room + Max Users + Firebase + Peer Setup
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
let CURRENT_ROOM = "";
let MAX_USERS = 0;

let localStream, peer, myPeerId;
let DISPLAY_NAME = "";

const connections = {};
const userNames = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

// UI
const joinScreen = document.getElementById("join-screen");
const roomScreen = document.getElementById("room-screen");
const mainApp = document.getElementById("main-app");

const roomNameInput = document.getElementById("room-name");
const maxUsersInput = document.getElementById("max-users");
const selectedModeTitle = document.getElementById("selected-mode-title");

const localVideo = document.getElementById("local-video");
const videoGrid = document.getElementById("video-grid");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const micToggle = document.getElementById("mic-toggle");
const videoToggle = document.getElementById("video-toggle");
const leaveCall = document.getElementById("leave-call");
const onlineUsersList = document.getElementById("online-users-list");
const fileInput = document.getElementById("file-input");
const fileBtn = document.getElementById("file-btn");

// ---------- USERNAME ----------
function getValidUsername() {
    const regex = /^[A-Za-z0-9]+( [A-Za-z0-9]+)?$/;
    while (true) {
        let name = prompt("Enter your name (max 15 chars, letters & numbers, one space allowed):");
        if (!name) continue;
        name = name.trim();
        if (name.length <= 15 && regex.test(name)) return name;
        alert("Invalid name format!");
    }
}

// ---------- MODE ----------
function selectMode(mode) {
    CURRENT_MODE = mode;
    joinScreen.style.display = "none";
    roomScreen.style.display = "flex";

    selectedModeTitle.innerText =
        mode === "text" ? "Text Only Room" :
        mode === "video" ? "Video Only Room" :
        "Video + Text Room";
}

// ---------- BACK TO MODE ----------
function goBackToMode() {
    roomScreen.style.display = "none";
    joinScreen.style.display = "flex";
}

// ---------- ROOM CREATE / JOIN ----------
function createRoom() { startRoom(true); }
function joinRoom() { startRoom(false); }

function startRoom(isCreate) {
    CURRENT_ROOM = roomNameInput.value.trim();
    MAX_USERS = parseInt(maxUsersInput.value);

    if (!CURRENT_ROOM || CURRENT_ROOM.length < 3) {
        alert("Enter valid room name (min 3 characters)");
        return;
    }
    if (!MAX_USERS || MAX_USERS < 2 || MAX_USERS > 20) {
        alert("Max users must be between 2 and 20");
        return;
    }

    roomScreen.style.display = "none";
    mainApp.style.display = "block";

    initializeApp(isCreate);
}

// ---------- INITIALIZE ----------
async function initializeApp(isCreate) {
    DISPLAY_NAME = getValidUsername();

    if (CURRENT_MODE !== "text") {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.play();
    } else {
        videoGrid.style.display = "none";
        micToggle.style.display = "none";
        videoToggle.style.display = "none";
    }

    if (CURRENT_MODE === "video") {
        messagesContainer.style.display = "none";
        messageForm.style.display = "none";
    }

    myPeerId = "visio_" + Math.random().toString(36).substr(2, 9);
    peer = new Peer(myPeerId);

    const roomRef = database.ref("rooms/" + CURRENT_ROOM);

    peer.on("open", id => {
        roomRef.once("value", snap => {
            if (snap.exists()) {
                const data = snap.val();
                if (data.mode !== CURRENT_MODE) {
                    alert("This room is for another mode!");
                    return location.reload();
                }
                if (Object.keys(data.users || {}).length >= data.maxUsers) {
                    alert("Room is full!");
                    return location.reload();
                }
            } else {
                if (!isCreate) {
                    alert("Room not found!");
                    return location.reload();
                }
                roomRef.set({
                    mode: CURRENT_MODE,
                    maxUsers: MAX_USERS
                });
            }

            roomRef.child("users/" + id).set({
                name: DISPLAY_NAME,
                peerId: id
            });

            roomRef.child("users").on("child_added", snap => {
                const user = snap.val();
                userNames[user.peerId] = user.name;
                addOnlineUser(user.peerId, user.name);

                if (user.peerId !== id) {
                    connectToPeer(user.peerId);
                    if (CURRENT_MODE !== "text") callPeer(user.peerId);
                }
            });
        });
    });

    peer.on("call", call => {
        if (CURRENT_MODE === "text") return;
        call.answer(localStream);
        call.on("stream", stream => addVideoStream(call.peer, stream));
    });

    peer.on("connection", setupDataConnection);
}
// ===============================
// VISIO - SCRIPT.JS (PART 2)
// Video + Chat + Files + Media Status + Exit
// ===============================

// ---------- PEER CONNECTION ----------
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
            displayMessage("System", `${data.sender} sending ${data.name}`, false);
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

// ---------- VIDEO GRID ----------
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
    name.innerText = userNames[id];

    const status = document.createElement("div");
    status.className = "media-status";
    status.id = "status-" + id;

    wrapper.append(video, name, status);
    videoGrid.appendChild(wrapper);
}

function updateMediaStatus(id, mic, cam) {
    const el = document.getElementById("status-" + id);
    if (!el) return;
    el.innerText = (!mic ? "🔇 " : "") + (!cam ? "🚫" : "");
}

function removeVideoStream(id) {
    const el = document.getElementById("wrap-" + id);
    if (el) el.remove();
}

// ---------- CHAT UI ----------
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

// ---------- ONLINE USERS ----------
function addOnlineUser(id, name) {
    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;
    onlineUsersList.appendChild(p);
}

function removeOnlineUser(id) {
    const el = document.getElementById("user-" + id);
    if (el) el.remove();
}

// ---------- EXIT ----------
function leaveRoom() {
    if (peer) peer.destroy();
    location.reload();
}

leaveCall.onclick = leaveRoom;
