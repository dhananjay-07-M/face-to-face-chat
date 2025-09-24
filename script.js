// ===================================================
// SCRIPT.JS: APPLICATION LOGIC (FINAL, DEBUGGED VERSION)
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

// PeerJS Configuration with STUN Servers (Essential for cross-network/mobile connections)
const peerConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
    ]
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
    console.error("Firebase SDK not loaded. Check your dashboard.html file.");
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
    const userName = prompt("Welcome! Please enter your display name:");
    if (userName && userName.trim() !== "") {
        DISPLAY_NAME = userName.trim();
    } else {
        DISPLAY_NAME = "Guest_" + Math.floor(Math.random() * 1000);
    }
    
    roomDisplay.textContent = `Room: ${ROOM_NAME}`;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        myPeerId = generateRandomId();
        peer = new Peer(myPeerId, peerConfig); 
        
        peer.on('open', (id) => {
            console.log('My Peer ID is: ' + id);
            
            if (onlineUsersRef) {
                const userRef = onlineUsersRef.child(id);
                userRef.set({ name: DISPLAY_NAME, peerId: id });
                userRef.onDisconnect().remove();
                
                // CALL ALL EXISTING USERS IN THE ROOM
                onlineUsersRef.once('value', (snapshot) => {
                    snapshot.forEach((childSnapshot) => {
                        const remoteUser = childSnapshot.val();
                        if (remoteUser.peerId !== id) {
                            callPeer(remoteUser.peerId, localStream);
                            connectToPeer(remoteUser.peerId);
                        }
                    });
                });
            }
        });

        // HANDLE INCOMING MEDIA (VIDEO/AUDIO) CALLS
        peer.on('call', (call) => {
            console.log('Incoming media call from:', call.peer);
            call.answer(localStream);
            
            call.on('stream', (remoteStream) => {
                addVideoStream(call.peer, remoteStream);
            });
            
            call.on('close', () => {
                removeVideoStream(call.peer);
            });
            
            connections[call.peer] = { ...connections[call.peer], media: call };
        });

        // HANDLE INCOMING DATA (CHAT/FILE) CONNECTIONS
        peer.on('connection', (conn) => {
            console.log('Incoming data connection from:', conn.peer);
            // CRITICAL: Immediately store the incoming connection object
            connections[conn.peer] = { ...connections[conn.peer], data: conn };
            setupDataConnectionListeners(conn);
        });
        
        peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
        });

    } catch (err) {
        console.error("Failed to get local stream or initialize PeerJS:", err);
        alert('Error: Could not access your camera and/or microphone. This app requires both.');
        micToggle.disabled = true;
        videoToggle.disabled = true;
    }
}

// Function to establish both Media and Data connections
function callPeer(remotePeerId, stream) {
    // 1. Establish Media Connection (Video)
    const mediaCall = peer.call(remotePeerId, stream);
    
    mediaCall.on('stream', (remoteStream) => {
        addVideoStream(mediaCall.peer, remoteStream);
    });
    
    mediaCall.on('close', () => {
        removeVideoStream(mediaCall.peer);
    });
    
    connections[remotePeerId] = { ...connections[remotePeerId], media: mediaCall };
    
    // 2. Establish Data Connection (Chat/Files)
    connectToPeer(remotePeerId);
}

function connectToPeer(remotePeerId) {
    // If DataConnection already exists, don't create a new one
    if (connections[remotePeerId] && connections[remotePeerId].data) return; 

    const conn = peer.connect(remotePeerId, { reliable: true });
    
    // CRITICAL FIX: Store the connection object immediately for chat stability
    connections[remotePeerId] = { ...connections[remotePeerId], data: conn };
    
    conn.on('open', () => {
        console.log('Data connection opened with:', remotePeerId);
        setupDataConnectionListeners(conn);
    });
    
    conn.on('error', (err) => {
        console.error('Data connection error:', err);
    });
}


