// ===================================================
// SCRIPT.JS: APPLICATION LOGIC WITH IMAGE PREVIEWS
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
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' }
        ]
    }
};

let database, chatRef, onlineUsersRef;
const ROOM_NAME = 'Lobby';
let DISPLAY_NAME = "Guest";

if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    chatRef = database.ref('messages/' + ROOM_NAME);
    onlineUsersRef = database.ref('onlineUsers/' + ROOM_NAME);
} else {
    console.error("Firebase SDK not loaded.");
}

// Global Variables
let localStream;
let peer;
let myPeerId;
const connections = {};
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.style.display = 'none';

// DOM Elements
const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const micToggle = document.getElementById('mic-toggle');
const videoToggle = document.getElementById('video-toggle');
const leaveCallButton = document.getElementById('leave-call');
const roomDisplay = document.getElementById('room-display');
const onlineUsersList = document.getElementById('online-users-list');

function generateRandomId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// -------------------
// 2. CORE FUNCTIONS: WebRTC/PeerJS Setup
// -------------------
async function initializeVideo() {
    const userName = prompt("Enter your display name:");
    DISPLAY_NAME = userName && userName.trim() !== "" ? userName.trim() : "Guest_" + Math.floor(Math.random() * 1000);
    if (roomDisplay) roomDisplay.textContent = `Room: ${ROOM_NAME}`;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.autoplay = true;
            localVideo.playsInline = true;
            localVideo.onloadedmetadata = () => localVideo.play().catch(() => {});
        }

        myPeerId = generateRandomId();
        peer = new Peer(myPeerId, peerConfig);

        peer.on('open', (id) => {
            console.log('My Peer ID:', id);
            const userRef = onlineUsersRef.child(id);
            userRef.set({ name: DISPLAY_NAME, peerId: id });
            try { userRef.onDisconnect().remove(); } catch (e){}

            onlineUsersRef.once('value', snapshot => {
                snapshot.forEach(child => {
                    const remoteUser = child.val();
                    if (remoteUser.peerId !== id) {
                        callPeer(remoteUser.peerId, localStream);
                        connectToPeer(remoteUser.peerId);
                    }
                });
            });
        });

        peer.on('call', (call) => {
            if (localStream) call.answer(localStream);
            else call.answer();

            connections[call.peer] = { ...connections[call.peer], media: call };

            call.on('stream', (remoteStream) => addVideoStream(call.peer, remoteStream));
            call.on('close', () => removeVideoStream(call.peer));
        });

        peer.on('connection', (conn) => {
            connections[conn.peer] = { ...connections[conn.peer], data: conn };
            conn.on('open', () => setupDataConnectionListeners(conn));
        });

    } catch (err) {
        console.error("Failed to get local stream:", err);
        alert('Cannot access camera/mic.');
    }
}

// Media call
function callPeer(remotePeerId, stream) {
    const mediaCall = peer.call(remotePeerId, stream);
    connections[remotePeerId] = { ...connections[remotePeerId], media: mediaCall };
    mediaCall.on('stream', remoteStream => addVideoStream(mediaCall.peer, remoteStream));
    mediaCall.on('close', () => removeVideoStream(mediaCall.peer));
    connectToPeer(remotePeerId);
}

// Data connection
function connectToPeer(remotePeerId) {
    if (connections[remotePeerId]?.data) return;
    const conn = peer.connect(remotePeerId, { reliable: true });
    connections[remotePeerId] = { ...connections[remotePeerId], data: conn };
    conn.on('open', () => setupDataConnectionListeners(conn));
}

// -------------------
// 3. VIDEO RENDERING
// -------------------
function addVideoStream(id, stream) {
    if (!videoGrid) return;
    let video = document.getElementById(`remote-${id}`);
    if (video) video.remove();
    video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.id = `remote-${id}`;
    video.muted = false;
    video.onloadedmetadata = () => video.play().catch(() => {});
    videoGrid.append(video);
}
function removeVideoStream(id) {
    const video = document.getElementById(`remote-${id}`);
    if (video) video.remove();
    if (connections[id]) delete connections[id].media;
}

// -------------------
// 4. TEXT CHAT & FILE TRANSFER
// -------------------
function sendChatMessage(messageText) {
    if (!messageText) return;
    const message = { type: 'chat', user: DISPLAY_NAME, text: messageText };
    displayMessage(message.user, message.text, true);

    Object.values(connections).forEach(conn => {
        if (conn.data && conn.data.open) conn.data.send(message);
    });
}

function setupDataConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch (data.type) {
            case 'chat':
                displayMessage(data.user, data.text, false);
                break;
            case 'file_meta':
                handleFileMeta(data, conn);
                break;
            case 'file_chunk':
                handleFileChunk(data);
                break;
        }
    });
}

// Display messages and image previews
function displayMessage(user, text, isMyMessage) {
    if (!messagesContainer) return;
    const messageElement = document.createElement('div');
    messageElement.className = isMyMessage ? 'my-message' : 'remote-message';

    // Check if text is image URL
    if (text && text.startsWith('data:image/')) {
        messageElement.innerHTML = `<b>${escapeHtml(user)}</b>: <br><img src="${text}" style="max-width:200px; max-height:200px; border-radius:5px;">`;
    } else {
        messageElement.innerHTML = `<b>${escapeHtml(user)}</b>: ${text}`;
    }

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]);
}

