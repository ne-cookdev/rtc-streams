let token = localStorage.getItem('token');
let ws = null;
let peerConnections = {};
let localStream = null;
let isBroadcasting = false;
let currentUsername = null;

// UI Elements
const authSection = document.getElementById('authSection');
const streamingSection = document.getElementById('streamingSection');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const startBroadcastBtn = document.getElementById('startBroadcastBtn');
const stopBroadcastBtn = document.getElementById('stopBroadcastBtn');
const broadcastList = document.getElementById('broadcastList');
const videoContainer = document.getElementById('videoContainer');
const currentUserElement = document.getElementById('currentUser');

// Check if user is already logged in
if (token) {
    // Decode JWT to get username
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUsername = payload.sub;
        currentUserElement.textContent = currentUsername;
        authSection.classList.add('hidden');
        streamingSection.classList.remove('hidden');
        connectWebSocket();
    } catch (error) {
        console.error('Error decoding token:', error);
        localStorage.removeItem('token');
    }
}

function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUsername = null;
    if (ws) {
        ws.close();
    }
    if (localStream) {
        stopBroadcast();
    }
    authSection.classList.remove('hidden');
    streamingSection.classList.add('hidden');
}

// Show/Hide Forms
function showRegister() {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
}

function showLogin() {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
}

// Authentication
async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch('http://localhost:8000/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });

        const data = await response.json();
        
        if (response.ok) {
            alert('Registration successful! Please login.');
            showLogin();
        } else {
            alert(data.detail || 'Registration failed');
        }
    } catch (error) {
        alert('Registration failed: ' + error.message);
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch('http://localhost:8000/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            token = data.access_token;
            currentUsername = username;
            currentUserElement.textContent = username;
            localStorage.setItem('token', token);
            authSection.classList.add('hidden');
            streamingSection.classList.remove('hidden');
            connectWebSocket();
        } else {
            const data = await response.json();
            alert(data.detail || 'Login failed');
        }
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

// WebSocket Connection
function connectWebSocket() {
    if (ws) {
        ws.close();
    }

    ws = new WebSocket(`ws://localhost:8000/ws/${token}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        requestBroadcastersList();
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received WebSocket message:', message);
        
        switch (message.type) {
            case 'broadcasters_list':
                updateBroadcastList(message.broadcasters);
                break;
            case 'broadcast_started':
                if (!isBroadcasting) {
                    updateBroadcastList([...broadcastList.getAttribute('data-broadcasters').split(','), message.broadcaster]);
                }
                break;
            case 'broadcast_stopped':
                if (!isBroadcasting) {
                    const broadcasters = broadcastList.getAttribute('data-broadcasters').split(',').filter(b => b !== message.broadcaster);
                    updateBroadcastList(broadcasters);
                }
                if (peerConnections[message.broadcaster]) {
                    peerConnections[message.broadcaster].close();
                    delete peerConnections[message.broadcaster];
                }
                break;
            case 'offer':
                console.log('Received offer from:', message.from);
                handleOffer(message);
                break;
            case 'answer':
                console.log('Received answer from:', message.from);
                handleAnswer(message);
                break;
            case 'ice-candidate':
                console.log('Received ICE candidate from:', message.from);
                handleIceCandidate(message);
                break;
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 1000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// WebRTC Functions
async function startBroadcast() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always"
            },
            audio: true
        });

        console.log('Got local stream:', localStream.getTracks().map(t => t.kind));

        isBroadcasting = true;
        startBroadcastBtn.classList.add('hidden');
        stopBroadcastBtn.classList.remove('hidden');

        ws.send(JSON.stringify({
            type: 'start_broadcast'
        }));

        // Create video element for local preview
        const video = document.createElement('video');
        video.srcObject = localStream;
        video.autoplay = true;
        video.muted = true;
        videoContainer.appendChild(video);

        localStream.getVideoTracks()[0].onended = () => {
            stopBroadcast();
        };
    } catch (error) {
        console.error('Failed to start broadcast:', error);
        alert('Failed to start broadcast: ' + error.message);
    }
}

function stopBroadcast() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    isBroadcasting = false;
    startBroadcastBtn.classList.remove('hidden');
    stopBroadcastBtn.classList.add('hidden');

    ws.send(JSON.stringify({
        type: 'stop_broadcast'
    }));

    // Remove local video preview
    const videos = videoContainer.getElementsByTagName('video');
    if (videos.length > 0) {
        videos[0].remove();
    }

    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
}

async function watchBroadcast(broadcaster) {
    console.log('Attempting to watch broadcast from:', broadcaster);
    if (peerConnections[broadcaster]) {
        console.log('Already watching this broadcast');
        return;
    }

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });

    peerConnections[broadcaster] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to:', broadcaster);
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: broadcaster,
                candidate: event.candidate
            }));
        }
    };

    pc.ontrack = (event) => {
        console.log('Received track from:', broadcaster);
        const video = document.createElement('video');
        video.srcObject = event.streams[0];
        video.autoplay = true;
        video.controls = true;
        videoContainer.appendChild(video);
    };

    try {
        console.log('Creating offer for:', broadcaster);
        const offer = await pc.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true
        });
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: 'offer',
            target: broadcaster,
            offer: offer
        }));
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

async function handleOffer(message) {
    console.log('Handling offer from:', message.from);
    if (!isBroadcasting) {
        console.log('Not broadcasting, ignoring offer');
        return;
    }

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });

    peerConnections[message.from] = pc;

    // Add local stream to peer connection
    if (localStream) {
        console.log('Adding local stream tracks to peer connection');
        localStream.getTracks().forEach(track => {
            console.log('Adding track:', track.kind);
            pc.addTrack(track, localStream);
        });
    } else {
        console.error('No local stream available');
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to:', message.from);
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                target: message.from,
                candidate: event.candidate
            }));
        }
    };

    try {
        console.log('Setting remote description');
        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
        console.log('Creating answer');
        const answer = await pc.createAnswer();
        console.log('Setting local description');
        await pc.setLocalDescription(answer);

        ws.send(JSON.stringify({
            type: 'answer',
            target: message.from,
            answer: answer
        }));
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(message) {
    console.log('Handling answer from:', message.from);
    const pc = peerConnections[message.from];
    if (pc) {
        try {
            console.log('Setting remote description from answer');
            await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
            console.log('Remote description set successfully');
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    } else {
        console.error('No peer connection found for:', message.from);
    }
}

async function handleIceCandidate(message) {
    console.log('Handling ICE candidate from:', message.from);
    const pc = peerConnections[message.from];
    if (pc) {
        try {
            console.log('Adding ICE candidate');
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
            console.log('ICE candidate added successfully');
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    } else {
        console.error('No peer connection found for:', message.from);
    }
}

// UI Updates
function updateBroadcastList(broadcasters) {
    broadcastList.innerHTML = '';
    broadcastList.setAttribute('data-broadcasters', broadcasters.join(','));
    
    broadcasters.forEach(broadcaster => {
        const div = document.createElement('div');
        div.className = 'broadcast-item';
        div.textContent = `Watch ${broadcaster}'s broadcast`;
        div.onclick = () => watchBroadcast(broadcaster);
        broadcastList.appendChild(div);
    });
}

// Initial broadcasters list request
function requestBroadcastersList() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'get_broadcasters'
        }));
    }
}

// Request broadcasters list every 5 seconds
setInterval(requestBroadcastersList, 5000); 