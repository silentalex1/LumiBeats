let audioCtx;
let tracks = [];
let isPlaying = false;
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let animationFrame;
let startTime = 0;
let activeSources = [];

const trackWrapper = document.getElementById('tracks-wrapper');
const timeDisplay = document.getElementById('time-display');
const playhead = document.getElementById('playhead');
const chatWidget = document.getElementById('ai-chat-widget');
const chatOverlay = document.getElementById('ai-overlay');
const chatHistory = document.getElementById('chat-history');
const typingIndicator = document.getElementById('typing-indicator');

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function generateSound(type) {
    initAudio();
    const sampleRate = audioCtx.sampleRate;
    const duration = 2.0; 
    const frameCount = sampleRate * duration;
    const buffer = audioCtx.createBuffer(2, frameCount, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            const t = i / sampleRate;
            
            if (type === 'drum') {
                if (i < 10000 && i % 8000 < 500) data[i] = (Math.random() * 2 - 1) * 0.8; 
                else data[i] = 0;
            } else if (type === 'snare') {
                const noise = Math.random() * 2 - 1;
                const envelope = Math.exp(-t * 20);
                data[i] = noise * envelope;
            } else if (type === 'hihat') {
                if (i % 5000 < 1000) data[i] = (Math.random() * 2 - 1) * Math.exp(-(i%5000)/500);
                else data[i] = 0;
            } else if (type === 'bass') {
                const freq = 55; 
                data[i] = Math.sin(t * freq * 2 * Math.PI) * 0.6 + Math.sin(t * freq * 1.01 * 2 * Math.PI) * 0.3;
            } else if (type === 'piano') {
                const freq = 440;
                const decay = Math.exp(-t * 3);
                data[i] = Math.sin(t * freq * 2 * Math.PI) * decay * 0.5;
            } else if (type === 'synth') {
                const freq = 220 + Math.sin(t * 5) * 20;
                data[i] = (Math.random() * 0.1 + Math.sin(t * freq * 2 * Math.PI)) * 0.4;
            }
        }
    }
    return buffer;
}

function makeDraggable(element, trackObj) {
    let isDragging = false;
    let startX;
    let initialLeft;

    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        initialLeft = element.offsetLeft;
        element.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const parentWidth = element.parentElement.offsetWidth;
        const deltaX = e.clientX - startX;
        let newLeft = initialLeft + deltaX;

        // Constraint to track bounds
        if (newLeft < 0) newLeft = 0;
        if (newLeft > parentWidth - element.offsetWidth) newLeft = parentWidth - element.offsetWidth;

        element.style.left = newLeft + 'px';
        
        // Update track offset percentage (0 to 1)
        trackObj.offsetPercent = newLeft / parentWidth;
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'grab';
        }
    });
}

function addTrack(name, type, buffer = null) {
    initAudio();
    const newBuffer = buffer || generateSound(type);
    
    const trackId = Date.now();
    const trackObj = {
        id: trackId,
        type: type,
        buffer: newBuffer,
        gain: audioCtx.createGain(),
        offsetPercent: 0 
    };
    
    trackObj.gain.connect(audioCtx.destination);
    tracks.push(trackObj);

    const div = document.createElement('div');
    div.className = 'timeline-track';
    div.innerHTML = `
        <div class="track-header">
            <div class="track-name">${name}</div>
            <div class="track-type">${type.toUpperCase()}</div>
        </div>
        <div class="track-lane">
            <div class="audio-clip ${type}" id="clip-${trackId}">
                <span>${name}</span>
            </div>
        </div>
    `;
    trackWrapper.appendChild(div);

    const clip = div.querySelector(`#clip-${trackId}`);
    makeDraggable(clip, trackObj);

    const emptyMsg = document.querySelector('.empty-timeline-msg');
    if (emptyMsg) emptyMsg.remove();
}

function playAll() {
    initAudio();
    if (isPlaying) stopAll();

    // Visual Timeline is 10 seconds long for this beta
    const timelineDuration = 10.0;
    const now = audioCtx.currentTime;

    activeSources = [];

    tracks.forEach(track => {
        const source = audioCtx.createBufferSource();
        source.buffer = track.buffer;
        source.connect(track.gain);
        
        track.gain.gain.value = document.getElementById('vol-slider').value;
        source.playbackRate.value = document.getElementById('speed-slider').value;

        // Calculate when to start based on drag position
        const startTimeOffset = track.offsetPercent * timelineDuration;
        
        // Only play if it fits in the timeline (simple logic)
        source.start(now + startTimeOffset);
        
        activeSources.push(source);
    });

    isPlaying = true;
    document.getElementById('play-btn').style.color = 'var(--accent)';
    animatePlayhead(now, timelineDuration);
}