// Chat input
if (messageForm) {
    messageForm.addEventListener('submit', e => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText) sendChatMessage(messageText);
        messageInput.value = '';
    });
}

// -------------------
// 5. FILE TRANSFER WITH IMAGE SUPPORT
// -------------------
const receivedFiles = {};

document.addEventListener('DOMContentLoaded', () => {
    const sendFileBtn = document.createElement('button');
    sendFileBtn.id = 'send-file-btn';
    sendFileBtn.className = 'control-btn';
    sendFileBtn.title = 'Send File';
    sendFileBtn.innerHTML = '<i class="fas fa-file-upload"></i>';

    if (messageForm) {
        const submitBtn = messageForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.parentNode.insertBefore(sendFileBtn, submitBtn.nextSibling);
    }

    sendFileBtn.addEventListener('click', e => {
        e.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', sendFile);
});

const CHUNK_SIZE = 16000;

function sendFile() {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        const dataURL = e.target.result;
        // If image, send as base64 string in a single message
        if (file.type.startsWith('image/')) {
            const message = { type: 'chat', user: DISPLAY_NAME, text: dataURL };
            displayMessage(DISPLAY_NAME, dataURL, true);
            Object.values(connections).forEach(conn => { if (conn.data.open) conn.data.send(message); });
        } else {
            // Non-image files: existing chunked logic
            const fileMeta = { type:'file_meta', name:file.name, size:file.size, peerId:myPeerId, mime:file.type||'application/octet-stream' };
            Object.values(connections).forEach(conn => { if (conn.data.open) conn.data.send(fileMeta); });

            let offset = 0;
            const readNextChunk = () => {
                const slice = file.slice(offset, offset + CHUNK_SIZE);
                reader.readAsArrayBuffer(slice);
            };
            reader.onload = e2 => {
                const chunk = e2.target.result;
                Object.values(connections).forEach(conn => { if (conn.data.open) conn.data.send({ type:'file_chunk', peerId:myPeerId, chunk:chunk, offset:offset }); });
                offset += chunk.byteLength;
                if (offset < file.size) readNextChunk();
                else displayMessage(DISPLAY_NAME, `File sent: ${file.name}`, true);
            };
            readNextChunk();
        }
    };
    reader.readAsDataURL(file);
}

function handleFileMeta(meta, conn) {
    const fileId = `${meta.peerId}-${meta.name}`;
    receivedFiles[fileId] = { data: [], meta: meta, receivedSize:0, conn: conn };
    displayMessage("System", `Incoming file from ${meta.peerId}: ${meta.name}`, false);
}

function handleFileChunk(chunkData) {
    const searchPrefix = `${chunkData.peerId}-`;
    const fileId = Object.keys(receivedFiles).find(k => k.startsWith(searchPrefix));
    const file = receivedFiles[fileId];
    if (!file) return;
    file.data.push(chunkData.chunk);
    file.receivedSize += chunkData.chunk.byteLength;

    if (file.receivedSize >= file.meta.size) {
        const blob = new Blob(file.data, { type: file.meta.mime });
        const url = URL.createObjectURL(blob);
        const downloadLink = `<a href="${url}" download="${encodeURIComponent(file.meta.name)}">here</a>`;
        displayMessage("System", `File received: ${file.meta.name}. Click ${downloadLink} to download.`, false);
        delete receivedFiles[fileId];
    }
}

// -------------------
// 6. UI CONTROLS
// -------------------
if (onlineUsersRef && onlineUsersList) {
    onlineUsersList.innerHTML = '';
    onlineUsersRef.on('child_added', snapshot => {
        const user = snapshot.val();
        const userElement = document.createElement('p');
        userElement.id = `user-${user.peerId}`;
        userElement.textContent = `🟢 ${user.name} (${user.peerId===myPeerId?'You':'Online'})`;
        onlineUsersList.appendChild(userElement);
        if (user.peerId!==myPeerId && localStream) callPeer(user.peerId, localStream);
    });

    onlineUsersRef.on('child_removed', snapshot => {
        const peerId = snapshot.key;
        const userElement = document.getElementById(`user-${peerId}`);
        if (userElement) userElement.remove();
        removeVideoStream(peerId);
        if (connections[peerId]) {
            if (connections[peerId].media) connections[peerId].media.close();
            if (connections[peerId].data) connections[peerId].data.close();
            delete connections[peerId];
        }
    });
}

if (micToggle) micToggle.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    micToggle.classList.toggle('off', !audioTrack.enabled);
});

if (videoToggle) videoToggle.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    videoToggle.classList.toggle('off', !videoTrack.enabled);
});

if (leaveCallButton) leaveCallButton.addEventListener('click', () => {
    Object.values(connections).forEach(c => { if (c.media) c.media.close(); if (c.data) c.data.close(); });
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (onlineUsersRef && myPeerId) onlineUsersRef.child(myPeerId).remove();
    alert('Call ended.');
    window.location.href = 'index.html';
});

window.onload = () => { if (document.getElementById('app-container')) initializeVideo(); };