// -------------------
// 3. VIDEO RENDERING & STREAM MANAGEMENT (FIXED FOR BLACK SCREEN)
// -------------------

function addVideoStream(id, stream) {
    let video = document.getElementById(`remote-${id}`);
    
    // FIX: If video element exists, remove it first to ensure a clean stream re-attachment/render
    if (video) {
        video.remove();
        console.log(`Re-rendering stream for: ${id}`);
    } else {
        console.log(`Adding new stream for: ${id}`);
    }
    
    // Create and configure the new video element
    video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true; 
    video.id = `remote-${id}`;
    
    // Set up the event listener for playback (CRUCIAL for mobile/browsers)
    video.onloadedmetadata = () => {
        video.play().catch(e => console.log('Video play failed:', e));
    };

    videoGrid.append(video);
}

function removeVideoStream(id) {
    const videoElement = document.getElementById(`remote-${id}`);
    if (videoElement) {
        videoElement.remove();
    }
    if (connections[id]) {
        delete connections[id].media;
    }
}

// -------------------
// 4. TEXT CHAT & FILE TRANSFER (PeerJS DataChannel)
// -------------------

function sendChatMessage(messageText) {
    const message = { type: 'chat', user: DISPLAY_NAME, text: messageText };
    
    // Display my own message locally
    displayMessage(message.user, message.text, true); 

    // Send to all connected peers
    Object.values(connections).forEach(conn => {
        // Chat sends if the connection exists AND is open
        if (conn.data && conn.data.open) { 
            conn.data.send(message);
        } else if (conn.data && !conn.data.open) {
            console.warn(`Data channel to ${conn.data.peer} is not yet open.`);
        }
    });
}

function setupDataConnectionListeners(conn) {
    conn.on('data', (data) => {
        switch(data.type) {
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
    conn.on('close', () => {
        console.log('Data connection closed with:', conn.peer);
    });
    conn.on('error', (err) => {
        console.error('Data connection error:', err);
    });
}

// FIX: This function uses innerHTML to render the download link correctly
function displayMessage(user, text, isMyMessage) {
    const messageElement = document.createElement('div');
    // CRITICAL FIX: Use innerHTML to allow HTML tags (like <a>) to render
    messageElement.innerHTML = `<b>${user}</b>: ${text}`; 
    
    messageElement.className = isMyMessage ? 'my-message' : 'remote-message';
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Chat Input Fix and Submission ---
if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText) {
            sendChatMessage(messageText); 
            messageInput.value = '';
        }
    });
}

// -------------------
// 5. FILE TRANSFER LOGIC
// -------------------

const receivedFiles = {}; 

document.addEventListener('DOMContentLoaded', () => {
    // Add file icon button
    const sendFileBtn = document.createElement('button');
    sendFileBtn.id = 'send-file-btn';
    sendFileBtn.className = 'control-btn';
    sendFileBtn.title = 'Send File';
    sendFileBtn.innerHTML = '<i class="fas fa-file-upload"></i>';
    
    // Insert file button next to the Send Message button
    const submitBtn = messageForm.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.parentNode.insertBefore(sendFileBtn, submitBtn.nextSibling);
    } else {
        const leaveBtn = document.getElementById('leave-call');
        if(leaveBtn) leaveBtn.parentNode.insertBefore(sendFileBtn, leaveBtn);
    }

    sendFileBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        fileInput.click();
    });

    fileInput.addEventListener('change', sendFile);
});

const CHUNK_SIZE = 16000; 

