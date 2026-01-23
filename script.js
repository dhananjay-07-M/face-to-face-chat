// ===============================
// FINAL SCRIPT.JS PART 1
// Join Mode + Video + Chat + Files + Status Sync
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

const ROOM_NAME = "Lobby";
const onlineUsersRef = database.ref("onlineUsers/" + ROOM_NAME);

const peerConfig = {
    config: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ]
    }
};

let localStream, peer, myPeerId;
let DISPLAY_NAME = "";
let JOIN_MODE = "both"; // text | video | both

const connections = {};
const userNames = {};
const userModes = {};
const userStatus = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

const joinScreen = document.getElementById("join-screen");
const mainApp = document.getElementById("main-app");

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

// ---------- USERNAME VALIDATION ----------
function getValidUsername() {
    const regex = /^[A-Za-z0-9]+( [A-Za-z0-9]+)?$/;
    while (true) {
        let name = prompt("Enter your name (letters, numbers, one space, max 15):");
        if (!name) continue;
        name = name.trim();
        if (name.length <= 15 && regex.test(name)) return name;
        alert("Invalid name format!");
    }
}

// ---------- MODE SELECTION ----------
function selectMode(mode) {
    JOIN_MODE = mode;
    document.body.classList.add(
        mode === "text" ? "text-only" :
        mode === "video" ? "video-only" : "both-mode"
    );

    joinScreen.style.display = "none";
    mainApp.style.display = "block";
    initializeApp();
}

// ---------- INITIALIZE ----------
async function initializeApp() {
    DISPLAY_NAME = getValidUsername();

    if (JOIN_MODE !== "text") {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.play();
    }

    myPeerId = "user_" + Math.random().toString(36).substr(2, 9);
    peer = new Peer(myPeerId, peerConfig);

    peer.on("open", id => {
        onlineUsersRef.child(id).set({
            name: DISPLAY_NAME,
            peerId: id,
            mode: JOIN_MODE,
            mic: true,
            cam: JOIN_MODE !== "text"
        });

        onlineUsersRef.child(id).onDisconnect().remove();

        onlineUsersRef.on("child_added", snap => {
            const user = snap.val();
            userNames[user.peerId] = user.name;
            userModes[user.peerId] = user.mode;
            userStatus[user.peerId] = { mic: user.mic, cam: user.cam };
            addOnlineUser(user.peerId, user.name, user.mode);

            if (user.peerId !== id && JOIN_MODE !== "text" && user.mode !== "text") {
                callPeer(user.peerId);
                connectToPeer(user.peerId);
            }
        });

        onlineUsersRef.on("child_changed", snap => {
            const u = snap.val();
            updateMediaStatus(u.peerId, u.mic, u.cam);
        });

        onlineUsersRef.on("child_removed", snap => {
            removeOnlineUser(snap.key);
            removeVideoStream(snap.key);
        });
    });

    peer.on("call", call => {
        if (JOIN_MODE === "text") return;
        call.answer(localStream);
        call.on("stream", stream => addVideoStream(call.peer, stream));
    });

    peer.on("connection", setupDataConnection);
}

// ---------- CALLING ----------
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

// ---------- DATA ----------
function setupDataConnection(conn) {
    conn.on("data", data => {
        if (data.type === "chat") {
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
                a.textContent = "Download " + file.name;
                messagesContainer.appendChild(a);
                delete receivedFiles[data.peerId];
            }
        }
    });
}
// ---------- VIDEO UI ----------
function addVideoStream(id, stream) {
    if (document.getElementById("remote-" + id)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";
    wrapper.id = "wrap-" + id;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.id = "remote-" + id;

    const name = document.createElement("div");
    name.className = "name-label";
    name.innerText = userNames[id] || "User";

    const status = document.createElement("div");
    status.className = "media-status";
    status.id = "status-" + id;
    status.innerText = "";

    wrapper.appendChild(video);
    wrapper.appendChild(name);
    wrapper.appendChild(status);
    videoGrid.appendChild(wrapper);
}

function updateMediaStatus(id, micOn, camOn) {
    const status = document.getElementById("status-" + id);
    if (!status) return;

    let icons = "";
    if (!micOn) icons += "🔇 ";
    if (!camOn) icons += "🚫";
    status.innerText = icons;
}

function removeVideoStream(id) {
    const el = document.getElementById("wrap-" + id);
    if (el) el.remove();
}

// ---------- CHAT ----------
function displayMessage(user, text, mine) {
    const div = document.createElement("div");
    div.className = mine ? "my-message" : "remote-message";
    div.innerHTML = `<b>${user}</b>: ${text}`;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

messageForm.addEventListener("submit", e => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);
    Object.values(connections).forEach(c => {
        c.data?.send({ type: "chat", user: DISPLAY_NAME, text: msg });
    });
    messageInput.value = "";
});

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
            displayMessage(DISPLAY_NAME, "[Image Sent]", true);
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

// ---------- MIC / CAM TOGGLE SYNC ----------
micToggle.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    onlineUsersRef.child(myPeerId).update({ mic: track.enabled });
};

videoToggle.onclick = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    onlineUsersRef.child(myPeerId).update({ cam: track.enabled });
};

// ---------- ONLINE USERS ----------
function addOnlineUser(id, name, mode) {
    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name + " (" + mode + ")";
    onlineUsersList.appendChild(p);
}

function removeOnlineUser(id) {
    const el = document.getElementById("user-" + id);
    if (el) el.remove();
}

// ---------- LEAVE ----------
leaveCall.onclick = () => {
    onlineUsersRef.child(myPeerId).remove();
    location.reload();
};
