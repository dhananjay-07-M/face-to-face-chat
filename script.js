// ===============================
// FINAL SCRIPT.JS (VIDEO + CHAT + FILE + IMAGE)
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
const connections = {};
const userNames = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

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

function generateRandomId() {
    return "user_" + Math.random().toString(36).substr(2, 9);
}

function getValidUsername() {
    let name = "";
    const regex = /^[A-Za-z0-9]+( [A-Za-z0-9]+)?$/;

    while (true) {
        name = prompt("Enter your name (letters/numbers, one space allowed, max 15 chars):");
        if (!name) continue;
        name = name.trim();

        if (name.length <= 15 && regex.test(name)) return name;
        alert("Invalid name! Only letters, numbers, ONE space allowed. Max 15 characters.");
    }
}

async function initializeVideo() {
    DISPLAY_NAME = getValidUsername();

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.play();

    myPeerId = generateRandomId();
    peer = new Peer(myPeerId, peerConfig);

    peer.on("open", id => {
        onlineUsersRef.child(id).set({ name: DISPLAY_NAME, peerId: id });
        onlineUsersRef.child(id).onDisconnect().remove();

        onlineUsersRef.on("child_added", snap => {
            const user = snap.val();
            userNames[user.peerId] = user.name;
            addOnlineUser(user.peerId, user.name);

            if (user.peerId !== id) {
                callPeer(user.peerId);
                connectToPeer(user.peerId);
            }
        });

        onlineUsersRef.on("child_removed", snap => {
            removeOnlineUser(snap.key);
            removeVideoStream(snap.key);
        });
    });

    peer.on("call", call => {
        call.answer(localStream);
        call.on("stream", stream => addVideoStream(call.peer, stream));
    });

    peer.on("connection", conn => {
        conn.on("data", data => {

            if (data.type === "chat") {
                displayMessage(data.user, data.text, false);
            }

            if (data.type === "file_meta") {
                receivedFiles[data.peerId] = {
                    name: data.name,
                    size: data.size,
                    mime: data.mime,
                    sender: data.sender,
                    chunks: [],
                    received: 0
                };
                displayMessage("System", `${data.sender} is sending ${data.name}`, false);
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
                    link.textContent = `Download ${file.name}`;
                    link.style.color = "#38bdf8";

                    const div = document.createElement("div");
                    div.appendChild(link);
                    messagesContainer.appendChild(div);

                    delete receivedFiles[data.peerId];
                }
            }
        });
    });
}

function callPeer(id) {
    if (connections[id]?.media) return;
    const call = peer.call(id, localStream);
    connections[id] = { media: call };
    call.on("stream", stream => addVideoStream(id, stream));
}

function connectToPeer(id) {
    if (connections[id]?.data) return;
    const conn = peer.connect(id);
    connections[id] = { ...connections[id], data: conn };
}

function addVideoStream(id, stream) {
    if (document.getElementById("remote-" + id)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.id = "remote-" + id;

    const label = document.createElement("div");
    label.className = "name-label";
    label.innerText = userNames[id] || "User";

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videoGrid.appendChild(wrapper);
}

function removeVideoStream(id) {
    const el = document.getElementById("remote-" + id);
    if (el && el.parentElement) el.parentElement.remove();
}

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

messageForm.addEventListener("submit", e => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);
    Object.values(connections).forEach(c => {
        if (c.data) c.data.send({ type: "chat", user: DISPLAY_NAME, text: msg });
    });
    messageInput.value = "";
});

fileBtn.onclick = () => fileInput.click();

fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;

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
        Object.values(connections).forEach(c => {
            c.data?.send({
                type: "file_chunk",
                peerId: myPeerId,
                chunk: e.target.result
            });
        });

        offset += e.target.result.byteLength;
        if (offset < file.size) readNextChunk();
        else displayMessage("System", `File sent: ${file.name}`, true);
    };

    function readNextChunk() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }

    readNextChunk();
};

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

micToggle.onclick = () => localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
videoToggle.onclick = () => localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;

leaveCall.onclick = () => {
    onlineUsersRef.child(myPeerId).remove();
    location.reload();
};

window.onload = initializeVideo;
