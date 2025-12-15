let audioCtx;
let tracks = [];
let isPlaying = false;
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let animationFrame;
let activeSources = [];

const timelineDuration = 15.0; 

const trackWrapper = document.getElementById('tracks-wrapper');
const timeDisplay = document.getElementById('time-display');
const playhead = document.getElementById('playhead');
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const chatWidget = document.getElementById('ai-chat-widget');
const chatOverlay = document.getElementById('ai-overlay');
const chatHistory = document.getElementById('chat-history');
const typingIndicator = document.getElementById('typing-indicator');

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function generateSound(type) {
    initAudio();
    const sampleRate = audioCtx.sampleRate;
    const duration = 3.0; 
    const frameCount = sampleRate * duration;
    const buffer = audioCtx.createBuffer(2, frameCount, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            const t = i / sampleRate;
            
            if (type === 'drum') {
                if (i < 5000) data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 20); 
                if (i < 15000) data[i] += Math.sin(t * 100 * Math.PI) * Math.exp(-t * 10);
            } else if (type === 'snare') {
                const noise = Math.random() * 2 - 1;
                const env = Math.exp(-t * 15);
                data[i] = noise * env;
            } else if (type === 'hihat') {
                if (i % 3000 < 500) data[i] = (Math.random() * 2 - 1) * 0.3;
            } else if (type === '808') {
                const freq = 45; 
                data[i] = Math.tanh(Math.sin(t * freq * 2 * Math.PI * (1 - t*0.5)) * 5) * Math.exp(-t * 1.5);
            } else if (type === 'bass') {
                data[i] = Math.sin(t * 80 * 2 * Math.PI) * 0.5 + Math.sin(t * 160 * 2 * Math.PI) * 0.2;
            } else if (type === 'piano') {
                const freq = 330; 
                data[i] = Math.sin(t * freq * 2 * Math.PI) * Math.exp(-t * 3) * 0.5;
                data[i] += Math.sin(t * freq * 2 * 2 * Math.PI) * Math.exp(-t * 4) * 0.2;
            } else if (type === 'guitar') {
                const freq = 196; 
                const osc = (Math.abs((t * freq * 2) % 2 - 1) * 2 - 1); // Triangleish
                data[i] = osc * Math.exp(-t * 2) * 0.6;
            } else if (type === 'flute') {
                const freq = 523; 
                data[i] = (Math.sin(t * freq * 2 * Math.PI) + 0.1 * Math.sin(t * freq * 2 * 2 * Math.PI)) * 0.4 * Math.min(1, t*10);
            } else if (type === 'techno') {
                const freq = 110; 
                const mod = Math.sin(t * 10);
                data[i] = ((t * freq * 2 * Math.PI + mod) % 1 > 0.5 ? 0.6 : -0.6); // Squareish
            } else if (type === 'synth') {
                const freq = 220;
                data[i] = (Math.random() * 0.05 + Math.sin(t * freq * 2 * Math.PI + Math.sin(t*10))) * 0.4;
            } else if (type === 'strings') {
                const freq = 440;
                let s = 0;
                for(let k=1; k<5; k++) s += Math.sin(t * freq * k * 2 * Math.PI) / k;
                data[i] = s * 0.2 * (t < 0.5 ? t * 2 : Math.exp(-(t-0.5)));
            } else if (type === 'bell') {
                data[i] = Math.sin(t * 800 * 2 * Math.PI) * Math.exp(-t * 5) * 0.5;
            }
        }
    }
    return buffer;
}

function makeDraggable(element, trackObj) {
    let isDragging = false;
    let startX;
    let initialLeft;

    function startDrag(e) {
        isDragging = true;
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        initialLeft = element.offsetLeft;
        element.style.cursor = 'grabbing';
        element.style.zIndex = '100';
    }

    function drag(e) {
        if (!isDragging) return;
        const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
        
        const parentWidth = element.parentElement.offsetWidth;
        const deltaX = clientX - startX;
        let newLeft = initialLeft + deltaX;

        if (newLeft < 0) newLeft = 0;
        if (newLeft > parentWidth - element.offsetWidth) newLeft = parentWidth - element.offsetWidth;

        element.style.left = newLeft + 'px';
        trackObj.offsetPercent = newLeft / parentWidth;
    }

    function endDrag() {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'grab';
            element.style.zIndex = '';
        }
    }

    element.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);

    element.addEventListener('touchstart', (e) => {
        startDrag(e);
    }, {passive: false});
    
    window.addEventListener('touchmove', (e) => {
        if(isDragging) e.preventDefault(); 
        drag(e);
    }, {passive: false});
    
    window.addEventListener('touchend', endDrag);
}

