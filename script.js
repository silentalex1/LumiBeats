let audioCtx;
let tracks = [];
let isPlaying = false;
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let animationFrame;
let activeSources = [];
let selectedTrackId = null;
let videoObjectUrl = null;
let timelineDuration = 15.0;

const trackContainer = document.getElementById('tracks-container');
const timeDisplay = document.getElementById('time-display');
const playhead = document.getElementById('playhead');
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const splitBtn = document.getElementById('split-btn');
const deleteBtn = document.getElementById('delete-btn');
const chatWidget = document.getElementById('ai-widget');
const chatHeader = document.getElementById('widget-header');
const chatOverlay = document.getElementById('ai-overlay');
const chatHistory = document.getElementById('chat-stream');
const typingIndicator = document.getElementById('typing-dots');
const controlPanel = document.getElementById('control-panel');
const menuBtn = document.getElementById('mobile-menu-btn');
const loginBtn = document.getElementById('login-btn');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const videoPlayer = document.getElementById('main-video');
const videoStage = document.getElementById('video-stage');

menuBtn.addEventListener('click', () => {
    controlPanel.classList.toggle('collapsed');
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
                const f = 100 * Math.exp(-t * 25);
                val = Math.sin(t * f * 2 * Math.PI) * Math.exp(-t * 8);
                if(i < 300) val += (Math.random()-0.5);
            } else if (type === 'snare') {
                val = (Math.random() - 0.5) * Math.exp(-t * 15) * 0.8;
            } else if (type === 'hihat') {
                val = (Math.random() - 0.5) * Math.exp(-t * 50) * (i%3 ? 0.8 : 0);
            } else if (type === '808') {
                const f = 55 * Math.exp(-t * 0.5);
                val = Math.sin(t * f * 2 * Math.PI) * Math.exp(-t * 1.5);
                val = Math.tanh(val * 4); 
            } else if (type === 'bass') {
                val = Math.sin(t * 90 * Math.PI) * 0.7 + Math.sin(t * 180 * Math.PI) * 0.3;
            } else if (type === 'piano') {
                val = Math.sin(t * 440 * Math.PI) * Math.exp(-t * 3) * 0.5;
            } else if (type === 'guitar') {
                val = (Math.abs((t * 220 * 2) % 2 - 1) * 2 - 1) * Math.exp(-t*3) * 0.5;
            } else if (type === 'flute') {
                val = Math.sin(t * 660 * Math.PI) * 0.4;
            } else if (type === 'sax') {
                const wave = (Math.abs((t * 180 * 2) % 2 - 1) * 2 - 1);
                val = wave * Math.exp(-t*0.5) + (Math.random()-0.5)*0.1;
                val *= 0.5;
            } else if (type === 'harp') {
                val = Math.sin(t * 500 * Math.PI) * Math.exp(-t * 8) * 0.5;
            } else if (type === 'choir') {
                val = (Math.sin(t * 300 * Math.PI) + Math.sin(t * 304 * Math.PI)) * 0.3 * Math.min(1,t*2);
            } else if (type === 'lofi') {
                val = (Math.random()-0.5)*0.1 + Math.sin(t*100*Math.PI)*0.2;
            } else if (type === 'techno') {
                val = (Math.sin(t * 120 * Math.PI) > 0 ? 0.6 : -0.6);
            } else if (type === 'synth') {
                val = (Math.random()*0.1 + Math.sin(t * 440 * Math.PI * (1 + 0.01*Math.sin(t*5)))) * 0.5;
            } else if (type === 'strings') {
                val = (Math.sin(t * 440 * Math.PI) + Math.sin(t * 442 * Math.PI)) * 0.3;
            } else if (type === 'bell') {
                val = Math.sin(t * 1200 * Math.PI) * Math.exp(-t * 12) * 0.5;
            }
            data[i] = val;
        }
    }
    return buffer;
}

function selectClip(element, trackId) {
    document.querySelectorAll('.clip').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    selectedTrackId = trackId;
    deleteBtn.classList.remove('hidden');
    splitBtn.classList.remove('hidden');
}

