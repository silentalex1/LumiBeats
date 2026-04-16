let currentVideoFile = null;
let videoElement = null;

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
    videoElement.src = URL.createObjectURL(file);
    videoElement.onloadedmetadata = () => {
        document.getElementById('video-title').textContent = file.name;
        updateTime();
    };
    videoElement.ontimeupdate = updateTime;
}

function updateTime() {
    const cur = formatTime(videoElement.currentTime);
    const dur = formatTime(videoElement.duration);
    document.getElementById('video-duration').textContent = `${cur} / ${dur}`;
    const pct = (videoElement.currentTime / videoElement.duration) * 100;
    document.getElementById('playhead').style.left = `${pct}%`;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function switchTab(n) {
    document.getElementById('ai-panel').classList.toggle('hidden', n !== 0);
    document.getElementById('manual-panel').classList.toggle('hidden', n !== 1);
    document.getElementById('tab-0').className = n === 0 ? "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest border-b border-violet-500" : "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500";
    document.getElementById('tab-1').className = n === 1 ? "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest border-b border-violet-500" : "flex-1 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500";
}

function runCustomAI() {
    const prompt = document.getElementById('ai-prompt').value.toLowerCase();
    if (!prompt || !videoElement) return;

    showLoading();

    setTimeout(() => {
        hideLoading();
        applyAIChanges(prompt);
        document.getElementById('ai-prompt').value = '';
    }, 3500);
}

function applyAIChanges(prompt) {
    const overlay = document.getElementById('ai-overlay');
    const badge = document.getElementById('quality-badge');

    if (prompt.includes('shake')) {
        videoElement.classList.add('animate-bounce');
        setTimeout(() => videoElement.classList.remove('animate-bounce'), 2000);
    }

    if (prompt.includes('4080') || prompt.includes('4k') || prompt.includes('upscale')) {
        badge.textContent = '4080P ULTRA HD';
        badge.classList.replace('text-violet-400', 'text-emerald-400');
        videoElement.style.filter = 'contrast(1.1) saturate(1.1) brightness(1.05)';
    }

    if (prompt.includes('2040')) {
        badge.textContent = '2040P QHD';
    }

    if (prompt.includes('pretty') || prompt.includes('cinematic') || prompt.includes('make anything')) {
        videoElement.style.filter = 'sepia(0.2) contrast(1.2) saturate(1.4)';
    }

    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 2500);
}

function runAITool(type) {
    document.getElementById('ai-prompt').value = `Applying ${type} effect...`;
    runCustomAI();
}

function showLoading() {
    document.getElementById('loading-modal').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-modal').classList.add('hidden');
}

function scrubTimeline(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoElement.currentTime = pct * videoElement.duration;
}

function loadDemoVideo() {
    document.getElementById('upload-screen').classList.add('hidden');
    document.getElementById('editor-screen').classList.remove('hidden');
    document.getElementById('editor-screen').classList.add('grid');
    videoElement = document.getElementById('preview');
    videoElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180_10s_1MB.mp4';
}

function exportVideo() {
    alert("Exporting project in 4080p...");
}
