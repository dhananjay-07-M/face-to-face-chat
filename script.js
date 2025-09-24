// ===================================================
// SCRIPT.JS: APPLICATION LOGIC (FINAL VERSION)
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

// Initialize Firebase
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

// Helper function to create a unique ID for this user/session
function generateRandomId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// -------------------
// 2. CORE FUNCTIONS: WebRTC/PeerJS Setup
// -------------------

async function initializeVideo() {
    // 1. Prompt user for unique name
    const userName = prompt("Welcome! Please enter your display name:");
    if (userName && userName.trim() !== "") {
        DISPLAY_NAME = userName.trim();
    } else {
        DISPLAY_NAME = "Guest_" + Math.floor(Math.random() * 1000);
    }
    
    roomDisplay.textContent = `Room: ${ROOM_NAME}`;

    try {
        // Get local media
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        // 2. PeerJS Configuration with STUN Servers (Fixes NAT Traversal/Mobile issues)
        const peerConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.services.mozilla.com' }
            ]
        };
        
        myPeerId = generateRandomId();
        // Initialize PeerJS with the robust configuration
        peer = new Peer(myPeerId, peerConfig); 
        
        peer.on('open', (id) => {
            console.log('My Peer ID is: ' + id);
            
            // A. Post user online status/ID to Firebase
            if (onlineUsersRef) {
                const userRef = onlineUsersRef.child(id);
                userRef.set({ name: DISPLAY_NAME, peerId: id });
                
                userRef.onDisconnect().remove();
                
                // B. Call other users already in the room
                onlineUsersRef.once('value', (snapshot) => {
                    snapshot.forEach((childSnapshot) => {
                        const remoteUser = childSnapshot.val();
                        if (remoteUser.peerId !== id) {
                            callPeer(remoteUser.peerId, localStream);
                        }
                    });
                });
            }
        });

        // 3. Handle incoming calls
        peer.on('call', (call) => {
            console.log('Incoming call from:', call.peer);
            call.answer(localStream);
            
            call.on('stream', (remoteStream) => {
                addVideoStream(call.peer, remoteStream);
            });
            
            call.on('close', () => {
                removeVideoStream(call.peer);
            });
            
            connections[call.peer] = call;
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

// Function to call a remote peer
function callPeer(remotePeerId, stream) {
    if (connections[remotePeerId]) return;

    console.log('Calling peer:', remotePeerId);
    const call = peer.call(remotePeerId, stream);
    
    call.on('stream', (remoteStream) => {
        addVideoStream(call.peer, remoteStream);
    });
    
    call.on('close', () => {
        removeVideoStream(call.peer);
    });

    connections[remotePeerId] = call;
}

// Function to add a video stream to the DOM
function addVideoStream(id, stream) {
    if (document.getElementById(`remote-${id}`)) return;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    // CRITICAL: Ensure video is set to play on mobile
    video.autoplay = true;
    video.playsinline = true; 
    
    video.id = `remote-${id}`;
    
    // Attempt to play immediately (sometimes required by some browsers)
    video.onloadedmetadata = () => {
        video.play().catch(e => console.log('Video play failed:', e));
    };

    videoGrid.append(video);
}

// Function to remove a video stream from the DOM
function removeVideoStream(id) {
    const videoElement = document.getElementById(`remote-${id}`);
    if (videoElement) {
        videoElement.remove();
        delete connections[id];
    }
}

// -------------------
// 3. TEXT CHAT & UI CONTROLS
// -------------------

// Text Chat Submission
if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText && chatRef) {
            chatRef.push({
                user: DISPLAY_NAME, 
                text: messageText,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            messageInput.value = '';
        }
    });
}

// Listen for new messages from Firebase
if (chatRef) {
    chatRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        
        const messageElement = document.createElement('div');
        messageElement.textContent = `${message.user}: ${message.text}`;
        
        const isMyMessage = (message.user === DISPLAY_NAME); 
        
        messageElement.className = isMyMessage ? 'my-message' : 'remote-message';
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// Listen for users joining/leaving to update the sidebar
if (onlineUsersRef && onlineUsersList) {
    onlineUsersList.innerHTML = '';
    
    onlineUsersRef.on('child_added', (snapshot) => {
        const user = snapshot.val();
        const userElement = document.createElement('p');
        userElement.id = `user-${user.peerId}`;
        userElement.textContent = `🟢 ${user.name} (${user.peerId === myPeerId ? 'You' : 'Online'})`;
        onlineUsersList.appendChild(userElement);
    });

    onlineUsersRef.on('child_removed', (snapshot) => {
        const peerId = snapshot.key;
        const userElement = document.getElementById(`user-${peerId}`);
        if (userElement) {
            userElement.remove();
        }
        removeVideoStream(peerId);
    });
}


// Mic and Video Toggles
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
    Object.values(connections).forEach(conn => conn.close());
    localStream.getTracks().forEach(track => track.stop());
    
    if (onlineUsersRef && myPeerId) {
         onlineUsersRef.child(myPeerId).remove();
    }
    
    alert('Call ended. Redirecting to home.');
    window.location.href = 'index.html'; 
});


// Start the application when the page loads
window.onload = () => {
    if (document.getElementById('app-container')) {
        initializeVideo();
    }
};
