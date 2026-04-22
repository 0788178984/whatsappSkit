/**
 * WhatsApp Skit Maker - Main Application
 * Orchestrates the parser, renderer, and exporter
 */

// Application state
const AppState = {
  renderer: null,
  parser: null,
  exporter: null,
  currentSkit: null,
  isPlaying: false,
  isRecording: false,
  recordStartTime: null,
  recordTimer: null,
  mediaRecorder: null,
  recordedChunks: [],
  wallpaperUrl: null,
  isStartingRecording: false,
  maxDurationTimer: null,
  customSentSoundUrl: null,
  customReceivedSoundUrl: null,
  customSentAudio: null,
  customReceivedAudio: null,
  avatarImageUrl: null,
  sound: {
    enabled: true,
    sentType: 'pop',
    receivedType: 'coin',
    volume: 0.7
  },
  audioContext: null
};

// Example skit data
const EXAMPLE_SKIT = `DATE: Today · The Beginning
TITLE: First Meeting

ME: Hey... is this Angella? 😅
7:03 PM THEM: Yes? Who is this?
ME: It's Lucky. From church. We sat next to each other last Sunday 😊
THEM: Ohhh Lucky 😄 How did you get my number??
ME: Brian gave it to me. I hope that's okay 🙏
THEM: It's okay 😂 So what do you want?
ME: I just... wanted to say that your voice when you were singing yesterday was really beautiful
THEM: ...
THEM: You noticed that? 🫣
ME: I couldn't stop noticing 😌
THEM: Lucky stop 😭😭
--reaction: 🥹
ME: I'm serious. Can we talk more? Like... regularly?
THEM: We'll see 😏
ME: I'll take that as a yes 😄
--reaction: ❤️`;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Initialize components
  AppState.parser = new SkitParser();
  AppState.renderer = new WhatsAppRenderer({
    typingSpeed: document.getElementById('typingSpeed')?.value || 'normal'
  });
  
  // Initialize exporters
  const { videoExporter } = initExporters({
    fps: parseInt(document.getElementById('videoFps')?.value || 30),
    resolution: document.getElementById('videoResolution')?.value || '720'
  });
  AppState.exporter = videoExporter;
  
  // Load example by default
  document.getElementById('skitScript').value = EXAMPLE_SKIT;
  parseAndPreview();
  updateWallpaperSettings();
  
  // Set up event listeners
  setupEventListeners();
  setupSoundSettings();

  AppState.renderer.onMessageCallback = (msg) => {
    playMessageSound(msg);
    // Update status bar time to match the message time
    if (msg && msg.time) {
      const statusTime = document.getElementById('statusTime');
      if (statusTime) statusTime.textContent = msg.time;
    }
  };
  
  // Set date chip to current formatted date
  AppState.renderer.setDate(AppState.renderer.formatCurrentDate());

  // Update clock (correlates with chat times)
  updateClock();
  setInterval(updateClock, 1000);

  // Update date chip daily at midnight
  scheduleDateUpdate();
}

function setupEventListeners() {
  // Contact settings
  const contactInputs = ['contactName', 'contactInitial', 'avatarColor1', 'avatarColor2'];
  contactInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateContactSettings);
    }
  });
  
  document.getElementById('showOnline')?.addEventListener('change', updateContactSettings);
  document.getElementById('avatarPhoto')?.addEventListener('change', handleAvatarPhotoChange);
  
  // Chat settings
  document.getElementById('chatDate')?.addEventListener('input', (e) => {
    AppState.renderer.setDate(e.target.value);
  });
  
  document.getElementById('typingSpeed')?.addEventListener('change', (e) => {
    AppState.renderer.options.typingSpeed = e.target.value;
  });

  document.getElementById('wallpaperTheme')?.addEventListener('change', updateWallpaperSettings);
  document.getElementById('wallpaperOpacity')?.addEventListener('input', updateWallpaperSettings);
  document.getElementById('wallpaperMedia')?.addEventListener('change', handleWallpaperMediaChange);

  document.getElementById('enableSounds')?.addEventListener('change', updateSoundSettings);
  document.getElementById('sentSoundType')?.addEventListener('change', updateSoundSettings);
  document.getElementById('receivedSoundType')?.addEventListener('change', updateSoundSettings);
  document.getElementById('soundVolume')?.addEventListener('input', updateSoundSettings);
  document.getElementById('customSentSound')?.addEventListener('change', (e) => handleCustomSoundUpload(e, 'sent'));
  document.getElementById('customReceivedSound')?.addEventListener('change', (e) => handleCustomSoundUpload(e, 'received'));
  
  // Script changes
  document.getElementById('skitScript')?.addEventListener('input', debounce(parseAndPreview, 500));
}

