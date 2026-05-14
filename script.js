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
var activeCgiEffect = 'none';
var cgiAnimFrame = null;
var cgiCanvas = null;
var cgiCtx = null;
var cgiPhase = 0;

var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
var GEMINI_MODEL = 'gemini-2.5-pro';

function getGeminiKey() {
  return localStorage.getItem('vidai_gemini_key') || '';
}

function openSettingsModal() {
  var modal = document.getElementById('settings-modal');
  var input = document.getElementById('gemini-key-input');
  var status = document.getElementById('key-status');
  if (modal) modal.classList.remove('hidden');
  var saved = getGeminiKey();
  if (input) {
    input.value = saved ? saved : '';
    input.type = 'password';
  }
  if (status) {
    if (saved) {
      status.innerHTML = '<span style="color:var(--em);">✓ API key saved</span>';
    } else {
      status.innerHTML = '';
    }
  }
  updateGeminiNotice();
}

function closeSettingsModal() {
  var modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

function toggleKeyVisibility() {
  var input = document.getElementById('gemini-key-input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function saveSettings() {
  var input = document.getElementById('gemini-key-input');
  var status = document.getElementById('key-status');
  if (!input) return;
  var key = input.value.trim();
  if (!key) {
    if (status) status.innerHTML = '<span style="color:#ef4444;">Please enter an API key.</span>';
    return;
  }
  if (!key.startsWith('AIza')) {
    if (status) status.innerHTML = '<span style="color:#f59e0b;">Key looks unusual — make sure it starts with AIza...</span>';
  }
  localStorage.setItem('vidai_gemini_key', key);
  if (status) status.innerHTML = '<span style="color:var(--em);">✓ Saved successfully!</span>';
  updateGeminiNotice();
  setTimeout(closeSettingsModal, 900);
}

function updateGeminiNotice() {
  var notice = document.getElementById('gemini-key-notice');
  if (!notice) return;
  notice.style.display = getGeminiKey() ? 'none' : 'block';
}

async function captureVideoFrame() {
  if (!videoElement || !videoElement.videoWidth) return null;
  var c = document.createElement('canvas');
  var scale = Math.min(1, 640 / videoElement.videoWidth);
  c.width = Math.round(videoElement.videoWidth * scale);
  c.height = Math.round(videoElement.videoHeight * scale);
  var ctx = c.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7).split(',')[1];
}

async function callGemini(prompt, frameBase64) {
  var key = getGeminiKey();
  if (!key) {
    openSettingsModal();
    return null;
  }
  var url = GEMINI_BASE + GEMINI_MODEL + ':generateContent?key=' + key;
  var systemText = 'You are a professional CGI video editor AI. Analyze the video frame and the user request, then return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:\n{"filters":{"brightness":1,"contrast":1,"saturate":1,"sepia":0,"grayscale":0,"blur":0,"hueRotate":0,"invert":0},"speed":1,"flip":null,"rotate":0,"shake":false,"cgiEffect":"none","textOverlays":[],"description":"short description of changes"}\ncgiEffect options: "none","chromatic","grain","vhs","hdr","hologram","neon","bloom","matrix"\nOnly return the JSON. No other text whatsoever.';
  var parts = [{ text: systemText + '\n\nUser request: ' + prompt }];
  if (frameBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: frameBase64 } });
  }
  var body = {
    contents: [{ parts: parts }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
  };
  var resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var data = await resp.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API error');
  var text = '';
  var cands = data.candidates;
  if (cands && cands[0] && cands[0].content && cands[0].content.parts) {
    text = cands[0].content.parts.map(function(p) { return p.text || ''; }).join('');
  }
  text = text.replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

function initCGICanvas() {
  var wrap = document.getElementById('video-wrap');
  cgiCanvas = document.getElementById('cgi-canvas');
  if (!cgiCanvas || !wrap) return;
  cgiCtx = cgiCanvas.getContext('2d');
}

function startCGIEffect(effect) {
  activeCgiEffect = effect;
  if (!cgiCanvas) initCGICanvas();
  if (effect === 'none') {
    stopCGIEffect();
    return;
  }
  var badge = document.getElementById('cgi-badge');
  if (badge) {
    badge.textContent = effect.toUpperCase();
    badge.classList.remove('hidden');
  }
  if (cgiCanvas) cgiCanvas.style.display = 'block';
  if (cgiAnimFrame) cancelAnimationFrame(cgiAnimFrame);
  animateCGI();
}

function stopCGIEffect() {
  if (cgiAnimFrame) {
    cancelAnimationFrame(cgiAnimFrame);
    cgiAnimFrame = null;
  }
  activeCgiEffect = 'none';
  var badge = document.getElementById('cgi-badge');
  if (badge) badge.classList.add('hidden');
  if (cgiCanvas) {
    cgiCanvas.style.display = 'none';
    if (cgiCtx) cgiCtx.clearRect(0, 0, cgiCanvas.width, cgiCanvas.height);
  }
}

function animateCGI() {
  if (activeCgiEffect === 'none' || !cgiCanvas || !videoElement) return;
  var wrap = document.getElementById('video-wrap');
  if (wrap) {
    cgiCanvas.width = wrap.offsetWidth;
    cgiCanvas.height = wrap.offsetHeight;
  }
  if (!cgiCtx) cgiCtx = cgiCanvas.getContext('2d');
  cgiCtx.clearRect(0, 0, cgiCanvas.width, cgiCanvas.height);
  cgiPhase += 0.04;
  var w = cgiCanvas.width;
  var h = cgiCanvas.height;
  if (activeCgiEffect === 'grain') {
    renderGrainOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'vhs') {
    renderVHSOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'hologram') {
    renderHologramOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'chromatic') {
    renderChromaticOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'neon') {
    renderNeonOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'bloom') {
    renderBloomOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'matrix') {
    renderMatrixOverlay(cgiCtx, w, h);
  } else if (activeCgiEffect === 'hdr') {
    renderHDROverlay(cgiCtx, w, h);
  }
  cgiAnimFrame = requestAnimationFrame(animateCGI);
}

function renderGrainOverlay(ctx, w, h) {
  var imageData = ctx.createImageData(w, h);
  var data = imageData.data;
  for (var i = 0; i < data.length; i += 4) {
    var noise = (Math.random() - 0.5) * 60;
    data[i] = 128 + noise;
    data[i + 1] = 128 + noise;
    data[i + 2] = 128 + noise;
    data[i + 3] = 18 + Math.random() * 18;
  }
  ctx.putImageData(imageData, 0, 0);
}

function renderVHSOverlay(ctx, w, h) {
  ctx.save();
  for (var y = 0; y < h; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.04) + ')';
    ctx.fillRect(0, y, w, 1);
  }
  var glitchY = Math.floor(Math.random() * h);
  var glitchH = 2 + Math.floor(Math.random() * 4);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, glitchY, w, glitchH);
  if (Math.random() < 0.06) {
    var gx = Math.floor(Math.random() * w * 0.3);
    var gw = 20 + Math.floor(Math.random() * 60);
    var gy = Math.floor(Math.random() * h);
    ctx.fillStyle = 'rgba(0,255,255,0.06)';
    ctx.fillRect(gx, gy, gw, 2);
    ctx.fillStyle = 'rgba(255,0,0,0.06)';
    ctx.fillRect(gx + 2, gy + 1, gw, 2);
  }
  var grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0.12)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function renderHologramOverlay(ctx, w, h) {
  ctx.save();
  var flicker = 0.85 + Math.sin(cgiPhase * 8) * 0.06 + Math.random() * 0.06;
  for (var y = 0; y < h; y += 4) {
    var alpha = (0.06 + Math.sin(y * 0.1 + cgiPhase * 2) * 0.03) * flicker;
    ctx.fillStyle = 'rgba(0,255,180,' + alpha + ')';
    ctx.fillRect(0, y, w, 1);
  }
  ctx.shadowBlur = 14;
  ctx.shadowColor = 'rgba(0,255,180,0.5)';
  ctx.strokeStyle = 'rgba(0,255,180,' + (0.15 * flicker) + ')';
  ctx.lineWidth = 1;
  for (var i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, h * (0.2 + i * 0.3));
    ctx.lineTo(w, h * (0.2 + i * 0.3) + Math.sin(cgiPhase + i) * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function renderChromaticOverlay(ctx, w, h) {
  ctx.save();
  var offset = 3 + Math.sin(cgiPhase * 2) * 2;
  var grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255,0,0,0.08)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,255,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  if (Math.random() < 0.04) {
    var gy = Math.floor(Math.random() * h);
    ctx.fillStyle = 'rgba(255,0,100,0.1)';
    ctx.fillRect(-offset, gy, w, 2);
    ctx.fillStyle = 'rgba(0,100,255,0.1)';
    ctx.fillRect(offset, gy + 1, w, 2);
  }
  ctx.restore();
}

function renderNeonOverlay(ctx, w, h) {
  ctx.save();
  var cols = ['rgba(255,0,200,', 'rgba(0,255,255,', 'rgba(100,0,255,'];
  for (var i = 0; i < 2; i++) {
    var col = cols[Math.floor(cgiPhase * 0.5 + i) % cols.length];
    ctx.shadowBlur = 30;
    ctx.shadowColor = col + '0.9)';
    ctx.strokeStyle = col + (0.12 + Math.sin(cgiPhase * 3 + i) * 0.05) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * (0.3 + i * 0.4));
    for (var x = 0; x < w; x += 4) {
      ctx.lineTo(x, h * (0.3 + i * 0.4) + Math.sin(x * 0.02 + cgiPhase + i) * 12);
    }
    ctx.stroke();
  }
  var vgrad = ctx.createLinearGradient(0, 0, 0, h);
  vgrad.addColorStop(0, 'rgba(100,0,255,0.06)');
  vgrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  vgrad.addColorStop(1, 'rgba(255,0,200,0.06)');
  ctx.fillStyle = vgrad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function renderBloomOverlay(ctx, w, h) {
  ctx.save();
  var grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
  var intensity = 0.1 + Math.sin(cgiPhase) * 0.03;
  grad.addColorStop(0, 'rgba(255,255,220,' + intensity + ')');
  grad.addColorStop(0.4, 'rgba(255,255,200,' + (intensity * 0.3) + ')');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function renderHDROverlay(ctx, w, h) {
  ctx.save();
  var vign = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

var matrixChars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ';
var matrixDrops = [];
function renderMatrixOverlay(ctx, w, h) {
  ctx.save();
  var fontSize = 12;
  var cols = Math.floor(w / fontSize);
  if (matrixDrops.length !== cols) {
    matrixDrops = [];
    for (var c = 0; c < cols; c++) {
      matrixDrops.push(Math.random() * -50);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,255,65,0.7)';
  ctx.font = fontSize + 'px monospace';
  for (var i = 0; i < matrixDrops.length; i++) {
    var char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
    ctx.fillStyle = matrixDrops[i] * fontSize < 10 ? 'rgba(200,255,200,0.9)' : 'rgba(0,255,65,0.55)';
    ctx.fillText(char, i * fontSize, matrixDrops[i] * fontSize);
    if (matrixDrops[i] * fontSize > h && Math.random() > 0.975) {
      matrixDrops[i] = 0;
    }
    matrixDrops[i] += 0.5;
  }
  ctx.restore();
}

function applyCGIEffectToCanvas(ctx, w, h, effect, frameIdx) {
  if (effect === 'grain') {
    var grainData = ctx.getImageData(0, 0, w, h);
    var gd = grainData.data;
    for (var i = 0; i < gd.length; i += 4) {
      var n = (Math.random() - 0.5) * 45;
      gd[i] = Math.min(255, Math.max(0, gd[i] + n));
      gd[i + 1] = Math.min(255, Math.max(0, gd[i + 1] + n));
      gd[i + 2] = Math.min(255, Math.max(0, gd[i + 2] + n));
    }
    ctx.putImageData(grainData, 0, 0);
  } else if (effect === 'chromatic') {
    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;
    var orig = new Uint8ClampedArray(data);
    var off = 4;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var rIdx = (y * w + Math.min(w - 1, x + off)) * 4;
        var bIdx = (y * w + Math.max(0, x - off)) * 4;
        data[idx] = orig[rIdx];
        data[idx + 2] = orig[bIdx + 2];
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (effect === 'vhs') {
    if (Math.random() < 0.1) {
      var gy = Math.floor(Math.random() * h);
      var goff = Math.floor(Math.random() * 8) - 4;
      var lineData = ctx.getImageData(0, gy, w, 1);
      ctx.putImageData(lineData, goff, gy);
    }
    for (var sl = 0; sl < h; sl += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.03)';
      ctx.fillRect(0, sl, w, 1);
    }
    var vgrad = ctx.createLinearGradient(0, 0, 0, h);
    vgrad.addColorStop(0, 'rgba(0,0,0,0.08)');
    vgrad.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = vgrad;
    ctx.fillRect(0, 0, w, h);
  } else if (effect === 'hologram') {
    var tint = ctx.getImageData(0, 0, w, h);
    var td = tint.data;
    for (var ti = 0; ti < td.length; ti += 4) {
      td[ti] = Math.max(0, td[ti] - 30);
      td[ti + 1] = Math.min(255, td[ti + 1] + 20);
      td[ti + 2] = Math.min(255, td[ti + 2] + 15);
      var ty = Math.floor(ti / 4 / w);
      if (ty % 4 === 0) {
        td[ti + 3] = Math.max(0, td[ti + 3] - 20);
      }
    }
    ctx.putImageData(tint, 0, 0);
  } else if (effect === 'hdr') {
    var hdrData = ctx.getImageData(0, 0, w, h);
    var hd = hdrData.data;
    for (var hi = 0; hi < hd.length; hi += 4) {
      var r = hd[hi] / 255;
      var g = hd[hi + 1] / 255;
      var b = hd[hi + 2] / 255;
      r = r < 0.5 ? r * 1.15 : 1 - (1 - r) * 0.85;
      g = g < 0.5 ? g * 1.15 : 1 - (1 - g) * 0.85;
      b = b < 0.5 ? b * 1.1 : 1 - (1 - b) * 0.88;
      hd[hi] = Math.min(255, r * 255);
      hd[hi + 1] = Math.min(255, g * 255);
      hd[hi + 2] = Math.min(255, b * 255);
    }
    ctx.putImageData(hdrData, 0, 0);
  } else if (effect === 'neon') {
    var neonD = ctx.getImageData(0, 0, w, h);
    var nd = neonD.data;
    for (var ni = 0; ni < nd.length; ni += 4) {
      var lum = 0.299 * nd[ni] + 0.587 * nd[ni + 1] + 0.114 * nd[ni + 2];
      if (lum > 160) {
        nd[ni] = Math.min(255, nd[ni] * 1.3);
        nd[ni + 2] = Math.min(255, nd[ni + 2] * 1.5);
      }
      nd[ni] = Math.min(255, nd[ni] * 1.1);
      nd[ni + 1] = Math.max(0, nd[ni + 1] * 0.8);
      nd[ni + 2] = Math.min(255, nd[ni + 2] * 1.3);
    }
    ctx.putImageData(neonD, 0, 0);
  } else if (effect === 'bloom') {
    var bloomGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
    bloomGrad.addColorStop(0, 'rgba(255,255,220,0.12)');
    bloomGrad.addColorStop(0.6, 'rgba(255,255,200,0.04)');
    bloomGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloomGrad;
    ctx.fillRect(0, 0, w, h);
  }
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

(function initOnLoad() {
  function run() {
    updateGeminiNotice();
    initCGICanvas();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
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
  document.getElementById('gallery-page').style.display = 'none';
}

function showPluginPage() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('editor-screen').classList.remove('active');
  document.getElementById('plugin-page').style.display = 'block';
  document.getElementById('gallery-page').style.display = 'none';
}

function showGalleryPage() {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('editor-screen').classList.remove('active');
  document.getElementById('plugin-page').style.display = 'none';
  document.getElementById('gallery-page').style.display = 'block';
  loadGallery();
}

function loadVideoIntoEditor(file) {
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('plugin-page').style.display = 'none';
  document.getElementById('gallery-page').style.display = 'none';
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
    updateGeminiNotice();
    var pubTitle = document.getElementById('publish-title');
    if (pubTitle) pubTitle.value = file.name.replace(/\.[^.]+$/, '');
  };
  videoElement.onerror = function() {
    alert('Could not load this video. Try MP4, WebM, or MOV format.');
    showUpload();
  };
  videoElement.ontimeupdate = updateTime;
  appliedFilters = {};
  textOverlays = [];
  stopFaceTracking();
  stopCGIEffect();
  syncSlidersFromFilters();
  initCGICanvas();
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

function applyGeminiResult(result) {
  if (!result) return;
  if (result.filters) {
    var f = result.filters;
    if (f.brightness !== undefined) appliedFilters.brightness = f.brightness;
    if (f.contrast !== undefined) appliedFilters.contrast = f.contrast;
    if (f.saturate !== undefined) appliedFilters.saturate = f.saturate;
    if (f.sepia !== undefined) appliedFilters.sepia = f.sepia;
    if (f.grayscale !== undefined) appliedFilters.grayscale = f.grayscale;
    if (f.blur !== undefined) appliedFilters.blur = f.blur;
    if (f.hueRotate !== undefined) appliedFilters.hueRotate = f.hueRotate;
    if (f.invert !== undefined) appliedFilters.invert = f.invert;
  }
  if (result.speed !== undefined) { appliedFilters.speed = result.speed; }
  if (result.flip !== undefined) appliedFilters.flip = result.flip;
  if (result.rotate !== undefined) appliedFilters.rotate = result.rotate;
  if (result.shake !== undefined) appliedFilters.shake = result.shake;
  if (result.textOverlays && Array.isArray(result.textOverlays)) {
    textOverlays = textOverlays.concat(result.textOverlays);
  }
  if (result.cgiEffect && result.cgiEffect !== 'none') {
    startCGIEffect(result.cgiEffect);
  }
  applyFiltersToVideo();
  syncSlidersFromFilters();
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
    stopCGIEffect();
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
  if (p.includes('4k') || p.includes('2160p') || p.includes('8k')) { showPremiumModal(); return; }
  if (p.includes('bright') || p.includes('lighten')) appliedFilters.brightness = 1.4;
  if (p.includes('dark') || p.includes('darken')) appliedFilters.brightness = 0.6;
  if (p.includes('high contrast')) appliedFilters.contrast = 1.7;
  else if (p.includes('low contrast')) appliedFilters.contrast = 0.7;
  else if (p.includes('contrast')) appliedFilters.contrast = 1.5;
  if (p.includes('saturat') || p.includes('vivid') || p.includes('vibrant')) appliedFilters.saturate = 1.8;
  if (p.includes('desaturat') || p.includes('muted')) appliedFilters.saturate = 0.3;
  if (p.includes('sepia') || p.includes('vintage') || p.includes('retro') || p.includes('old film')) { appliedFilters.sepia = 0.8; appliedFilters.contrast = 1.1; }
  if (p.includes('grayscale') || p.includes('black and white') || p.includes('b&w') || p.includes('monochrome') || p.includes('film noir')) appliedFilters.grayscale = 1;
  if (p.includes('blur') || p.includes('soft focus')) appliedFilters.blur = 3;
  if (p.includes('sharp') || p.includes('crisp')) { appliedFilters.blur = 0; appliedFilters.contrast = 1.3; }
  if (p.includes('invert') || p.includes('negative')) appliedFilters.invert = 1;
  if (p.includes('warm') || p.includes('golden') || p.includes('sunset')) { appliedFilters.sepia = 0.25; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
  if (p.includes('cool') || p.includes('cold') || p.includes('blue tone')) { appliedFilters.hueRotate = 200; appliedFilters.saturate = 1.2; }
  if (p.includes('cinematic') || p.includes('film look')) { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
  if (p.includes('neon') || p.includes('cyberpunk')) { appliedFilters.saturate = 2.5; appliedFilters.contrast = 1.5; appliedFilters.brightness = 1.1; appliedFilters.hueRotate = 300; startCGIEffect('neon'); }
  if (p.includes('horror') || p.includes('scary')) { appliedFilters.grayscale = 0.7; appliedFilters.contrast = 1.8; appliedFilters.brightness = 0.7; }
  if (p.includes('dream') || p.includes('dreamy') || p.includes('ethereal')) { appliedFilters.blur = 1.5; appliedFilters.saturate = 1.4; appliedFilters.brightness = 1.2; }
  if (p.includes('shake') && !p.includes('no shake') && !p.includes('remove shake')) appliedFilters.shake = true;
  if (p.includes('no shake') || p.includes('remove shake') || p.includes('stabilize')) appliedFilters.shake = false;
  if (p.includes('flip horizontal') || p.includes('mirror')) appliedFilters.flip = 'h';
  if (p.includes('flip vertical') || p.includes('flip upside')) appliedFilters.flip = 'v';
  if (p.includes('slow') || p.includes('0.5x') || p.includes('half speed')) { appliedFilters.speed = 0.5; if (videoElement) videoElement.playbackRate = 0.5; }
  if (!p.includes('slow') && (p.includes('2x') || (p.includes('fast') && !p.includes('slow')) || p.includes('timelapse'))) { appliedFilters.speed = 2.0; if (videoElement) videoElement.playbackRate = 2.0; }
  if (p.includes('rotate 90') || p.includes('turn 90')) appliedFilters.rotate = 90;
  if (p.includes('rotate 180') || p.includes('turn 180')) appliedFilters.rotate = 180;
  if (p.includes('add text') || p.includes('overlay text') || p.includes('caption')) {
    var match = prompt.match(/["\u201C\u201D]([^"\u201C\u201D]+)["\u201C\u201D]/) || prompt.match(/'([^']+)'/);
    textOverlays.push({ text: match ? match[1] : 'My Video', x: 50, y: 85, size: 28, color: '#ffffff' });
  }
  if (p.includes('vhs') || p.includes('tape') || p.includes('80s')) { appliedFilters.sepia = 0.3; appliedFilters.contrast = 1.1; appliedFilters.saturate = 0.8; startCGIEffect('vhs'); }
  if (p.includes('hologram') || p.includes('sci-fi') || p.includes('holo')) { appliedFilters.hueRotate = 150; appliedFilters.saturate = 1.5; appliedFilters.brightness = 1.1; startCGIEffect('hologram'); }
  if (p.includes('chromatic') || p.includes('rgb') || p.includes('glitch') || p.includes('aberration')) { startCGIEffect('chromatic'); }
  if (p.includes('film grain') || p.includes('analog') || p.includes('grain')) { startCGIEffect('grain'); }
  if (p.includes('hdr') || p.includes('ultra vivid') || p.includes('high dynamic')) { appliedFilters.contrast = 1.3; appliedFilters.saturate = 1.6; startCGIEffect('hdr'); }
  if (p.includes('bloom') || p.includes('glow')) { appliedFilters.brightness = 1.1; startCGIEffect('bloom'); }
  if (p.includes('matrix')) { appliedFilters.grayscale = 0.5; startCGIEffect('matrix'); }
  applyFiltersToVideo();
  syncSlidersFromFilters();
  showChangesApplied();
}

async function runCustomAIWithGemini(prompt) {
  if (!videoElement) { alert('Please upload a video first.'); return; }
  showLoading('Gemini AI is analyzing your video...', 'Powered by Gemini 2.5 Pro');
  var frameBase64 = null;
  try {
    frameBase64 = await captureVideoFrame();
  } catch (e) {
    frameBase64 = null;
  }
  var key = getGeminiKey();
  if (!key) {
    hideLoading();
    parsePromptAndApply(prompt);
    showChangesApplied();
    openSettingsModal();
    return;
  }
  try {
    var result = await callGemini(prompt, frameBase64);
    hideLoading();
    if (result) {
      applyGeminiResult(result);
      var desc = result.description || 'Effects applied by Gemini AI.';
      var cgiNote = result.cgiEffect && result.cgiEffect !== 'none' ? '\n\nCGI Effect: ' + result.cgiEffect.toUpperCase() + ' overlay active.' : '';
      var responseText = document.getElementById('ai-response-text');
      var responseModal = document.getElementById('ai-response-modal');
      if (responseText) responseText.textContent = desc + cgiNote;
      if (responseModal) responseModal.classList.remove('hidden');
      showChangesApplied();
    } else {
      parsePromptAndApply(prompt);
      showChangesApplied();
    }
  } catch (err) {
    hideLoading();
    var errMsg = err.message || '';
    if (errMsg.includes('API key') || errMsg.includes('401') || errMsg.includes('403')) {
      alert('Gemini API key error: ' + errMsg + '\n\nPlease check your key in Settings.');
      openSettingsModal();
    } else {
      parsePromptAndApply(prompt);
      showChangesApplied();
    }
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
  runCustomAIWithGemini(prompt);
}

function runAITool(type) {
  if (!videoElement && type !== 'reset') { alert('Please upload a video first.'); return; }
  showLoading('Applying effect...', '');
  setTimeout(function() {
    hideLoading();
    if (type === 'shake') appliedFilters.shake = !appliedFilters.shake;
    if (type === 'cinematic') { appliedFilters.contrast = 1.2; appliedFilters.saturate = 0.85; appliedFilters.brightness = 0.95; appliedFilters.sepia = 0.1; }
    if (type === 'grayscale') appliedFilters.grayscale = appliedFilters.grayscale ? 0 : 1;
    if (type === 'warm') { appliedFilters.sepia = 0.25; appliedFilters.saturate = 1.3; appliedFilters.brightness = 1.1; }
    if (type === 'flip') appliedFilters.flip = appliedFilters.flip === 'h' ? null : 'h';
    if (type === 'slow') { appliedFilters.speed = 0.5; if (videoElement) videoElement.playbackRate = 0.5; }
    if (type === 'chromatic') { startCGIEffect(activeCgiEffect === 'chromatic' ? 'none' : 'chromatic'); }
    if (type === 'grain') { appliedFilters.contrast = 1.1; startCGIEffect(activeCgiEffect === 'grain' ? 'none' : 'grain'); }
    if (type === 'vhs') { appliedFilters.sepia = 0.3; appliedFilters.saturate = 0.8; appliedFilters.contrast = 1.1; startCGIEffect(activeCgiEffect === 'vhs' ? 'none' : 'vhs'); }
    if (type === 'hdr') { appliedFilters.contrast = 1.3; appliedFilters.saturate = 1.6; startCGIEffect(activeCgiEffect === 'hdr' ? 'none' : 'hdr'); }
    if (type === 'hologram') { appliedFilters.hueRotate = 150; appliedFilters.saturate = 1.4; startCGIEffect(activeCgiEffect === 'hologram' ? 'none' : 'hologram'); }
    if (type === 'neon') { appliedFilters.saturate = 2.5; appliedFilters.contrast = 1.4; appliedFilters.hueRotate = 280; startCGIEffect(activeCgiEffect === 'neon' ? 'none' : 'neon'); }
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
      stopCGIEffect();
      syncSlidersFromFilters();
      showChangesApplied();
      return;
    }
    applyFiltersToVideo();
    syncSlidersFromFilters();
    showChangesApplied();
  }, 350);
}

function runViralHook() {
  if (!videoElement || !videoElement.duration) { alert('Please upload a video first.'); return; }
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
  if (!videoElement) { alert('Please upload a video first.'); return; }
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
  showLoading('Rendering video...', 'Encoding with all effects applied');
  setTimeout(function() { renderAndDownload(false, null); }, 150);
}

function renderAndDownload(forPublish, onComplete) {
  var src = videoElement;
  var w = src.videoWidth || 1280;
  var h = src.videoHeight || 720;
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
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
    if (forPublish && onComplete) {
      onComplete(blob);
    } else {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var baseName = (document.getElementById('video-title').textContent || 'video').replace(/\.[^.]+$/, '');
      a.download = baseName + '_edited.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 8000);
    }
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
    if (activeCgiEffect !== 'none') {
      applyCGIEffectToCanvas(ctx, w, h, activeCgiEffect, frameIdx);
    }
    for (var ti = 0; ti < textOverlays.length; ti++) {
      var t = textOverlays[ti];
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

function openPublishModal() {
  if (!videoElement || !videoElement.src) { alert('Please load a video first.'); return; }
  var modal = document.getElementById('publish-modal');
  if (modal) modal.classList.remove('hidden');
}

function closePublishModal() {
  var modal = document.getElementById('publish-modal');
  if (modal) modal.classList.add('hidden');
}

function confirmPublish() {
  var titleEl = document.getElementById('publish-title');
  var descEl = document.getElementById('publish-desc');
  var title = titleEl ? titleEl.value.trim() : '';
  var desc = descEl ? descEl.value.trim() : '';
  if (!title) {
    if (titleEl) { titleEl.focus(); titleEl.style.borderColor = '#ef4444'; }
    return;
  }
  closePublishModal();
  showLoading('Publishing to Gallery...', 'Rendering with all effects applied');
  setTimeout(function() {
    renderAndDownload(true, function(blob) {
      saveToGallery(title, desc, blob);
    });
  }, 150);
}

function getGalleryDB(callback) {
  var req = indexedDB.open('vidai_gallery', 1);
  req.onupgradeneeded = function(e) {
    var db = e.target.result;
    if (!db.objectStoreNames.contains('videos')) {
      var store = db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
      store.createIndex('ts', 'ts', { unique: false });
    }
  };
  req.onsuccess = function(e) { callback(null, e.target.result); };
  req.onerror = function(e) { callback(e.target.error, null); };
}

function saveToGallery(title, desc, blob) {
  getGalleryDB(function(err, db) {
    if (err) { alert('Could not save to gallery: ' + err.message); return; }
    var tx = db.transaction('videos', 'readwrite');
    var store = tx.objectStore('videos');
    var effects = [];
    if (activeCgiEffect !== 'none') effects.push(activeCgiEffect.toUpperCase());
    var filterKeys = Object.keys(appliedFilters).filter(function(k) { return appliedFilters[k] && appliedFilters[k] !== 1 && appliedFilters[k] !== 0 && appliedFilters[k] !== false; });
    effects = effects.concat(filterKeys.slice(0, 3));
    var record = {
      title: title,
      desc: desc,
      blob: blob,
      ts: Date.now(),
      effects: effects,
      duration: videoElement ? videoElement.duration : 0
    };
    var addReq = store.add(record);
    addReq.onsuccess = function() {
      var pubTitle = document.getElementById('publish-title');
      if (pubTitle) pubTitle.value = '';
      showGalleryPage();
    };
    addReq.onerror = function() { alert('Failed to save video to gallery.'); };
  });
}

function loadGallery() {
  getGalleryDB(function(err, db) {
    var grid = document.getElementById('gallery-grid');
    var empty = document.getElementById('gallery-empty');
    if (err || !grid) { if (empty) empty.style.display = 'block'; return; }
    var tx = db.transaction('videos', 'readonly');
    var store = tx.objectStore('videos');
    var all = [];
    var cursor = store.openCursor(null, 'prev');
    cursor.onsuccess = function(e) {
      var c = e.target.result;
      if (c) { all.push(c.value); c.continue(); }
      else {
        if (all.length === 0) {
          if (empty) empty.style.display = 'block';
          grid.innerHTML = '';
          return;
        }
        if (empty) empty.style.display = 'none';
        grid.innerHTML = '';
        all.forEach(function(item) {
          var card = buildGalleryCard(item);
          grid.appendChild(card);
        });
      }
    };
    cursor.onerror = function() { if (empty) empty.style.display = 'block'; };
  });
}

function buildGalleryCard(item) {
  var card = document.createElement('div');
  card.className = 'gallery-card';
  var url = URL.createObjectURL(item.blob);
  var effectTags = (item.effects || []).map(function(e) {
    return '<span class="gallery-tag">' + e + '</span>';
  }).join('');
  var dur = item.duration ? formatTime(item.duration) : '';
  var date = new Date(item.ts).toLocaleDateString();
  card.innerHTML = '<div class="gallery-thumb-wrap"><video class="gallery-video" src="' + url + '" preload="metadata" muted playsinline></video><div class="gallery-play-btn"><svg width="18" height="18" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3l14 9-14 9V3z"/></svg></div>' + (dur ? '<div class="gallery-dur">' + dur + '</div>' : '') + '</div><div class="gallery-info"><div class="gallery-title">' + escapeHtml(item.title) + '</div>' + (item.desc ? '<div class="gallery-desc">' + escapeHtml(item.desc) + '</div>' : '') + '<div class="gallery-meta">' + effectTags + '<span class="gallery-date">' + date + '</span></div><div class="gallery-actions"><a href="' + url + '" download="' + escapeHtml(item.title) + '.webm" class="gallery-dl-btn"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Download</a><button onclick="deleteGalleryItem(' + item.id + ',this)" class="gallery-del-btn"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Delete</button></div></div>';
  var video = card.querySelector('.gallery-video');
  var playBtn = card.querySelector('.gallery-play-btn');
  if (video && playBtn) {
    playBtn.onclick = function() {
      if (video.paused) { video.play(); playBtn.style.opacity = '0'; }
      else { video.pause(); playBtn.style.opacity = '1'; }
    };
    video.onclick = function() {
      if (!video.paused) { video.pause(); playBtn.style.opacity = '1'; }
    };
  }
  return card;
}

function deleteGalleryItem(id, btn) {
  getGalleryDB(function(err, db) {
    if (err) return;
    var tx = db.transaction('videos', 'readwrite');
    var store = tx.objectStore('videos');
    store.delete(id).onsuccess = function() { loadGallery(); };
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    if (tabRow) tabRow.innerHTML = '<button class="tab-btn active" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn" onclick="openMobileSheet(\'adjust\')">Adjust</button>';
    if (content) content.innerHTML = buildAISheetHTML();
  } else if (type === 'adjust') {
    if (tabRow) tabRow.innerHTML = '<button class="tab-btn" onclick="openMobileSheet(\'ai\')">AI Studio</button><button class="tab-btn active" onclick="openMobileSheet(\'adjust\')">Adjust</button>';
    if (content) content.innerHTML = buildAdjustSheetHTML();
  }
}

function buildAISheetHTML() {
  var keyNotice = !getGeminiKey() ? '<div style="margin-bottom:12px;padding:10px 12px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.25);border-radius:var(--r2);text-align:center;"><p style="font-size:11px;color:var(--t3);margin-bottom:7px;">Add Gemini API key for AI editing</p><button class="generate-btn" style="margin-top:0;font-size:10px;padding:7px;" onclick="openSettingsModal();closeMobileSheetDirect();">Add Key</button></div>' : '';
  return keyNotice +
    '<div class="tool-grid" style="margin-bottom:14px;">' +
    '<button class="tool-btn" onclick="runAITool(\'shake\')">Shake</button>' +
    '<button class="tool-btn" onclick="runAITool(\'cinematic\')">Cinematic</button>' +
    '<button class="tool-btn" onclick="runAITool(\'grayscale\')">B&W</button>' +
    '<button class="tool-btn" onclick="runAITool(\'warm\')">Warm</button>' +
    '<button class="tool-btn" onclick="runAITool(\'flip\')">Flip H</button>' +
    '<button class="tool-btn" onclick="runAITool(\'slow\')">Slow Mo</button>' +
    '<button class="tool-btn" onclick="runAITool(\'chromatic\')">Chromatic</button>' +
    '<button class="tool-btn" onclick="runAITool(\'grain\')">Film Grain</button>' +
    '<button class="tool-btn" onclick="runAITool(\'vhs\')">VHS</button>' +
    '<button class="tool-btn" onclick="runAITool(\'hdr\')">HDR</button>' +
    '<button class="tool-btn" onclick="runAITool(\'hologram\')">Hologram</button>' +
    '<button class="tool-btn" onclick="runAITool(\'neon\')">Neon</button>' +
    (installedPlugins['facetrack'] ? '<button class="tool-btn full active-blue" onclick="openFaceTrackModal();closeMobileSheetDirect();">SpectraTrack Face</button>' : '') +
    (installedPlugins['viral'] ? '<button class="tool-btn full" onclick="runViralHook();closeMobileSheetDirect();">Viral Hook</button>' : '') +
    (installedPlugins['audio'] ? '<button class="tool-btn full" onclick="runAudioManip();closeMobileSheetDirect();">Audio Manipulator</button>' : '') +
    '<button class="tool-btn full red" onclick="runAITool(\'reset\')">Reset All</button>' +
    '</div>' +
    '<div class="ai-box"><div class="box-label">Command Gemini AI</div>' +
    '<textarea class="ai-textarea" id="sheet-ai-prompt" rows="4" placeholder="e.g. cinematic warm, VHS retro, neon glow, hologram sci-fi..."></textarea>' +
    '<button class="generate-btn" onclick="runCustomAISheet()">GENERATE WITH GEMINI</button></div>' +
    '<div class="hints-wrap" style="margin-top:12px;"><div class="box-label">Quick Commands</div><div class="hints-grid">' +
    '<span class="hint" onclick="fillSheet(\'cinematic warm film look\')">cinematic</span>' +
    '<span class="hint" onclick="fillSheet(\'warm golden tones\')">warm</span>' +
    '<span class="hint" onclick="fillSheet(\'neon cyberpunk\')">neon</span>' +
    '<span class="hint" onclick="fillSheet(\'VHS retro 80s\')">vhs</span>' +
    '<span class="hint" onclick="fillSheet(\'black and white\')">b&w</span>' +
    '<span class="hint" onclick="fillSheet(\'HDR ultra vivid\')">hdr</span>' +
    '<span class="hint" onclick="fillSheet(\'hologram sci-fi\')">hologram</span>' +
    '<span class="hint" onclick="fillSheet(\'reset\')">reset</span>' +
    '</div></div>';
}

function buildAdjustSheetHTML() {
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
  runCustomAIWithGemini(prompt);
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
