function initTailwind() {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    violet: {
                        500: '#8b5cf6',
                        600: '#7c3aed',
                    }
                }
            }
        }
    }
}

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
    const url = URL.createObjectURL(file);
    videoElement.src = url;

    videoElement.onloadedmetadata = () => {
        updateDurationDisplay();
        document.getElementById('video-title').textContent = file.name;
    };

    videoElement.ontimeupdate = () => {
        updateDurationDisplay();
        updatePlayhead();
    };
}

function updateDurationDisplay() {
    const current = formatTime(videoElement.currentTime);
    const total = formatTime(videoElement.duration);
    document.getElementById('video-duration').textContent = `${current} / ${total}`;
}

function updatePlayhead() {
    const percent = (videoElement.currentTime / videoElement.duration) * 100;
    document.getElementById('playhead').style.left = `${percent}%`;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function loadDemoVideo() {
    document.getElementById('upload-screen').classList.add('hidden');
    const editor = document.getElementById('editor-screen');
    editor.classList.remove('hidden');
    editor.classList.add('grid');

    videoElement = document.getElementById('preview');
    videoElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180_10s_1MB.mp4';
    videoElement.onloadedmetadata = () => {
        updateDurationDisplay();
        document.getElementById('video-title').textContent = 'Demo: Big Buck Bunny';
    };
}

function switchTab(n) {
    const aiPanel = document.getElementById('ai-panel');
    const manualPanel = document.getElementById('manual-panel');
    const t0 = document.getElementById('tab-0');
    const t1 = document.getElementById('tab-1');

    if (n === 0) {
        aiPanel.classList.remove('hidden');
        manualPanel.classList.add('hidden');
        t0.className = "flex-1 py-4 text-[11px] font-bold uppercase tracking-widest transition-all border-b border-violet-500 text-white";
        t1.className = "flex-1 py-4 text-[11px] font-bold uppercase tracking-widest transition-all text-zinc-500 border-b border-transparent hover:text-zinc-300";
    } else {
        aiPanel.classList.add('hidden');
        manualPanel.classList.remove('hidden');
        t1.className = "flex-1 py-4 text-[11px] font-bold uppercase tracking-widest transition-all border-b border-violet-500 text-white";
        t0.className = "flex-1 py-4 text-[11px] font-bold uppercase tracking-widest transition-all text-zinc-500 border-b border-transparent hover:text-zinc-300";
    }
}

function runAITool(tool) {
    showLoading(`GPT-5 Engine applying ${tool.toUpperCase()}...`);
    setTimeout(() => {
        hideLoading();
        if (videoElement) {
            triggerSuccessOverlay();
            if (tool === 'auto') videoElement.playbackRate = 1.15;
            if (tool === 'bgremove') videoElement.style.filter = 'contrast(1.1) brightness(1.1)';
        }
    }, 2000);
}

function runCustomAI() {
    const prompt = document.getElementById('ai-prompt').value.trim();
    if (!prompt || !videoElement) return;
    showLoading('GPT-5 parsing narrative instructions...');
    setTimeout(() => {
        hideLoading();
        triggerSuccessOverlay();
        document.getElementById('ai-prompt').value = '';
    }, 2800);
}

function triggerSuccessOverlay() {
    const overlay = document.getElementById('ai-overlay');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 2000);
}

function showLoading(text) {
    const modal = document.getElementById('loading-modal');
    document.getElementById('loading-text').textContent = text;
    modal.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-modal').classList.add('hidden');
}

function changeSpeed(speed) {
    if (videoElement) videoElement.playbackRate = parseFloat(speed);
}

function applyTrim() {
    if (!videoElement) return;
    const start = parseFloat(document.getElementById('trim-start').value) || 0;
    videoElement.currentTime = start;
}

function applyFilter(type) {
    if (!videoElement) return;
    videoElement.style.filter = type === 'grayscale' ? 'grayscale(100%)' : 'sepia(80%) brightness(0.9)';
    setTimeout(() => { if (videoElement) videoElement.style.filter = '' }, 4000);
}

function addTextOverlay() {
    if (!videoElement) return;
    const text = prompt('Enter text for layer:');
    if (text) console.log('Layer added:', text);
}

function exportVideo() {
    if (!videoElement || !videoElement.src) return;
    const a = document.createElement('a');
    a.href = videoElement.src;
    a.download = 'VidAI_Export.mp4';
    a.click();
}

function fakePuterLogin() {
    alert('Connected to Puter. GPT-5 High-Compute mode active.');
}

function scrubTimeline(e) {
    if (!videoElement) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    videoElement.currentTime = percent * videoElement.duration;
}

window.onload = initTailwind;
