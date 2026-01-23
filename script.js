// ===============================
// FINAL SCRIPT.JS (ALL IN ONE)
// Join Mode + Video + Text + Files + Status + Modes
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
let JOIN_MODE = "both";

const connections = {};
const userNames = {};
const userModes = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

// UI
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

// ---------- USERNAME ----------
function getValidUsername() {
    const regex = /^[A-Za-z0-9]+( [A-Za-z0-9]+)?$/;
    while (true) {
        let name = prompt("Enter your name (letters, numbers, one space, max 15):");
        if (!name) continue;
        name = name.trim();
        if (name.length <= 15 && regex.test(name)) return name;
        alert("Invalid name! Only letters, numbers, one space, max 15 chars.");
    }
}

// ---------- MODE ----------
function selectMode(mode) {
    JOIN_MODE = mode;
    joinScreen.style.display = "none";
    mainApp.style.display = "block";
    initializeApp();
}

// ---------- INIT ----------
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
            addOnlineUser(user.peerId, user.name, user.mode);

            if (user.peerId !== id) {
                connectToPeer(user.peerId); // chat always

                if (JOIN_MODE !== "text" && user.mode !== "text") {
                    callPeer(user.peerId); // video only if both allow
                }
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

// ---------- CONNECTION ----------
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

        if (data.type === "media_status") {
            updateMediaStatus(data.peerId, data.mic, data.cam);
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

                const link = document.createElement("a");
                link.href = url;
                link.download = file.name;
                link.innerText = "⬇ Download " + file.name;
                link.style.color = "#38bdf8";

                const div = document.createElement("div");
                div.appendChild(link);
                messagesContainer.appendChild(div);

                delete receivedFiles[data.peerId];
            }
        }
    });
}

// ---------- VIDEO ----------
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
    const msg = messageInput.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);
    Object.values(connections).forEach(c =>
        c.data?.send({ type: "chat", user: DISPLAY_NAME, text: msg })
    );
    messageInput.value = "";
};

// ---------- FILE ----------
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

// ---------- STATUS BROADCAST ----------
function broadcastStatus() {
    const mic = localStream.getAudioTracks()[0].enabled;
    const cam = localStream.getVideoTracks()[0].enabled;

    onlineUsersRef.child(myPeerId).update({ mic, cam });

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

// ---------- USERS ----------
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

// ---------- BACK & EXIT ----------
window.onpopstate = () => location.reload();

leaveCall.onclick = () => {
    onlineUsersRef.child(myPeerId).remove();
    if (peer) peer.destroy();
    location.reload();
};
