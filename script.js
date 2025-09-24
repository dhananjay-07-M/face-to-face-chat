// ===================================================
// SCRIPT.JS: APPLICATION LOGIC WITH IMAGE PREVIEWS
// ===================================================

// -------------------
// 1. CONFIGURATION
// -------------------
// It's a good practice to use environment variables for keys, but for this project,
// we'll keep it simple by defining them directly.
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

// Use a self-executing function to ensure Firebase is initialized correctly
(function() {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        chatRef = database.ref('messages/' + ROOM_NAME);
        onlineUsersRef = database.ref('onlineUsers/' + ROOM_NAME);
    } else {
        console.error("Firebase SDK not loaded. Check your script tags.");
        // A user-friendly alert could be added here if the app is critical
    }
})();

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
            localVideo.play().catch(() => {});
        }

        myPeerId = generateRandomId();
        peer = new Peer(myPeerId, peerConfig);

        peer.on('open', (id) => {
            console.log('My Peer ID:', id);
            const userRef = onlineUsersRef.child(id);
            userRef.set({ name: DISPLAY_NAME, peerId: id });
            try { userRef.onDisconnect().remove(); } catch (e){ console.error("onDisconnect failed:", e); }

            // This is a key fix: We must re-establish connections with all active users
            // when we come online. This fixes the issue where new users cannot see
            // existing ones.
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

        // The 'call' event listener handles incoming calls
        peer.on('call', (call) => {
            console.log("Receiving call from:", call.peer);
            call.answer(localStream);
            connections[call.peer] = { ...connections[call.peer], media: call };
            call.on('stream', (remoteStream) => {
                addVideoStream(call.peer, remoteStream);
            });
            call.on('close', () => removeVideoStream(call.peer));
            call.on('error', (err) => console.error("Call error:", err));
        });

        // The 'connection' event listener handles incoming data connections
        peer.on('connection', (conn) => {
            console.log("Receiving data connection from:", conn.peer);
            connections[conn.peer] = { ...connections[conn.peer], data: conn };
            conn.on('open', () => setupDataConnectionListeners(conn));
            conn.on('error', (err) => console.error("Data connection error:", err));
        });

        peer.on('disconnected', () => {
            console.log("Peer disconnected. Reconnecting...");
            peer.reconnect();
        });

    } catch (err) {
        console.error("Failed to get local stream:", err);
        // Using a custom message box instead of alert()
        displayMessageBox('Cannot access camera/mic. Please ensure permissions are granted and try again.', 'error');
    }
}

// Media call
function callPeer(remotePeerId, stream) {
    // Prevent duplicate calls
    if (connections[remotePeerId]?.media) {
        console.log(`Already calling peer ${remotePeerId}`);
        return;
    }
    const mediaCall = peer.call(remotePeerId, stream);
    connections[remotePeerId] = { ...connections[remotePeerId], media: mediaCall };
    mediaCall.on('stream', remoteStream => addVideoStream(mediaCall.peer, remoteStream));
    mediaCall.on('close', () => removeVideoStream(mediaCall.peer));
    mediaCall.on('error', (err) => console.error("Call to peer failed:", err));
    connectToPeer(remotePeerId);
}

// Data connection
function connectToPeer(remotePeerId) {
    if (connections[remotePeerId]?.data) {
        console.log(`Already connected to peer ${remotePeerId}`);
        return;
    }
    const conn = peer.connect(remotePeerId, { reliable: true });
    connections[remotePeerId] = { ...connections[remotePeerId], data: conn };
    conn.on('open', () => setupDataConnectionListeners(conn));
    conn.on('error', (err) => console.error("Data connection to peer failed:", err));
}

// -------------------
// 3. VIDEO RENDERING
// -------------------
function addVideoStream(id, stream) {
    if (!videoGrid) return;
    const existingVideo = document.getElementById(`remote-${id}`);
    if (existingVideo) return; // Prevent adding duplicate videos

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.id = `remote-${id}`;
    video.muted = false;

    // Use a promise to ensure video plays correctly on all platforms
    video.onloadedmetadata = () => {
        video.play().catch(e => console.error("Video play failed:", e));
    };

    videoGrid.append(video);
}

function removeVideoStream(id) {
    const video = document.getElementById(`remote-${id}`);
    if (video) video.remove();
    if (connections[id]) {
        if (connections[id].media) connections[id].media.close();
        if (connections[id].data) connections[id].data.close();
        delete connections[id];
    }
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
        console.log("Data received:", data);
        if (!data.type) {
            console.error("Received data without a 'type' field.");
            return;
        }
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
            default:
                console.warn(`Unknown data type received: ${data.type}`);
        }
    });

    conn.on('error', (err) => console.error("Data connection error:", err));
    conn.on('close', () => console.log("Data connection closed."));
}

