let currentVideoFile = null;
let videoElement = null;
let appliedFilters = {};
let recordedChunks = [];
let mediaRecorder = null;
let trimStart = 0;
let trimEnd = null;
let textOverlays = [];
let installedPlugins = {};
let faceTrackInterval = null;
let trackStyle = 'smooth';
let trackTarget = '';
let faceBoxVisible = false;

(function initUploadZone() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('fileInput');
  const demoBtn = document.getElementById('demo-btn');

  zone.addEventListener('click', function(e) {
    if (e.target === demoBtn || demoBtn.contains(e.target)) return;
    input.click();
  });

  demoBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    loadDemoVideo();
  });

  input.addEventListener('change', function() {
    if (this.files && this.files[0]) handleFile(this.files[0]);
  });

  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
    zone.style.borderColor = 'rgba(124,58,237,0.6)';
    zone.style.background = 'rgba(124,58,237,0.05)';
  });

  zone.addEventListener('dragleave', function() {
    zone.style.borderColor = '';
    zone.style.background = '';
  });

  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) handleFile(file);
  });
})();

function handleFile(file) {
  currentVideoFile = file;
  loadVideoIntoEditor(file);
}

function showUpload() {
  document.getElementById('upload-screen').style.display = 'flex';
  document.getElementById('editor-screen').classList.remove('active');
  document.getElementById('plugin-page').style.display = 'none';
}

function showPluginPage() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('editor-screen').classList.remove('active');
  document.getElementById('plugin-page').style.display = 'block';
}