function setupSoundSettings() {
  const enableSounds = document.getElementById('enableSounds');
  const sentSoundType = document.getElementById('sentSoundType');
  const receivedSoundType = document.getElementById('receivedSoundType');
  const soundVolume = document.getElementById('soundVolume');

  if (enableSounds) enableSounds.checked = AppState.sound.enabled;
  if (sentSoundType) sentSoundType.value = AppState.sound.sentType;
  if (receivedSoundType) receivedSoundType.value = AppState.sound.receivedType;
  if (soundVolume) soundVolume.value = String(Math.round(AppState.sound.volume * 100));

  updateSoundSettings();
}

function updateSoundSettings() {
  const enableSounds = document.getElementById('enableSounds');
  const sentSoundType = document.getElementById('sentSoundType');
  const receivedSoundType = document.getElementById('receivedSoundType');
  const soundVolume = document.getElementById('soundVolume');
  const soundVolumeValue = document.getElementById('soundVolumeValue');

  if (!enableSounds || !sentSoundType || !receivedSoundType || !soundVolume || !soundVolumeValue) {
    return;
  }

  const volume = Math.max(0, Math.min(100, parseInt(soundVolume.value || '70', 10)));
  AppState.sound.enabled = enableSounds.checked;
  AppState.sound.sentType = sentSoundType.value;
  AppState.sound.receivedType = receivedSoundType.value;
  AppState.sound.volume = volume / 100;
  soundVolumeValue.textContent = `${volume}%`;
}

function handleCustomSoundUpload(event, target) {
  const file = event.target.files?.[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';

  if (target === 'sent') {
    if (AppState.customSentSoundUrl) {
      URL.revokeObjectURL(AppState.customSentSoundUrl);
    }
    AppState.customSentSoundUrl = objectUrl;
    AppState.customSentAudio = audio;
    const sentSoundType = document.getElementById('sentSoundType');
    if (sentSoundType) sentSoundType.value = 'custom';
  } else {
    if (AppState.customReceivedSoundUrl) {
      URL.revokeObjectURL(AppState.customReceivedSoundUrl);
    }
    AppState.customReceivedSoundUrl = objectUrl;
    AppState.customReceivedAudio = audio;
    const receivedSoundType = document.getElementById('receivedSoundType');
    if (receivedSoundType) receivedSoundType.value = 'custom';
  }

  updateSoundSettings();
}

function getAudioContext() {
  if (AppState.audioContext) return AppState.audioContext;

  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;

  AppState.audioContext = new Context();
  return AppState.audioContext;
}

function playTone(frequency, duration, gainValue = 0.05, type = 'sine', endFrequency = null, startDelay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + startDelay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (endFrequency) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playPresetSound(type, volume) {
  if (type === 'none') return;

  if (type === 'pop') {
    playTone(950, 0.07, 0.05 * volume, 'triangle', 620, 0);
    return;
  }

  if (type === 'coin') {
    playTone(1244, 0.08, 0.04 * volume, 'sine', 1480, 0);
    playTone(1760, 0.12, 0.035 * volume, 'sine', 2093, 0.06);
    return;
  }

  if (type === 'ring') {
    playTone(880, 0.12, 0.03 * volume, 'sine', 820, 0);
    playTone(1174, 0.12, 0.028 * volume, 'sine', 1100, 0.16);
  }
}

function playCustomSound(target, volume) {
  const audio = target === 'sent' ? AppState.customSentAudio : AppState.customReceivedAudio;
  if (!audio) return false;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {});
    return true;
  } catch (err) {
    console.warn('Custom sound failed to play:', err);
    return false;
  }
}