// Display messages and image previews
function displayMessage(user, text, isMyMessage) {
    if (!messagesContainer) return;
    const messageElement = document.createElement('div');
    messageElement.className = isMyMessage ? 'my-message' : 'remote-message';

    // Check if text is a Base64 image URL
    if (text && text.startsWith('data:image/')) {
        const img = new Image();
        img.src = text;
        img.style.maxWidth = '200px';
        img.style.maxHeight = '200px';
        img.style.borderRadius = '5px';
        
        const textElement = document.createElement('span');
        textElement.innerHTML = `<b>${escapeHtml(user)}</b>: <br>`;
        
        messageElement.appendChild(textElement);
        messageElement.appendChild(img);
    } else {
        messageElement.innerHTML = `<b>${escapeHtml(user)}</b>: ${escapeHtml(text)}`;
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
const CHUNK_SIZE = 16000;

document.addEventListener('DOMContentLoaded', () => {
    // Add file input and button dynamically if they don't exist
    if (messageForm && !document.getElementById('send-file-btn')) {
        const sendFileBtn = document.createElement('button');
        sendFileBtn.id = 'send-file-btn';
        sendFileBtn.className = 'control-btn';
        sendFileBtn.title = 'Send File';
        sendFileBtn.innerHTML = '<i class="fas fa-file-upload"></i>';
        
        const submitBtn = messageForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            messageForm.insertBefore(sendFileBtn, submitBtn);
        }

        sendFileBtn.addEventListener('click', e => {
            e.preventDefault();
            fileInput.click();
        });
    }

    fileInput.addEventListener('change', sendFile);
});

function sendFile() {
    const file = fileInput.files[0];
    if (!file) return;

    // Read the file as a Data URL for previewing, even if we send as chunks
    const reader = new FileReader();
    reader.onload = e => {
        const dataURL = e.target.result;
        // Display a message for the sender
        displayMessage(DISPLAY_NAME, `Sending file: ${file.name}`, true);
        
        // This is the main change: We will now send all files as chunks,
        // but for images, we also send a direct chat message with the preview.
        if (file.type.startsWith('image/')) {
            const imagePreviewMessage = { type: 'chat', user: DISPLAY_NAME, text: dataURL };
            Object.values(connections).forEach(conn => {
                if (conn.data && conn.data.open) conn.data.send(imagePreviewMessage);
            });
        }
        
        // Begin chunked file transfer for all file types
        const fileMeta = { type:'file_meta', name:file.name, size:file.size, peerId:myPeerId, mime:file.type||'application/octet-stream' };
        Object.values(connections).forEach(conn => {
            if (conn.data && conn.data.open) conn.data.send(fileMeta);
        });

        const arrayReader = new FileReader();
        let offset = 0;
        
        arrayReader.onload = e => {
            const chunk = e.target.result;
            Object.values(connections).forEach(conn => {
                if (conn.data && conn.data.open) {
                    conn.data.send({ type:'file_chunk', peerId:myPeerId, chunk:chunk, offset:offset });
                }
            });
            offset += chunk.byteLength;
            if (offset < file.size) {
                readNextChunk(arrayReader);
            } else {
                displayMessage(DISPLAY_NAME, `File sent: ${file.name}`, true);
            }
        };

        const readNextChunk = (r) => {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            r.readAsArrayBuffer(slice);
        };
        
        readNextChunk(arrayReader);
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
    if (!file) {
        console.error("Received chunk for unknown file.");
        return;
    }
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

// Custom message box function to replace alert()
function displayMessageBox(message, type) {
    const box = document.createElement('div');
    box.textContent = message;
    box.style.position = 'fixed';
    box.style.bottom = '20px';
    box.style.left = '50%';
    box.style.transform = 'translateX(-50%)';
    box.style.padding = '15px 25px';
    box.style.borderRadius = '8px';
    box.style.zIndex = '9999';
    box.style.color = 'white';
    box.style.backgroundColor = type === 'error' ? '#e74c3c' : '#2ecc71';
    box.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    box.style.textAlign = 'center';
    
    document.body.appendChild(box);
    setTimeout(() => {
        box.remove();
    }, 5000); // Remove after 5 seconds
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
    });

    onlineUsersRef.on('child_removed', snapshot => {
        const peerId = snapshot.key;
        const userElement = document.getElementById(`user-${peerId}`);
        if (userElement) userElement.remove();
        removeVideoStream(peerId);
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
    Object.values(connections).forEach(c => {
        if (c.media) c.media.close();
        if (c.data) c.data.close();
    });
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (onlineUsersRef && myPeerId) onlineUsersRef.child(myPeerId).remove();
    displayMessageBox('Call ended.', 'info');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000); // Wait for message to display
});

window.onload = () => { if (document.getElementById('app-container')) initializeVideo(); };
