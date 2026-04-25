var currentVideoFile = null;
var videoElement = null;
var appliedFilters = {};
var recordedChunks = [];
var mediaRecorder = null;
var trimStart = 0;
var trimEnd = null;
var textOverlays = [];
var installedPlugins = {};
var faceTrackInterval = null;
var trackStyle = 'smooth';
var trackTarget = '';
var faceBoxVisible = false;
var puterUser = null;

(function waitForPuter() {
  if (typeof puter === 'undefined') {
    setTimeout(waitForPuter, 100);
    return;
  }
  puter.auth.getUser().then(function(user) {
    if (user && user.username) {
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
  if (typeof puter === 'undefined') return;
  puter.auth.signIn().then(function(user) {
    puterUser = user;
    updateAuthUI(user);
  }).catch(function(e) {});
}

function handleLogout() {
  if (typeof puter === 'undefined') return;
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
  function setup() {
    var zone = document.getElementById('upload-zone');
    var input = document.getElementById('fileInput');
    var browseBtn = document.getElementById('browse-btn');
    if (!zone || !input || !browseBtn) {
      setTimeout(setup, 100);
      return;
    }

    browseBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      input.click();
    });

    zone.addEventListener('click', function(e) {
      if (e.target === browseBtn || browseBtn.contains(e.target)) return;
      input.click();
    });

    input.addEventListener('change', function() {
      if (this.files && this.files[0]) {
        handleFile(this.files[0]);
      }
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
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
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

  videoElement.onerror = function() {
    alert('Could not load this video. Try MP4, WebM, or MOV format.');
    showUpload();
  };

  videoElement.ontimeupdate = updateTime;
  appliedFilters = {};
  textOverlays = [];
  stopFaceTracking();
  syncSlidersFromFilters();
}

function updateQualityBadge() {
  if (!videoElement) return;
  var h = videoElement.videoHeight;
  var badge = document.getElementById('quality-badge');
  if (!badge) return;
  if (!h) { badge.textContent = '-'; return; }
  if (h >= 2160) badge.textContent = '4K';
  else if (h >= 1080) badge.textContent = '1080P';
  else if (h >= 720) badge.textContent = '720P';
  else if (h >= 480) badge.textContent = '480P';
  else badge.textContent = h + 'P';
}

function updateTime() {
  if (!videoElement) return;
  var durEl = document.getElementById('video-duration');
  if (durEl) durEl.textContent = formatTime(videoElement.currentTime) + ' / ' + formatTime(videoElement.duration);
  if (videoElement.duration) {
    var ph = document.getElementById('playhead');
    if (ph) ph.style.left = (videoElement.currentTime / videoElement.duration * 100) + '%';
  }
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function switchTab(n) {
  var aiPanel = document.getElementById('ai-panel');
  var manualPanel = document.getElementById('manual-panel');
  var tab0 = document.getElementById('tab-0');
  var tab1 = document.getElementById('tab-1');
  if (aiPanel) aiPanel.style.display = n === 0 ? 'block' : 'none';
  if (manualPanel) manualPanel.style.display = n === 1 ? 'block' : 'none';
  if (tab0) tab0.className = 'tab-btn' + (n === 0 ? ' active' : '');
  if (tab1) tab1.className = 'tab-btn' + (n === 1 ? ' active' : '');
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
  var transform = '';
  if (appliedFilters.flip === 'h') transform = 'scaleX(-1)';
  else if (appliedFilters.flip === 'v') transform = 'scaleY(-1)';
  else if (appliedFilters.rotate) transform = 'rotate(' + appliedFilters.rotate + 'deg)';
  videoElement.style.transform = transform;
  if (appliedFilters.speed !== undefined) videoElement.playbackRate = appliedFilters.speed;
}

function parsePromptAndApply(prompt) {
  var p = prompt.toLowerCase().trim();

  if (p.includes('reset') || p.includes('remove all') || p.includes('undo all') || p === 'original') {
    appliedFilters = {};
    textOverlays = [];
    if (videoElement) {
      videoElement.playbackRate = 1;
      videoElement.style.filter = '';
      videoElement.style.transform = '';
      videoElement.style.animation = '';
    }
    stopFaceTracking();
    syncSlidersFromFilters();
    showChangesApplied();
    return;
  }

  var qualityMatch = p.match(/(\d{3,4})\s*p/);
  if (qualityMatch) {
    var q = parseInt(qualityMatch[1]);
    if (q > 1080) { showPremiumModal(); return; }
    var badge = document.getElementById('quality-badge');
    if (badge) badge.textContent = q + 'P';
    showChangesApplied();
    return;
  }
  if (p.includes('4k') || p.includes('2160p') || p.includes('8k') || p.includes('ultra hd')) {
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
  if (!p.includes('slow') && (p.includes('2x') || (p.includes('fast') && !p.includes('slow')) || p.includes('timelapse') || p.includes('double speed'))) { appliedFilters.speed = 2.0; if (videoElement) videoElement.playbackRate = 2.0; }
  if (p.includes('normal speed') || p.includes('1x speed')) { appliedFilters.speed = 1.0; if (videoElement) videoElement.playbackRate = 1.0; }
  if (p.includes('rotate 90') || p.includes('turn 90')) appliedFilters.rotate = 90;
  if (p.includes('rotate 180') || p.includes('turn 180')) appliedFilters.rotate = 180;
  if (p.includes('rotate 270') || p.includes('turn 270')) appliedFilters.rotate = 270;
  if (p.includes('add text') || p.includes('overlay text') || p.includes('caption')) {
    var match = prompt.match(/["\u201C\u201D]([^"\u201C\u201D]+)["\u201C\u201D]/) || prompt.match(/'([^']+)'/);
    textOverlays.push({ text: match ? match[1] : 'My Video', x: 50, y: 85, size: 28, color: '#ffffff' });
  }

  applyFiltersToVideo();
  syncSlidersFromFilters();
  showChangesApplied();
}

async function runCustomAIWithGPT(prompt) {
  if (!videoElement) {
    alert('Please upload a video first.');
    return;
  }

  if (typeof puter === 'undefined' || !puterUser) {
    var aiLoginRequired = document.getElementById('ai-login-required');
    if (aiLoginRequired) aiLoginRequired.style.display = 'block';
    parsePromptAndApply(prompt);
    return;
  }

  showLoading('AI is analyzing your request...', 'Powered by VidAI Engine v6.0');

  var videoInfo = 'Video: ' + (document.getElementById('video-title') ? document.getElementById('video-title').textContent : 'unknown') +
    ', Duration: ' + formatTime(videoElement.duration) +
    ', Resolution: ' + videoElement.videoWidth + 'x' + videoElement.videoHeight +
    ', Active filters: ' + JSON.stringify(appliedFilters);

  var systemPrompt = 'You are VidAI, a professional AI video editor. The user has a video and wants you to help edit it. ' +
    'You can control: brightness (0.2-2), contrast (0.2-3), saturation (0-3), sepia (0-1), grayscale (0-1), blur (0-10px), hue-rotate (0-360deg), invert (0-1), playback speed (0.25-4x), flip, rotate, shake effect, text overlays. ' +
    'Describe clearly what changes you are applying to achieve the requested effect. Be concise and professional. ' +
    'Video info: ' + videoInfo;

  try {
    var response = await puter.ai.chat(prompt, { model: 'claude-sonnet-4-5', system: systemPrompt });

    hideLoading();

    var aiText = '';
    if (typeof response === 'string') {
      aiText = response;
    } else if (response && response.message && response.message.content) {
      if (Array.isArray(response.message.content)) {
        aiText = response.message.content.map(function(b) { return b.text || ''; }).join('');
      } else {
        aiText = String(response.message.content);
      }
    } else if (response && response.content) {
      aiText = String(response.content);
    } else {
      aiText = String(response);
    }

    parsePromptAndApply(prompt);

    var responseText = document.getElementById('ai-response-text');
    var responseModal = document.getElementById('ai-response-modal');
    if (responseText) responseText.textContent = aiText;
    if (responseModal) responseModal.classList.remove('hidden');

  } catch (err) {
    hideLoading();
    parsePromptAndApply(prompt);
    showChangesApplied();
  }
}

function showChangesApplied() {
  var o = document.getElementById('ai-overlay');
  if (!o) return;
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
  if (!prompt) return;
  if (!videoElement) { alert('Please upload a video first.'); return; }
  if (el) el.value = '';
  runCustomAIWithGPT(prompt);
}

function runAITool(type) {
  if (!videoElement && type !== 'reset') {
    alert('Please upload a video first.');
    return;
  }
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
      if (videoElement) {
        videoElement.playbackRate = 1;
        videoElement.style.filter = '';
        videoElement.style.transform = '';
        videoElement.style.animation = '';
      }
      stopFaceTracking();
      syncSlidersFromFilters();
      showChangesApplied();
      return;
    }
    applyFiltersToVideo();
    syncSlidersFromFilters();
    showChangesApplied();
  }, 400);
}

function runViralHook() {
  if (!videoElement || !videoElement.duration) {
    alert('Please upload a video first.');
    return;
  }
  showLoading('Analyzing clip...', 'Scanning facial expressions and audio peaks');
  setTimeout(function() {
    hideLoading();
    var bestMoment = Math.random() * Math.min(videoElement.duration * 0.3, 5);
    videoElement.currentTime = bestMoment;
    trimStart = bestMoment;
    renderTrimUI();
    showChangesApplied();
  }, 1600);
}

function runAudioManip() {
  if (!videoElement) {
    alert('Please upload a video first.');
    return;
  }
  showLoading('Processing audio...', 'Adjusting audio levels');
  setTimeout(function() {
    hideLoading();
    videoElement.volume = videoElement.volume < 0.5 ? 1.0 : 0.5;
    showChangesApplied();
  }, 900);
}

function syncSlidersFromFilters() {
  function setSlider(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val;
    var d = document.getElementById(id.replace('-slider', '-val'));
    if (d) d.textContent = val;
  }
  setSlider('brightness-slider', appliedFilters.brightness !== undefined ? appliedFilters.brightness : 1);
  setSlider('contrast-slider', appliedFilters.contrast !== undefined ? appliedFilters.contrast : 1);
  setSlider('saturate-slider', appliedFilters.saturate !== undefined ? appliedFilters.saturate : 1);
  setSlider('sepia-slider', appliedFilters.sepia !== undefined ? appliedFilters.sepia : 0);
  setSlider('blur-slider', appliedFilters.blur !== undefined ? appliedFilters.blur : 0);
  setSlider('speed-slider', appliedFilters.speed !== undefined ? appliedFilters.speed : 1);
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
    var tl = document.getElementById('trim-label');
    if (tl) tl.textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
    if (videoElement) videoElement.currentTime = trimStart;
  };
  var sOut = document.createElement('input');
  sOut.type = 'range'; sOut.min = 0; sOut.max = dur; sOut.step = 0.1; sOut.value = trimEnd || dur;
  sOut.className = 'slider-track fu'; sOut.style.flex = '1';
  sOut.oninput = function(e) {
    trimEnd = parseFloat(e.target.value);
    var tl = document.getElementById('trim-label');
    if (tl) tl.textContent = 'Trim  IN: ' + formatTime(trimStart) + '  OUT: ' + formatTime(trimEnd || dur);
  };
  var s2 = document.createElement('span'); s2.className = 'trim-lbl'; s2.textContent = 'OUT';
  row.appendChild(s1); row.appendChild(sIn); row.appendChild(sOut); row.appendChild(s2);
  c.appendChild(row);
}

function showLoading(msg, sub) {
  var t = document.getElementById('loading-text');
  var s = document.getElementById('loading-sub');
  var m = document.getElementById('loading-modal');
  if (t && msg) t.textContent = msg;
  if (s) s.textContent = sub || 'Processing your request';
  if (m) m.classList.remove('hidden');
}

function hideLoading() {
  var m = document.getElementById('loading-modal');
  if (m) m.classList.add('hidden');
}

function showPremiumModal() {
  var m = document.getElementById('premium-modal');
  if (m) m.classList.remove('hidden');
}

function closePremiumModal() {
  var m = document.getElementById('premium-modal');
  if (m) m.classList.add('hidden');
}

function scrubTimeline(e) {
  if (!videoElement || !videoElement.duration) return;
  var rect = e.currentTarget.getBoundingClientRect();
  var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  videoElement.currentTime = pct * videoElement.duration;
}

function exportVideo() {
  if (!videoElement || !videoElement.src) { alert('Please load a video first.'); return; }
  if (videoElement.readyState < 1) { alert('Video is still loading, please wait.'); return; }
  showLoading('Rendering video...', 'Encoding with your edits applied');
  setTimeout(renderAndDownload, 150);
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
  for (var i = 0; i < mimeTypes.length; i++) {
    if (MediaRecorder.isTypeSupported(mimeTypes[i])) { mimeType = mimeTypes[i]; break; }
  }
  if (!mimeType) {
    hideLoading();
    alert('Your browser does not support video recording. Please use Chrome or Edge.');
    return;
  }

  var stream = canvas.captureStream(30);
  recordedChunks = [];

  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 8000000 });
  } catch(e) {
    hideLoading();
    alert('Recording failed: ' + e.message);
    return;
  }

  mediaRecorder.ondataavailable = function(e) {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = function() {
    hideLoading();
    var blob = new Blob(recordedChunks, { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var baseName = (document.getElementById('video-title').textContent || 'video').replace(/\.[^.]+$/, '');
    a.download = baseName + '_edited.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 8000);
    src.playbackRate = appliedFilters.speed || 1;
  };

  var filterStr = buildFilterString();
  var start = trimStart || 0;
  var end = (trimEnd && trimEnd > start) ? trimEnd : src.duration;

  src.pause();
  src.currentTime = start;
  mediaRecorder.start(100);

  var frameIdx = 0;
  var fps = 30;

  function drawFrame() {
    var targetTime = start + frameIdx / fps;
    if (targetTime >= end || src.ended) {
      mediaRecorder.stop();
      return;
    }
    ctx.save();
    ctx.filter = filterStr;
    if (appliedFilters.flip === 'h') {
      ctx.translate(w, 0); ctx.scale(-1, 1);
    } else if (appliedFilters.flip === 'v') {
      ctx.translate(0, h); ctx.scale(1, -1);
    } else if (appliedFilters.rotate) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(appliedFilters.rotate * Math.PI / 180);
      ctx.translate(-w / 2, -h / 2);
    }
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
      ctx.fillText(t.text, (t.x / 100) * w, (t.y / 100) * h);
      ctx.restore();
    }
    frameIdx++;
    src.currentTime = targetTime + (1 / fps);
  }

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
  var interval = setInterval(function() {
    progress += (Math.random() * 22);
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
  var m = document.getElementById('facetrack-modal');
  if (m) m.classList.remove('hidden');
}

function closeFaceTrackModal() {
  var m = document.getElementById('facetrack-modal');
  if (m) m.classList.add('hidden');
}

function setTrackStyle(style) {
  trackStyle = style;
  ['smooth', 'tight', 'wide'].forEach(function(s) {
    var el = document.getElementById('track-style-' + s);
    if (el) el.className = 'tool-btn' + (s === style ? ' active-blue' : '');
  });
}

function startFaceTracking() {
  var nameEl = document.getElementById('facetrack-name');
  trackTarget = nameEl ? (nameEl.value.trim() || 'target') : 'target';
  closeFaceTrackModal();
  if (!videoElement) return;

  var box = document.getElementById('facetrack-box');
  var label = document.getElementById('facetrack-label');
  var wrap = document.getElementById('video-wrap');
  if (!box || !wrap) return;

  box.style.display = 'block';
  faceBoxVisible = true;
  if (label) label.textContent = 'Tracking: ' + trackTarget;

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
  var m = document.getElementById('mobile-menu');
  if (m) m.classList.remove('hidden');
}

function closeMobileMenu(e) {
  if (e.target === document.getElementById('mobile-menu')) {
    document.getElementById('mobile-menu').classList.add('hidden');
  }
}

function closeMobileMenuDirect() {
  var m = document.getElementById('mobile-menu');
  if (m) m.classList.add('hidden');
}

function openMobileSheet(type) {
  var sheet = document.getElementById('mobile-sheet');
  var content = document.getElementById('sheet-content');
  var tabRow = document.getElementById('sheet-tab-row');
  if (!sheet) return;
  sheet.classList.remove('hidden');

  if (type === 'ai') {
    if (tabRow) tabRow.innerHTML = '<button class="tab-btn active" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn" onclick="openMobileSheet(\'settings\')">Settings</button>';
    if (content) content.innerHTML = buildAISheetHTML();
  } else if (type === 'settings') {
    if (tabRow) tabRow.innerHTML = '<button class="tab-btn" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn active" onclick="openMobileSheet(\'settings\')">Settings</button>';
    if (content) content.innerHTML = buildSettingsSheetHTML();
  } else if (type === 'history') {
    if (tabRow) tabRow.innerHTML = '<button class="tab-btn active">History</button>';
    var historyName = document.getElementById('history-name-uploaded');
    var historyUploaded = document.getElementById('history-uploaded');
    var hasVideo = historyUploaded && historyUploaded.style.display !== 'none' && historyName;
    if (content) content.innerHTML = '<div style="margin-bottom:12px;"><button class="btn-ghost" style="width:100%;" onclick="document.getElementById(\'fileInput\').click();closeMobileSheetDirect();">+ Upload Video</button></div>' +
      (hasVideo ? '<div class="history-item"><div class="history-thumb"><svg width="20" height="20" fill="none" stroke="var(--t4)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><p class="history-name">' + historyName.textContent + '</p></div>' : '');
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
    '<textarea class="ai-textarea" id="sheet-ai-prompt" rows="4" placeholder="e.g. cinematic warm look, slow motion, neon cyberpunk..."></textarea>' +
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
  function s(id, min, max, step, val, label) {
    return '<div class="slider-row"><div class="slider-meta"><span>' + label + '</span><span id="ms-' + id + '">' + val + '</span></div>' +
      '<input type="range" class="slider-track" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" oninput="onSliderChange(\'' + id + '\',this.value);var d=document.getElementById(\'ms-' + id + '\');if(d)d.textContent=this.value;"></div>';
  }
  return '<div class="sliders-wrap">' +
    '<div class="section-label">Adjustments</div>' +
    s('brightness', '0.2', '2', '0.05', f.brightness !== undefined ? f.brightness : 1, 'Brightness') +
    s('contrast', '0.2', '3', '0.05', f.contrast !== undefined ? f.contrast : 1, 'Contrast') +
    s('saturate', '0', '3', '0.05', f.saturate !== undefined ? f.saturate : 1, 'Saturation') +
    s('sepia', '0', '1', '0.05', f.sepia !== undefined ? f.sepia : 0, 'Sepia') +
    s('blur', '0', '10', '0.5', f.blur !== undefined ? f.blur : 0, 'Blur') +
    s('speed', '0.25', '4', '0.25', f.speed !== undefined ? f.speed : 1, 'Speed') +
    '<div class="divider"></div><div class="section-label">Transform</div>' +
    '<div class="tool-grid">' +
    '<button class="tool-btn" onclick="runAITool(\'flip\')">Flip H</button>' +
    '<button class="tool-btn" onclick="appliedFilters.flip=\'v\';applyFiltersToVideo()">Flip V</button>' +
    '<button class="tool-btn" onclick="appliedFilters.rotate=90;applyFiltersToVideo()">Rotate 90</button>' +
    '<button class="tool-btn" onclick="appliedFilters.rotate=180;applyFiltersToVideo()">Rotate 180</button>' +
    '</div>' +
    '<button class="tool-btn full red" onclick="runAITool(\'reset\')">Reset All Effects</button>' +
    '</div>';
}

function runCustomAISheet() {
  var el = document.getElementById('sheet-ai-prompt');
  var prompt = el ? el.value.trim() : '';
  if (!prompt) return;
  if (!videoElement) { alert('Please upload a video first.'); return; }
  if (el) el.value = '';
  closeMobileSheetDirect();
  runCustomAIWithGPT(prompt);
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
  var m = document.getElementById('mobile-sheet');
  if (m) m.classList.add('hidden');
}