function addTrack(name, type, buffer = null) {
    initAudio();
    const newBuffer = buffer || generateSound(type);
    const trackId = Date.now() + Math.random();
    
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
            <div class="audio-clip ${type}" id="clip-${Math.floor(trackId)}">
                <span>${name}</span>
            </div>
        </div>
    `;
    trackWrapper.appendChild(div);

    const clip = div.querySelector(`.audio-clip`);
    makeDraggable(clip, trackObj);

    const emptyMsg = document.querySelector('.empty-timeline-msg');
    if (emptyMsg) emptyMsg.remove();
}

function togglePlay() {
    initAudio();
    if (isPlaying) {
        stopAll();
    } else {
        playAll();
    }
}

function playAll() {
    activeSources = [];
    const now = audioCtx.currentTime;

    tracks.forEach(track => {
        const source = audioCtx.createBufferSource();
        source.buffer = track.buffer;
        source.connect(track.gain);
        
        track.gain.gain.value = document.getElementById('vol-slider').value;
        source.playbackRate.value = document.getElementById('speed-slider').value;

        const startTimeOffset = track.offsetPercent * timelineDuration;
        
        if (startTimeOffset < timelineDuration) {
            source.start(now + startTimeOffset);
            activeSources.push(source);
        }
    });

    isPlaying = true;
    playIcon.innerText = "■"; 
    playBtn.style.backgroundColor = "white";
    playIcon.style.color = "black";
    animatePlayhead(now, timelineDuration);
}

function stopAll() {
    activeSources.forEach(src => {
        try { src.stop(); } catch(e) {}
    });
    activeSources = [];
    isPlaying = false;
    playIcon.innerText = "▶";
    playBtn.style.backgroundColor = "";
    playIcon.style.color = "";
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

playBtn.addEventListener('click', togglePlay);
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
    alert("Exporting mix to .WAV... (Processing)");
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

        const prompt = `User request: "${text}". 
        Act as a music studio AI. Return a single token for the best instrument matching the description.
        Tokens: [ADD:drum], [ADD:snare], [ADD:hihat], [ADD:808], [ADD:bass], [ADD:piano], [ADD:guitar], [ADD:flute], [ADD:techno], [ADD:synth], [ADD:strings], [ADD:bell].
        Return short text then the token.`;
        
        const response = await puter.ai.chat(prompt);
        
        typingIndicator.classList.add('hidden');
        
        let displayMsg = response.replace(/\[ADD:\w+\]/g, '').trim();
        if(!displayMsg) displayMsg = "Here is a suggestion for you.";
        let actionBtn = '';
        
        if (response.includes('[ADD:drum]')) actionBtn = createAiBtn('drum', 'Kick Drum');
        else if (response.includes('[ADD:snare]')) actionBtn = createAiBtn('snare', 'Trap Snare');
        else if (response.includes('[ADD:hihat]')) actionBtn = createAiBtn('hihat', 'Hi-Hats');
        else if (response.includes('[ADD:808]')) actionBtn = createAiBtn('808', '808 Bass');
        else if (response.includes('[ADD:bass]')) actionBtn = createAiBtn('bass', 'Deep Bass');
        else if (response.includes('[ADD:piano]')) actionBtn = createAiBtn('piano', 'Grand Piano');
        else if (response.includes('[ADD:guitar]')) actionBtn = createAiBtn('guitar', 'Guitar');
        else if (response.includes('[ADD:flute]')) actionBtn = createAiBtn('flute', 'Jazz Flute');
        else if (response.includes('[ADD:techno]')) actionBtn = createAiBtn('techno', 'Techno Lead');
        else if (response.includes('[ADD:synth]')) actionBtn = createAiBtn('synth', 'Saw Synth');
        else if (response.includes('[ADD:strings]')) actionBtn = createAiBtn('strings', 'Strings');
        else if (response.includes('[ADD:bell]')) actionBtn = createAiBtn('bell', 'Cowbell');

        appendMessage(displayMsg + actionBtn, true);
        
    } catch (e) {
        typingIndicator.classList.add('hidden');
        appendMessage("AI offline. Use the sidebar to add instruments.", true);
    }
}

function createAiBtn(type, name) {
    return `<div class="ai-apply-card"><button class="apply-btn" onclick="applyAi('${type}', '${name}')">✚ Add ${name}</button></div>`;
}

window.applyAi = (type, name) => {
    addTrack(name, type);
    appendMessage(`<i>Added ${name} to the timeline.</i>`, true);
};

document.getElementById('send-chat').addEventListener('click', handleAiRequest);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') handleAiRequest();
});

document.getElementById('login-btn').addEventListener('click', async () => {
    if(typeof puter !== 'undefined') {
        try {
            const user = await puter.auth.signIn();
            if(user) {
                document.getElementById('login-btn').classList.add('hidden');
                document.getElementById('user-profile').classList.remove('hidden');
                document.getElementById('user-avatar').innerText = user.username[0].toUpperCase();
            }
        } catch(e) { }
    }
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