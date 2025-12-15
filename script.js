let audioCtx;
let tracks = [];
let isPlaying = false;
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let animationFrame;
let activeSources = [];
let selectedTrackId = null;

const timelineDuration = 15.0; 

const trackWrapper = document.getElementById('tracks-wrapper');
const timeDisplay = document.getElementById('time-display');
const playhead = document.getElementById('playhead');
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const deleteBtn = document.getElementById('delete-btn');
const chatWidget = document.getElementById('ai-chat-widget');
const chatOverlay = document.getElementById('ai-overlay');
const chatHistory = document.getElementById('chat-history');
const typingIndicator = document.getElementById('typing-indicator');
const controlSection = document.getElementById('studio-controls');
const menuBtn = document.getElementById('mobile-menu-btn');
const loginBtn = document.getElementById('login-btn');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');

menuBtn.addEventListener('click', () => {
    controlSection.classList.toggle('collapsed');
});

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
            let val = 0;

            if (type === 'drum') {
                const freq = 100 * Math.exp(-t * 20);
                val = Math.sin(t * freq * 2 * Math.PI) * Math.exp(-t * 5);
                if (i < 200) val += (Math.random() - 0.5) * 0.5;
            } else if (type === 'snare') {
                const tone = Math.sin(t * 180 * Math.PI) * Math.exp(-t * 15);
                const noise = (Math.random() * 2 - 1) * Math.exp(-t * 20);
                val = (tone * 0.5 + noise * 0.8);
            } else if (type === 'hihat') {
                 // High pass noise approximation
                const noise = (Math.random() * 2 - 1);
                if (i % 2 === 0) val = noise * Math.exp(-t * 40) * 0.6;
            } else if (type === '808') {
                const freq = 60 * Math.exp(-t * 1.5);
                val = Math.sin(t * freq * 2 * Math.PI) * Math.exp(-t * 0.8);
                val = Math.tanh(val * 4) * 0.8;
            } else if (type === 'bass') {
                // Sawtooth-ish
                const freq = 80;
                val = 0;
                for(let k=1; k<5; k++) val += Math.sin(t * freq * k * 2 * Math.PI) / k;
                val *= 0.6;
            } else if (type === 'piano') {
                const freq = 440;
                val = Math.sin(t * freq * 2 * Math.PI) * Math.exp(-t * 4) 
                    + 0.5 * Math.sin(t * freq * 2 * 2 * Math.PI) * Math.exp(-t * 5)
                    + 0.2 * Math.sin(t * freq * 3 * 2 * Math.PI) * Math.exp(-t * 6);
                val *= 0.6;
            } else if (type === 'guitar') {
                 // Plucked string algo simple
                const freq = 220;
                const p = 1/freq;
                const harmonics = Math.floor((p * sampleRate)/2);
                val = 0;
                for(let k=1; k<8; k++) val += (1/k) * Math.sin(t * freq * k * 2 * Math.PI);
                val *= Math.exp(-t * 3) * 0.5;
            } else if (type === 'flute') {
                const freq = 660;
                val = Math.sin(t * freq * 2 * Math.PI) + 0.1 * Math.sin(t * freq * 3 * 2 * Math.PI);
                val *= 0.4 * (1 - Math.exp(-t*20)); 
            } else if (type === 'sax') {
                const freq = 200;
                val = 0;
                for(let k=1; k<10; k++) val += (1/k) * Math.sin(t*freq*k*2*Math.PI + Math.sin(t*5));
                val *= 0.3;
            } else if (type === 'harp') {
                const freq = 500;
                val = Math.sin(t * freq * 2 * Math.PI) * Math.exp(-t * 6) * 0.5;
            } else if (type === 'choir') {
                const f = 250;
                val = (Math.sin(t*f*2*Math.PI) + Math.sin(t*f*1.01*2*Math.PI) + Math.sin(t*f*1.5*2*Math.PI))/3;
                val *= 0.4 * Math.min(1, t*4);
            } else if (type === 'lofi') {
                // Noise + low hum
                val = (Math.random() - 0.5) * 0.05 + Math.sin(t * 50 * 2 * Math.PI) * 0.1;
                if (i % 22000 < 1000) val += 0.3 * Math.sin(t * 100);
            } else if (type === 'techno') {
                const freq = 120;
                val = (Math.sin(t * freq * 2 * Math.PI) > 0 ? 0.6 : -0.6);
            } else if (type === 'synth') {
                const freq = 330;
                val = (Math.random()*0.1 + Math.sin(t * freq * 2 * Math.PI * (1 + 0.01*Math.sin(t*10)))) * 0.5;
            } else if (type === 'strings') {
                const freq = 440;
                val = 0;
                for(let k=1; k<6; k++) val += Math.sin(t*freq*k*2*Math.PI)/k;
                val *= 0.3 * (t < 0.2 ? t/0.2 : 1);
            } else if (type === 'bell') {
                val = Math.sin(t * 1000 * 2 * Math.PI) * Math.exp(-t * 8) 
                    + Math.sin(t * 2500 * 2 * Math.PI) * Math.exp(-t * 12) * 0.5;
                val *= 0.4;
            }

            data[i] = val;
        }
    }
    return buffer;
}

