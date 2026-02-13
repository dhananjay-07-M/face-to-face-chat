// =====================================================
// VISIO - ENTERPRISE STABLE VERSION
// Text | Video | Hybrid | Online Users | Clean Sync
// =====================================================

// ================= FIREBASE =================

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

// ================= GLOBAL STATE =================

let CURRENT_MODE = "";
let ROOM_ID = "";
let DISPLAY_NAME = "";

let peer = null;
let myPeerId = null;
let localStream = null;

const connections = {};
const userCache = {};

function get(id){ return document.getElementById(id); }

// =====================================================
// MODE START
// =====================================================

window.startInstant = function(mode){

    CURRENT_MODE = mode;

    if(mode==="text") ROOM_ID="text-room";
    if(mode==="video") ROOM_ID="video-room";
    if(mode==="both") ROOM_ID="hybrid-room";

    DISPLAY_NAME = prompt("Enter your name (max 15 chars):");
    if(!DISPLAY_NAME) return;

    applyModeUI();

    get("join-screen").style.display="none";
    get("main-app").style.display="block";

    initializeRoom();
};

// =====================================================
// MODE UI CONTROL
// =====================================================

function applyModeUI(){

    document.body.classList.remove("video-only","text-only");

    if(CURRENT_MODE==="video")
        document.body.classList.add("video-only");

    if(CURRENT_MODE==="text")
        document.body.classList.add("text-only");
}

// =====================================================
// INITIALIZE ROOM
// =====================================================

async function initializeRoom(){

    myPeerId = "visio_"+Math.random().toString(36).substr(2,9);

    peer = new Peer(myPeerId);

    const usersRef = database.ref("rooms/"+ROOM_ID+"/users");

    peer.on("open", id=>{

        // Add self
        usersRef.child(id).set({
            name: DISPLAY_NAME,
            peerId: id,
            joinedAt: Date.now()
        });

        usersRef.child(id).onDisconnect().remove();

        listenForUsers(usersRef,id);
    });

    if(CURRENT_MODE!=="text"){
        await initializeMedia();
    }

    setupPeerEvents();
}

// =====================================================
// USER LISTENERS
// =====================================================

function listenForUsers(usersRef,myId){

    usersRef.on("value", snapshot=>{

        const users = snapshot.val() || {};

        get("online-users-list").innerHTML = "";

        Object.keys(users).forEach(uid=>{
            const user = users[uid];
            addOnlineUser(user.peerId,user.name);
        });
    });

    usersRef.on("child_added", snap=>{
        const user = snap.val();

        if(user.peerId===myId) return;

        if(!connections[user.peerId]){
            connectToPeer(user.peerId);

            if(CURRENT_MODE!=="text"){
                callPeer(user.peerId);
            }
        }
    });

    usersRef.on("child_removed", snap=>{
        const user = snap.val();
        cleanupUser(user.peerId);
    });
}

// =====================================================
// MEDIA
// =====================================================

async function initializeMedia(){
    try{
        localStream = await navigator.mediaDevices.getUserMedia({
            video:true,
            audio:true
        });

        get("local-video").srcObject = localStream;

    }catch(e){
        alert("Camera/Mic permission denied");
    }
}

// =====================================================
// PEER EVENTS
// =====================================================

function setupPeerEvents(){

    peer.on("call", call=>{
        call.answer(localStream);

        call.on("stream", stream=>{
            addVideoStream(call.peer,stream);
        });

        connections[call.peer] = connections[call.peer] || {};
        connections[call.peer].media = call;
    });

    peer.on("connection", conn=>{
        conn.on("open",()=>{
            connections[conn.peer] = connections[conn.peer] || {};
            connections[conn.peer].data = conn;
            setupDataChannel(conn);
        });
    });
}

// =====================================================
// VIDEO SYSTEM
// =====================================================