function deselectAll() {
    document.querySelectorAll('.clip').forEach(el => el.classList.remove('active'));
    selectedTrackId = null;
    deleteBtn.classList.add('hidden');
    splitBtn.classList.add('hidden');
}

function splitSelectedTrack() {
    if(!selectedTrackId) return;
    const now = audioCtx.currentTime;
    const playheadTime = (parseFloat(playhead.style.left) / 100) * timelineDuration || 0;
    
    const track = tracks.find(t => Math.floor(t.id) === Math.floor(selectedTrackId));
    if(!track) return;

    const clipStart = track.offsetPercent * timelineDuration;
    const clipEnd = clipStart + (track.durationPercent * timelineDuration);

    if(playheadTime > clipStart && playheadTime < clipEnd) {
        const firstDuration = playheadTime - clipStart;
        const secondDuration = clipEnd - playheadTime;
        
        track.durationPercent = firstDuration / timelineDuration;
        const el = document.getElementById(`clip-${Math.floor(track.id)}`);
        if(el) el.style.width = (track.durationPercent * 100) + '%';

        addTrack(track.name, track.type, track.buffer, track.isVideo, track.videoSrc);
        const newTrack = tracks[tracks.length - 1];
        newTrack.offsetPercent = playheadTime / timelineDuration;
        newTrack.durationPercent = secondDuration / timelineDuration;
        
        const newEl = document.getElementById(`clip-${Math.floor(newTrack.id)}`);
        if(newEl) {
            newEl.style.left = (newTrack.offsetPercent * 100) + '%';
            newEl.style.width = (newTrack.durationPercent * 100) + '%';
        }
    }
}

function deleteSelectedTrack() {
    if (selectedTrackId) {
        const clipEl = document.getElementById(`clip-${Math.floor(selectedTrackId)}`);
        if (clipEl) {
            const trackEl = clipEl.closest('.track-block');
            trackEl.remove();
        }
        tracks = tracks.filter(t => Math.floor(t.id) !== Math.floor(selectedTrackId));
        deselectAll();
        
        if (tracks.length === 0) {
            videoPlayer.src = "";
            videoStage.classList.add('hidden');
        }
    }
}

function makeInteractable(element, trackObj) {
    let mode = 'none'; 
    let startX;
    let initialLeft;
    let initialWidth;
    let parentWidth;

    const leftHandle = document.createElement('div');
    leftHandle.className = 'clip-handle left';
    element.appendChild(leftHandle);

    const rightHandle = document.createElement('div');
    rightHandle.className = 'clip-handle right';
    element.appendChild(rightHandle);

    function startInteraction(e, action) {
        mode = action;
        selectClip(element, trackObj.id);
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        initialLeft = element.offsetLeft;
        initialWidth = element.offsetWidth;
        parentWidth = element.parentElement.offsetWidth;
        if (mode === 'move') element.style.cursor = 'grabbing';
        e.stopPropagation();
    }

    function move(e) {
        if (mode === 'none') return;
        const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
        const deltaX = clientX - startX;

        if (mode === 'move') {
            let newLeft = initialLeft + deltaX;
            if (newLeft < 0) newLeft = 0;
            if (newLeft + element.offsetWidth > parentWidth) newLeft = parentWidth - element.offsetWidth;
            element.style.left = newLeft + 'px';
            trackObj.offsetPercent = newLeft / parentWidth;
        } 
        else if (mode === 'resize-right') {
            let newWidth = initialWidth + deltaX;
            if (newWidth < 20) newWidth = 20;
            if (element.offsetLeft + newWidth > parentWidth) newWidth = parentWidth - element.offsetLeft;
            element.style.width = newWidth + 'px';
            trackObj.durationPercent = newWidth / parentWidth;
        }
        else if (mode === 'resize-left') {
            let newWidth = initialWidth - deltaX;
            let newLeft = initialLeft + deltaX;
            if (newWidth < 20) return;
            if (newLeft < 0) newLeft = 0;
            element.style.width = newWidth + 'px';
            element.style.left = newLeft + 'px';
            trackObj.offsetPercent = newLeft / parentWidth;
            trackObj.durationPercent = newWidth / parentWidth;
        }
    }

    function endInteraction() {
        if (mode !== 'none') {
            mode = 'none';
            element.style.cursor = 'pointer';
        }
    }

    rightHandle.addEventListener('mousedown', (e) => startInteraction(e, 'resize-right'));
    rightHandle.addEventListener('touchstart', (e) => startInteraction(e, 'resize-right'), {passive: false});
    leftHandle.addEventListener('mousedown', (e) => startInteraction(e, 'resize-left'));
    leftHandle.addEventListener('touchstart', (e) => startInteraction(e, 'resize-left'), {passive: false});
    element.addEventListener('mousedown', (e) => {
        if(e.target === rightHandle || e.target === leftHandle) return;
        startInteraction(e, 'move');
    });
    element.addEventListener('touchstart', (e) => {
        if(e.target === rightHandle || e.target === leftHandle) return;
        startInteraction(e, 'move');
    }, {passive: false});
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', (e) => {
        if(mode !== 'none') { e.preventDefault(); move(e); }
    }, {passive: false});
    window.addEventListener('mouseup', endInteraction);
    window.addEventListener('touchend', endInteraction);
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        selectClip(element, trackObj.id);
    });
}

