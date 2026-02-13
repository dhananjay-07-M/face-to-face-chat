// =====================================================
// VISIO - FULL ADVANCED PRODUCTION BACKEND
// Create + Join + Video + Chat + File + Media Sync
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
let MAX_USERS = 0;
let DISPLAY_NAME = "";
let CREATOR_ID = "";

let peer = null;
let myPeerId = null;
let localStream = null;
let currentCamera = "user";

const connections = {};
const userNames = {};
const receivedFiles = {};
const CHUNK_SIZE = 16000;

// ---------------- SAFE GET ----------------
function get(id) {
    return document.getElementById(id);
}

// ---------------- USERNAME ----------------
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

// ---------------- MODE ----------------
window.selectMode = function(mode) {
    CURRENT_MODE = mode;
    get("join-screen").style.display = "none";
    get("action-screen").style.display = "flex";

    get("mode-title").innerText =
        mode === "text" ? "TEXT CHAT ROOM" :
        mode === "video" ? "VIDEO CALL ROOM" :
        "VIDEO + TEXT ROOM";
};

// ---------------- CREATE ROOM ----------------
window.createRoom = function() {
    ROOM_NAME = get("room-name").value.trim();
    ROOM_ID = get("room-id").value.trim();
    MAX_USERS = parseInt(get("max-users").value);

    if (!ROOM_NAME || ROOM_NAME.length < 3)
        return alert("Room name too short");

    if (!ROOM_ID || !/^[A-Za-z0-9]+$/.test(ROOM_ID))
        return alert("Room ID only letters & numbers");

    if (!MAX_USERS || MAX_USERS < 2 || MAX_USERS > 20)
        return alert("Max users must be 2-20");

    startRoom(true);
};

// ---------------- JOIN ROOM ----------------
window.joinRoom = function() {
    ROOM_ID = get("join-room-id").value.trim();

    if (!ROOM_ID || !/^[A-Za-z0-9]+$/.test(ROOM_ID))
        return alert("Invalid Room ID");

    startRoom(false);
};

// ---------------- START ROOM ----------------
async function startRoom(isCreator) {

    DISPLAY_NAME = getValidUsername();
    get("action-screen").style.display = "none";
    get("main-app").style.display = "block";

    myPeerId = "visio_" + Math.random().toString(36).substr(2, 9);

    peer = new Peer(myPeerId, {
        host: "peerjs-server.herokuapp.com",
        secure: true,
        port: 443
    });

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

// ---------------- ROOM HEADER ----------------
function setupRoomHeader() {
    const bar = document.createElement("div");
    bar.className = "room-info-bar";
    bar.innerHTML = `
        <span>Room: ${ROOM_NAME}</span>
        <span>ID: ${ROOM_ID}</span>
        <span>${myPeerId === CREATOR_ID ? "👑 Creator" : "Member"}</span>
    `;
    document.body.insertBefore(bar, get("app-container"));
}

// ---------------- VIDEO ----------------
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

// ---------------- CHAT ----------------
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

// ---------------- FILE & IMAGE ----------------
get("file-btn")?.addEventListener("click", () => {
    get("file-input").click();
});

get("file-input")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => {
            broadcast({ type: "image", user: DISPLAY_NAME, data: ev.target.result });
            displayMessage(DISPLAY_NAME, "[Image]", true);
        };
        reader.readAsDataURL(file);
    } else {
        sendFile(file);
    }
});

// ---------------- FILE CHUNK SYSTEM ----------------
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

// ---------------- DATA CONNECTION ----------------
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

        if (data.type === "media_status")
            updateMediaStatus(data.peerId, data.mic, data.cam);
    });
}

// ---------------- MEDIA STATUS ----------------
function broadcastStatus() {
    const mic = localStream.getAudioTracks()[0].enabled;
    const cam = localStream.getVideoTracks()[0].enabled;
    broadcast({ type: "media_status", peerId: myPeerId, mic, cam });
}

function updateMediaStatus(peerId, mic, cam) {
    const status = get("status-" + peerId);
    if (!status) return;
    status.innerHTML = `${!mic ? "🎤❌" : ""} ${!cam ? "📷❌" : ""}`;
}

// ---------------- BROADCAST ----------------
function broadcast(data) {
    Object.values(connections).forEach(c =>
        c.data?.send(data)
    );
}

// ---------------- ONLINE USERS ----------------
function addOnlineUser(id, name) {
    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;
    get("online-users-list").appendChild(p);
}

function removeOnlineUser(id) {
    get("user-" + id)?.remove();
}

// ---------------- EXIT ----------------
get("leave-call")?.addEventListener("click", () => {
    peer?.destroy();
    location.reload();
});
