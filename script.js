let audioCtx;
let mediaRecorder;
let audioChunks = [];
let audioBuffer = null;
let sourceNode = null;
let gainNode = null;
let isRecording = false;
let isPlaying = false;

const loginBtn = document.getElementById('login-btn');
const userProfile = document.getElementById('user-profile');
const usernameDisplay = document.getElementById('username-display');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const trackList = document.getElementById('track-list');
const volumeSlider = document.getElementById('volume-slider');
const pitchSlider = document.getElementById('pitch-slider');

const chatToggle = document.getElementById('ai-chat-toggle');
const chatWidget = document.getElementById('ai-chat-widget');
const closeChatBtn = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatHistory = document.getElementById('chat-history');

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

puter.auth.getUser().then(user => {
    if (user) {
        handleLoginSuccess(user);
    }
});

loginBtn.addEventListener('click', async () => {
    try {
        const user = await puter.auth.signIn();
        handleLoginSuccess(user);
    } catch (e) {
        console.error(e);
    }
});

function handleLoginSuccess(user) {
    loginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    usernameDisplay.innerText = user.username;
}

recordBtn.addEventListener('click', async () => {
    initAudio();
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            
            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: 'audio/wav' });
                const buf = await blob.arrayBuffer();
                audioBuffer = await audioCtx.decodeAudioData(buf);
                updateTrackUI();
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('active');
            recordBtn.innerHTML = '<span class="icon">●</span> Stop';
            playBtn.disabled = true;
        } catch (err) {
            alert('Microphone access needed to record.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('active');
        recordBtn.innerHTML = '<span class="icon">●</span> Rec';
        playBtn.disabled = false;
    }
});

function playAudio() {
    if (!audioBuffer) return;
    
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e){}
    }

    sourceNode = audioCtx.createBufferSource();
    gainNode = audioCtx.createGain();
    
    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.value = pitchSlider.value;
    gainNode.gain.value = volumeSlider.value;

    sourceNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    sourceNode.start(0);
    isPlaying = true;
    
    sourceNode.onended = () => isPlaying = false;
}

playBtn.addEventListener('click', () => {
    initAudio();
    if (audioBuffer) playAudio();
});

stopBtn.addEventListener('click', () => {
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e){}
        isPlaying = false;
    }
});

function updateSettings() {
    if (gainNode) gainNode.gain.value = volumeSlider.value;
    if (sourceNode) sourceNode.playbackRate.value = pitchSlider.value;
}

volumeSlider.addEventListener('input', updateSettings);
pitchSlider.addEventListener('input', updateSettings);

function updateTrackUI() {
    trackList.innerHTML = `
        <div class="track-item">
            <span>Recorded Audio Track</span>
            <span style="font-size:0.8rem; opacity:0.7">WAV • Ready</span>
        </div>
    `;
}

downloadBtn.addEventListener('click', () => {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lumi-beat.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

chatToggle.addEventListener('click', () => {
    chatWidget.classList.remove('hidden');
});

closeChatBtn.addEventListener('click', () => {
    chatWidget.classList.add('hidden');
});

function addMessage(text, type) {
    const div = document.createElement('div');
    div.className = `message ${type}-message`;
    div.innerText = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function handleChat() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    chatInput.value = '';

    try {
        const response = await puter.ai.chat(text);
        addMessage(response, 'ai');
    } catch (err) {
        addMessage("Sorry, I couldn't connect to the AI service.", 'ai');
    }
}

sendChatBtn.addEventListener('click', handleChat);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
});