function addVideoStream(peerId,stream){

    if(get("wrap-"+peerId)) return;

    const wrapper=document.createElement("div");
    wrapper.className="video-wrapper";
    wrapper.id="wrap-"+peerId;

    const video=document.createElement("video");
    video.srcObject=stream;
    video.autoplay=true;
    video.playsInline=true;

    wrapper.appendChild(video);
    get("video-grid").appendChild(wrapper);
}

function removeVideo(peerId){
    get("wrap-"+peerId)?.remove();
}

// =====================================================
// CHAT SYSTEM
// =====================================================

get("message-form")?.addEventListener("submit",e=>{

    e.preventDefault();

    if(CURRENT_MODE==="video") return;

    const input=get("message-input");
    const msg=input.value.trim();
    if(!msg) return;

    displayMessage(DISPLAY_NAME,msg,true);

    broadcast({
        type:"chat",
        user:DISPLAY_NAME,
        text:msg,
        timestamp:Date.now()
    });

    input.value="";
});

function displayMessage(user,text,mine){

    const div=document.createElement("div");
    div.className=mine?"chat-bubble mine":"chat-bubble other";

    const time = new Date().toLocaleTimeString([],{
        hour:"2-digit",
        minute:"2-digit"
    });

    div.innerHTML=`
        <div><b>${mine?"You":user}</b></div>
        <div>${text}</div>
        <div style="font-size:11px;opacity:0.7">${time}</div>
    `;

    get("messages-container").appendChild(div);

    get("messages-container").scrollTop =
        get("messages-container").scrollHeight;
}

// =====================================================
// DATA CHANNEL
// =====================================================

function setupDataChannel(conn){

    conn.on("data",data=>{

        if(data.type==="chat"){
            displayMessage(data.user,data.text,false);
        }
    });
}

function connectToPeer(id){

    if(connections[id]?.data) return;

    const conn = peer.connect(id,{reliable:true});

    conn.on("open",()=>{
        connections[id] = connections[id] || {};
        connections[id].data = conn;
        setupDataChannel(conn);
    });
}

function callPeer(id){

    if(connections[id]?.media) return;

    const call = peer.call(id,localStream);

    connections[id] = connections[id] || {};
    connections[id].media = call;

    call.on("stream",stream=>{
        addVideoStream(id,stream);
    });
}

// =====================================================
// BROADCAST
// =====================================================

function broadcast(data){

    Object.values(connections).forEach(c=>{
        if(c.data && c.data.open){
            c.data.send(data);
        }
    });
}

// =====================================================
// USER CLEANUP
// =====================================================

function cleanupUser(peerId){

    removeOnlineUser(peerId);
    removeVideo(peerId);

    if(connections[peerId]){
        connections[peerId].data?.close();
        connections[peerId].media?.close();
        delete connections[peerId];
    }
}

// =====================================================
// ONLINE USERS UI
// =====================================================

function addOnlineUser(id,name){

    if(get("user-"+id)) return;

    const div=document.createElement("div");
    div.id="user-"+id;
    div.style.marginBottom="8px";
    div.innerText="🟢 "+name;

    get("online-users-list").appendChild(div);
}

function removeOnlineUser(id){
    get("user-"+id)?.remove();
}

// =====================================================
// CONTROLS
// =====================================================

get("mic-toggle")?.addEventListener("click",()=>{

    if(!localStream) return;

    const track=localStream.getAudioTracks()[0];
    track.enabled=!track.enabled;

    get("mic-toggle").innerHTML =
        track.enabled ? "🎤" : "🎤❌";
});

get("video-toggle")?.addEventListener("click",()=>{

    if(!localStream) return;

    const track=localStream.getVideoTracks()[0];
    track.enabled=!track.enabled;

    get("video-toggle").innerHTML =
        track.enabled ? "📷" : "📷❌";
});

get("leave-call")?.addEventListener("click",()=>{

    localStream?.getTracks().forEach(t=>t.stop());
    peer?.destroy();
    location.reload();
});