function loadVideoIntoEditor(file) {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('plugin-page').style.display = 'none';
  document.getElementById('editor-screen').classList.add('active');
  videoElement = document.getElementById('preview');

  if (videoElement.src && videoElement.src.startsWith('blob:')) {
    URL.revokeObjectURL(videoElement.src);
  }

  videoElement.src = URL.createObjectURL(file);
  videoElement.load();

  videoElement.onloadedmetadata = function() {
    document.getElementById('video-title').textContent = file.name;
    trimStart = 0;
    trimEnd = videoElement.duration;
    updateTime();
    updateQualityBadge();
    renderTrimUI();
    const hu = document.getElementById('history-uploaded');
    const hn = document.getElementById('history-name-uploaded');
    if (hu && hn) { hu.style.display = 'block'; hn.textContent = file.name; }
  };

  videoElement.ontimeupdate = updateTime;
  appliedFilters = {};
  textOverlays = [];
  stopFaceTracking();
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
  document.getElementById('video-duration').textContent = formatTime(videoElement.currentTime) + ' / ' + formatTime(videoElement.duration);
  if (videoElement.duration) {
    document.getElementById('playhead').style.left = (videoElement.currentTime / videoElement.duration * 100) + '%';
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
  document.getElementById('manual-panel').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('tab-0').className = 'tab-btn' + (n === 0 ? ' active' : '');
  document.getElementById('tab-1').className = 'tab-btn' + (n === 1 ? ' active' : '');
}

function buildFilterString() {
  const p = [];
  if (appliedFilters.brightness !== undefined) p.push('brightness(' + appliedFilters.brightness + ')');
  if (appliedFilters.contrast !== undefined) p.push('contrast(' + appliedFilters.contrast + ')');
  if (appliedFilters.saturate !== undefined) p.push('saturate(' + appliedFilters.saturate + ')');
  if (appliedFilters.sepia !== undefined) p.push('sepia(' + appliedFilters.sepia + ')');
  if (appliedFilters.grayscale !== undefined) p.push('grayscale(' + appliedFilters.grayscale + ')');
  if (appliedFilters.blur !== undefined) p.push('blur(' + appliedFilters.blur + 'px)');
  if (appliedFilters.hueRotate !== undefined) p.push('hue-rotate(' + appliedFilters.hueRotate + 'deg)');
  if (appliedFilters.invert !== undefined) p.push('invert(' + appliedFilters.invert + ')');
  return p.join(' ') || 'none';
}

function applyFiltersToVideo() {
  if (!videoElement) return;
  videoElement.style.filter = buildFilterString();
  videoElement.style.animation = appliedFilters.shake ? 'shake 0.18s infinite' : '';
  if (appliedFilters.flip === 'h') videoElement.style.transform = 'scaleX(-1)';
  else if (appliedFilters.flip === 'v') videoElement.style.transform = 'scaleY(-1)';
  else if (appliedFilters.rotate) videoElement.style.transform = 'rotate(' + appliedFilters.rotate + 'deg)';
  else videoElement.style.transform = '';
  if (appliedFilters.speed !== undefined) videoElement.playbackRate = appliedFilters.speed;
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
  if (p.includes('4k') || p.includes('2160p') || p.includes('4080') || p.includes('8k') || p.includes('ultra hd')) {
    showPremiumModal();
    return;
  }

  if (p.includes('bright') || p.includes('lighten')) appliedFilters.brightness = 1.4;
  if (p.includes('dark') || p.includes('darken')) appliedFilters.brightness = 0.6;
  if (p.includes('high contrast')) appliedFilters.contrast = 1.7;
  else if (p.includes('low contrast')) appliedFilters.contrast = 0.7;
  else if (p.includes('contrast')) appliedFilters.contrast = 1.5;
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
  if (p.includes('2x') || (p.includes('fast') && !p.includes('slow')) || p.includes('timelapse') || p.includes('double speed')) { appliedFilters.speed = 2.0; if (videoElement) videoElement.playbackRate = 2.0; }
  if (p.includes('normal speed') || p.includes('1x speed')) { appliedFilters.speed = 1.0; if (videoElement) videoElement.playbackRate = 1.0; }
  if (p.includes('rotate 90') || p.includes('turn 90')) appliedFilters.rotate = 90;
  if (p.includes('rotate 180') || p.includes('turn 180')) appliedFilters.rotate = 180;
  if (p.includes('rotate 270') || p.includes('turn 270')) appliedFilters.rotate = 270;
  if (p.includes('add text') || p.includes('overlay text') || p.includes('caption')) {
    const match = prompt.match(/["""']([^"""']+)["""']/);
    textOverlays.push({ text: match ? match[1] : 'My Video', x: 50, y: 85, size: 28, color: '#ffffff' });
  }
  if (p.includes('reset') || p.includes('remove all') || p.includes('undo all') || p === 'original') {
    appliedFilters = {};
    textOverlays = [];
    if (videoElement) videoElement.playbackRate = 1;
    stopFaceTracking();
  }

  applyFiltersToVideo();
  syncSlidersFromFilters();
  showChangesApplied();
}

function showChangesApplied() {
  const o = document.getElementById('ai-overlay');
  o.classList.remove('hidden');
  setTimeout(function() { o.classList.add('hidden'); }, 1800);
}

function fillPrompt(text) {
  const el = document.getElementById('ai-prompt');
  if (el) { el.value = text; el.focus(); }
}

function runCustomAI() {
  const el = document.getElementById('ai-prompt');
  const prompt = el ? el.value.trim() : '';
  if (!prompt || !videoElement) return;
  showLoading('Applying changes...');
  setTimeout(function() { hideLoading(); parsePromptAndApply(prompt); if (el) el.value = ''; }, 700);
}

function runAITool(type) {
  if (!videoElement && type !== 'reset') return;
  showLoading('Applying effect...');
  setTimeout(function() {
    hideLoading();
    if (type === 'shake') appliedFilters.shake = !appliedFilters.shake;
    if (type === 'cinematic') { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
    if (type === 'grayscale') appliedFilters.grayscale = appliedFilters.grayscale ? 0 : 1;
    if (type === 'warm') { appliedFilters.sepia = 0.25; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
    if (type === 'flip') appliedFilters.flip = appliedFilters.flip === 'h' ? null : 'h';
    if (type === 'slow') { appliedFilters.speed = 0.5; if (videoElement) videoElement.playbackRate = 0.5; }
    if (type === 'reset') {
      appliedFilters = {};
      textOverlays = [];
      if (videoElement) { videoElement.playbackRate = 1; videoElement.style.filter = ''; videoElement.style.transform = ''; videoElement.style.animation = ''; }
      stopFaceTracking();
      syncSlidersFromFilters();
      showChangesApplied();
      return;
    }
    applyFiltersToVideo();
    syncSlidersFromFilters();
    showChangesApplied();
  }, 500);
}

function runViralHook() {
  if (!videoElement || !videoElement.duration) return;
  showLoading('Analyzing clip...');
  setTimeout(function() {
    hideLoading();
    const bestMoment = Math.random() * Math.min(videoElement.duration, 5);
    videoElement.currentTime = bestMoment;
    trimStart = bestMoment;
    renderTrimUI();
    showChangesApplied();
  }, 1400);
}

function runAudioManip() {
  if (!videoElement) return;
  const v = videoElement.volume;
  videoElement.volume = v < 0.5 ? 1.0 : 0.5;
  showChangesApplied();
}

function syncSlidersFromFilters() {
  const set = function(id, val) {
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
  const c = document.getElementById('trim-container');
  if (!c || !videoElement || !videoElement.duration) return;
  const dur = videoElement.duration;
  c.innerHTML = '';
  const lbl = document.createElement('div');
  lbl.id = 'trim-label';
  lbl.className = 'trim-label';
  lbl.textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  c.appendChild(lbl);
  const row = document.createElement('div');
  row.className = 'trim-row';
  const s1 = document.createElement('span'); s1.className = 'trim-lbl'; s1.textContent = 'IN';
  const sIn = document.createElement('input');
  sIn.type = 'range'; sIn.min = 0; sIn.max = dur; sIn.step = 0.1; sIn.value = trimStart;
  sIn.className = 'slider-track'; sIn.style.flex = '1';
  sIn.oninput = function(e) {
    trimStart = parseFloat(e.target.value);
    document.getElementById('trim-label').textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
    if (videoElement) videoElement.currentTime = trimStart;
  };
  const sOut = document.createElement('input');
  sOut.type = 'range'; sOut.min = 0; sOut.max = dur; sOut.step = 0.1; sOut.value = trimEnd || dur;
  sOut.className = 'slider-track fu'; sOut.style.flex = '1';
  sOut.oninput = function(e) {
    trimEnd = parseFloat(e.target.value);
    document.getElementById('trim-label').textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  };
  const s2 = document.createElement('span'); s2.className = 'trim-lbl'; s2.textContent = 'OUT';
  row.appendChild(s1); row.appendChild(sIn); row.appendChild(sOut); row.appendChild(s2);
  c.appendChild(row);
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
  document.getElementById('editor-screen').classList.add('active');
  videoElement = document.getElementById('preview');
  videoElement.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  videoElement.load();
  videoElement.onloadedmetadata = function() {
    document.getElementById('video-title').textContent = 'BigBuckBunny.mp4';
    trimStart = 0;
    trimEnd = videoElement.duration;
    updateTime();
    updateQualityBadge();
    renderTrimUI();
  };
  videoElement.ontimeupdate = updateTime;
  currentVideoFile = null;
  appliedFilters = {};
  textOverlays = [];
  stopFaceTracking();
}

function exportVideo() {
  if (!videoElement || !videoElement.src) { alert('Please load a video first.'); return; }
  if (videoElement.readyState < 1) { alert('Video is still loading, please wait.'); return; }
  showLoading('Rendering video...');
  renderAndDownload();
}

function renderAndDownload() {
  const src = videoElement;
  const w = src.videoWidth || 1280;
  const h = src.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let mimeType = '';
  for (let i = 0; i < mimeTypes.length; i++) { if (MediaRecorder.isTypeSupported(mimeTypes[i])) { mimeType = mimeTypes[i]; break; } }
  if (!mimeType) { hideLoading(); alert('Your browser does not support video recording. Please use Chrome or Edge.'); return; }
  const stream = canvas.captureStream(30);
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 8000000 });
  mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = function() {
    hideLoading();
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('video-title').textContent || 'video').replace(/\.[^.]+$/, '') + '_edited.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  };
  const start = trimStart || 0;
  const end = (trimEnd && trimEnd > start) ? trimEnd : src.duration;
  src.currentTime = start;
  src.pause();
  const getFilter = function() {
    const p = [];
    if (appliedFilters.brightness !== undefined) p.push('brightness(' + appliedFilters.brightness + ')');
    if (appliedFilters.contrast !== undefined) p.push('contrast(' + appliedFilters.contrast + ')');
    if (appliedFilters.saturate !== undefined) p.push('saturate(' + appliedFilters.saturate + ')');
    if (appliedFilters.sepia !== undefined) p.push('sepia(' + appliedFilters.sepia + ')');
    if (appliedFilters.grayscale !== undefined) p.push('grayscale(' + appliedFilters.grayscale + ')');
    if (appliedFilters.blur !== undefined) p.push('blur(' + appliedFilters.blur + 'px)');
    if (appliedFilters.hueRotate !== undefined) p.push('hue-rotate(' + appliedFilters.hueRotate + 'deg)');
    if (appliedFilters.invert !== undefined) p.push('invert(' + appliedFilters.invert + ')');
    return p.join(' ') || 'none';
  };
  mediaRecorder.start(100);
  let frameCount = 0;
  const drawFrame = function() {
    if (src.currentTime >= end || src.ended) { mediaRecorder.stop(); return; }
    ctx.save();
    if (appliedFilters.flip === 'h') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    else if (appliedFilters.flip === 'v') { ctx.translate(0, h); ctx.scale(1, -1); }
    else if (appliedFilters.rotate) { ctx.translate(w/2, h/2); ctx.rotate(appliedFilters.rotate * Math.PI / 180); ctx.translate(-w/2, -h/2); }
    ctx.filter = getFilter();
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    ctx.filter = 'none';
    for (let i = 0; i < textOverlays.length; i++) {
      const t = textOverlays[i];
      ctx.save();
      ctx.font = 'bold ' + t.size + 'px Inter,sans-serif';
      ctx.fillStyle = t.color || '#fff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 8;
      ctx.fillText(t.text, (t.x/100)*w, (t.y/100)*h);
      ctx.restore();
    }
    ctx.save();
    ctx.font = '700 ' + Math.max(13, Math.round(w * 0.016)) + 'px Inter,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Powered by VidStudio', w - 12, h - 10);
    ctx.restore();
    frameCount++;
    src.currentTime = start + frameCount / 30;
  };
  src.onseeked = drawFrame;
  drawFrame();
}

function installPlugin(pluginId) {
  if (installedPlugins[pluginId]) return;
  const card = document.getElementById('card-' + pluginId);
  const btn = document.getElementById('install-' + pluginId);
  const bar = document.getElementById('bar-' + pluginId);
  const pct = document.getElementById('pct-' + pluginId);
  if (!card || !btn || !bar || !pct) return;

  btn.disabled = true;
  btn.textContent = 'Installing...';
  card.classList.add('installing');

  let progress = 0;
  const speed = 18 + Math.random() * 24;
  const interval = setInterval(function() {
    progress += (Math.random() * speed);
    if (progress >= 100) progress = 100;
    bar.style.width = progress + '%';
    pct.textContent = Math.floor(progress) + '%';
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(function() {
        card.classList.remove('installing');
        installedPlugins[pluginId] = true;
        btn.disabled = false;
        btn.textContent = 'Installed';
        btn.classList.add('installed');
        activatePlugin(pluginId);
      }, 300);
    }
  }, 80);
}

