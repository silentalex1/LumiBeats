let audioCtx;
let mediaRecorder;
let audioChunks = [];
let audioBuffer = null;
let sourceNode = null;
let gainNode = null;
let startTime = 0;
let timerInterval;

let isRecording = false;
let isPlaying = false;

const loginBtn = document.getElementById('login-btn');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const trackList = document.getElementById('track-list');
const statusText = document.getElementById('status-text');
const timeDisplay = document.querySelector('.time-display');
const visualizerBar = document.querySelector('.visualizer-bar');

const volumeSlider = document.getElementById('volume-slider');
const pitchSlider = document.getElementById('pitch-slider');

const chatToggle = document.getElementById('ai-chat-toggle');
const chatWidget = document.getElementById('ai-chat-widget');
const chatOverlay = document.getElementById('ai-overlay');
const closeChatBtn = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatHistory = document.getElementById('chat-history');

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function updateStatus(text, type = '') {
    statusText.innerText = text;
    if (type === 'record') {
        visualizerBar.classList.add('recording');
    } else {
        visualizerBar.classList.remove('recording');
    }
}

puter.auth.getUser().then(user => {
    if (user) handleLogin(user);
});

loginBtn.addEventListener('click', async () => {
    try {
        const user = await puter.auth.signIn();
        handleLogin(user);
    } catch (e) {
        console.error("Login Error", e);
    }
});

function handleLogin(user) {
    loginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    userAvatar.innerText = user.username.charAt(0).toUpperCase();
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const delta = Date.now() - startTime;
        const seconds = Math.floor((delta / 1000) % 60);
        const minutes = Math.floor((delta / (1000 * 60)) % 60);
        const millis = Math.floor((delta % 1000) / 10);
        
        timeDisplay.innerText = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(millis).padStart(2, '0')}`;
    }, 50);
}

function stopTimer() {
    clearInterval(timerInterval);
    timeDisplay.innerText = "00:00:00";
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
                addTrackUI();
                updateStatus("Recording Saved", '');
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('active');
            updateStatus("Recording...", 'record');
            playBtn.disabled = true;
            startTimer();
        } catch (err) {
            alert('Please allow microphone access to record.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('active');
        stopTimer();
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
    playBtn.classList.add('active');
    updateStatus("Playing");
    
    sourceNode.onended = () => {
        isPlaying = false;
        playBtn.classList.remove('active');
        updateStatus("Ready");
    };
}

playBtn.addEventListener('click', () => {
    initAudio();
    if (audioBuffer) playAudio();
    else alert("Record something first!");
});

stopBtn.addEventListener('click', () => {
    if (sourceNode) {
        try { sourceNode.stop(); } catch(e){}
    }
    isPlaying = false;
    playBtn.classList.remove('active');
    updateStatus("Stopped");
});

function updateSettings() {
    if (gainNode) gainNode.gain.value = volumeSlider.value;
    if (sourceNode) sourceNode.playbackRate.value = pitchSlider.value;
}

volumeSlider.addEventListener('input', updateSettings);
pitchSlider.addEventListener('input', updateSettings);

function addTrackUI() {
    trackList.innerHTML = `
        <div class="track-item">
            <div class="track-info">
                <strong>Main Vocal / Beat</strong>
                <div style="font-size:0.75rem; color:#aaa; margin-top:2px;">WAV Audio • Processed</div>
            </div>
            <div style="color:var(--primary);">✔ Ready</div>
        </div>
    `;
}

downloadBtn.addEventListener('click', () => {
    if (audioChunks.length === 0) {
        alert("No recording to download.");
        return;
    }
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lumi-beat-master.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

function toggleChat() {
    const isHidden = chatWidget.classList.contains('hidden');
    if (isHidden) {
        chatWidget.classList.remove('hidden');
        if (window.innerWidth < 600) chatOverlay.classList.remove('hidden');
    } else {
        chatWidget.classList.add('hidden');
        chatOverlay.classList.add('hidden');
    }
}

chatToggle.addEventListener('click', toggleChat);
closeChatBtn.addEventListener('click', toggleChat);
chatOverlay.addEventListener('click', toggleChat);

function appendMessage(text, isAi) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${isAi ? 'ai-bubble' : 'user-bubble'}`;
    div.innerText = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendToAi() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage(text, false);
    chatInput.value = '';

    try {
        const response = await puter.ai.chat(
            `You are a music expert for 'Lumi Beats'. User asks: "${text}". Keep answer short, encouraging, and about music.`
        );
        appendMessage(response, true);
    } catch (err) {
        appendMessage("AI connection unstable. Try again later.", true);
    }
}

sendChatBtn.addEventListener('click', sendToAi);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendToAi();
});