function playMessageSound(msg) {
  try {
    if (!AppState.sound.enabled || !msg || msg.type !== 'message') return;

    const isSent = msg.s === 'sent';
    const soundType = isSent ? AppState.sound.sentType : AppState.sound.receivedType;
    const target = isSent ? 'sent' : 'received';

    if (soundType === 'custom') {
      const played = playCustomSound(target, AppState.sound.volume);
      if (!played) playPresetSound(isSent ? 'pop' : 'coin', AppState.sound.volume);
      return;
    }

    playPresetSound(soundType, AppState.sound.volume);
  } catch (err) {
    console.warn('Message sound failed:', err);
  }
}

function updateContactSettings() {
  const name = document.getElementById('contactName').value || 'Contact';
  const initial = document.getElementById('contactInitial').value || name[0];
  const color1 = document.getElementById('avatarColor1').value;
  const color2 = document.getElementById('avatarColor2').value;
  const showOnline = document.getElementById('showOnline').checked;
  
  AppState.renderer.setContact(name, initial, [color1, color2], showOnline);
}

function handleAvatarPhotoChange(event) {
  const file = event.target.files?.[0];

  if (AppState.avatarImageUrl) {
    URL.revokeObjectURL(AppState.avatarImageUrl);
    AppState.avatarImageUrl = null;
  }

  if (!file) {
    AppState.renderer.setAvatarImage(null);
    return;
  }

  AppState.avatarImageUrl = URL.createObjectURL(file);
  AppState.renderer.setAvatarImage(AppState.avatarImageUrl);
}

function updateWallpaperSettings() {
  const wallpaper = document.getElementById('chatWallpaper');
  const opacityInput = document.getElementById('wallpaperOpacity');
  const opacityValue = document.getElementById('wallpaperOpacityValue');
  const themeSelect = document.getElementById('wallpaperTheme');
  const mediaGroup = document.getElementById('wallpaperMediaGroup');

  if (!wallpaper || !opacityInput || !opacityValue || !themeSelect) return;

  const opacity = Math.max(0, Math.min(100, parseInt(opacityInput.value || '60', 10)));
  wallpaper.style.setProperty('--wallpaper-opacity', String(opacity / 100));
  opacityValue.textContent = `${opacity}%`;

  const hasImage = wallpaper.classList.contains('has-image');
  const hasVideo = wallpaper.classList.contains('has-video');
  wallpaper.className = `chat-wallpaper theme-${themeSelect.value}`;
  if (hasImage) wallpaper.classList.add('has-image');
  if (hasVideo) wallpaper.classList.add('has-video');
  if (mediaGroup) {
    mediaGroup.style.display = themeSelect.value === 'custom' ? 'block' : 'none';
  }

  if (themeSelect.value !== 'custom') {
    wallpaper.classList.remove('has-image', 'has-video');
  }
}

function handleWallpaperMediaChange(event) {
  const file = event.target.files?.[0];
  const wallpaper = document.getElementById('chatWallpaper');
  const image = document.getElementById('wallpaperImage');
  const video = document.getElementById('wallpaperVideo');
  const themeSelect = document.getElementById('wallpaperTheme');

  if (!wallpaper || !image || !video || !themeSelect) return;

  if (AppState.wallpaperUrl) {
    URL.revokeObjectURL(AppState.wallpaperUrl);
    AppState.wallpaperUrl = null;
  }

  wallpaper.classList.remove('has-image', 'has-video');
  image.removeAttribute('src');
  video.pause();
  video.removeAttribute('src');
  video.load();

  if (!file) return;

  AppState.wallpaperUrl = URL.createObjectURL(file);
  themeSelect.value = 'custom';
  wallpaper.className = 'chat-wallpaper theme-custom';

  if (file.type.startsWith('video/')) {
    video.src = AppState.wallpaperUrl;
    video.currentTime = 0;
    video.play().catch(() => {});
    wallpaper.classList.add('has-video');
  } else {
    image.src = AppState.wallpaperUrl;
    wallpaper.classList.add('has-image');
  }

  updateWallpaperSettings();
}

