let audioContext;
let mediaRecorder;
let audioChunks = [];
let recordedBuffer = null;
let sourceNode = null;
let gainNode = null;
let isRecording = false;
let isPlaying = false;

const loginBtn = document.getElementById('login-btn');
const userInfo = document.getElementById('user-info');
const usernameDisplay = document.getElementById('username-display');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const trackContainer = document.getElementById('track-container');
const volumeSlider = document.getElementById('volume-slider');
const pitchSlider = document.getElementById('pitch-slider');

const chatToggleBtn = document.getElementById('ai-chat-toggle');
const chatWindow = document.getElementById('ai-chat-interface');
const closeChatBtn = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatHistory = document.getElementById('chat-history');

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

loginBtn.addEventListener('click', async () => {
    try {
        const user = await puter.auth.signIn();
        if (user) {
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            usernameDisplay.innerText = `Hi, ${user.username}`;
        }
    } catch (error) {
        console.error(error);
    }
});

puter.auth.getUser().then(user => {
    if (user) {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        usernameDisplay.innerText = `Hi, ${user.username}`;
    }
});

chatToggleBtn.addEventListener('click', () => {
    chatWindow.classList.remove('hidden');
});

closeChatBtn.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
});

async function handleChatSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage(text, 'user-msg');
    chatInput.value = '';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai-msg';
    loadingDiv.innerText = '...';
    chatHistory.appendChild(loadingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    try {
        const response = await puter.ai.chat(`You are a helpful music production assistant. Keep answers concise. User asks: ${text}`);
        chatHistory.removeChild(loadingDiv);
        appendMessage(response, 'ai-msg');
    } catch (err) {
        chatHistory.removeChild(loadingDiv);
        appendMessage("I couldn't reach the server right now.", 'ai-msg');
    }
}

function appendMessage(text, className) {
    const div = document.createElement('div');
    div.className = `message ${className}`;
    div.innerText = text;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

sendChatBtn.addEventListener('click', handleChatSend);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChatSend();
});

recordBtn.addEventListener('click', async () => {
    initAudio();

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                recordedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                renderTrackUI("Recorded Audio");
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.innerText = "● Stop";
            recordBtn.classList.add('recording');
            playBtn.disabled = true;

        } catch (err) {
            alert("Microphone access is required to record.");
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
    if (!recordedBuffer) return;

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = recordedBuffer;

    gainNode = audioContext.createGain();
    
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    applySettings();

    sourceNode.start(0);
    isPlaying = true;
    
    sourceNode.onended = () => {
        isPlaying = false;
    };
}

function stopSound() {
    if (sourceNode && isPlaying) {
        sourceNode.stop();
        isPlaying = false;
    }
}

playBtn.addEventListener('click', () => {
    initAudio();
    if(recordedBuffer) {
        stopSound();
        playSound();
    }
});

stopBtn.addEventListener('click', stopSound);

function applySettings() {
    if (gainNode) gainNode.gain.value = volumeSlider.value;
    if (sourceNode) sourceNode.playbackRate.value = pitchSlider.value;
}

volumeSlider.addEventListener('input', applySettings);
pitchSlider.addEventListener('input', applySettings);

function renderTrackUI(name) {
    trackContainer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'track-item';
    div.innerHTML = `<span>${name}</span><span>Ready</span>`;
    trackContainer.appendChild(div);
}

downloadBtn.addEventListener('click', () => {
    if (!audioChunks.length) {
        alert("Please record something first.");
        return;
    }
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style = 'display: none';
    a.href = url;
    a.download = 'lumi-beat.wav';
    a.click();
    window.URL.revokeObjectURL(url);
});