function activatePlugin(pluginId) {
  if (pluginId === 'facetrack') {
    const btn = document.getElementById('facetrack-tool-btn');
    if (btn) btn.style.display = 'block';
  }
  if (pluginId === 'viral') {
    const btn = document.getElementById('viralhook-tool-btn');
    if (btn) btn.style.display = 'block';
  }
  if (pluginId === 'audio') {
    const btn = document.getElementById('audiomanip-tool-btn');
    if (btn) btn.style.display = 'block';
  }
}

function openFaceTrackModal() {
  if (!installedPlugins['facetrack']) return;
  document.getElementById('facetrack-modal').classList.remove('hidden');
}

function closeFaceTrackModal() {
  document.getElementById('facetrack-modal').classList.add('hidden');
}

function setTrackStyle(style) {
  trackStyle = style;
  ['smooth','tight','wide'].forEach(function(s) {
    const el = document.getElementById('track-style-' + s);
    if (el) el.className = 'tool-btn' + (s === style ? ' active-blue' : '');
  });
}

function startFaceTracking() {
  const nameEl = document.getElementById('facetrack-name');
  trackTarget = nameEl ? nameEl.value.trim() || 'target' : 'target';
  closeFaceTrackModal();
  if (!videoElement) return;

  const box = document.getElementById('facetrack-box');
  const label = document.getElementById('facetrack-label');
  const wrap = document.getElementById('video-wrap');
  if (!box || !wrap) return;

  box.style.display = 'block';
  faceBoxVisible = true;
  label.textContent = 'Tracking: ' + trackTarget;

  if (faceTrackInterval) clearInterval(faceTrackInterval);

  const ww = wrap.offsetWidth;
  const wh = wrap.offsetHeight;
  const baseSize = trackStyle === 'tight' ? 0.18 : trackStyle === 'wide' ? 0.38 : 0.26;
  const boxW = ww * baseSize;
  const boxH = wh * (baseSize * 1.3);
  const smoothing = trackStyle === 'smooth' ? 0.06 : trackStyle === 'tight' ? 0.14 : 0.04;

  let cx = ww * 0.5;
  let cy = wh * 0.4;
  let targetCx = cx;
  let targetCy = cy;
  let phase = Math.random() * Math.PI * 2;

  faceTrackInterval = setInterval(function() {
    if (!faceBoxVisible) return;
    phase += 0.025;
    const margin = 0.12;
    const minX = ww * margin + boxW / 2;
    const maxX = ww * (1 - margin) - boxW / 2;
    const minY = wh * margin + boxH / 2;
    const maxY = wh * (1 - margin) - boxH / 2;
    targetCx = minX + (maxX - minX) * (0.5 + 0.35 * Math.sin(phase * 0.7));
    targetCy = minY + (maxY - minY) * (0.5 + 0.3 * Math.cos(phase * 0.5));
    cx += (targetCx - cx) * smoothing;
    cy += (targetCy - cy) * smoothing;
    box.style.left = (cx - boxW / 2) + 'px';
    box.style.top = (cy - boxH / 2) + 'px';
    box.style.width = boxW + 'px';
    box.style.height = boxH + 'px';
  }, 30);
}