function parseAndPreview() {
  const script = document.getElementById('skitScript').value;
  if (!script.trim()) return;
  
  try {
    AppState.currentSkit = AppState.parser.parse(script);
    
    // Update date display
    const currentDate = AppState.renderer.formatCurrentDate();
    const dateText = AppState.currentSkit.date && AppState.currentSkit.date !== 'Today'
      ? (AppState.currentSkit.title 
        ? `${AppState.currentSkit.date} · ${AppState.currentSkit.title}`
        : AppState.currentSkit.date)
      : currentDate;
    AppState.renderer.setDate(dateText);
    document.getElementById('chatDate').value = dateText;
    
    // Load messages (but don't play yet)
    AppState.renderer.loadMessages(AppState.currentSkit.messages);
    
  } catch (err) {
    console.error('Parse error:', err);
  }
}

function togglePlay() {
  const btn = document.getElementById('playPauseBtn');
  
  if (AppState.isPlaying) {
    // Pause
    AppState.renderer.pause();
    AppState.isPlaying = false;
    btn.textContent = '▶ Play';
    
    // Pause recording if active
    if (AppState.isRecording && AppState.mediaRecorder?.state === 'recording') {
      AppState.mediaRecorder.pause();
    }
  } else {
    // Play
    if (!AppState.currentSkit) {
      parseAndPreview();
    }
    
    AppState.isPlaying = true;
    btn.textContent = '⏸ Pause';
    
    // Check if we should auto-record
    const autoRecord = document.getElementById('autoPlayRecord')?.checked;
    if (autoRecord && !AppState.isRecording && !AppState.isStartingRecording) {
      startRecording();
    }
    
    // Resume recording if paused
    if (AppState.isRecording && AppState.mediaRecorder?.state === 'paused') {
      AppState.mediaRecorder.resume();
    }
    
    AppState.renderer.resume();
    
    // Handle completion
    AppState.renderer.onCompleteCallback = () => {
      AppState.isPlaying = false;
      btn.textContent = '▶ Replay';
      
      // Stop recording when done
      if (AppState.isRecording) {
        setTimeout(stopRecording, 1500);
      }
    };
  }
}

function resetChat() {
  AppState.renderer.stop();
  AppState.renderer.clearChat();
  AppState.isPlaying = false;
  document.getElementById('playPauseBtn').textContent = '▶ Play';
  
  // Reload messages
  if (AppState.currentSkit) {
    AppState.renderer.loadMessages(AppState.currentSkit.messages);
  }
}

async function startRecording() {
  if (AppState.isRecording || AppState.isStartingRecording) return;
  AppState.isStartingRecording = true;
  
  try {
    // Use canvas-based recording (records only the WhatsApp element, no permission dialog)
    await startCanvasRecording();
    
  } catch (err) {
    console.error('Recording failed:', err);
    alert('Recording failed. Please try screen capture mode or use external recording software.');
  } finally {
    AppState.isStartingRecording = false;
  }
}

async function startScreenRecording() {
  // Use Screen Capture API
  const phone = document.getElementById('phone');
  const rect = phone.getBoundingClientRect();
  
  // Prompt user to select the phone area
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      cursor: 'never',
      displaySurface: 'monitor',
      logicalSurface: false
    },
    audio: false
  });
  
  // Determine MIME type
  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ];
  
  let mimeType = '';
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      mimeType = type;
      break;
    }
  }
  
  AppState.mediaRecorder = new MediaRecorder(stream, {
    mimeType: mimeType || 'video/webm',
    videoBitsPerSecond: 5000000
  });
  
  AppState.recordedChunks = [];
  
  AppState.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      AppState.recordedChunks.push(e.data);
    }
  };
  
  AppState.mediaRecorder.onstop = () => {
    const blob = new Blob(AppState.recordedChunks, { type: mimeType || 'video/webm' });
    showVideoOutput(blob);
    
    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
  };
  
  AppState.mediaRecorder.start(100);
  AppState.isRecording = true;
  
  // Update UI
  document.getElementById('phone').classList.add('recording');
  document.getElementById('recordIndicator').style.display = 'flex';
  document.getElementById('exportBtn').disabled = true;
  document.getElementById('playPauseBtn').textContent = '⏸ Pause';
  
  // Start timer
  AppState.recordStartTime = Date.now();
  startRecordTimer();
  
  // Auto-stop after estimated duration + buffer
  if (AppState.currentSkit) {
    const duration = AppState.renderer.getEstimatedDuration();
    setTimeout(() => {
      if (AppState.isRecording) {
        stopRecording();
      }
    }, duration + 2000);
  }
}

