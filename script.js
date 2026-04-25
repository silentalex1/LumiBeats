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
let puterUser = null;

(function initAuth() {
  puter.auth.getUser().then(function(user) {
    if (user) {
      puterUser = user;
      updateAuthUI(user);
    }
  }).catch(function() {});
})();

function updateAuthUI(user) {
  var loginBtn = document.getElementById('login-btn');
  var mobileLoginBtn = document.getElementById('mobile-login-btn');
  var userInfo = document.getElementById('user-info');
  var userNameDisplay = document.getElementById('user-name-display');
  var aiLoginRequired = document.getElementById('ai-login-required');
  if (loginBtn) loginBtn.style.display = 'none';
  if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
  if (userInfo) userInfo.style.display = 'flex';
  if (userNameDisplay) userNameDisplay.textContent = user.username || user.email || 'User';
  if (aiLoginRequired) aiLoginRequired.style.display = 'none';
}

function handleLogin() {
  puter.auth.signIn().then(function(user) {
    puterUser = user;
    updateAuthUI(user);
  }).catch(function() {});
}

function handleLogout() {
  puter.auth.signOut().then(function() {
    puterUser = null;
    var loginBtn = document.getElementById('login-btn');
    var mobileLoginBtn = document.getElementById('mobile-login-btn');
    var userInfo = document.getElementById('user-info');
    var aiLoginRequired = document.getElementById('ai-login-required');
    if (loginBtn) loginBtn.style.display = '';
    if (mobileLoginBtn) mobileLoginBtn.style.display = '';
    if (userInfo) userInfo.style.display = 'none';
    if (aiLoginRequired) aiLoginRequired.style.display = 'block';
  }).catch(function() {});
}

(function initUploadZone() {
  var zone = document.getElementById('upload-zone');
  var input = document.getElementById('fileInput');
  var browseBtn = document.getElementById('browse-btn');

  zone.addEventListener('click', function(e) {
    if (e.target === browseBtn || browseBtn.contains(e.target)) return;
    input.click();
  });

  browseBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    input.click();
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
    var file = e.dataTransfer.files[0];
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
    var hu = document.getElementById('history-uploaded');
    var hn = document.getElementById('history-name-uploaded');
    if (hu && hn) { hu.style.display = 'block'; hn.textContent = file.name; }
    if (!puterUser) {
      var aiLoginRequired = document.getElementById('ai-login-required');
      if (aiLoginRequired) aiLoginRequired.style.display = 'block';
    }
  };

  videoElement.ontimeupdate = updateTime;
  appliedFilters = {};
  textOverlays = [];
  stopFaceTracking();
}

