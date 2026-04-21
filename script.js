let currentVideoFile = null;
let videoElement = null;
let appliedFilters = {};
let mediaRecorder = null;
let recordedChunks = [];
let isProcessing = false;
let trimStart = 0;
let trimEnd = null;
let playbackSpeed = 1.0;
let cropSettings = { x: 0, y: 0, w: 1, h: 1 };
let textOverlays = [];

function triggerUpload() {
    document.getElementById('fileInput').click();
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;
    currentVideoFile = file;
    loadVideoIntoEditor(file);
}

function loadVideoIntoEditor(file) {
    document.getElementById('upload-screen').classList.add('hidden');
    const editor = document.getElementById('editor-screen');
    editor.classList.remove('hidden');
    editor.classList.add('grid');
    videoElement = document.getElementById('preview');
    const url = URL.createObjectURL(file);
    videoElement.src = url;
    videoElement.onloadedmetadata = () => {
        document.getElementById('video-title').textContent = file.name;
        trimEnd = videoElement.duration;
        updateTime();
        updateQualityBadge();
        renderTrimUI();
    };
    videoElement.ontimeupdate = updateTime;
    appliedFilters = {};
    textOverlays = [];
    playbackSpeed = 1.0;
    cropSettings = { x: 0, y: 0, w: 1, h: 1 };
}

function updateQualityBadge() {
    const badge = document.getElementById('quality-badge');
    const h = videoElement.videoHeight;
    if (h >= 2160) badge.textContent = '4K';
    else if (h >= 1080) badge.textContent = '1080P';
    else if (h >= 720) badge.textContent = '720P';
    else badge.textContent = `${h}P`;
}

function updateTime() {
    const cur = formatTime(videoElement.currentTime);
    const dur = formatTime(videoElement.duration);
    document.getElementById('video-duration').textContent = `${cur} / ${dur}`;
    const pct = (videoElement.currentTime / videoElement.duration) * 100;
    document.getElementById('playhead').style.left = `${pct}%`;
}

function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function switchTab(n) {
    document.getElementById('ai-panel').classList.toggle('hidden', n !== 0);
    document.getElementById('manual-panel').classList.toggle('hidden', n !== 1);
    document.getElementById('tab-0').className = n === 0
        ? 'flex-1 py-4 text-[10px] font-bold uppercase tracking-widest border-b border-violet-500'
        : 'flex-1 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500';
    document.getElementById('tab-1').className = n === 1
        ? 'flex-1 py-4 text-[10px] font-bold uppercase tracking-widest border-b border-violet-500'
        : 'flex-1 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500';
}

function buildFilterString() {
    const parts = [];
    if (appliedFilters.brightness !== undefined) parts.push(`brightness(${appliedFilters.brightness})`);
    if (appliedFilters.contrast !== undefined) parts.push(`contrast(${appliedFilters.contrast})`);
    if (appliedFilters.saturate !== undefined) parts.push(`saturate(${appliedFilters.saturate})`);
    if (appliedFilters.sepia !== undefined) parts.push(`sepia(${appliedFilters.sepia})`);
    if (appliedFilters.grayscale !== undefined) parts.push(`grayscale(${appliedFilters.grayscale})`);
    if (appliedFilters.blur !== undefined) parts.push(`blur(${appliedFilters.blur}px)`);
    if (appliedFilters.hueRotate !== undefined) parts.push(`hue-rotate(${appliedFilters.hueRotate}deg)`);
    if (appliedFilters.invert !== undefined) parts.push(`invert(${appliedFilters.invert})`);
    return parts.join(' ') || 'none';
}

function applyFiltersToVideo() {
    videoElement.style.filter = buildFilterString();
    if (appliedFilters.shake) {
        videoElement.style.animation = 'shake 0.2s infinite';
    } else {
        videoElement.style.animation = '';
    }
    if (appliedFilters.flip === 'h') {
        videoElement.style.transform = 'scaleX(-1)';
    } else if (appliedFilters.flip === 'v') {
        videoElement.style.transform = 'scaleY(-1)';
    } else if (appliedFilters.rotate) {
        videoElement.style.transform = `rotate(${appliedFilters.rotate}deg)`;
    } else {
        videoElement.style.transform = '';
    }
    if (appliedFilters.speed) {
        videoElement.playbackRate = appliedFilters.speed;
    }
}

