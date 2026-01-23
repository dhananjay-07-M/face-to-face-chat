// ===================================================
// SCRIPT.JS: FINAL STABLE VERSION (VIDEO + CHAT + IMAGE + FILE)
// ===================================================

// -------------------
// 1. CONFIGURATION
// -------------------
const firebaseConfig = {
    apiKey: "AIzaSyDkrzN0604XsYRipUbPF9iiLXy8aaOji3o",
    authDomain: "dhananjay-chat-app.firebaseapp.com",
    databaseURL: "https://dhananjay-chat-app-default-rtdb.firebaseio.com",
    projectId: "dhananjay-chat-app",
    storageBucket: "dhananjay-chat-app.firebasestorage.app",
    messagingSenderId: "319061629483",
    appId: "1:319061629483:web:6c2d52351a764662a6286e"
};

const peerConfig = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

let database, chatRef, onlineUsersRef;
const ROOM_NAME = 'Lobby';
let DISPLAY_NAME = "Guest";

(function () {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    chatRef = database.ref('messages/' + ROOM_NAME);
    onlineUsersRef = database.ref('onlineUsers/' + ROOM_NAME);
})();

let localStream, peer, myPeerId;
const connections = {};
const CHUNK_SIZE = 16000;
const receivedFiles = {};

const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

function generateRandomId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

async function initializeVideo() {
    DISPLAY_NAME = prompt("Enter your name:") || "Dhanu";

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.play();

    myPeerId = generateRandomId();
    peer = new Peer(myPeerId, peerConfig);

    peer.on('open', id => {
        const userRef = onlineUsersRef.child(id);
        userRef.set({ name: DISPLAY_NAME, peerId: id });
        userRef.onDisconnect().remove();

        onlineUsersRef.on('child_added', snapshot => {
            const user = snapshot.val();
            if (user.peerId !== id) {
                callPeer(user.peerId);
                connectToPeer(user.peerId);
            }
        });
    });

    peer.on('call', call => {
        call.answer(localStream);
        call.on('stream', stream => addVideoStream(call.peer, stream));
    });

    peer.on('connection', conn => setupDataConnection(conn));
}

function callPeer(id) {
    if (connections[id]?.media) return;
    const call = peer.call(id, localStream);
    connections[id] = { media: call };
    call.on('stream', stream => addVideoStream(id, stream));
}

function connectToPeer(id) {
    if (connections[id]?.data) return;
    const conn = peer.connect(id);
    connections[id] = { ...connections[id], data: conn };
    setupDataConnection(conn);
}

function setupDataConnection(conn) {
    conn.on('data', data => {
        if (data.type === 'chat') displayMessage(data.user, data.text, false);
        if (data.type === 'file_meta') handleFileMeta(data);
        if (data.type === 'file_chunk') handleFileChunk(data);
    });
}

function addVideoStream(id, stream) {
    if (document.getElementById(`remote-${id}`)) return;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.id = `remote-${id}`;
    videoGrid.appendChild(video);
}

function displayMessage(user, text, mine) {
    const div = document.createElement('div');
    div.className = mine ? 'my-message' : 'remote-message';

    if (text.startsWith('data:image/')) {
        const img = new Image();
        img.src = text;
        img.style.maxWidth = "200px";
        div.innerHTML = `<b>${user}</b><br>`;
        div.appendChild(img);
    } else {
        div.innerHTML = `<b>${user}</b>: ${text}`;
    }

    messagesContainer.appendChild(div);
}

messageForm.addEventListener('submit', e => {
    e.preventDefault();
    const msg = messageInput.value;
    displayMessage(DISPLAY_NAME, msg, true);
    Object.values(connections).forEach(c => c.data?.send({ type: 'chat', user: DISPLAY_NAME, text: msg }));
    messageInput.value = '';
});

function handleFileMeta(meta) {
    receivedFiles[meta.peerId] = { chunks: [], size: meta.size, name: meta.name, received: 0 };
}

function handleFileChunk(chunk) {
    const file = receivedFiles[chunk.peerId];
    file.chunks.push(chunk.chunk);
    file.received += chunk.chunk.byteLength;

    if (file.received >= file.size) {
        const blob = new Blob(file.chunks);
        const url = URL.createObjectURL(blob);
        displayMessage("System", `File received: <a href="${url}" download="${file.name}">Download</a>`, false);
        delete receivedFiles[chunk.peerId];
    }
}

window.onload = initializeVideo;