function sendFile() {
    const file = fileInput.files[0];
    if (!file) return;

    const fileMeta = {
        type: 'file_meta',
        name: file.name,
        size: file.size,
        peerId: myPeerId,
        mime: file.type || 'application/octet-stream'
    };
    
    Object.values(connections).forEach(conn => {
        if (conn.data && conn.data.open) {
            conn.data.send(fileMeta);
        }
    });

    const reader = new FileReader();
    let offset = 0;

    reader.onload = (e) => {
        const chunk = e.target.result;
        Object.values(connections).forEach(conn => {
            if (conn.data && conn.data.open) {
                conn.data.send({
                    type: 'file_chunk',
                    peerId: myPeerId,
                    chunk: chunk,
                    offset: offset
                });
            }
        });
        offset += chunk.byteLength;
        if (offset < file.size) {
            readNextChunk();
        } else {
            console.log("File transfer complete!");
            displayMessage(DISPLAY_NAME, `File sent: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`, true);
        }
    };

    const readNextChunk = () => {
        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(chunk);
    };

    readNextChunk();
}


function handleFileMeta(meta, conn) {
    const fileId = `${meta.peerId}-${meta.name}`;
    receivedFiles[fileId] = {
        data: [],
        meta: meta,
        receivedSize: 0,
        conn: conn 
    };
    displayMessage("System", `Incoming file from ${meta.peerId}: ${meta.name} (${(meta.size/1024/1024).toFixed(2)} MB)`, false);
}

function handleFileChunk(chunkData) {
    const fileId = `${chunkData.peerId}-${receivedFiles[`${chunkData.peerId}-${receivedFiles}`]?.meta.name}`;
    const file = receivedFiles[fileId];

    if (!file) return;

    file.data.push(chunkData.chunk);
    file.receivedSize += chunkData.chunk.byteLength;

    if (file.receivedSize === file.meta.size) {
        const blob = new Blob(file.data, { type: file.meta.mime });
        const url = URL.createObjectURL(blob);
        
        // Final message with the download link
        const downloadLink = `<a href="${url}" download="${file.meta.name}" target="_blank">here</a>`;
        displayMessage("System", `File received: ${file.meta.name}. Click ${downloadLink} to download.`, false);
        
        delete receivedFiles[fileId];
    }
}


// -------------------
// 6. UI CONTROLS & CLEANUP
// -------------------

if (onlineUsersRef && onlineUsersList) {
    onlineUsersList.innerHTML = '';
    
    onlineUsersRef.on('child_added', (snapshot) => {
        const user = snapshot.val();
        const userElement = document.createElement('p');
        userElement.id = `user-${user.peerId}`;
        userElement.textContent = `🟢 ${user.name} (${user.peerId === myPeerId ? 'You' : 'Online'})`;
        onlineUsersList.appendChild(userElement);
        
        if (user.peerId !== myPeerId && localStream) {
            callPeer(user.peerId, localStream);
            connectToPeer(user.peerId);
        }
    });

    onlineUsersRef.on('child_removed', (snapshot) => {
        const peerId = snapshot.key;
        const userElement = document.getElementById(`user-${peerId}`);
        if (userElement) {
            userElement.remove();
        }
        removeVideoStream(peerId);
        
        if (connections[peerId]) {
            if (connections[peerId].media) connections[peerId].media.close();
            if (connections[peerId].data) connections[peerId].data.close();
            delete connections[peerId];
        }
    });
}

micToggle.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    micToggle.classList.toggle('off', !audioTrack.enabled);
    micToggle.title = audioTrack.enabled ? 'Toggle Mic' : 'Mic OFF';
});

videoToggle.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    videoToggle.classList.toggle('off', !videoTrack.enabled);
    videoToggle.title = videoTrack.enabled ? 'Toggle Video' : 'Video OFF';
});

leaveCallButton.addEventListener('click', () => {
    Object.values(connections).forEach(c => {
        if (c.media) c.media.close();
        if (c.data) c.data.close();
    });
    localStream.getTracks().forEach(track => track.stop());
    
    if (onlineUsersRef && myPeerId) {
         onlineUsersRef.child(myPeerId).remove();
    }
    
    alert('Call ended. Redirecting to home.');
    window.location.href = 'index.html'; 
});


window.onload = () => {
    if (document.getElementById('app-container')) {
        initializeVideo();
    }
};