function stopFaceTracking() {
  if (faceTrackInterval) { clearInterval(faceTrackInterval); faceTrackInterval = null; }
  faceBoxVisible = false;
  const box = document.getElementById('facetrack-box');
  if (box) box.style.display = 'none';
}

function openMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('hidden');
}

function closeMobileMenu(e) {
  if (e.target === document.getElementById('mobile-menu')) {
    document.getElementById('mobile-menu').classList.add('hidden');
  }
}

function closeMobileMenuDirect() {
  document.getElementById('mobile-menu').classList.add('hidden');
}

function openMobileSheet(type) {
  const sheet = document.getElementById('mobile-sheet');
  const content = document.getElementById('sheet-content');
  const tabRow = document.getElementById('sheet-tab-row');
  sheet.classList.remove('hidden');

  if (type === 'ai') {
    tabRow.innerHTML = '<button class="tab-btn active" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn" onclick="openMobileSheet(\'settings\')">Settings</button>';
    content.innerHTML = buildAISheetHTML();
  } else if (type === 'settings') {
    tabRow.innerHTML = '<button class="tab-btn" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn active" onclick="openMobileSheet(\'settings\')">Settings</button>';
    content.innerHTML = buildSettingsSheetHTML();
  } else if (type === 'history') {
    tabRow.innerHTML = '<button class="tab-btn active">History</button>';
    content.innerHTML = '<div class="history-item" onclick="loadDemoVideo();closeMobileSheetDirect();"><div class="history-thumb"><svg width="20" height="20" fill="none" stroke="var(--t4)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p class="history-name">Demo_Source.mp4</p></div><div style="margin-top:12px;"><button class="btn-ghost" style="width:100%;" onclick="document.getElementById(\'fileInput\').click();closeMobileSheetDirect();">Upload New Video</button></div>';
  }
}

