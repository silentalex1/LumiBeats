let audioContext;
let mediaRecorder;
let audioChunks = [];
let audioBuffer = null;
let sourceNode = null;
let gainNode = null;
let isRecording = false;
let isPlaying = false;
let playbackStartTime = 0;

const loginBtn = document.getElementById('login-btn');
const userInfo = document.getElementById('user-info');
const usernameDisplay = document.getElementById('username-display');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const statusText = document.getElementById('status-text');
const volumeSlider = document.getElementById('volume-slider');
const pitchSlider = document.getElementById('pitch-slider');
const visualContainer = document.getElementById('track-visual-container');

const aiChatToggle = document.getElementById('ai-chat-toggle');
const aiChatInterface = document.getElementById('ai-chat-interface');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

async function handleLogin() {
    try {
        const user = await puter.auth.signIn();
        if (user) {
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            usernameDisplay.innerText = user.username;
        }
    } catch (error) {
        console.error(error);
    }
}

puter.auth.getUser().then(user => {
    if (user) {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        usernameDisplay.innerText = user.username;
    }
});

loginBtn.addEventListener('click', handleLogin);

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
                const arrayBuffer = await blob.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                statusText.innerText = "Sound captured. Ready to edit.";
                visualContainer.innerHTML = '<div style="width: 100%; height: 100%; background: #2c2c2c; display:flex; align-items:center; justify-content:center; color:#555;">Waveform Ready</div>';
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.innerText = "● Stop Rec";
            recordBtn.classList.add('recording');
            playBtn.disabled = true;
            statusText.innerText = "Recording...";
        } catch (err) {
            alert("Microphone access required.");
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.innerText = "● Rec";
        recordBtn.classList.remove('recording');
        playBtn.disabled = false;
    }
});

function playSound() {
    if (!audioBuffer) return;
    
    sourceNode = audioContext.createBufferSource();
    gainNode = audioContext.createGain();
    
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    gainNode.gain.value = volumeSlider.value;
    sourceNode.playbackRate.value = pitchSlider.value;
    
    sourceNode.start(0);
    isPlaying = true;
    statusText.innerText = "Playing...";
    
    const bar = document.createElement('div');
    bar.className = 'track-bar';
    visualContainer.innerHTML = '';
    visualContainer.appendChild(bar);
    
    setTimeout(() => {
        bar.style.width = '100%';
        bar.style.transitionDuration = (audioBuffer.duration / pitchSlider.value) + 's';
    }, 50);

    sourceNode.onended = () => {
        isPlaying = false;
        statusText.innerText = "Playback finished.";
        visualContainer.innerHTML = '';
    };
}

playBtn.addEventListener('click', () => {
    initAudio();
    if (isPlaying && sourceNode) {
        sourceNode.stop();
    }
    if (audioBuffer) {
        playSound();
    } else {
        statusText.innerText = "Please record a sound first.";
    }
});

stopBtn.addEventListener('click', () => {
    if (isPlaying && sourceNode) {
        sourceNode.stop();
        isPlaying = false;
        statusText.innerText = "Stopped.";
        visualContainer.innerHTML = '';
    }
});

volumeSlider.addEventListener('input', () => {
    if (gainNode && isPlaying) {
        gainNode.gain.value = volumeSlider.value;
    }
});

pitchSlider.addEventListener('input', () => {
    if (sourceNode && isPlaying) {
        sourceNode.playbackRate.value = pitchSlider.value;
    }
});

downloadBtn.addEventListener('click', () => {
    if (audioChunks.length === 0) {
        alert("No beat created yet.");
        return;
    }
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'lumi-beat.wav';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
});

function addMessage(text, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerText = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

aiChatToggle.addEventListener('click', () => {
    aiChatInterface.classList.remove('hidden');
    if (chatHistory.children.length === 0) {
        addMessage("Thank you for using lumi beats AI. What do you need help with your music beat?", 'ai');
    }
});

closeChatBtn.addEventListener('click', () => {
    aiChatInterface.classList.add('hidden');
});

async function sendToAI() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    chatInput.value = '';
    
    try {
        const response = await puter.ai.chat(text);
        addMessage(response, 'ai');
    } catch (err) {
        addMessage("I'm having trouble connecting right now.", 'ai');
    }
}

sendChatBtn.addEventListener('click', sendToAI);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendToAI();
    }
});