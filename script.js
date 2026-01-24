// ===============================
// VISIO BACKEND - PART 1
// Core Room System + Mode + Creator + Validation
// ===============================

// Firebase Config
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

// Global State
let CURRENT_MODE = "";
let ROOM_NAME = "";
let ROOM_ID = "";
let MAX_USERS = 0;
let DISPLAY_NAME = "";
let IS_CREATOR = false;

let peer, myPeerId, localStream;
const connections = {};
const userNames = {};

// Screens
const joinScreen = document.getElementById("join-screen");
const actionScreen = document.getElementById("action-screen");
const createScreen = document.getElementById("create-screen");
const joinRoomScreen = document.getElementById("join-room-screen");
const mainApp = document.getElementById("main-app");

// Inputs
const roomNameInput = document.getElementById("room-name");
const roomIdInput = document.getElementById("room-id");
const maxUsersInput = document.getElementById("max-users");
const joinRoomIdInput = document.getElementById("join-room-id");
const modeTitle = document.getElementById("mode-title");

// Username Validation
function getValidUsername() {
    const regex = /^[A-Za-z0-9 ]{1,15}$/;
    while (true) {
        let name = prompt("Enter your name (max 15 characters):");
        if (!name) continue;
        name = name.trim();
        if (regex.test(name)) return name;
        alert("Invalid name! Use only letters & numbers.");
    }
}

// Mode Select
function selectMode(mode) {
    CURRENT_MODE = mode;
    joinScreen.style.display = "none";
    actionScreen.style.display = "flex";

    modeTitle.innerText =
        mode === "text" ? "Text Chat Mode" :
        mode === "video" ? "Video Call Mode" :
        "Video + Text Mode";
}

// Navigation
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

// Create Room
function createRoom() {
    ROOM_NAME = roomNameInput.value.trim();
    ROOM_ID = roomIdInput.value.trim();
    MAX_USERS = parseInt(maxUsersInput.value);

    const idRegex = /^[A-Za-z0-9]+$/;

    if (!ROOM_NAME || ROOM_NAME.length < 3) return alert("Room name min 3 characters");
    if (!ROOM_ID || !idRegex.test(ROOM_ID)) return alert("Room ID: letters & numbers only");
    if (!MAX_USERS || MAX_USERS < 2 || MAX_USERS > 20) return alert("Max users 2 to 20");

    IS_CREATOR = true;
    startRoom(true);
}

// Join Room
function joinRoom() {
    ROOM_ID = joinRoomIdInput.value.trim();
    const idRegex = /^[A-Za-z0-9]+$/;

    if (!ROOM_ID || !idRegex.test(ROOM_ID)) return alert("Enter valid Room ID");

    IS_CREATOR = false;
    startRoom(false);
}

