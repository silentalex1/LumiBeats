let currentVideoFile = null;
let videoElement = null;
let appliedFilters = {};
let recordedChunks = [];
let mediaRecorder = null;
let trimStart = 0;
let trimEnd = null;
let textOverlays = [];
let installedPlugins = {};

function showUpload() {
  document.getElementById('upload-screen').style.display = 'flex';
  document.getElementById('editor-screen').classList.remove('grid-active');
  document.getElementById('plugin-page').style.display = 'none';
}

function showPluginPage() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('editor-screen').classList.remove('grid-active');
  document.getElementById('plugin-page').style.display = 'block';
}

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
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('plugin-page').style.display = 'none';
  const editor = document.getElementById('editor-screen');
  editor.classList.add('grid-active');
  videoElement = document.getElementById('preview');
  videoElement.src = URL.createObjectURL(file);
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
}

function updateQualityBadge() {
  if (!videoElement) return;
  const h = videoElement.videoHeight;
  const badge = document.getElementById('quality-badge');
  if (!h) { badge.textContent = '—'; return; }
  if (h >= 2160) badge.textContent = '4K';
  else if (h >= 1080) badge.textContent = '1080P';
  else if (h >= 720) badge.textContent = '720P';
  else if (h >= 480) badge.textContent = '480P';
  else badge.textContent = h + 'P';
}