function addTrack(name, type, buffer = null, isVideo = false, src = null) {
    initAudio(); 
    const newBuffer = buffer || (isVideo ? null : generateSound(type));
    const trackId = Date.now() + Math.random();
    const defaultDurationPct = 2.0 / timelineDuration;

    const trackObj = {
        id: trackId,
        name: name,
        type: type,
        buffer: newBuffer,
        gain: audioCtx.createGain(),
        offsetPercent: 0,
        durationPercent: defaultDurationPct, 
        isVideo: isVideo,
        videoSrc: src
    };
    
    if(!isVideo) trackObj.gain.connect(audioCtx.destination);
    tracks.push(trackObj);

    const div = document.createElement('div');
    div.className = 'track-block';
    div.innerHTML = `
        <div class="track-info">
            <div class="track-title">${name}</div>
            <div class="track-meta">${type.toUpperCase()}</div>
        </div>
        <div class="track-timeline">
            <div class="clip ${type}" id="clip-${Math.floor(trackId)}" style="width: ${defaultDurationPct * 100}%">
                <span>${name}</span>
            </div>
        </div>
    `;
    trackContainer.appendChild(div);

    const clip = div.querySelector(`.clip`);
    makeInteractable(clip, trackObj);

    const emptyMsg = document.querySelector('.empty-state');
    if (emptyMsg) emptyMsg.remove();
}

document.getElementById('video-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
        videoObjectUrl = URL.createObjectURL(file);
        videoPlayer.src = videoObjectUrl;
        videoStage.classList.remove('hidden');
        addTrack('Video Track', 'video', null, true, videoObjectUrl);
    }
});

function togglePlay() {
    initAudio(); 
    if (isPlaying) stopAll();
    else playAll();
}

