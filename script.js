// ===============================
// FINAL STABLE SCRIPT.JS
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
const connections = {};
const userNames = {};

const localVideo = document.getElementById("local-video");
const videoGrid = document.getElementById("video-grid");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const micToggle = document.getElementById("mic-toggle");
const videoToggle = document.getElementById("video-toggle");
const leaveCall = document.getElementById("leave-call");
const onlineUsersList = document.getElementById("online-users-list");

function generateRandomId() {
    return "user_" + Math.random().toString(36).substr(2, 9);
}

async function initializeVideo() {
    const name = prompt("Enter your name:");
    const DISPLAY_NAME = name && name.trim() !== "" ? name : "Guest";

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
    div.innerHTML = `<b>${user}</b>: ${text}`;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

messageForm.addEventListener("submit", e => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;

    displayMessage("Me", msg, true);
    Object.values(connections).forEach(c => {
        if (c.data) c.data.send({ type: "chat", user: "Me", text: msg });
    });
    messageInput.value = "";
});

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

micToggle.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
};

videoToggle.onclick = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
};

leaveCall.onclick = () => {
    onlineUsersRef.child(myPeerId).remove();
    location.reload();
};

window.onload = initializeVideo;
