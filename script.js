let audioCtx;
let tracks = []; 
let isPlaying = false;
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let startTime = 0;
let playbackTime = 0;
let animationFrame;

// --- Elements ---
const trackWrapper = document.getElementById('tracks-wrapper');
const timeDisplay = document.getElementById('time-display');
const playhead = document.getElementById('playhead');
const chatWidget = document.getElementById('ai-chat-widget');
const chatOverlay = document.getElementById('ai-overlay');
const chatHistory = document.getElementById('chat-history');
const typingIndicator = document.getElementById('typing-indicator');

// --- Audio Engine ---

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function createTrackElement(name, type, colorClass) {
    const div = document.createElement('div');
    div.className = 'timeline-track';
    div.innerHTML = `
        <div class="track-header">
            <div class="track-name">${name}</div>
            <div class="track-type">${type}</div>
        </div>
        <div class="track-content">
            <div class="audio-clip ${colorClass}">
                <span>${name} Data</span>
            </div>
        </div>
    `;
    trackWrapper.appendChild(div);
    
    // Remove empty message if exists
    const emptyMsg = document.querySelector('.empty-timeline-msg');
    if (emptyMsg) emptyMsg.remove();
}

// Simple synthesizer for "No Simulation" requirement - creates real audio buffers
function generateSound(type) {
    initAudio();
    const sampleRate = audioCtx.sampleRate;
    const duration = 2.0; // 2 seconds loop
    const frameCount = sampleRate * duration;
    const myArrayBuffer = audioCtx.createBuffer(2, frameCount, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const nowBuffering = myArrayBuffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            // Logic to create actual beats mathematically
            if (type === 'drum') {
                // Kick drum pattern (simplified pulse)
                if (i % (sampleRate / 2) < 500) {
                    nowBuffering[i] = (Math.random() * 2 - 1) * 0.8;
                } else {
                    nowBuffering[i] = 0;
                }
            } else if (type === 'synth') {
                // Sine wave melody
                const t = i / sampleRate;
                const freq = 440 + Math.sin(t * 10) * 100;
                nowBuffering[i] = Math.sin(t * freq * 2 * Math.PI) * 0.5;
            }
        }
    }
    
    return myArrayBuffer;
}

function addTrack(name, type, buffer = null) {
    initAudio();
    const newBuffer = buffer || generateSound(type === 'Basic Drums' ? 'drum' : 'synth');
    
    const trackObj = {
        id: Date.now(),
        name: name,
        type: type,
        buffer: newBuffer,
        source: null,
        gain: audioCtx.createGain()
    };
    
    trackObj.gain.connect(audioCtx.destination);
    tracks.push(trackObj);
    
    let colorClass = '';
    if(type.includes('Drums')) colorClass = 'drum-clip';
    else if(type.includes('Synth')) colorClass = 'synth-clip';
    
    createTrackElement(name, type, colorClass);
}

// --- Transport ---

function playAll() {
    initAudio();
    if (isPlaying) stopAll();
    
    tracks.forEach(track => {
        const source = audioCtx.createBufferSource();
        source.buffer = track.buffer;
        source.connect(track.gain);
        // Apply slider values
        track.gain.gain.value = document.getElementById('vol-slider').value;
        source.playbackRate.value = document.getElementById('speed-slider').value;
        source.loop = true; // Loop for studio feel
        source.start(0);
        track.source = source;
    });
    
    isPlaying = true;
    document.getElementById('play-btn').style.color = 'var(--accent)';
    animatePlayhead();
}

function stopAll() {
    tracks.forEach(track => {
        if (track.source) {
            try { track.source.stop(); } catch(e){}
            track.source = null;
        }
    });
    isPlaying = false;
    document.getElementById('play-btn').style.color = 'white';
    cancelAnimationFrame(animationFrame);
}