function selectClip(element, trackId) {
    document.querySelectorAll('.audio-clip').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedTrackId = trackId;
    deleteBtn.classList.remove('hidden');
}

function deselectAll() {
    document.querySelectorAll('.audio-clip').forEach(el => el.classList.remove('selected'));
    selectedTrackId = null;
    deleteBtn.classList.add('hidden');
}

function deleteSelectedTrack() {
    if (selectedTrackId) {
        // Remove from UI
        const clipEl = document.getElementById(`clip-${Math.floor(selectedTrackId)}`);
        if (clipEl) {
            const trackEl = clipEl.closest('.timeline-track');
            trackEl.remove();
        }
        // Remove from logic
        tracks = tracks.filter(t => Math.floor(t.id) !== Math.floor(selectedTrackId));
        deselectAll();
    }
}

function makeDraggable(element, trackObj) {
    let isDragging = false;
    let startX;
    let initialLeft;

    function startDrag(e) {
        selectClip(element, trackObj.id);
        isDragging = true;
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        initialLeft = element.offsetLeft;
        element.style.cursor = 'grabbing';
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
        }
    }

    element.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);

    element.addEventListener('touchstart', (e) => {
        e.stopPropagation(); 
        startDrag(e);
    }, {passive: false});
    
    window.addEventListener('touchmove', (e) => {
        if(isDragging) {
            e.preventDefault(); 
            drag(e);
        }
    }, {passive: false});
    
    window.addEventListener('touchend', endDrag);
    
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        selectClip(element, trackObj.id);
    });
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
deleteBtn.addEventListener('click', deleteSelectedTrack);

// Global Keydown for Delete
document.addEventListener('keydown', (e) => {
    if (selectedTrackId && (e.key === 'Delete' || e.key === 'Backspace')) {
        deleteSelectedTrack();
    }
});

// Deselect when clicking background
document.addEventListener('click', (e) => {
    if (!e.target.closest('.audio-clip') && !e.target.closest('#delete-btn')) {
        deselectAll();
    }
});

