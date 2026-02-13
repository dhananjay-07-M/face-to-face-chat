// =====================================================
// VISIO - FULL PRODUCTION STABLE VERSION
// Cross Device Working (STUN + TURN Config)
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
let DISPLAY_NAME = "";

let peer = null;
let myPeerId = null;
let localStream = null;

const connections = {};
const userNames = {};

function get(id) {
    return document.getElementById(id);
}


// =====================================================
// START INSTANT MODE
// =====================================================

window.startInstant = function (mode) {

    CURRENT_MODE = mode;

    if (mode === "text") ROOM_ID = "text-room";
    if (mode === "video") ROOM_ID = "video-room";
    if (mode === "both") ROOM_ID = "hybrid-room";

    DISPLAY_NAME = prompt("Enter your name (max 15 chars):");
    if (!DISPLAY_NAME) return;

    applyModeUI();

    get("join-screen").style.display = "none";
    get("main-app").style.display = "block";

    startRoom();
};


// =====================================================
// MODE UI CONTROL
// =====================================================

function applyModeUI() {

    document.body.classList.remove("video-only", "text-only");

    if (CURRENT_MODE === "video")
        document.body.classList.add("video-only");

    if (CURRENT_MODE === "text")
        document.body.classList.add("text-only");
}


// =====================================================
// START ROOM
// =====================================================

async function startRoom() {

    myPeerId = "visio_" + Math.random().toString(36).substr(2, 9);

    // 🔥 PRODUCTION ICE CONFIG
    peer = new Peer(myPeerId, {
        config: {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                    urls: "turn:openrelay.metered.ca:80",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                }
            ]
        }
    });

    const roomRef = database.ref("rooms/" + ROOM_ID + "/users");

    peer.on("open", id => {

        // Add self to Firebase
        roomRef.child(id).set({
            name: DISPLAY_NAME,
            peerId: id
        });

        roomRef.child(id).onDisconnect().remove();

        // Listen for new users
        roomRef.on("child_added", snap => {

            const user = snap.val();
            if (!user) return;

            userNames[user.peerId] = user.name;

            addOnlineUser(user.peerId, user.name);

            if (user.peerId !== id) {

                connectToPeer(user.peerId);

                if (CURRENT_MODE !== "text") {
                    callPeer(user.peerId);
                }
            }
        });

        roomRef.on("child_removed", snap => {
            removeOnlineUser(snap.val().peerId);
        });
    });


    // Get media only if not text mode
    if (CURRENT_MODE !== "text") {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            get("local-video").srcObject = localStream;

        } catch (err) {
            alert("Camera/Microphone permission denied");
        }
    }


    // Incoming call
    peer.on("call", call => {

        if (CURRENT_MODE === "text") return;

        call.answer(localStream);

        call.on("stream", stream => {
            addVideoStream(call.peer, stream);
        });
    });


    // Incoming data connection
    peer.on("connection", conn => {

        conn.on("open", () => {

            connections[conn.peer] = connections[conn.peer] || {};
            connections[conn.peer].data = conn;

            setupDataConnection(conn);
        });
    });
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

get("message-form")?.addEventListener("submit", e => {

    e.preventDefault();

    if (CURRENT_MODE === "video") return;

    const input = get("message-input");
    const msg = input.value.trim();
    if (!msg) return;

    displayMessage(DISPLAY_NAME, msg, true);

    broadcast({
        type: "chat",
        user: DISPLAY_NAME,
        text: msg
    });

    input.value = "";
});


function displayMessage(user, text, mine) {

    const div = document.createElement("div");
    div.className = mine ? "chat-bubble mine" : "chat-bubble other";

    div.innerHTML = `<b>${mine ? "You" : user}</b><br>${text}`;

    get("messages-container").appendChild(div);

    get("messages-container").scrollTop =
        get("messages-container").scrollHeight;
}


// =====================================================
// DATA CONNECTION
// =====================================================

function setupDataConnection(conn) {

    conn.on("data", data => {

        if (data.type === "chat") {
            displayMessage(data.user, data.text, false);
        }
    });
}


function connectToPeer(id) {

    if (connections[id]?.data) return;

    const conn = peer.connect(id, { reliable: true });

    conn.on("open", () => {

        connections[id] = connections[id] || {};
        connections[id].data = conn;

        setupDataConnection(conn);
    });
}


function callPeer(id) {

    if (connections[id]?.media) return;

    const call = peer.call(id, localStream);

    connections[id] = connections[id] || {};
    connections[id].media = call;

    call.on("stream", stream => {
        addVideoStream(id, stream);
    });
}


// =====================================================
// BROADCAST
// =====================================================

function broadcast(data) {

    Object.values(connections).forEach(c => {

        if (c.data && c.data.open) {
            c.data.send(data);
        }
    });
}


// =====================================================
// ONLINE USERS
// =====================================================

function addOnlineUser(id, name) {

    if (get("user-" + id)) return;

    const p = document.createElement("p");
    p.id = "user-" + id;
    p.innerText = "🟢 " + name;

    get("online-users-list").appendChild(p);
}

function removeOnlineUser(id) {
    get("user-" + id)?.remove();
}


// =====================================================
// CONTROLS
// =====================================================

get("mic-toggle")?.addEventListener("click", () => {

    if (!localStream) return;

    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;

    get("mic-toggle").innerHTML =
        track.enabled ? "🎤" : "🎤❌";
});


get("video-toggle")?.addEventListener("click", () => {

    if (!localStream) return;

    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;

    get("video-toggle").innerHTML =
        track.enabled ? "📷" : "📷❌";
});


get("leave-call")?.addEventListener("click", () => {

    localStream?.getTracks().forEach(t => t.stop());
    peer?.destroy();
    location.reload();
});