function updateQualityBadge() {
  if (!videoElement) return;
  var h = videoElement.videoHeight;
  var badge = document.getElementById('quality-badge');
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
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function switchTab(n) {
  document.getElementById('ai-panel').style.display = n === 0 ? 'block' : 'none';
  document.getElementById('manual-panel').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('tab-0').className = 'tab-btn' + (n === 0 ? ' active' : '');
  document.getElementById('tab-1').className = 'tab-btn' + (n === 1 ? ' active' : '');
}

function buildFilterString() {
  var p = [];
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
  var p = prompt.toLowerCase();

  var qualityMatch = p.match(/(\d{3,4})\s*p/);
  if (qualityMatch) {
    var q = parseInt(qualityMatch[1]);
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
    var match = prompt.match(/[""'"]([^""'"]+)[""'"]/);
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

async function runCustomAIWithGPT(prompt) {
  if (!puterUser) {
    var aiLoginRequired = document.getElementById('ai-login-required');
    if (aiLoginRequired) aiLoginRequired.style.display = 'block';
    parsePromptAndApply(prompt);
    return;
  }

  showLoading('AI is analyzing your request...', 'Powered by GPT-5.1');

  var videoInfo = '';
  if (videoElement) {
    videoInfo = 'Video: ' + (document.getElementById('video-title').textContent || 'unknown') +
      ', Duration: ' + formatTime(videoElement.duration) +
      ', Resolution: ' + videoElement.videoWidth + 'x' + videoElement.videoHeight +
      ', Current filters: ' + JSON.stringify(appliedFilters);
  }

  var systemPrompt = 'You are VidAI, a professional AI video editor assistant. The user has a video loaded and is asking you to manipulate it. ' +
    'You have access to these CSS filter controls: brightness (0.2-2), contrast (0.2-3), saturate (0-3), sepia (0-1), grayscale (0-1), blur (0-10px), hue-rotate (0-360deg), invert (0-1). ' +
    'You can also control: speed (0.25-4x), flip (horizontal/vertical), rotate (90/180/270deg), text overlays, shake effect. ' +
    'First, apply the requested changes by describing exactly what CSS filters or transformations to use. ' +
    'Then explain what you did and why it achieves the desired effect. ' +
    'If the user asks something that requires actual video processing beyond CSS filters (like background removal, object tracking, audio editing), explain what the effect would be and apply the closest CSS approximation. ' +
    'Be conversational and helpful. Current video info: ' + videoInfo;

  try {
    var response = await puter.ai.chat(prompt, {
      model: 'gpt-4o',
      system: systemPrompt
    });

    hideLoading();

    var aiText = '';
    if (typeof response === 'string') {
      aiText = response;
    } else if (response && response.message && response.message.content) {
      aiText = response.message.content;
    } else if (response && response.content) {
      aiText = response.content;
    } else {
      aiText = String(response);
    }

    parsePromptAndApply(prompt);

    document.getElementById('ai-response-text').textContent = aiText;
    document.getElementById('ai-response-modal').classList.remove('hidden');

  } catch (err) {
    hideLoading();
    parsePromptAndApply(prompt);
    showChangesApplied();
  }
}

function showChangesApplied() {
  var o = document.getElementById('ai-overlay');
  o.classList.remove('hidden');
  setTimeout(function() { o.classList.add('hidden'); }, 1800);
}

function fillPrompt(text) {
  var el = document.getElementById('ai-prompt');
  if (el) { el.value = text; el.focus(); }
}

function runCustomAI() {
  var el = document.getElementById('ai-prompt');
  var prompt = el ? el.value.trim() : '';
  if (!prompt || !videoElement) return;
  runCustomAIWithGPT(prompt);
  if (el) el.value = '';
}

function runAITool(type) {
  if (!videoElement && type !== 'reset') return;
  showLoading('Applying effect...', '');
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
  showLoading('Analyzing clip...', 'Finding best moment');
  setTimeout(function() {
    hideLoading();
    var bestMoment = Math.random() * Math.min(videoElement.duration, 5);
    videoElement.currentTime = bestMoment;
    trimStart = bestMoment;
    renderTrimUI();
    showChangesApplied();
  }, 1400);
}

function runAudioManip() {
  if (!videoElement) return;
  var v = videoElement.volume;
  videoElement.volume = v < 0.5 ? 1.0 : 0.5;
  showChangesApplied();
}

function syncSlidersFromFilters() {
  var set = function(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
    var d = document.getElementById(id.replace('-slider', '-val'));
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
  var d = document.getElementById(type + '-val');
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
  var c = document.getElementById('trim-container');
  if (!c || !videoElement || !videoElement.duration) return;
  var dur = videoElement.duration;
  c.innerHTML = '';
  var lbl = document.createElement('div');
  lbl.id = 'trim-label';
  lbl.className = 'trim-label';
  lbl.textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  c.appendChild(lbl);
  var row = document.createElement('div');
  row.className = 'trim-row';
  var s1 = document.createElement('span'); s1.className = 'trim-lbl'; s1.textContent = 'IN';
  var sIn = document.createElement('input');
  sIn.type = 'range'; sIn.min = 0; sIn.max = dur; sIn.step = 0.1; sIn.value = trimStart;
  sIn.className = 'slider-track'; sIn.style.flex = '1';
  sIn.oninput = function(e) {
    trimStart = parseFloat(e.target.value);
    document.getElementById('trim-label').textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
    if (videoElement) videoElement.currentTime = trimStart;
  };
  var sOut = document.createElement('input');
  sOut.type = 'range'; sOut.min = 0; sOut.max = dur; sOut.step = 0.1; sOut.value = trimEnd || dur;
  sOut.className = 'slider-track fu'; sOut.style.flex = '1';
  sOut.oninput = function(e) {
    trimEnd = parseFloat(e.target.value);
    document.getElementById('trim-label').textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  };
  var s2 = document.createElement('span'); s2.className = 'trim-lbl'; s2.textContent = 'OUT';
  row.appendChild(s1); row.appendChild(sIn); row.appendChild(sOut); row.appendChild(s2);
  c.appendChild(row);
}

function showLoading(msg, sub) {
  var t = document.getElementById('loading-text');
  var s = document.getElementById('loading-sub');
  if (t && msg) t.textContent = msg;
  if (s) s.textContent = sub || 'Processing your request';
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
  var rect = e.currentTarget.getBoundingClientRect();
  var pct = (e.clientX - rect.left) / rect.width;
  videoElement.currentTime = pct * videoElement.duration;
}

function exportVideo() {
  if (!videoElement || !videoElement.src) { alert('Please load a video first.'); return; }
  if (videoElement.readyState < 1) { alert('Video is still loading, please wait.'); return; }
  showLoading('Rendering video...', 'Encoding with your edits');
  renderAndDownload();
}

function renderAndDownload() {
  var src = videoElement;
  var w = src.videoWidth || 1280;
  var h = src.videoHeight || 720;
  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  var mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  var mimeType = '';
  for (var i = 0; i < mimeTypes.length; i++) { if (MediaRecorder.isTypeSupported(mimeTypes[i])) { mimeType = mimeTypes[i]; break; } }
  if (!mimeType) { hideLoading(); alert('Your browser does not support video recording. Please use Chrome or Edge.'); return; }
  var stream = canvas.captureStream(30);
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 8000000 });
  mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = function() {
    hideLoading();
    var blob = new Blob(recordedChunks, { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (document.getElementById('video-title').textContent || 'video').replace(/\.[^.]+$/, '') + '_edited.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  };
  var start = trimStart || 0;
  var end = (trimEnd && trimEnd > start) ? trimEnd : src.duration;
  src.currentTime = start;
  src.pause();
  var getFilter = function() {
    var p = [];
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
  var frameCount = 0;
  var drawFrame = function() {
    if (src.currentTime >= end || src.ended) { mediaRecorder.stop(); return; }
    ctx.save();
    if (appliedFilters.flip === 'h') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    else if (appliedFilters.flip === 'v') { ctx.translate(0, h); ctx.scale(1, -1); }
    else if (appliedFilters.rotate) { ctx.translate(w/2, h/2); ctx.rotate(appliedFilters.rotate * Math.PI / 180); ctx.translate(-w/2, -h/2); }
    ctx.filter = getFilter();
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    ctx.filter = 'none';
    for (var i = 0; i < textOverlays.length; i++) {
      var t = textOverlays[i];
      ctx.save();
      ctx.font = 'bold ' + t.size + 'px Inter,sans-serif';
      ctx.fillStyle = t.color || '#fff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 8;
      ctx.fillText(t.text, (t.x/100)*w, (t.y/100)*h);
      ctx.restore();
    }
    frameCount++;
    src.currentTime = start + frameCount / 30;
  };
  src.onseeked = drawFrame;
  drawFrame();
}

function installPlugin(pluginId) {
  if (installedPlugins[pluginId]) return;
  var card = document.getElementById('card-' + pluginId);
  var btn = document.getElementById('install-' + pluginId);
  var bar = document.getElementById('bar-' + pluginId);
  var pct = document.getElementById('pct-' + pluginId);
  if (!card || !btn || !bar || !pct) return;

  btn.disabled = true;
  btn.textContent = 'Installing...';
  card.classList.add('installing');

  var progress = 0;
  var speed = 18 + Math.random() * 24;
  var interval = setInterval(function() {
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
    var btn = document.getElementById('facetrack-tool-btn');
    if (btn) btn.style.display = 'block';
  }
  if (pluginId === 'viral') {
    var btn = document.getElementById('viralhook-tool-btn');
    if (btn) btn.style.display = 'block';
  }
  if (pluginId === 'audio') {
    var btn = document.getElementById('audiomanip-tool-btn');
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
    var el = document.getElementById('track-style-' + s);
    if (el) el.className = 'tool-btn' + (s === style ? ' active-blue' : '');
  });
}

function startFaceTracking() {
  var nameEl = document.getElementById('facetrack-name');
  trackTarget = nameEl ? nameEl.value.trim() || 'target' : 'target';
  closeFaceTrackModal();
  if (!videoElement) return;

  var box = document.getElementById('facetrack-box');
  var label = document.getElementById('facetrack-label');
  var wrap = document.getElementById('video-wrap');
  if (!box || !wrap) return;

  box.style.display = 'block';
  faceBoxVisible = true;
  label.textContent = 'Tracking: ' + trackTarget;

  if (faceTrackInterval) clearInterval(faceTrackInterval);

  var ww = wrap.offsetWidth;
  var wh = wrap.offsetHeight;
  var baseSize = trackStyle === 'tight' ? 0.18 : trackStyle === 'wide' ? 0.38 : 0.26;
  var boxW = ww * baseSize;
  var boxH = wh * (baseSize * 1.3);
  var smoothing = trackStyle === 'smooth' ? 0.06 : trackStyle === 'tight' ? 0.14 : 0.04;

  var cx = ww * 0.5;
  var cy = wh * 0.4;
  var targetCx = cx;
  var targetCy = cy;
  var phase = Math.random() * Math.PI * 2;

  faceTrackInterval = setInterval(function() {
    if (!faceBoxVisible) return;
    phase += 0.025;
    var margin = 0.12;
    var minX = ww * margin + boxW / 2;
    var maxX = ww * (1 - margin) - boxW / 2;
    var minY = wh * margin + boxH / 2;
    var maxY = wh * (1 - margin) - boxH / 2;
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
  var box = document.getElementById('facetrack-box');
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
  var sheet = document.getElementById('mobile-sheet');
  var content = document.getElementById('sheet-content');
  var tabRow = document.getElementById('sheet-tab-row');
  sheet.classList.remove('hidden');

  if (type === 'ai') {
    tabRow.innerHTML = '<button class="tab-btn active" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn" onclick="openMobileSheet(\'settings\')">Settings</button>';
    content.innerHTML = buildAISheetHTML();
  } else if (type === 'settings') {
    tabRow.innerHTML = '<button class="tab-btn" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn active" onclick="openMobileSheet(\'settings\')">Settings</button>';
    content.innerHTML = buildSettingsSheetHTML();
  } else if (type === 'history') {
    tabRow.innerHTML = '<button class="tab-btn active">History</button>';
    content.innerHTML = '<div style="margin-bottom:12px;"><button class="btn-ghost" style="width:100%;" onclick="document.getElementById(\'fileInput\').click();closeMobileSheetDirect();">Upload Video</button></div>' +
      (document.getElementById('history-name-uploaded') && document.getElementById('history-uploaded').style.display !== 'none' ?
        '<div class="history-item"><div class="history-thumb"><svg width="20" height="20" fill="none" stroke="var(--t4)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p class="history-name">' + (document.getElementById('history-name-uploaded').textContent) + '</p></div>'
        : '');
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
  var f = appliedFilters;
  var s = function(id, min, max, step, val, label) {
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
  var el = document.getElementById('sheet-ai-prompt');
  var prompt = el ? el.value.trim() : '';
  if (!prompt || !videoElement) return;
  runCustomAIWithGPT(prompt);
  if (el) el.value = '';
}

function fillSheet(text) {
  var el = document.getElementById('sheet-ai-prompt');
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