async function startCanvasRecording() {
  // Use Canvas-based recording (records only WhatsApp phone element)
  if (typeof html2canvas === 'undefined') {
    alert('html2canvas library not loaded. Please check internet connection.');
    return;
  }
  
  await AppState.exporter.startRecording();
  AppState.isRecording = true;
  
  // Update UI
  document.getElementById('phone').classList.add('recording');
  document.getElementById('recordIndicator').style.display = 'flex';
  
  AppState.recordStartTime = Date.now();
  startRecordTimer();

  // Enforce max duration
  const maxSeconds = getMaxDurationSeconds();
  if (maxSeconds > 0) {
    AppState.maxDurationTimer = setTimeout(() => {
      if (AppState.isRecording) {
        console.log('Max duration reached, stopping recording.');
        stopRecording();
      }
    }, maxSeconds * 1000);
  }
}

function startRecordTimer() {
  const timerEl = document.querySelector('.record-time');
  
  AppState.recordTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - AppState.recordStartTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = `REC ${mins}:${secs}`;
  }, 1000);
}

async function stopRecording() {
  if (!AppState.isRecording) return;
  
  AppState.isRecording = false;
  clearInterval(AppState.recordTimer);
  if (AppState.maxDurationTimer) {
    clearTimeout(AppState.maxDurationTimer);
    AppState.maxDurationTimer = null;
  }
  
  // Update UI
  document.getElementById('phone').classList.remove('recording');
  document.getElementById('recordIndicator').style.display = 'none';
  document.getElementById('exportBtn').disabled = false;
  
  // Stop canvas-based recording and get the blob
  try {
    let blob = await AppState.exporter.stopRecording();
    const preferMp4 = document.getElementById('tiktokMp4')?.checked;

    if (blob && preferMp4 && !blob.type.includes('mp4')) {
      const exportBtn = document.getElementById('exportBtn');
      const originalText = exportBtn?.textContent;
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = '⏳ Converting to TikTok MP4...';
      }

      try {
        blob = await AppState.exporter.convertToMp4(blob);
      } catch (convertErr) {
        console.warn('TikTok MP4 conversion failed, keeping WebM:', convertErr);
        alert('TikTok MP4 conversion failed on this browser. Downloading WebM instead.');
      } finally {
        if (exportBtn) {
          exportBtn.disabled = false;
          exportBtn.textContent = originalText || '🎬 Preview & Export Video';
        }
      }
    }

    if (blob) {
      showVideoOutput(blob);
    }
  } catch (err) {
    console.error('Failed to finalize recording:', err);
    alert('Export failed while finalizing video file. Please try again.');
  }
}

function showVideoOutput(blob) {
  if (!blob || blob.size === 0) {
    alert('Export failed: generated video file is empty.');
    return;
  }

  const videoUrl = URL.createObjectURL(blob);
  const video = document.getElementById('exportedVideo');
  const downloadBtn = document.getElementById('downloadBtn');
  
  video.src = videoUrl;
  video.load();
  downloadBtn.href = videoUrl;
  
  // Determine file extension from MIME type
  const isMp4 = blob.type.includes('mp4');
  downloadBtn.download = `whatsapp-skit-${Date.now()}.${isMp4 ? 'mp4' : 'webm'}`;
  
  // Show output panel
  document.getElementById('videoOutput').style.display = 'block';
  
  // Update button state
  document.getElementById('playPauseBtn').textContent = '▶ Play';
  AppState.isPlaying = false;
}

function getMaxDurationSeconds() {
  const el = document.getElementById('maxDuration');
  if (!el) return 0;
  return parseInt(el.value, 10) || 0;
}