document.getElementById('add-track-btn').addEventListener('click', () => {
    initAudio();
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

// AI & Login Logic
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
        if(typeof puter !== 'undefined' && puter.auth && !puter.auth.isSignedIn()) {
             await puter.auth.signIn();
        }

        const prompt = `User request: "${text}". 
        Act as a music AI. Return single token matching request.
        Genre Tokens: [GENRE:LOFI], [GENRE:TRAP], [GENRE:TECHNO], [GENRE:ORCHESTRA].
        Instrument Tokens: [ADD:drum], [ADD:snare], [ADD:hihat], [ADD:808], [ADD:bass], [ADD:piano], [ADD:guitar], [ADD:flute], [ADD:sax], [ADD:harp], [ADD:choir], [ADD:techno], [ADD:synth], [ADD:strings], [ADD:bell].
        Return short text then token.`;
        
        const response = await puter.ai.chat(prompt);
        
        typingIndicator.classList.add('hidden');
        
        let displayMsg = response.replace(/\[(ADD|GENRE):\w+\]/g, '').trim();
        if(!displayMsg) displayMsg = "Here is what I created for you.";
        let actionBtn = '';
        
        if (response.includes('[GENRE:LOFI]')) actionBtn = createGenreBtn('lofi', 'Lo-Fi Beat');
        else if (response.includes('[GENRE:TRAP]')) actionBtn = createGenreBtn('trap', 'Trap Bundle');
        else if (response.includes('[GENRE:TECHNO]')) actionBtn = createGenreBtn('techno_set', 'Techno Set');
        else if (response.includes('[GENRE:ORCHESTRA]')) actionBtn = createGenreBtn('orch', 'Orchestra');
        else if (response.includes('[ADD:drum]')) actionBtn = createAiBtn('drum', 'Kick Drum');
        else if (response.includes('[ADD:snare]')) actionBtn = createAiBtn('snare', 'Trap Snare');
        else if (response.includes('[ADD:hihat]')) actionBtn = createAiBtn('hihat', 'Hi-Hats');
        else if (response.includes('[ADD:808]')) actionBtn = createAiBtn('808', '808 Bass');
        else if (response.includes('[ADD:bass]')) actionBtn = createAiBtn('bass', 'Deep Bass');
        else if (response.includes('[ADD:piano]')) actionBtn = createAiBtn('piano', 'Grand Piano');
        else if (response.includes('[ADD:guitar]')) actionBtn = createAiBtn('guitar', 'Guitar');
        else if (response.includes('[ADD:flute]')) actionBtn = createAiBtn('flute', 'Jazz Flute');
        else if (response.includes('[ADD:sax]')) actionBtn = createAiBtn('sax', 'Saxophone');
        else if (response.includes('[ADD:harp]')) actionBtn = createAiBtn('harp', 'Harp');
        else if (response.includes('[ADD:choir]')) actionBtn = createAiBtn('choir', 'Choir');
        else if (response.includes('[ADD:techno]')) actionBtn = createAiBtn('techno', 'Techno Lead');
        else if (response.includes('[ADD:synth]')) actionBtn = createAiBtn('synth', 'Saw Synth');
        else if (response.includes('[ADD:strings]')) actionBtn = createAiBtn('strings', 'Strings');
        else if (response.includes('[ADD:bell]')) actionBtn = createAiBtn('bell', 'Cowbell');

        appendMessage(displayMsg + actionBtn, true);
        
    } catch (e) {
        typingIndicator.classList.add('hidden');
        appendMessage("Network error or AI service offline.", true);
    }
}

function createAiBtn(type, name) {
    return `<div class="ai-apply-card"><button class="apply-btn" onclick="applyAi('${type}', '${name}')">✚ Add ${name}</button></div>`;
}

function createGenreBtn(type, name) {
    return `<div class="ai-apply-card"><button class="apply-btn" onclick="applyGenre('${type}')">✚ Create ${name}</button></div>`;
}

window.applyAi = (type, name) => {
    addTrack(name, type);
    appendMessage(`<i>Added ${name} to the timeline.</i>`, true);
};

window.applyGenre = (genre) => {
    initAudio();
    if(genre === 'lofi') {
        addTrack('Lo-Fi Drums', 'lofi');
        setTimeout(() => addTrack('Chill Piano', 'piano'), 100);
        setTimeout(() => addTrack('Smooth Bass', 'bass'), 200);
    } else if(genre === 'trap') {
        addTrack('Hard Kick', 'drum');
        setTimeout(() => addTrack('Trap Snare', 'snare'), 100);
        setTimeout(() => addTrack('Hi-Hats', 'hihat'), 200);
        setTimeout(() => addTrack('808 Sub', '808'), 300);
    } else if(genre === 'techno_set') {
        addTrack('Techno Lead', 'techno');
        setTimeout(() => addTrack('Kick 4/4', 'drum'), 100);
    } else if(genre === 'orch') {
        addTrack('Violins', 'strings');
        setTimeout(() => addTrack('Choir', 'choir'), 100);
        setTimeout(() => addTrack('Harp Arp', 'harp'), 200);
    }
    appendMessage(`<i>Created genre tracks.</i>`, true);
};

document.getElementById('send-chat').addEventListener('click', handleAiRequest);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') handleAiRequest();
});

function updateProfileUI(user) {
    loginBtn.classList.add('hidden');
    userProfile.classList.remove('hidden');
    userAvatar.innerText = user.username[0].toUpperCase();
}

loginBtn.addEventListener('click', async () => {
    if(typeof puter !== 'undefined') {
        try {
            const user = await puter.auth.signIn();
            if(user) updateProfileUI(user);
        } catch(e) { }
    }
});

if (typeof puter !== 'undefined') {
    puter.auth.getUser().then(user => {
        if(user) updateProfileUI(user);
    }).catch(()=>{});
}