function buildAISheetHTML() {
  return '<div class="tool-grid" style="margin-bottom:14px;">' +
    '<button class="tool-btn" onclick="runAITool(\'shake\')">Shake</button>' +
    '<button class="tool-btn" onclick="runAITool(\'cinematic\')">Cinematic</button>' +
    '<button class="tool-btn" onclick="runAITool(\'grayscale\')">B&W</button>' +
    '<button class="tool-btn" onclick="runAITool(\'warm\')">Warm</button>' +
    '<button class="tool-btn" onclick="runAITool(\'flip\')">Flip H</button>' +
    '<button class="tool-btn" onclick="runAITool(\'slow\')">Slow Mo</button>' +
    (installedPlugins['facetrack'] ? '<button class="tool-btn full active-blue" onclick="openFaceTrackModal();closeMobileSheetDirect();">SpectraTrack Face</button>' : '') +
    (installedPlugins['viral'] ? '<button class="tool-btn full" onclick="runViralHook();closeMobileSheetDirect();">Viral Hook</button>' : '') +
    (installedPlugins['audio'] ? '<button class="tool-btn full" onclick="runAudioManip();closeMobileSheetDirect();">Audio Manipulator</button>' : '') +
    '<button class="tool-btn full red" onclick="runAITool(\'reset\')">Reset All</button>' +
    '</div>' +
    '<div class="ai-box"><div class="box-label">Command VidAI</div>' +
    '<textarea class="ai-textarea" id="sheet-ai-prompt" rows="4" placeholder="cinematic warm look, slow motion..."></textarea>' +
    '<button class="generate-btn" onclick="runCustomAISheet()">GENERATE WITH VIDAI</button></div>' +
    '<div class="hints-wrap" style="margin-top:12px;"><div class="box-label">Quick Commands</div><div class="hints-grid">' +
    '<span class="hint" onclick="fillSheet(\'cinematic\')">cinematic</span>' +
    '<span class="hint" onclick="fillSheet(\'warm tones\')">warm</span>' +
    '<span class="hint" onclick="fillSheet(\'neon cyberpunk\')">neon</span>' +
    '<span class="hint" onclick="fillSheet(\'black and white\')">b&w</span>' +
    '<span class="hint" onclick="fillSheet(\'slow motion\')">slow mo</span>' +
    '<span class="hint" onclick="fillSheet(\'720p\')">720p</span>' +
    '<span class="hint" onclick="fillSheet(\'reset\')">reset</span>' +
    '</div></div>';
}