// Start Room
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
                    alert("This room is in different mode!");
                    location.reload();
                    return;
                }

                if (Object.keys(data.users || {}).length >= data.maxUsers) {
                    alert("Room is full!");
                    location.reload();
                    return;
                }
            } else {
                if (!isCreate) {
                    alert("Room ID not found!");
                    location.reload();
                    return;
                }

                roomRef.set({
                    roomName: ROOM_NAME,
                    roomId: ROOM_ID,
                    mode: CURRENT_MODE,
                    maxUsers: MAX_USERS,
                    creator: DISPLAY_NAME,
                    createdAt: Date.now()
                });
            }

            roomRef.child("users/" + id).set({
                name: DISPLAY_NAME,
                peerId: id,
                isCreator: IS_CREATOR
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
        });
    });

    if (CURRENT_MODE !== "text") {
        navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, frameRate: 30 },
            audio: { echoCancellation: true, noiseSuppression: true }
        }).then(stream => {
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
// ===============================
// VISIO BACKEND - PART 2
// Video Engine + Camera Switch + Mic + Chat + Online Users
// ===============================

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

let currentCamera = "user"; // front camera
let videoTrack, audioTrack;

// --------- CONNECT PEERS ----------
function callPeer(id) {
    if (connections[id]?.media) return;

    const call = peer.call(id, localStream);
    connections[id] = { media: call };

    call.on("stream", stream => {
        addVideoStream(id, stream);
    });
}

function connectToPeer(id) {
    if (connections[id]?.data) return;

    const conn = peer.connect(id, { reliable: true });
    connections[id] = { ...connections[id], data: conn };
    setupDataConnection(conn);
}

// --------- DATA CHANNEL ----------
function setupDataConnection(conn) {
    conn.on("data", data => {

        if (data.type === "chat" && CURRENT_MODE !== "video") {
            displayMessage(data.user, data.text, false);
        }

        if (data.type === "media_status") {
            updateMediaStatus(data.peerId, data.mic, data.cam);
        }

        if (data.type === "user_joined") {
            addOnlineUser(data.peerId, data.name);
        }
    });
}

// --------- VIDEO GRID ----------
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

// --------- MIC & CAMERA STATUS ----------
function updateMediaStatus(id, mic, cam) {
    const el = document.getElementById("status-" + id);
    if (!el) return;
    el.innerText = (!mic ? "🔇 " : "") + (!cam ? "🚫" : "");
}

function broadcastStatus() {
    if (!localStream) return;

    const mic = audioTrack.enabled;
    const cam = videoTrack.enabled;

    Object.values(connections).forEach(c =>
        c.data?.send({ type: "media_status", peerId: myPeerId, mic, cam })
    );
}

// --------- MIC TOGGLE ----------
micToggle.onclick = () => {
    audioTrack.enabled = !audioTrack.enabled;
    broadcastStatus();
};

// --------- VIDEO TOGGLE ----------
videoToggle.onclick = () => {
    videoTrack.enabled = !videoTrack.enabled;
    broadcastStatus();
};

// --------- CAMERA SWITCH (FRONT / BACK) ----------
async function switchCamera() {
    currentCamera = currentCamera === "user" ? "environment" : "user";

    const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentCamera },
        audio: true
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    const sender = Object.values(peer.connections)
        .flat()
        .find(s => s.peerConnection?.getSenders);

    sender?.peerConnection.getSenders()
        .find(s => s.track.kind === "video")
        .replaceTrack(newVideoTrack);

    localStream.getTracks().forEach(t => t.stop());
    localStream = newStream;
    videoTrack = newVideoTrack;
    document.getElementById("local-video").srcObject = localStream;
}

// --------- CHAT ----------
function displayMessage(user, text, mine) {
    const div = document.createElement("div");
    div.className = mine ? "my-message" : "remote-message";
    div.innerHTML = `<b>${user}</b>: ${text}`;
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

// --------- ONLINE USERS ----------
function addOnlineUser(id, name) {
    if (document.getElementById("user-" + id)) return;

    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;
    onlineUsersList.appendChild(p);
}

// --------- EXIT ----------
function leaveRoom() {
    if (peer) peer.destroy();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    location.reload();
}

leaveCall.onclick = leaveRoom;
// ===============================
// VISIO BACKEND - PART 3
// Screen Share + Reconnect + Room Lock + Quality Boost
// ===============================

let isScreenSharing = false;
let screenTrack = null;
let isCreator = false;

// ---------- ROOM INFO SYNC ----------
function broadcastRoomInfo() {
    const info = {
        type: "room_info",
        roomName: ROOM_NAME,
        roomId: ROOM_ID,
        creator: DISPLAY_NAME
    };

    Object.values(connections).forEach(c => c.data?.send(info));
}

// ---------- SCREEN SHARE ----------
async function toggleScreenShare() {
    if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenTrack = stream.getVideoTracks()[0];

        replaceVideoTrack(screenTrack);
        isScreenSharing = true;

        screenTrack.onended = () => stopScreenShare();
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (!screenTrack) return;
    replaceVideoTrack(videoTrack);
    screenTrack.stop();
    isScreenSharing = false;
}

function replaceVideoTrack(newTrack) {
    Object.values(peer.connections).forEach(conns => {
        conns.forEach(conn => {
            conn.peerConnection.getSenders().forEach(sender => {
                if (sender.track && sender.track.kind === "video") {
                    sender.replaceTrack(newTrack);
                }
            });
        });
    });

    const newStream = new MediaStream([newTrack, audioTrack]);
    document.getElementById("local-video").srcObject = newStream;
}

// ---------- CREATOR LOCK ----------
function lockRoom() {
    if (!isCreator) return alert("Only Creator can lock room");

    Object.values(connections).forEach(c =>
        c.data?.send({ type: "room_lock" })
    );
}

// ---------- NOISE SUPPRESSION ----------
async function enableNoiseSuppression() {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
        },
        video: true
    });

    localStream.getTracks().forEach(t => t.stop());
    localStream = stream;

    audioTrack = stream.getAudioTracks()[0];
    videoTrack = stream.getVideoTracks()[0];

    document.getElementById("local-video").srcObject = stream;
    broadcastStatus();
}

// ---------- AUTO RECONNECT ----------
window.addEventListener("offline", () => {
    alert("Connection lost. Reconnecting...");
});

window.addEventListener("online", () => {
    location.reload();
});

// ---------- DATA HANDLER EXTENSION ----------
function handleAdvancedData(data) {

    if (data.type === "room_info") {
        document.getElementById("room-name-ui").innerText = data.roomName;
        document.getElementById("room-id-ui").innerText = data.roomId;
        document.getElementById("creator-ui").innerText = data.creator;
    }

    if (data.type === "room_lock") {
        alert("Room locked by creator. No new users allowed.");
    }
}

// Attach to existing data handler
const oldSetup = setupDataConnection;
setupDataConnection = function (conn) {
    oldSetup(conn);

    conn.on("data", data => {
        handleAdvancedData(data);
    });
};

// ---------- CREATOR DETECTION ----------
function markCreator() {
    if (isCreator) return;
    isCreator = true;
    broadcastRoomInfo();
}

// Call this after room creation success
markCreator();