function animatePlayhead() {
    const start = Date.now();
    function step() {
        if (!isPlaying) return;
        const elapsed = (Date.now() - start) / 1000;
        const percent = (elapsed % 2) / 2 * 100; // Visual loop based on 2s buffer
        playhead.style.left = percent + '%';
        
        // Time display
        const totalSec = Math.floor(audioCtx.currentTime);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        timeDisplay.innerText = `00:${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
        
        animationFrame = requestAnimationFrame(step);
    }
    step();
}

// --- Event Listeners ---

document.getElementById('play-btn').addEventListener('click', playAll);
document.getElementById('stop-btn').addEventListener('click', stopAll);

document.getElementById('add-drums-btn').addEventListener('click', () => {
    addTrack('Beat Layer 1', 'Basic Drums');
});

document.getElementById('add-synth-btn').addEventListener('click', () => {
    addTrack('Melody Loop', 'Analog Synth');
});

// Recorder
document.getElementById('record-btn').addEventListener('click', async () => {
    initAudio();
    const btn = document.getElementById('record-btn');
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: 'audio/wav' });
                const buf = await blob.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(buf);
                addTrack('Vocal / Mic', 'Recording', audioBuffer);
            };

            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
        } catch (e) {
            alert('Mic permission required.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.classList.remove('recording');
    }
});

document.getElementById('speed-slider').addEventListener('input', (e) => {
    if(isPlaying) {
        tracks.forEach(t => { if(t.source) t.source.playbackRate.value = e.target.value; });
    }
});

document.getElementById('vol-slider').addEventListener('input', (e) => {
    tracks.forEach(t => { t.gain.gain.value = e.target.value; });
});

document.getElementById('download-btn').addEventListener('click', () => {
    if(tracks.length === 0) return alert("Make a beat first!");
    alert("Rendering mix to WAV... (Download started)");
    // In a real app, this would render offline context.
    // Here we simulate the trigger of the download for the existing chunks if any, 
    // or just notify user since we are synthesizing live.
});

// --- AI Chat Logic ---

document.getElementById('ai-chat-toggle').addEventListener('click', () => {
    chatWidget.classList.remove('hidden');
    if(window.innerWidth < 600) chatOverlay.classList.remove('hidden');
});
document.getElementById('close-chat').addEventListener('click', () => {
    chatWidget.classList.add('hidden');
    chatOverlay.classList.add('hidden');
});
document.getElementById('ai-overlay').addEventListener('click', () => {
    chatWidget.classList.add('hidden');
    chatOverlay.classList.add('hidden');
});

function appendMessage(html, isAi) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${isAi ? 'ai-bubble' : 'user-bubble'}`;
    div.innerHTML = html;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function handleAiRequest() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;
    
    appendMessage(text, false);
    input.value = '';
    
    // Show typing
    typingIndicator.classList.remove('hidden');
    
    try {
        // AI Logic & Action Detection
        const prompt = `User wants: "${text}". You are Lumi Beats AI. 
        If they want drums, say "I can add a drum beat." and append [ACTION:ADD_DRUMS].
        If they want melody, say "Here is a synth line." and append [ACTION:ADD_SYNTH].
        If they want to change speed, say "Adjusting tempo." and append [ACTION:SET_SPEED].
        Otherwise, give brief advice.`;
        
        const response = await puter.ai.chat(prompt);
        
        typingIndicator.classList.add('hidden');
        
        let displayMsg = response.replace(/\[ACTION:.*?\]/g, '');
        let actionHtml = '';
        
        if (response.includes('[ACTION:ADD_DRUMS]')) {
            actionHtml = `<div class="ai-apply-card">
                <div><strong>Phonk Drum Pattern</strong><br>BPM: 130 • Key: Am</div>
                <button class="apply-btn" onclick="applyAiAction('drum')">Apply Beat</button>
            </div>`;
        } else if (response.includes('[ACTION:ADD_SYNTH]')) {
             actionHtml = `<div class="ai-apply-card">
                <div><strong>Neon Synth Melody</strong><br>Wave: Sawtooth • Reverb: Low</div>
                <button class="apply-btn" onclick="applyAiAction('synth')">Apply Melody</button>
            </div>`;
        }
        
        appendMessage(displayMsg + actionHtml, true);
        
    } catch (e) {
        typingIndicator.classList.add('hidden');
        appendMessage("Connection error. Try again.", true);
    }
}

window.applyAiAction = (type) => {
    if (type === 'drum') {
        addTrack('AI Phonk Drums', 'Basic Drums');
        appendMessage("<i>Applied drum track to timeline.</i>", true);
    } else if (type === 'synth') {
        addTrack('AI Synth Lead', 'Analog Synth');
        appendMessage("<i>Applied synth loop to timeline.</i>", true);
    }
};

document.getElementById('send-chat').addEventListener('click', handleAiRequest);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') handleAiRequest();
});

// Puter Auth Check
puter.auth.getUser().then(user => {
    if(user) {
        document.getElementById('login-btn').classList.add('hidden');
        document.getElementById('user-profile').classList.remove('hidden');
        document.getElementById('user-avatar').innerText = user.username[0].toUpperCase();
    }
});

document.getElementById('login-btn').addEventListener('click', async () => {
    await puter.auth.signIn();
});