function updateTime() {
  if (!videoElement) return;
  const cur = formatTime(videoElement.currentTime);
  const dur = formatTime(videoElement.duration);
  document.getElementById('video-duration').textContent = cur + ' / ' + dur;
  if (videoElement.duration) {
    const pct = (videoElement.currentTime / videoElement.duration) * 100;
    document.getElementById('playhead').style.left = pct + '%';
  }
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function switchTab(n) {
  document.getElementById('ai-panel').style.display = n === 0 ? 'block' : 'none';
  const mp = document.getElementById('manual-panel');
  mp.style.display = n === 1 ? 'flex' : 'none';
  document.getElementById('tab-0').className = 'tab-btn' + (n === 0 ? ' active' : '');
  document.getElementById('tab-1').className = 'tab-btn' + (n === 1 ? ' active' : '');
}

function buildFilterString() {
  const parts = [];
  if (appliedFilters.brightness !== undefined) parts.push('brightness(' + appliedFilters.brightness + ')');
  if (appliedFilters.contrast !== undefined) parts.push('contrast(' + appliedFilters.contrast + ')');
  if (appliedFilters.saturate !== undefined) parts.push('saturate(' + appliedFilters.saturate + ')');
  if (appliedFilters.sepia !== undefined) parts.push('sepia(' + appliedFilters.sepia + ')');
  if (appliedFilters.grayscale !== undefined) parts.push('grayscale(' + appliedFilters.grayscale + ')');
  if (appliedFilters.blur !== undefined) parts.push('blur(' + appliedFilters.blur + 'px)');
  if (appliedFilters.hueRotate !== undefined) parts.push('hue-rotate(' + appliedFilters.hueRotate + 'deg)');
  if (appliedFilters.invert !== undefined) parts.push('invert(' + appliedFilters.invert + ')');
  return parts.join(' ') || 'none';
}

function applyFiltersToVideo() {
  if (!videoElement) return;
  videoElement.style.filter = buildFilterString();
  videoElement.style.animation = appliedFilters.shake ? 'shake 0.2s infinite' : '';
  if (appliedFilters.flip === 'h') videoElement.style.transform = 'scaleX(-1)';
  else if (appliedFilters.flip === 'v') videoElement.style.transform = 'scaleY(-1)';
  else if (appliedFilters.rotate) videoElement.style.transform = 'rotate(' + appliedFilters.rotate + 'deg)';
  else videoElement.style.transform = '';
  if (appliedFilters.speed) videoElement.playbackRate = appliedFilters.speed;
}

function parsePromptAndApply(prompt) {
  const p = prompt.toLowerCase();

  const qualityMatch = p.match(/(\d{3,4})\s*p/);
  if (qualityMatch) {
    const q = parseInt(qualityMatch[1]);
    if (q > 1080) { showPremiumModal(); return; }
    document.getElementById('quality-badge').textContent = q + 'P';
    showChangesApplied();
    return;
  }
  if (p.includes('4k') || p.includes('2160')) { showPremiumModal(); return; }
  if (p.includes('4080') || p.includes('8k') || p.includes('ultra hd')) { showPremiumModal(); return; }

  if (p.includes('bright') || p.includes('lighten')) appliedFilters.brightness = 1.4;
  if (p.includes('dark') || p.includes('darken')) appliedFilters.brightness = 0.6;
  if (p.includes('contrast')) appliedFilters.contrast = p.includes('low') ? 0.7 : 1.5;
  if (p.includes('saturat') || p.includes('vivid') || p.includes('vibrant')) appliedFilters.saturate = 1.8;
  if (p.includes('desaturat') || p.includes('muted')) appliedFilters.saturate = 0.3;
  if (p.includes('sepia') || p.includes('vintage') || p.includes('retro') || p.includes('old film')) { appliedFilters.sepia = 0.8; appliedFilters.contrast = 1.1; }
  if (p.includes('grayscale') || p.includes('black and white') || p.includes('b&w') || p.includes('monochrome')) appliedFilters.grayscale = 1;
  if (p.includes('blur') || p.includes('soft focus')) appliedFilters.blur = 3;
  if (p.includes('sharp') || p.includes('crisp')) { appliedFilters.blur = 0; appliedFilters.contrast = 1.3; }
  if (p.includes('invert') || p.includes('negative')) appliedFilters.invert = 1;
  if (p.includes('warm') || p.includes('golden') || p.includes('sunset')) { appliedFilters.sepia = 0.25; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
  if (p.includes('cool') || p.includes('cold') || p.includes('blue tones')) { appliedFilters.hueRotate = 200; appliedFilters.saturate = 1.2; }
  if (p.includes('cinematic') || p.includes('film look')) { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
  if (p.includes('neon') || p.includes('cyberpunk')) { appliedFilters.saturate = 3; appliedFilters.contrast = 1.5; appliedFilters.brightness = 1.1; appliedFilters.hueRotate = 300; }
  if (p.includes('horror') || p.includes('scary')) { appliedFilters.grayscale = 0.7; appliedFilters.contrast = 1.8; appliedFilters.brightness = 0.7; }
  if (p.includes('dream') || p.includes('dreamy') || p.includes('ethereal')) { appliedFilters.blur = 1.5; appliedFilters.saturate = 1.4; appliedFilters.brightness = 1.2; }
  if (p.includes('shake') && !p.includes('no shake') && !p.includes('remove shake')) appliedFilters.shake = true;
  if (p.includes('no shake') || p.includes('remove shake') || p.includes('stabilize')) appliedFilters.shake = false;
  if (p.includes('flip horizontal') || p.includes('mirror')) appliedFilters.flip = 'h';
  if (p.includes('flip vertical') || p.includes('flip upside')) appliedFilters.flip = 'v';
  if (p.includes('slow') || p.includes('0.5x') || p.includes('half speed')) { appliedFilters.speed = 0.5; if (videoElement) videoElement.playbackRate = 0.5; }
  if (p.includes('2x') || p.includes('fast') || p.includes('timelapse') || p.includes('double speed')) { appliedFilters.speed = 2.0; if (videoElement) videoElement.playbackRate = 2.0; }
  if (p.includes('normal speed') || p.includes('1x speed')) { appliedFilters.speed = 1.0; if (videoElement) videoElement.playbackRate = 1.0; }
  if (p.includes('rotate 90') || p.includes('turn 90')) appliedFilters.rotate = 90;
  if (p.includes('rotate 180') || p.includes('turn 180')) appliedFilters.rotate = 180;
  if (p.includes('rotate 270') || p.includes('turn 270')) appliedFilters.rotate = 270;
  if (p.includes('add text') || p.includes('overlay text') || p.includes('caption') || p.includes('subtitle')) {
    const match = prompt.match(/[""]([^""]+)[""]/);
    const txt = match ? match[1] : 'My Video';
    textOverlays.push({ text: txt, x: 50, y: 85, size: 28, color: '#ffffff' });
  }
  if (p.includes('reset') || p.includes('remove all') || p.includes('undo all') || p.includes('original')) {
    appliedFilters = {};
    textOverlays = [];
  }

  applyFiltersToVideo();
  syncSlidersFromFilters();
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
  }, 700);
}

function runAITool(type) {
  if (!videoElement) return;
  showLoading('Applying effect...');
  setTimeout(() => {
    hideLoading();
    if (type === 'shake') appliedFilters.shake = !appliedFilters.shake;
    if (type === 'cinematic') { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
    if (type === 'grayscale') { appliedFilters.grayscale = appliedFilters.grayscale ? 0 : 1; }
    if (type === 'warm') { appliedFilters.sepia = 0.25; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
    if (type === 'flip') appliedFilters.flip = appliedFilters.flip === 'h' ? null : 'h';
    if (type === 'slow') { appliedFilters.speed = 0.5; videoElement.playbackRate = 0.5; }
    if (type === 'reset') { appliedFilters = {}; textOverlays = {}; videoElement.playbackRate = 1; }
    applyFiltersToVideo();
    syncSlidersFromFilters();
    showChangesApplied();
  }, 500);
}

function syncSlidersFromFilters() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
    const d = document.getElementById(id.replace('-slider', '-val'));
    if (d) d.textContent = val;
  };
  set('brightness-slider', appliedFilters.brightness !== undefined ? appliedFilters.brightness : 1);
  set('contrast-slider', appliedFilters.contrast !== undefined ? appliedFilters.contrast : 1);
  set('saturate-slider', appliedFilters.saturate !== undefined ? appliedFilters.saturate : 1);
  set('sepia-slider', appliedFilters.sepia !== undefined ? appliedFilters.sepia : 0);
  set('blur-slider', appliedFilters.blur !== undefined ? appliedFilters.blur : 0);
  set('speed-slider', appliedFilters.speed !== undefined ? appliedFilters.speed : 1);
}

function onSliderChange(type, val) {
  val = parseFloat(val);
  const d = document.getElementById(type + '-val');
  if (d) d.textContent = val;
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
  const dur = videoElement.duration;
  container.innerHTML = '';

  const label = document.createElement('div');
  label.id = 'trim-label';
  label.style.cssText = 'font-size:10px;color:var(--text-muted);margin-bottom:6px;font-family:monospace;';
  label.textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  container.appendChild(label);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;';

  const startLbl = document.createElement('span');
  startLbl.style.cssText = 'font-size:9px;color:var(--text-dim);font-weight:700;';
  startLbl.textContent = 'IN';

  const startInput = document.createElement('input');
  startInput.type = 'range'; startInput.min = 0; startInput.max = dur; startInput.step = 0.1; startInput.value = trimStart;
  startInput.className = 'slider-track'; startInput.style.flex = '1';
  startInput.oninput = (e) => {
    trimStart = parseFloat(e.target.value);
    document.getElementById('trim-label').textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
    if (videoElement) videoElement.currentTime = trimStart;
  };

  const endInput = document.createElement('input');
  endInput.type = 'range'; endInput.min = 0; endInput.max = dur; endInput.step = 0.1; endInput.value = trimEnd || dur;
  endInput.className = 'slider-track fuchsia'; endInput.style.flex = '1';
  endInput.oninput = (e) => {
    trimEnd = parseFloat(e.target.value);
    document.getElementById('trim-label').textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  };

  const endLbl = document.createElement('span');
  endLbl.style.cssText = 'font-size:9px;color:var(--text-dim);font-weight:700;';
  endLbl.textContent = 'OUT';

  row.appendChild(startLbl); row.appendChild(startInput); row.appendChild(endInput); row.appendChild(endLbl);
  container.appendChild(row);
}

function showLoading(msg) {
  const t = document.getElementById('loading-text');
  if (t && msg) t.textContent = msg;
  document.getElementById('loading-modal').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-modal').classList.add('hidden');
}

function showPremiumModal() {
  document.getElementById('premium-modal').classList.remove('hidden');
}

function closePremiumModal() {
  document.getElementById('premium-modal').classList.add('hidden');
}

function scrubTimeline(e) {
  if (!videoElement || !videoElement.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  videoElement.currentTime = pct * videoElement.duration;
}

function loadDemoVideo() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('plugin-page').style.display = 'none';
  const editor = document.getElementById('editor-screen');
  editor.classList.add('grid-active');
  videoElement = document.getElementById('preview');
  videoElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  videoElement.onloadedmetadata = () => {
    document.getElementById('video-title').textContent = 'BigBuckBunny.mp4';
    trimEnd = videoElement.duration;
    updateTime();
    updateQualityBadge();
    renderTrimUI();
  };
  videoElement.ontimeupdate = updateTime;
  currentVideoFile = null;
  appliedFilters = {};
  textOverlays = [];
}

function exportVideo() {
  if (!videoElement || !videoElement.src || videoElement.readyState < 1) {
    alert('Please load a video first.');
    return;
  }
  showLoading('Rendering video...');
  renderAndDownload();
}

function renderAndDownload() {
  const src = videoElement;
  const w = src.videoWidth || 1280;
  const h = src.videoHeight || 720;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let mimeType = '';
  for (const m of mimeTypes) {
    if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
  }
  if (!mimeType) {
    hideLoading();
    alert('Your browser does not support video recording. Try Chrome or Edge.');
    return;
  }

  const stream = canvas.captureStream(30);
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    hideLoading();
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = (document.getElementById('video-title').textContent || 'video').replace(/\.[^.]+$/, '');
    a.download = base + '_edited.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const start = trimStart || 0;
  const end = (trimEnd && trimEnd > start) ? trimEnd : src.duration;
  src.currentTime = start;
  src.pause();

  const applyCanvasFilters = () => {
    const parts = [];
    if (appliedFilters.brightness !== undefined) parts.push('brightness(' + appliedFilters.brightness + ')');
    if (appliedFilters.contrast !== undefined) parts.push('contrast(' + appliedFilters.contrast + ')');
    if (appliedFilters.saturate !== undefined) parts.push('saturate(' + appliedFilters.saturate + ')');
    if (appliedFilters.sepia !== undefined) parts.push('sepia(' + appliedFilters.sepia + ')');
    if (appliedFilters.grayscale !== undefined) parts.push('grayscale(' + appliedFilters.grayscale + ')');
    if (appliedFilters.blur !== undefined) parts.push('blur(' + appliedFilters.blur + 'px)');
    if (appliedFilters.hueRotate !== undefined) parts.push('hue-rotate(' + appliedFilters.hueRotate + 'deg)');
    if (appliedFilters.invert !== undefined) parts.push('invert(' + appliedFilters.invert + ')');
    ctx.filter = parts.join(' ') || 'none';
  };

  const drawWatermark = () => {
    ctx.save();
    ctx.filter = 'none';
    ctx.font = '700 ' + Math.max(14, Math.round(w * 0.018)) + 'px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Powered by VidStudio', w - 14, h - 12);
    ctx.restore();
  };

  const drawTextOverlays = () => {
    ctx.filter = 'none';
    for (const t of textOverlays) {
      ctx.save();
      ctx.font = 'bold ' + t.size + 'px Inter, sans-serif';
      ctx.fillStyle = t.color || '#ffffff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 8;
      ctx.fillText(t.text, (t.x / 100) * w, (t.y / 100) * h);
      ctx.restore();
    }
  };

  mediaRecorder.start(100);
  let frameCount = 0;
  const fps = 30;
  const frameInterval = 1 / fps;

  const drawFrame = () => {
    if (src.currentTime >= end || src.ended) {
      mediaRecorder.stop();
      return;
    }
    ctx.save();
    if (appliedFilters.flip === 'h') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    else if (appliedFilters.flip === 'v') { ctx.translate(0, h); ctx.scale(1, -1); }
    else if (appliedFilters.rotate) { ctx.translate(w / 2, h / 2); ctx.rotate((appliedFilters.rotate * Math.PI) / 180); ctx.translate(-w / 2, -h / 2); }
    applyCanvasFilters();
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    drawTextOverlays();
    drawWatermark();
    frameCount++;
    src.currentTime = start + frameCount * frameInterval;
  };

  src.onseeked = drawFrame;
  drawFrame();
}

function toggleInstall(pluginId) {
  const btn = document.getElementById('install-' + pluginId);
  if (!btn) return;
  if (installedPlugins[pluginId]) {
    installedPlugins[pluginId] = false;
    btn.textContent = 'Install';
    btn.classList.remove('installed');
  } else {
    installedPlugins[pluginId] = true;
    btn.textContent = 'Installed';
    btn.classList.add('installed');
  }
}