function stopAll() {
    activeSources.forEach(src => {
        try { src.stop(); } catch(e) {}
    });
    activeSources = [];
    isPlaying = false;
    document.getElementById('play-btn').style.color = 'white';
    if(animationFrame) cancelAnimationFrame(animationFrame);
    playhead.style.left = '0%';
    timeDisplay.innerText = "00:00:00";
}

function animatePlayhead(audioStartTime, duration) {
    function step() {
        if (!isPlaying) return;
        const now = audioCtx.currentTime;
        const elapsed = now - audioStartTime;
        
        if (elapsed > duration) {
            stopAll();
            return;
        }

        const percent = (elapsed / duration) * 100;
        playhead.style.left = percent + '%';

        const totalSec = Math.floor(elapsed);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        const ms = Math.floor((elapsed % 1) * 100);
        timeDisplay.innerText = `00:${m<10?'0'+m:m}:${s<10?'0'+s:s}:${ms<10?'0'+ms:ms}`;

        animationFrame = requestAnimationFrame(step);
    }
    step();
}

document.getElementById('play-btn').addEventListener('click', playAll);
document.getElementById('stop-btn').addEventListener('click', stopAll);

document.getElementById('add-track-btn').addEventListener('click', () => {
    const select = document.getElementById('instrument-select');
    const type = select.value;
    const name = select.options[select.selectedIndex].text;
    addTrack(name, type);
});

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
                addTrack('Recording', 'mic', audioBuffer);
            };
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
        } catch (e) {
            alert('Mic permission denied.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.classList.remove('recording');
    }
});

document.getElementById('speed-slider').addEventListener('input', (e) => {
    if(isPlaying && activeSources.length > 0) {
        activeSources.forEach(src => src.playbackRate.value = e.target.value);
    }
});

document.getElementById('download-btn').addEventListener('click', () => {
    if(tracks.length === 0) return alert("Nothing to export.");
    alert("Exporting mix... (Processing)");
});

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
    typingIndicator.classList.remove('hidden');
    
    try {
        if(typeof puter === 'undefined') throw new Error("Puter not loaded");

        const prompt = `User text: "${text}". If they want drums, say "[ADD:drum]". If piano, "[ADD:piano]". If bass, "[ADD:bass]". If synth, "[ADD:synth]". Otherwise just chat.`;
        const response = await puter.ai.chat(prompt);
        
        typingIndicator.classList.add('hidden');
        
        let displayMsg = response;
        let actionBtn = '';
        
        if (response.includes('[ADD:drum]')) {
            displayMsg = "I can add a drum loop for you.";
            actionBtn = `<div class="ai-apply-card"><button class="apply-btn" onclick="applyAi('drum', 'AI Drum Loop')">Apply Drums</button></div>`;
        } else if (response.includes('[ADD:piano]')) {
            displayMsg = "Here is a piano melody.";
            actionBtn = `<div class="ai-apply-card"><button class="apply-btn" onclick="applyAi('piano', 'AI Piano')">Apply Piano</button></div>`;
        } else if (response.includes('[ADD:bass]')) {
             displayMsg = "Adding deep bass.";
             actionBtn = `<div class="ai-apply-card"><button class="apply-btn" onclick="applyAi('bass', 'AI Bass')">Apply Bass</button></div>`;
        } else if (response.includes('[ADD:synth]')) {
             displayMsg = "Generating synth wave.";
             actionBtn = `<div class="ai-apply-card"><button class="apply-btn" onclick="applyAi('synth', 'AI Synth')">Apply Synth</button></div>`;
        }

        appendMessage(displayMsg + actionBtn, true);
        
    } catch (e) {
        typingIndicator.classList.add('hidden');
        appendMessage("AI unavailable. Try adding beats manually.", true);
    }
}

window.applyAi = (type, name) => {
    addTrack(name, type);
    appendMessage(`<i>Added ${name} to timeline.</i>`, true);
};

document.getElementById('send-chat').addEventListener('click', handleAiRequest);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') handleAiRequest();
});

if (typeof puter !== 'undefined') {
    puter.auth.getUser().then(user => {
        if(user) {
            document.getElementById('login-btn').classList.add('hidden');
            document.getElementById('user-profile').classList.remove('hidden');
            document.getElementById('user-avatar').innerText = user.username[0].toUpperCase();
        }
    }).catch(()=>{});
}

document.getElementById('login-btn').addEventListener('click', async () => {
    if(typeof puter !== 'undefined') await puter.auth.signIn();
});