function playAll() {
    activeSources = [];
    const now = audioCtx.currentTime;

    if(videoPlayer.src) videoPlayer.play();

    tracks.forEach(track => {
        if(track.isVideo) return;

        const source = audioCtx.createBufferSource();
        source.buffer = track.buffer;
        source.connect(track.gain);
        
        track.gain.gain.value = document.getElementById('vol-slider').value;
        source.playbackRate.value = document.getElementById('speed-slider').value;

        const startTimeOffset = track.offsetPercent * timelineDuration;
        const clipDuration = track.durationPercent * timelineDuration;
        
        if (startTimeOffset < timelineDuration) {
            source.loop = true; 
            source.start(now + startTimeOffset, 0, clipDuration);
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
    
    if(videoPlayer.src) {
        videoPlayer.pause();
        videoPlayer.currentTime = 0;
    }

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
        if (elapsed > duration) { stopAll(); return; }
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

if (window.innerWidth > 768) {
    let isDraggingChat = false;
    let chatStartX, chatStartY, chatInitX, chatInitY;
    chatHeader.addEventListener('mousedown', (e) => {
        isDraggingChat = true;
        chatStartX = e.clientX;
        chatStartY = e.clientY;
        const rect = chatWidget.getBoundingClientRect();
        chatInitX = rect.left;
        chatInitY = rect.top;
        chatWidget.style.right = 'auto';
        chatWidget.style.bottom = 'auto';
        chatHeader.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDraggingChat) return;
        chatWidget.style.left = `${chatInitX + (e.clientX - chatStartX)}px`;
        chatWidget.style.top = `${chatInitY + (e.clientY - chatStartY)}px`;
    });
    window.addEventListener('mouseup', () => {
        isDraggingChat = false;
        chatHeader.style.cursor = 'move';
    });
}

playBtn.addEventListener('click', togglePlay);
document.getElementById('stop-btn').addEventListener('click', stopAll);
deleteBtn.addEventListener('click', deleteSelectedTrack);
splitBtn.addEventListener('click', splitSelectedTrack);

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        togglePlay();
    }
    if (selectedTrackId) {
        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedTrack();
        if (e.ctrlKey && e.key === 'c') splitSelectedTrack();
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.clip') && !e.target.closest('#delete-btn') && !e.target.closest('#split-btn')) {
        deselectAll();
    }
});

document.getElementById('add-track-btn').addEventListener('click', () => {
    initAudio();
    const select = document.getElementById('instrument-select');
    addTrack(select.options[select.selectedIndex].text, select.value);
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
            btn.classList.add('active');
        } catch (e) {
            alert('Mic permission denied.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.classList.remove('active');
    }
});

document.getElementById('speed-slider').addEventListener('input', (e) => {
    if(isPlaying && activeSources.length > 0) {
        activeSources.forEach(src => src.playbackRate.value = e.target.value);
    }
});

document.getElementById('export-trigger-btn').addEventListener('click', () => {
    if(tracks.length === 0) return alert("Project is empty.");
    window.location.href = 'exporting.html';
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
    div.className = `msg ${isAi ? 'ai' : 'user'}`;
    div.innerHTML = html;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function handleAiRequest() {
    if (typeof puter === 'undefined' || !puter.auth) {
        appendMessage("System error: AI service not loaded.", true);
        return;
    }
    
    if (!puter.auth.isSignedIn()) {
        try {
            await puter.auth.signIn();
            updateProfileUI(await puter.auth.getUser());
        } catch (e) {
            appendMessage("Login required for AI.", true);
            return;
        }
    }

    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;
    
    appendMessage(text, false);
    input.value = '';
    typingIndicator.classList.remove('hidden');
    
    try {
        const prompt = `User request: "${text}". Return single token. Tokens: [GENRE:LOFI], [GENRE:TRAP], [GENRE:TECHNO], [GENRE:ORCHESTRA], [ADD:drum], [ADD:snare], [ADD:hihat], [ADD:808], [ADD:bass], [ADD:piano], [ADD:guitar], [ADD:flute], [ADD:sax], [ADD:harp], [ADD:choir], [ADD:techno], [ADD:synth], [ADD:strings], [ADD:bell]. Text then token.`;
        
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
        appendMessage("AI Service Offline. Try refreshing.", true);
    }
}

function createAiBtn(type, name) {
    return `<div class="ai-card"><button class="ai-btn-action" onclick="applyAi('${type}', '${name}')">✚ Add ${name}</button></div>`;
}

function createGenreBtn(type, name) {
    return `<div class="ai-card"><button class="ai-btn-action" onclick="applyGenre('${type}')">✚ Create ${name}</button></div>`;
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
    if (user) {
        loginBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        userAvatar.innerText = user.username[0].toUpperCase();
    }
}

loginBtn.addEventListener('click', async () => {
    if(typeof puter !== 'undefined') {
        try {
            const user = await puter.auth.signIn();
            updateProfileUI(user);
        } catch(e) { }
    }
});

if (typeof puter !== 'undefined') {
    puter.auth.getUser().then(user => updateProfileUI(user)).catch(()=>{});
}