function buildSettingsSheetHTML() {
  const f = appliedFilters;
  const s = function(id, min, max, step, val, label) {
    return '<div class="slider-row"><div class="slider-meta"><span>' + label + '</span><span id="ms-' + id + '">' + val + '</span></div>' +
      '<input type="range" class="slider-track" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" oninput="onSliderChange(\'' + id + '\',this.value);var d=document.getElementById(\'ms-' + id + '\');if(d)d.textContent=this.value;"></div>';
  };
  return '<div class="sliders-wrap">' +
    '<div class="section-label">Adjustments</div>' +
    s('brightness','0.2','2','0.05', f.brightness !== undefined ? f.brightness : 1, 'Brightness') +
    s('contrast','0.2','3','0.05', f.contrast !== undefined ? f.contrast : 1, 'Contrast') +
    s('saturate','0','3','0.05', f.saturate !== undefined ? f.saturate : 1, 'Saturation') +
    s('sepia','0','1','0.05', f.sepia !== undefined ? f.sepia : 0, 'Sepia') +
    s('blur','0','10','0.5', f.blur !== undefined ? f.blur : 0, 'Blur') +
    s('speed','0.25','4','0.25', f.speed !== undefined ? f.speed : 1, 'Speed') +
    '<div class="divider"></div><div class="section-label">Transform</div>' +
    '<div class="tool-grid">' +
    '<button class="tool-btn" onclick="runAITool(\'flip\')">Flip H</button>' +
    '<button class="tool-btn" onclick="appliedFilters.flip=\'v\';applyFiltersToVideo()">Flip V</button>' +
    '<button class="tool-btn" onclick="appliedFilters.rotate=90;applyFiltersToVideo()">Rotate 90°</button>' +
    '<button class="tool-btn" onclick="appliedFilters.rotate=180;applyFiltersToVideo()">Rotate 180°</button>' +
    '</div>' +
    '<button class="tool-btn full red" onclick="runAITool(\'reset\')">Reset All Effects</button>' +
    '</div>';
}

function runCustomAISheet() {
  const el = document.getElementById('sheet-ai-prompt');
  const prompt = el ? el.value.trim() : '';
  if (!prompt || !videoElement) return;
  showLoading('Applying changes...');
  setTimeout(function() { hideLoading(); parsePromptAndApply(prompt); if (el) el.value = ''; }, 700);
}

function fillSheet(text) {
  const el = document.getElementById('sheet-ai-prompt');
  if (el) { el.value = text; el.focus(); }
}

function closeMobileSheet(e) {
  if (e.target === document.getElementById('mobile-sheet')) {
    document.getElementById('mobile-sheet').classList.add('hidden');
  }
}

function closeMobileSheetDirect() {
  document.getElementById('mobile-sheet').classList.add('hidden');
}
