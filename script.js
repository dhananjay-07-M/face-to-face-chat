// ===============================
// VISIO - SCRIPT.JS (PART 1)
// Core, Mode Flow, Room, Firebase, Peer Setup
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
const roomInfoBar = document.querySelector(".room-info-bar");

// Username
function getValidUsername() {
    while (true) {
        let name = prompt("Enter your name (Max 15 chars):");
        if (!name) continue;
        name = name.trim();
        if (name.length <= 15) return name;
    }
}

// Mode Select
function selectMode(mode) {
    CURRENT_MODE = mode;
    joinScreen.style.display = "none";
    actionScreen.style.display = "flex";

    document.body.className = "";
    if (mode === "text") document.body.classList.add("text-only");
    if (mode === "video") document.body.classList.add("video-only");

    modeTitle.innerText =
        mode === "text" ? "Text Chat Mode" :
        mode === "video" ? "Video Call Mode" :
        "Video + Text Mode";
}

// UI Flow
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

    if (ROOM_NAME.length < 3) return alert("Room name too short");
    if (!/^[A-Za-z0-9]+$/.test(ROOM_ID)) return alert("Room ID must be alphanumeric");
    if (MAX_USERS < 2 || MAX_USERS > 20) return alert("Max users 2-20");

    startRoom(true);
}

// Join Room
function joinRoom() {
    ROOM_ID = joinRoomIdInput.value.trim();
    if (!/^[A-Za-z0-9]+$/.test(ROOM_ID)) return alert("Invalid Room ID");
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
                    alert("Room is for different mode");
                    return location.reload();
                }

                if (Object.keys(data.users || {}).length >= data.maxUsers) {
                    alert("Room Full");
                    return location.reload();
                }

                CREATOR_ID = data.creator;
                ROOM_NAME = data.roomName;
                MAX_USERS = data.maxUsers;
            } else {
                if (!isCreate) {
                    alert("Room not found");
                    return location.reload();
                }

                CREATOR_ID = id;
                roomRef.set({
                    roomName: ROOM_NAME,
                    roomId: ROOM_ID,
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
                addOnlineUser(user.peerId, user.name, user.peerId === CREATOR_ID);

                if (user.peerId !== id) {
                    connectToPeer(user.peerId);
                    if (CURRENT_MODE !== "text") callPeer(user.peerId);
                }
            });

            showRoomInfo();
        });
    });

    peer.on("call", call => {
        if (CURRENT_MODE === "text") return;
        call.answer(localStream);
        call.on("stream", stream => addVideoStream(call.peer, stream));
    });

    peer.on("connection", setupDataConnection);

    if (CURRENT_MODE !== "text") {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            localStream = stream;
            document.getElementById("local-video").srcObject = stream;
        });
    }
}

// Room Info Bar
function showRoomInfo() {
    roomInfoBar.innerHTML = `
        <span>Room: ${ROOM_NAME}</span>
        <span>ID: ${ROOM_ID}</span>
        <span>Host: ${userNames[CREATOR_ID] || "You"}</span>
    `;
}
// ===============================
// VISIO - SCRIPT.JS (PART 2)
// Video, Chat, Users, Media, Camera Switch, Exit
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

let currentCameraIndex = 0;
let videoDevices = [];

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
    name.innerText = userNames[id] || "User";

    const status = document.createElement("div");
    status.className = "media-status";
    status.id = "status-" + id;

    wrapper.append(video, name, status);
    videoGrid.appendChild(wrapper);
}

function updateMediaStatus(id, mic, cam) {
    const el = document.getElementById("status-" + id);
    if (!el) return;
    el.innerText = (!mic ? "🔇" : "") + (!cam ? " 🚫" : "");
}

// ---------- CHAT ----------
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

// ---------- CAMERA SWITCH ----------
async function switchCamera() {
    videoDevices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = videoDevices.filter(d => d.kind === "videoinput");

    if (videoDevices.length < 2) return alert("No second camera");

    currentCameraIndex = (currentCameraIndex + 1) % videoDevices.length;

    const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: videoDevices[currentCameraIndex].deviceId },
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

// ---------- ONLINE USERS ----------
function addOnlineUser(id, name, isCreator) {
    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerHTML = "🟢 " + name + (isCreator ? " <span class='creator-badge'>Host</span>" : "");
    onlineUsersList.appendChild(p);
}

// ---------- EXIT ----------
function leaveRoom() {
    if (peer) peer.destroy();
    location.reload();
}

leaveCall.onclick = leaveRoom;