function applySpeedToFitDuration() {
  const maxSeconds = getMaxDurationSeconds();
  if (maxSeconds <= 0 || !AppState.currentSkit) return;

  const estimatedMs = AppState.renderer.getEstimatedDuration();
  const estimatedSec = estimatedMs / 1000;

  if (estimatedSec <= maxSeconds) return; // fits already

  // Need to speed up. Pick the fastest typing speed.
  const speedEl = document.getElementById('typingSpeed');
  if (speedEl) speedEl.value = 'fast';
  AppState.renderer.options.typingSpeed = 'fast';

  // Re-check with fast speed
  const fastMs = AppState.renderer.getEstimatedDuration();
  const fastSec = fastMs / 1000;

  if (fastSec <= maxSeconds) return; // fast speed fits

  // Still too long even at fast speed. Apply a custom speed multiplier.
  // Reduce base delay proportionally.
  const ratio = maxSeconds / fastSec;
  const normalSpeeds = AppState.renderer.typingSpeeds;
  AppState.renderer.typingSpeeds = {
    ...normalSpeeds,
    custom: {
      base: Math.max(300, Math.round(normalSpeeds.fast.base * ratio)),
      perChar: Math.max(5, Math.round(normalSpeeds.fast.perChar * ratio)),
      typing: Math.max(200, Math.round(normalSpeeds.fast.typing * ratio))
    }
  };
  AppState.renderer.options.typingSpeed = 'custom';
}

async function startExport() {
  // Reset and start playback with recording
  resetChat();

  // Speed up skit if it exceeds max duration
  applySpeedToFitDuration();
  
  // Small delay to let reset complete
  await new Promise(resolve => setTimeout(resolve, 300));
  await startRecording();
  togglePlay();
}

function newExport() {
  // Hide output and reset
  document.getElementById('videoOutput').style.display = 'none';
  document.getElementById('exportedVideo').src = '';
  
  resetChat();
}

function loadExample() {
  document.getElementById('skitScript').value = EXAMPLE_SKIT;
  parseAndPreview();
}

function clearScript() {
  document.getElementById('skitScript').value = '';
  AppState.currentSkit = null;
  AppState.renderer.clearChat();
}

function updateClock() {
  // If a skit is loaded and has messages with times, use the last message time
  // Otherwise use real clock time
  const statusTime = document.getElementById('statusTime');
  if (!statusTime) return;

  // Try to get time from the most recent visible message
  const chatArea = document.getElementById('chatArea');
  const metaEls = chatArea?.querySelectorAll('.msg-meta');
  if (metaEls && metaEls.length > 0) {
    const lastMeta = metaEls[metaEls.length - 1];
    const metaText = lastMeta.textContent.trim();
    // Extract time like "7:03 PM" from meta text (time is before ticks)
    const timeMatch = metaText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    if (timeMatch) {
      statusTime.textContent = timeMatch[1].toUpperCase();
      return;
    }
  }

  // Fallback to real clock
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  statusTime.textContent = `${hours}:${minutes} ${ampm}`;
}

function scheduleDateUpdate() {
  // Update date chip at midnight
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntilMidnight = tomorrow - now;

  setTimeout(() => {
    if (AppState.renderer) {
      AppState.renderer.setDate(AppState.renderer.formatCurrentDate());
    }
    // Reschedule for next midnight
    scheduleDateUpdate();
  }, msUntilMidnight + 1000);
}

window.addEventListener('beforeunload', () => {
  if (AppState.wallpaperUrl) {
    URL.revokeObjectURL(AppState.wallpaperUrl);
  }
  if (AppState.customSentSoundUrl) {
    URL.revokeObjectURL(AppState.customSentSoundUrl);
  }
  if (AppState.customReceivedSoundUrl) {
    URL.revokeObjectURL(AppState.customReceivedSoundUrl);
  }
  if (AppState.avatarImageUrl) {
    URL.revokeObjectURL(AppState.avatarImageUrl);
  }
});

// Utility: Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Space to play/pause (when not typing)
  if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    togglePlay();
  }
  
  // R to reset
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
    if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      resetChat();
    }
  }
  
  // E to export
  if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey) {
    if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      startExport();
    }
  }
});