function parsePromptAndApply(prompt) {
    const p = prompt.toLowerCase();

    if (p.includes('bright') || p.includes('lighten')) appliedFilters.brightness = 1.4;
    if (p.includes('dark') || p.includes('darken')) appliedFilters.brightness = 0.6;
    if (p.includes('contrast')) appliedFilters.contrast = p.includes('low') ? 0.7 : 1.5;
    if (p.includes('saturat') || p.includes('vivid') || p.includes('vibrant')) appliedFilters.saturate = 1.8;
    if (p.includes('desaturat') || p.includes('muted')) appliedFilters.saturate = 0.3;
    if (p.includes('sepia') || p.includes('vintage') || p.includes('retro') || p.includes('old')) { appliedFilters.sepia = 0.8; appliedFilters.contrast = 1.1; }
    if (p.includes('grayscale') || p.includes('black and white') || p.includes('b&w') || p.includes('bw') || p.includes('monochrome')) appliedFilters.grayscale = 1;
    if (p.includes('blur') || p.includes('soft focus')) appliedFilters.blur = 3;
    if (p.includes('sharp') || p.includes('crisp')) { appliedFilters.blur = 0; appliedFilters.contrast = 1.3; }
    if (p.includes('invert') || p.includes('negative')) appliedFilters.invert = 1;
    if (p.includes('warm') || p.includes('golden hour') || p.includes('sunset')) { appliedFilters.sepia = 0.3; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
    if (p.includes('cool') || p.includes('cold') || p.includes('blue')) { appliedFilters.hueRotate = 200; appliedFilters.saturate = 1.2; }
    if (p.includes('cinematic') || p.includes('movie') || p.includes('film')) { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
    if (p.includes('neon') || p.includes('cyberpunk') || p.includes('glow')) { appliedFilters.saturate = 3; appliedFilters.contrast = 1.5; appliedFilters.brightness = 1.1; appliedFilters.hueRotate = 300; }
    if (p.includes('horror') || p.includes('scary')) { appliedFilters.grayscale = 0.7; appliedFilters.contrast = 1.8; appliedFilters.brightness = 0.7; }
    if (p.includes('dream') || p.includes('dreamy') || p.includes('ethereal')) { appliedFilters.blur = 1.5; appliedFilters.saturate = 1.4; appliedFilters.brightness = 1.2; }
    if (p.includes('shake') || p.includes('earthquake') || p.includes('tremor')) appliedFilters.shake = true;
    else if (p.includes('no shake') || p.includes('remove shake') || p.includes('stabilize')) appliedFilters.shake = false;
    if (p.includes('flip horizontal') || p.includes('mirror')) appliedFilters.flip = 'h';
    if (p.includes('flip vertical') || p.includes('flip upside')) appliedFilters.flip = 'v';
    if (p.includes('slow') || p.includes('0.5x') || p.includes('half speed')) appliedFilters.speed = 0.5;
    if (p.includes('fast') || p.includes('2x') || p.includes('double speed') || p.includes('timelapse')) appliedFilters.speed = 2.0;
    if (p.includes('normal speed') || p.includes('1x')) appliedFilters.speed = 1.0;
    if (p.includes('reset') || p.includes('original') || p.includes('remove all') || p.includes('undo all')) {
        appliedFilters = {};
        textOverlays = [];
    }
    if (p.includes('add text') || p.includes('overlay text') || p.includes('caption') || p.includes('subtitle')) {
        const match = prompt.match(/[""']([^""']+)[""']/);
        const txt = match ? match[1] : 'My Video';
        textOverlays.push({ text: txt, x: 50, y: 85, size: 28, color: '#ffffff' });
    }
    if (p.includes('rotate 90') || p.includes('turn 90')) appliedFilters.rotate = 90;
    if (p.includes('rotate 180') || p.includes('turn 180')) appliedFilters.rotate = 180;

    applyFiltersToVideo();
    updateSettingsPanelFromFilters();
    showChangesApplied();
}

function showChangesApplied() {
    const overlay = document.getElementById('ai-overlay');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 2000);
}

function runCustomAI() {
    const prompt = document.getElementById('ai-prompt').value;
    if (!prompt || !videoElement) return;
    showLoading('Applying changes...');
    setTimeout(() => {
        hideLoading();
        parsePromptAndApply(prompt);
        document.getElementById('ai-prompt').value = '';
    }, 800);
}

function runAITool(type) {
    if (!videoElement) return;
    showLoading('Applying effect...');
    setTimeout(() => {
        hideLoading();
        if (type === 'shake') { appliedFilters.shake = !appliedFilters.shake; }
        if (type === 'cinematic') { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
        if (type === 'grayscale') { appliedFilters.grayscale = appliedFilters.grayscale ? 0 : 1; }
        if (type === 'warm') { appliedFilters.sepia = 0.3; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
        if (type === 'flip') { appliedFilters.flip = appliedFilters.flip === 'h' ? null : 'h'; }
        if (type === 'slow') { appliedFilters.speed = 0.5; videoElement.playbackRate = 0.5; }
        if (type === 'reset') { appliedFilters = {}; textOverlays = []; }
        applyFiltersToVideo();
        updateSettingsPanelFromFilters();
        showChangesApplied();
    }, 600);
}

function updateSettingsPanelFromFilters() {
    const setSlider = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
        const disp = document.getElementById(id + '-val');
        if (disp) disp.textContent = val;
    };
    setSlider('brightness-slider', appliedFilters.brightness !== undefined ? appliedFilters.brightness : 1);
    setSlider('contrast-slider', appliedFilters.contrast !== undefined ? appliedFilters.contrast : 1);
    setSlider('saturate-slider', appliedFilters.saturate !== undefined ? appliedFilters.saturate : 1);
    setSlider('sepia-slider', appliedFilters.sepia !== undefined ? appliedFilters.sepia : 0);
    setSlider('blur-slider', appliedFilters.blur !== undefined ? appliedFilters.blur : 0);
    setSlider('speed-slider', appliedFilters.speed !== undefined ? appliedFilters.speed : 1);
}

function onSliderChange(type, val) {
    val = parseFloat(val);
    const disp = document.getElementById(type + '-slider-val');
    if (disp) disp.textContent = val;
    if (type === 'brightness') appliedFilters.brightness = val;
    if (type === 'contrast') appliedFilters.contrast = val;
    if (type === 'saturate') appliedFilters.saturate = val;
    if (type === 'sepia') appliedFilters.sepia = val;
    if (type === 'blur') appliedFilters.blur = val;
    if (type === 'speed') { appliedFilters.speed = val; if (videoElement) videoElement.playbackRate = val; }
    applyFiltersToVideo();
}

function renderTrimUI() {
    const container = document.getElementById('trim-container');
    if (!container || !videoElement || !videoElement.duration) return;
    container.innerHTML = '';
    const dur = videoElement.duration;
    const label = document.createElement('div');
    label.className = 'text-[10px] text-zinc-500 mb-1 font-mono';
    label.textContent = `Trim: ${formatTime(trimStart)} → ${formatTime(trimEnd || dur)}`;
    label.id = 'trim-label';
    container.appendChild(label);
    const row = document.createElement('div');
    row.className = 'flex gap-3 items-center';
    const startInput = document.createElement('input');
    startInput.type = 'range'; startInput.min = 0; startInput.max = dur; startInput.step = 0.1; startInput.value = trimStart;
    startInput.className = 'flex-1 accent-violet-500';
    startInput.oninput = (e) => { trimStart = parseFloat(e.target.value); document.getElementById('trim-label').textContent = `Trim: ${formatTime(trimStart)} → ${formatTime(trimEnd || dur)}`; if (videoElement) videoElement.currentTime = trimStart; };
    const endInput = document.createElement('input');
    endInput.type = 'range'; endInput.min = 0; endInput.max = dur; endInput.step = 0.1; endInput.value = trimEnd || dur;
    endInput.className = 'flex-1 accent-fuchsia-500';
    endInput.oninput = (e) => { trimEnd = parseFloat(e.target.value); document.getElementById('trim-label').textContent = `Trim: ${formatTime(trimStart)} → ${formatTime(trimEnd || dur)}`; };
    const startLbl = document.createElement('span'); startLbl.className = 'text-[9px] text-zinc-600'; startLbl.textContent = 'IN';
    const endLbl = document.createElement('span'); endLbl.className = 'text-[9px] text-zinc-600'; endLbl.textContent = 'OUT';
    row.appendChild(startLbl); row.appendChild(startInput); row.appendChild(endInput); row.appendChild(endLbl);
    container.appendChild(row);
}

function showLoading(msg) {
    const modal = document.getElementById('loading-modal');
    const text = document.getElementById('loading-text');
    if (text && msg) text.textContent = msg;
    modal.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-modal').classList.add('hidden');
}

function scrubTimeline(e) {
    if (!videoElement || !videoElement.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoElement.currentTime = pct * videoElement.duration;
}

function loadDemoVideo() {
    document.getElementById('upload-screen').classList.add('hidden');
    const editor = document.getElementById('editor-screen');
    editor.classList.remove('hidden');
    editor.classList.add('grid');
    videoElement = document.getElementById('preview');
    videoElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    videoElement.onloadedmetadata = () => {
        document.getElementById('video-title').textContent = 'BigBuckBunny.mp4';
        trimEnd = videoElement.duration;
        updateTime();
        renderTrimUI();
    };
    videoElement.ontimeupdate = updateTime;
    appliedFilters = {};
    currentVideoFile = null;
}

function exportVideo() {
    if (!videoElement || !videoElement.src || videoElement.src === '') {
        alert('Please load a video first.');
        return;
    }
    showLoading('Rendering video...');
    renderAndDownload();
}

function renderAndDownload() {
    const canvas = document.createElement('canvas');
    const src = videoElement;
    const w = src.videoWidth || 1280;
    const h = src.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let mimeType = '';
    for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
    }
    if (!mimeType) { hideLoading(); alert('Your browser does not support video recording. Try Chrome or Edge.'); return; }

    const stream = canvas.captureStream(30);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        hideLoading();
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const originalName = (document.getElementById('video-title').textContent || 'video').replace(/\.[^.]+$/, '');
        a.download = `${originalName}_edited.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const start = trimStart || 0;
    const end = trimEnd || src.duration;
    src.currentTime = start;
    src.pause();

    const applyCanvasFilters = () => {
        const parts = [];
        if (appliedFilters.brightness !== undefined) parts.push(`brightness(${appliedFilters.brightness})`);
        if (appliedFilters.contrast !== undefined) parts.push(`contrast(${appliedFilters.contrast})`);
        if (appliedFilters.saturate !== undefined) parts.push(`saturate(${appliedFilters.saturate})`);
        if (appliedFilters.sepia !== undefined) parts.push(`sepia(${appliedFilters.sepia})`);
        if (appliedFilters.grayscale !== undefined) parts.push(`grayscale(${appliedFilters.grayscale})`);
        if (appliedFilters.blur !== undefined) parts.push(`blur(${appliedFilters.blur}px)`);
        if (appliedFilters.hueRotate !== undefined) parts.push(`hue-rotate(${appliedFilters.hueRotate}deg)`);
        if (appliedFilters.invert !== undefined) parts.push(`invert(${appliedFilters.invert})`);
        ctx.filter = parts.join(' ') || 'none';
    };

    const drawTextOverlays = () => {
        ctx.filter = 'none';
        for (const t of textOverlays) {
            ctx.save();
            ctx.font = `bold ${t.size}px sans-serif`;
            ctx.fillStyle = t.color || '#ffffff';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 6;
            ctx.fillText(t.text, (t.x / 100) * w, (t.y / 100) * h);
            ctx.restore();
        }
    };

    let frameCount = 0;
    const fps = 30;
    const frameInterval = 1 / fps;

    mediaRecorder.start(100);

    const drawFrame = () => {
        if (src.currentTime >= end || src.ended) {
            mediaRecorder.stop();
            return;
        }
        ctx.save();
        if (appliedFilters.flip === 'h') { ctx.translate(w, 0); ctx.scale(-1, 1); }
        else if (appliedFilters.flip === 'v') { ctx.translate(0, h); ctx.scale(1, -1); }
        else if (appliedFilters.rotate) {
            ctx.translate(w / 2, h / 2);
            ctx.rotate((appliedFilters.rotate * Math.PI) / 180);
            ctx.translate(-w / 2, -h / 2);
        }
        applyCanvasFilters();
        ctx.drawImage(src, 0, 0, w, h);
        ctx.restore();
        drawTextOverlays();

        frameCount++;
        src.currentTime = start + frameCount * frameInterval;
    };

    src.onseeked = drawFrame;
    drawFrame();
}
