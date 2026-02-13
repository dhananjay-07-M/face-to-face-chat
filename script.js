// =====================================================
// VISIO - FINAL CLEAN ADVANCED VERSION
// Direct Mode → Username → Enter Room
// =====================================================

// ---------------- FIREBASE ----------------
const firebaseConfig = {
    apiKey: "AIzaSyDkrzN0604XsYRipUbPF9iiLXy8aaOji3o",
    authDomain: "dhananjay-chat-app.firebaseapp.com",
    databaseURL: "https://dhananjay-chat-app-default-rtdb.firebaseio.com",
    projectId: "dhananjay-chat-app",
    storageBucket: "dhananjay-chat-app.appspot.com",
    messagingSenderId: "319061629483",
    appId: "1:319061629483:web:6c2d52351a764662a6286e"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ---------------- GLOBAL STATE ----------------
let CURRENT_MODE = "";
let ROOM_ID = "";
let ROOM_NAME = "";
let DISPLAY_NAME = "";
let MAX_USERS = 50;
let CREATOR_ID = "";

let peer = null;
let myPeerId = null;
let localStream = null;

const connections = {};
const userNames = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

// ---------------- SAFE GET ----------------
function get(id) {
    return document.getElementById(id);
}

// =====================================================
// DIRECT MODE START
// =====================================================

window.startInstant = function(mode) {

    CURRENT_MODE = mode;

    if (mode === "text") ROOM_ID = "text-room";
    if (mode === "video") ROOM_ID = "video-room";
    if (mode === "both") ROOM_ID = "hybrid-room";

    ROOM_NAME = ROOM_ID;

    DISPLAY_NAME = prompt("Enter your name (max 15 chars):");
    if (!DISPLAY_NAME) return;

    get("join-screen").style.display = "none";
    get("main-app").style.display = "block";

    startRoom();
};

// =====================================================
// START ROOM
// =====================================================

async function startRoom() {

    myPeerId = "visio_" + Math.random().toString(36).substr(2, 9);

    peer = new Peer(myPeerId, {
        host: "peerjs-server.herokuapp.com",
        secure: true,
        port: 443
    });

    const roomRef = database.ref("rooms/" + ROOM_ID);

    peer.on("open", id => {

        roomRef.once("value", snap => {

            if (!snap.exists()) {

                CREATOR_ID = id;

                roomRef.set({
                    roomId: ROOM_ID,
                    roomName: ROOM_NAME,
                    mode: CURRENT_MODE,
                    maxUsers: MAX_USERS,
                    creator: id
                });
            } else {
                const data = snap.val();
                CREATOR_ID = data.creator;
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
                removeOnlineUser(snap.val().peerId);
            });

            setupRoomHeader();
        });
    });

    if (CURRENT_MODE !== "text") {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        get("local-video").srcObject = localStream;
    }

    peer.on("call", call => {
        call.answer(localStream);
        call.on("stream", stream => addVideoStream(call.peer, stream));
    });

    peer.on("connection", setupDataConnection);
}

// =====================================================
// ROOM HEADER
// =====================================================

function setupRoomHeader() {
    const bar = document.createElement("div");
    bar.className = "room-info-bar";
    bar.innerHTML = `
        <span>Room: ${ROOM_NAME}</span>
        <span>${myPeerId === CREATOR_ID ? "👑 Creator" : "Member"}</span>
    `;
    document.body.insertBefore(bar, get("app-container"));
}

// =====================================================
// VIDEO
// =====================================================

function addVideoStream(peerId, stream) {
    if (get("wrap-" + peerId)) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-wrapper";
    wrapper.id = "wrap-" + peerId;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    wrapper.appendChild(video);
    get("video-grid").appendChild(wrapper);
}

// =====================================================
// CHAT
// =====================================================

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

    get("messages-container").appendChild(div);
    get("messages-container").scrollTop =
        get("messages-container").scrollHeight;
}

get("message-form")?.addEventListener("submit", e => {

    e.preventDefault();

    if (CURRENT_MODE === "video") return;

    const input = get("message-input");
    const msg = input.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);

    broadcast({ type: "chat", user: DISPLAY_NAME, text: msg });

    input.value = "";
});

// =====================================================
// FILE SYSTEM
// =====================================================

get("file-btn")?.addEventListener("click", () => {
    get("file-input").click();
});

get("file-input")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => {
            broadcast({ type: "image", user: DISPLAY_NAME, text: ev.target.result });
            displayMessage(DISPLAY_NAME, "[Image]", true);
        };
        reader.readAsDataURL(file);
    } else {
        sendFile(file);
    }
});

// =====================================================
// FILE CHUNK SYSTEM
// =====================================================

function sendFile(file) {

    broadcast({
        type: "file_meta",
        name: file.name,
        size: file.size,
        mime: file.type,
        peerId: myPeerId
    });

    const reader = new FileReader();
    let offset = 0;

    reader.onload = e => {
        broadcast({
            type: "file_chunk",
            peerId: myPeerId,
            chunk: e.target.result
        });

        offset += e.target.result.byteLength;
        if (offset < file.size) readNext();
    };

    function readNext() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
    }

    readNext();
}

// =====================================================
// DATA CONNECTION
// =====================================================

function setupDataConnection(conn) {

    conn.on("data", data => {

        if (data.type === "chat")
            displayMessage(data.user, data.text, false);

        if (data.type === "image")
            displayMessage(data.user, "[Image]", false);

        if (data.type === "file_meta")
            receivedFiles[data.peerId] = { ...data, chunks: [], received: 0 };

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
                get("messages-container").appendChild(a);
            }
        }
    });
}

// =====================================================
// PEER CONNECTIONS
// =====================================================

function callPeer(id) {
    const call = peer.call(id, localStream);
    connections[id] = { media: call };

    call.on("stream", stream => addVideoStream(id, stream));
}

function connectToPeer(id) {
    const conn = peer.connect(id, { reliable: true });
    connections[id] = { data: conn };
    setupDataConnection(conn);
}

// =====================================================
// BROADCAST
// =====================================================

function broadcast(data) {
    Object.values(connections).forEach(c =>
        c.data?.send(data)
    );
}

// =====================================================
// ONLINE USERS
// =====================================================

function addOnlineUser(id, name) {
    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;
    get("online-users-list").appendChild(p);
}

function removeOnlineUser(id) {
    get("user-" + id)?.remove();
}

// =====================================================
// EXIT
// =====================================================

get("leave-call")?.addEventListener("click", () => {
    peer?.destroy();
    location.reload();
});
