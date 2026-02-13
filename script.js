// ===============================
// VISIO - COMPLETE UPDATED SCRIPT
// WhatsApp + Zoom Professional Mode
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

// ================= GLOBAL STATE =================

let CURRENT_MODE = "";
let ROOM_ID = "";
let ROOM_NAME = "";
let MAX_USERS = 0;
let DISPLAY_NAME = "";
let CREATOR_ID = "";

let peer, myPeerId, localStream;
const connections = {};
const userNames = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

// ================= UI ELEMENTS =================

const joinScreen = document.getElementById("join-screen");
const actionScreen = document.getElementById("action-screen");
const createScreen = document.getElementById("create-screen");
const joinRoomScreen = document.getElementById("join-room-screen");
const mainApp = document.getElementById("main-app");

const videoGrid = document.getElementById("video-grid");
const onlineUsersList = document.getElementById("online-users-list");
const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const micToggle = document.getElementById("mic-toggle");
const videoToggle = document.getElementById("video-toggle");
const leaveCall = document.getElementById("leave-call");

const fileInput = document.getElementById("file-input");
const fileBtn = document.getElementById("file-btn");

// ================= USERNAME =================

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

// ================= MODE =================

function selectMode(mode) {
    CURRENT_MODE = mode;
    joinScreen.style.display = "none";
    actionScreen.style.display = "flex";

    document.getElementById("mode-title").innerText =
        mode === "text" ? "TEXT CHAT ROOM" :
        mode === "video" ? "VIDEO CALL ROOM" :
        "VIDEO + TEXT ROOM";
}

function applyModeUI() {
    document.body.classList.remove("text-only", "video-only");

    if (CURRENT_MODE === "text")
        document.body.classList.add("text-only");

    if (CURRENT_MODE === "video")
        document.body.classList.add("video-only");
}

// ================= START ROOM =================

function startRoom(isCreator) {

    DISPLAY_NAME = getValidUsername();
    mainApp.style.display = "block";
    applyModeUI();

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

                addOnlineUser(user.peerId, user.name);

                if (user.peerId !== id) {
                    connectToPeer(user.peerId);
                    if (CURRENT_MODE !== "text")
                        callPeer(user.peerId);
                }
            });

            roomRef.child("users").on("child_removed", snap => {
                const user = snap.val();
                removeOnlineUser(user.peerId);
            });

            document.title = "VISIO | " + ROOM_NAME;
        });
    });

    if (CURRENT_MODE !== "text") {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
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

// ================= VIDEO =================

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

// ================= MEDIA TOGGLE =================

function broadcastStatus() {
    if (!localStream) return;

    const mic = localStream.getAudioTracks()[0].enabled;
    const cam = localStream.getVideoTracks()[0].enabled;

    Object.values(connections).forEach(c =>
        c.data?.send({ type: "media_status", peerId: myPeerId, mic, cam })
    );
}

micToggle.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;

    micToggle.innerHTML =
        track.enabled ? '<i class="fas fa-microphone"></i>'
        : '<i class="fas fa-microphone-slash"></i>';

    broadcastStatus();
};

videoToggle.onclick = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;

    videoToggle.innerHTML =
        track.enabled ? '<i class="fas fa-video"></i>'
        : '<i class="fas fa-video-slash"></i>';

    broadcastStatus();
};

// ================= ONLINE USERS =================

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

// ================= CHAT =================

function displayMessage(user, text, mine) {

    const div = document.createElement("div");
    div.className = mine ? "chat-bubble mine" : "chat-bubble other";

    const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    div.innerHTML = `
        <div class="bubble-header">${mine ? "You" : user}</div>
        <div class="bubble-text">${text}</div>
        <div class="bubble-time">${time}</div>
    `;

    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

messageForm.onsubmit = e => {

    e.preventDefault();

    if (CURRENT_MODE === "video") {
        alert("Chat disabled in Video Only mode");
        return;
    }

    const msg = messageInput.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);

    Object.values(connections).forEach(c =>
        c.data?.send({ type: "chat", user: DISPLAY_NAME, text: msg })
    );

    messageInput.value = "";
};

// ================= CONNECTION =================

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

function setupDataConnection(conn) {

    conn.on("data", data => {

        if (data.type === "chat")
            displayMessage(data.user, data.text, false);

        if (data.type === "media_status")
            updateMediaStatus(data.peerId, data.mic, data.cam);
    });
}

// ================= MEDIA STATUS =================

function updateMediaStatus(peerId, mic, cam) {

    const status = document.getElementById("status-" + peerId);
    if (!status) return;

    status.innerHTML =
        `${!mic ? "🎤❌" : ""} ${!cam ? "📷❌" : ""}`;
}

// ================= EXIT =================

function leaveRoom() {
    if (peer) peer.destroy();
    location.reload();
}

leaveCall.onclick = leaveRoom;
