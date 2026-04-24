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
  audioContext: null,
  connectivityTimer: null,
  connectivity: {
    signalBars: 4,
    networkType: '4G',
    kbps: 0
  }
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

const SETTINGS_STORAGE_KEY = 'whatsappSkitMaker.settings.v1';
const SETTINGS_CORE_STORAGE_KEY = 'whatsappSkitMaker.settings.core.v1';
const SETTINGS_ASSETS_STORAGE_KEY = 'whatsappSkitMaker.settings.assets.v1';
const ASSET_SETTING_KEYS = new Set([
  'avatarPhotoDataUrl',
  'customSentSoundDataUrl',
  'customReceivedSoundDataUrl',
  'wallpaperMediaDataUrl',
  'wallpaperMediaType'
]);
const PERSISTED_CONTROL_IDS = [
  'contactName',
  'contactInitial',
  'avatarColor1',
  'avatarColor2',
  'showOnline',
  'chatDate',
  'timeFormat',
  'typingSpeed',
  'wallpaperTheme',
  'wallpaperOpacity',
  'enableSounds',
  'sentSoundType',
  'receivedSoundType',
  'soundVolume',
  'skitScript',
  'videoResolution',
  'videoFps',
  'maxDuration',
  'autoPlayRecord',
  'tiktokMp4'
];

function loadStoredObject(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`Failed to load persisted object: ${key}`, err);
    return {};
  }
}

function saveStoredObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Failed to persist object: ${key}`, err);
    return false;
  }
}

function migrateLegacyPersistedSettings() {
  const legacy = loadStoredObject(SETTINGS_STORAGE_KEY);
  if (!Object.keys(legacy).length) return;

  const core = {};
  const assets = {};
  Object.entries(legacy).forEach(([key, value]) => {
    if (ASSET_SETTING_KEYS.has(key)) {
      assets[key] = value;
    } else {
      core[key] = value;
    }
  });

  saveStoredObject(SETTINGS_CORE_STORAGE_KEY, {
    ...loadStoredObject(SETTINGS_CORE_STORAGE_KEY),
    ...core
  });
  saveStoredObject(SETTINGS_ASSETS_STORAGE_KEY, {
    ...loadStoredObject(SETTINGS_ASSETS_STORAGE_KEY),
    ...assets
  });

  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to remove legacy settings key:', err);
  }
}

function loadPersistedSettings() {
  migrateLegacyPersistedSettings();
  const core = loadStoredObject(SETTINGS_CORE_STORAGE_KEY);
  const assets = loadStoredObject(SETTINGS_ASSETS_STORAGE_KEY);
  return { ...core, ...assets };
}

function savePersistedSettings(nextSettings) {
  const coreUpdates = {};
  const assetUpdates = {};

  Object.entries(nextSettings || {}).forEach(([key, value]) => {
    if (ASSET_SETTING_KEYS.has(key)) {
      assetUpdates[key] = value;
    } else {
      coreUpdates[key] = value;
    }
  });

  if (Object.keys(coreUpdates).length) {
    const mergedCore = { ...loadStoredObject(SETTINGS_CORE_STORAGE_KEY), ...coreUpdates };
    saveStoredObject(SETTINGS_CORE_STORAGE_KEY, mergedCore);
  }

  if (Object.keys(assetUpdates).length) {
    const mergedAssets = { ...loadStoredObject(SETTINGS_ASSETS_STORAGE_KEY), ...assetUpdates };
    const ok = saveStoredObject(SETTINGS_ASSETS_STORAGE_KEY, mergedAssets);
    if (!ok) {
      console.warn('Large media assets could not be saved, but core settings were preserved.');
    }
  }

  // Auto-sync to cloud if authenticated
  if (typeof FirebaseStorage !== 'undefined' && FirebaseStorage.getCurrentUser()) {
    const fullSettings = { ...loadStoredObject(SETTINGS_CORE_STORAGE_KEY), ...loadStoredObject(SETTINGS_ASSETS_STORAGE_KEY) };
    FirebaseStorage.saveSettings(fullSettings).catch(err => {
      console.warn('Failed to auto-sync settings to cloud:', err.message);
    });
  }
}

function clearPersistedAssetSetting(key) {
  if (!ASSET_SETTING_KEYS.has(key)) return;
  const current = loadStoredObject(SETTINGS_ASSETS_STORAGE_KEY);
  if (!(key in current)) return;
  delete current[key];
  try {
    localStorage.setItem(SETTINGS_ASSETS_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn(`Failed to clear persisted asset setting: ${key}`, err);
  }
}

function persistControlValue(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const value = el.type === 'checkbox' ? !!el.checked : el.value;
  savePersistedSettings({ [id]: value });
}

function applyPersistedControlValues(settings) {
  PERSISTED_CONTROL_IDS.forEach((id) => {
    if (!(id in settings)) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = !!settings[id];
    } else {
      el.value = settings[id];
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const persisted = loadPersistedSettings();
  applyPersistedControlValues(persisted);

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
  
  // Load saved API key
  loadAIApiKey();
  
  // Set up event listeners
  setupEventListeners();
  setupSoundSettings();
  restorePersistedAssets(persisted);
  updateContactSettings();

  // Load example only when no previous script is saved
  const scriptEl = document.getElementById('skitScript');
  if (scriptEl && !(persisted.skitScript && String(persisted.skitScript).trim())) {
    scriptEl.value = EXAMPLE_SKIT;
    persistControlValue('skitScript');
  }

  parseAndPreview();
  updateWallpaperSettings();
  updateScriptStats();
  startConnectivitySimulation();

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
      el.addEventListener('input', () => {
        updateContactSettings();
        persistControlValue(id);
      });
    }
  });
  
  document.getElementById('showOnline')?.addEventListener('change', () => {
    updateContactSettings();
    persistControlValue('showOnline');
  });
  document.getElementById('avatarPhoto')?.addEventListener('change', handleAvatarPhotoChange);
  
  // Chat settings
  document.getElementById('chatDate')?.addEventListener('input', (e) => {
    AppState.renderer.setDate(e.target.value);
    persistControlValue('chatDate');
  });
  document.getElementById('timeFormat')?.addEventListener('change', () => persistControlValue('timeFormat'));
  
  document.getElementById('typingSpeed')?.addEventListener('change', (e) => {
    AppState.renderer.options.typingSpeed = e.target.value;
    persistControlValue('typingSpeed');
  });

  document.getElementById('wallpaperTheme')?.addEventListener('change', () => {
    updateWallpaperSettings();
    persistControlValue('wallpaperTheme');
  });
  document.getElementById('wallpaperOpacity')?.addEventListener('input', () => {
    updateWallpaperSettings();
    persistControlValue('wallpaperOpacity');
  });
  document.getElementById('wallpaperMedia')?.addEventListener('change', handleWallpaperMediaChange);

  document.getElementById('enableSounds')?.addEventListener('change', () => {
    updateSoundSettings();
    persistControlValue('enableSounds');
  });
  document.getElementById('sentSoundType')?.addEventListener('change', () => {
    updateSoundSettings();
    persistControlValue('sentSoundType');
  });
  document.getElementById('receivedSoundType')?.addEventListener('change', () => {
    updateSoundSettings();
    persistControlValue('receivedSoundType');
  });
  document.getElementById('soundVolume')?.addEventListener('input', () => {
    updateSoundSettings();
    persistControlValue('soundVolume');
  });
  document.getElementById('customSentSound')?.addEventListener('change', (e) => handleCustomSoundUpload(e, 'sent'));
  document.getElementById('customReceivedSound')?.addEventListener('change', (e) => handleCustomSoundUpload(e, 'received'));
  
  // AI Mode
  document.getElementById('aiApiKey')?.addEventListener('input', handleAIApiKeyChange);
  
  // Script changes
  document.getElementById('skitScript')?.addEventListener('input', debounce(parseAndPreview, 500));
  document.getElementById('skitScript')?.addEventListener('input', () => {
    updateScriptStats();
    persistControlValue('skitScript');
  });

  ['videoResolution', 'videoFps', 'maxDuration', 'autoPlayRecord', 'tiktokMp4'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const eventName = el.type === 'checkbox' ? 'change' : 'change';
    el.addEventListener(eventName, () => persistControlValue(id));
  });
}

function updateScriptStats() {
  const scriptEl = document.getElementById('skitScript');
  const statsEl = document.getElementById('scriptStats');
  if (!scriptEl || !statsEl) return;

  const text = scriptEl.value || '';
  const lines = text.length ? text.split(/\r?\n/).length : 0;
  const chars = text.length;
  statsEl.textContent = `${lines} lines • ${chars} chars`;
}

function startConnectivitySimulation() {
  updateConnectivityStatus(true);
  if (AppState.connectivityTimer) clearInterval(AppState.connectivityTimer);
  AppState.connectivityTimer = setInterval(() => updateConnectivityStatus(false), 1500);
}

function updateConnectivityStatus(isInitial = false) {
  const signalEls = document.querySelectorAll('.signal span');
  const networkTypeEl = document.getElementById('networkType');
  const dataFlowEl = document.getElementById('dataFlowStatus');
  if (!signalEls.length || !networkTypeEl || !dataFlowEl) return;

  const randomDrop = Math.random();
  if (!isInitial && randomDrop < 0.08) {
    AppState.connectivity.signalBars = Math.max(1, AppState.connectivity.signalBars - 1);
  } else if (!isInitial && randomDrop > 0.72) {
    AppState.connectivity.signalBars = Math.min(4, AppState.connectivity.signalBars + 1);
  }

  const baseFlow = {
    '4G': [12, 180]
  };
  AppState.connectivity.networkType = '4G';
  const [minFlow, maxFlow] = baseFlow[AppState.connectivity.networkType];
  const weakFactor = 0.45 + (AppState.connectivity.signalBars / 4) * 0.75;
  const jitter = Math.random() * (maxFlow - minFlow) + minFlow;
  AppState.connectivity.kbps = Math.max(0.5, jitter * weakFactor);

  signalEls.forEach((bar, idx) => {
    bar.style.opacity = idx < AppState.connectivity.signalBars ? '0.95' : '0.28';
  });

  networkTypeEl.textContent = AppState.connectivity.networkType;
  dataFlowEl.textContent = `${AppState.connectivity.kbps.toFixed(1)} kb`;
}

function setupSoundSettings() {
  const enableSounds = document.getElementById('enableSounds');
  const sentSoundType = document.getElementById('sentSoundType');
  const receivedSoundType = document.getElementById('receivedSoundType');
  const soundVolume = document.getElementById('soundVolume');

  if (enableSounds) AppState.sound.enabled = enableSounds.checked;
  if (sentSoundType) AppState.sound.sentType = sentSoundType.value;
  if (receivedSoundType) AppState.sound.receivedType = receivedSoundType.value;
  if (soundVolume) {
    const parsed = parseInt(soundVolume.value || '70', 10);
    AppState.sound.volume = Math.max(0, Math.min(100, parsed)) / 100;
  }

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

async function handleCustomSoundUpload(event, target) {
  const file = event.target.files?.[0];
  if (!file) {
    if (target === 'sent') {
      AppState.customSentSoundUrl = null;
      AppState.customSentAudio = null;
      clearPersistedAssetSetting('customSentSoundDataUrl');
    } else {
      AppState.customReceivedSoundUrl = null;
      AppState.customReceivedAudio = null;
      clearPersistedAssetSetting('customReceivedSoundDataUrl');
    }
    return;
  }

  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch (err) {
    console.warn('Failed to load custom sound:', err);
    return;
  }

  const audio = new Audio(dataUrl);
  audio.preload = 'auto';

  if (target === 'sent') {
    AppState.customSentSoundUrl = dataUrl;
    AppState.customSentAudio = audio;
    const sentSoundType = document.getElementById('sentSoundType');
    if (sentSoundType) sentSoundType.value = 'custom';
    savePersistedSettings({ customSentSoundDataUrl: dataUrl, sentSoundType: 'custom' });
  } else {
    AppState.customReceivedSoundUrl = dataUrl;
    AppState.customReceivedAudio = audio;
    const receivedSoundType = document.getElementById('receivedSoundType');
    if (receivedSoundType) receivedSoundType.value = 'custom';
    savePersistedSettings({ customReceivedSoundDataUrl: dataUrl, receivedSoundType: 'custom' });
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

async function handleAvatarPhotoChange(event) {
  const file = event.target.files?.[0];

  if (!file) {
    AppState.avatarImageUrl = null;
    AppState.renderer.setAvatarImage(null);
    clearPersistedAssetSetting('avatarPhotoDataUrl');
    return;
  }

  try {
    AppState.avatarImageUrl = await readFileAsDataUrl(file);
    AppState.renderer.setAvatarImage(AppState.avatarImageUrl);
    savePersistedSettings({ avatarPhotoDataUrl: AppState.avatarImageUrl });
  } catch (err) {
    console.warn('Failed to load avatar photo:', err);
  }
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

async function handleWallpaperMediaChange(event) {
  const file = event.target.files?.[0];
  const wallpaper = document.getElementById('chatWallpaper');
  const image = document.getElementById('wallpaperImage');
  const video = document.getElementById('wallpaperVideo');
  const themeSelect = document.getElementById('wallpaperTheme');

  if (!wallpaper || !image || !video || !themeSelect) return;

  wallpaper.classList.remove('has-image', 'has-video');
  image.removeAttribute('src');
  video.pause();
  video.removeAttribute('src');
  video.load();

  if (!file) {
    clearPersistedAssetSetting('wallpaperMediaDataUrl');
    clearPersistedAssetSetting('wallpaperMediaType');
    return;
  }

  try {
    AppState.wallpaperUrl = await readFileAsDataUrl(file);
  } catch (err) {
    console.warn('Failed to load wallpaper media:', err);
    return;
  }

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

  savePersistedSettings({
    wallpaperTheme: 'custom',
    wallpaperMediaDataUrl: AppState.wallpaperUrl,
    wallpaperMediaType: file.type.startsWith('video/') ? 'video' : 'image'
  });

  updateWallpaperSettings();
}

function parseAndPreview() {
  const script = document.getElementById('skitScript').value;
  if (!script.trim()) return;
  
  try {
    AppState.currentSkit = AppState.parser.parse(script);
    alignMessagesToPhoneTime(AppState.currentSkit.messages);
    
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

function parseClockToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = (match[3] || '').toUpperCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (meridiem === 'PM') hours += 12;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesToClock(totalMinutes) {
  const day = 24 * 60;
  const normalized = ((totalMinutes % day) + day) % day;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

function shortestOffsetMinutes(fromMinutes, toMinutes) {
  const day = 24 * 60;
  let diff = toMinutes - fromMinutes;
  if (diff > day / 2) diff -= day;
  if (diff < -day / 2) diff += day;
  return diff;
}

function alignMessagesToPhoneTime(messages) {
  if (!Array.isArray(messages) || !messages.length) return;

  const firstWithTime = messages.find((msg) => msg?.type === 'message' && msg.time);
  if (!firstWithTime) return;

  const firstMinutes = parseClockToMinutes(firstWithTime.time);
  if (firstMinutes == null) return;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const offset = shortestOffsetMinutes(firstMinutes, nowMinutes);

  // Only normalize when timestamps are clearly unrealistic versus phone clock.
  if (Math.abs(offset) <= 45) return;

  messages.forEach((msg) => {
    if (!msg || msg.type !== 'message' || !msg.time) return;
    const mins = parseClockToMinutes(msg.time);
    if (mins == null) return;
    msg.time = minutesToClock(mins + offset);
  });
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
        exportBtn.textContent = '⏳ Converting to TikTok MP4... 0%';
      }

      const startedAt = Date.now();
      let lastPct = 0;
      let lastStage = 'Encoding';
      const tick = setInterval(() => {
        if (!exportBtn) return;
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        exportBtn.textContent = `⏳ ${lastStage}... ${lastPct}% (${elapsed}s)`;
      }, 1000);

      try {
        blob = await AppState.exporter.convertToMp4(blob, {
          timeoutMs: 180000,
          encodingTargetMs: 70000,
          onStatus: ({ stage, pct }) => {
            if (typeof stage === 'string') lastStage = stage;
            if (typeof pct === 'number') lastPct = pct;
            if (!exportBtn) return;
            exportBtn.textContent = `⏳ ${lastStage}... ${lastPct}%`;
          },
        });
      } catch (convertErr) {
        console.warn('TikTok MP4 conversion failed, keeping WebM:', convertErr);
        const reason = convertErr?.message ? `\nReason: ${convertErr.message}` : '';
        alert(`TikTok MP4 conversion failed on this browser. Downloading WebM instead.${reason}`);
      } finally {
        clearInterval(tick);
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

  // TikTok MP4 conversion is heavy in-browser. Enforce safe capture settings
  // so conversion finishes on most devices (720p @ 30fps).
  const preferMp4 = document.getElementById('tiktokMp4')?.checked;
  if (preferMp4) {
    const resEl = document.getElementById('videoResolution');
    const fpsEl = document.getElementById('videoFps');
    if (resEl && resEl.value === '1080') resEl.value = '720';
    if (fpsEl && fpsEl.value === '60') fpsEl.value = '30';

    // Ensure exporter uses updated settings.
    if (AppState.exporter) {
      AppState.exporter.options.resolution = resEl?.value || AppState.exporter.options.resolution;
      AppState.exporter.options.fps = parseInt(fpsEl?.value || AppState.exporter.options.fps, 10) || AppState.exporter.options.fps;
    }
  }
  
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
  updateScriptStats();
  parseAndPreview();
}

function clearScript() {
  document.getElementById('skitScript').value = '';
  persistControlValue('skitScript');
  updateScriptStats();
  AppState.currentSkit = null;
  AppState.renderer.clearChat();
}

function restorePersistedAssets(settings) {
  if (!settings || typeof settings !== 'object') return;

  if (settings.avatarPhotoDataUrl) {
    AppState.avatarImageUrl = settings.avatarPhotoDataUrl;
    AppState.renderer.setAvatarImage(settings.avatarPhotoDataUrl);
  }

  if (settings.customSentSoundDataUrl) {
    AppState.customSentSoundUrl = settings.customSentSoundDataUrl;
    AppState.customSentAudio = new Audio(settings.customSentSoundDataUrl);
    AppState.customSentAudio.preload = 'auto';
  }
  if (settings.customReceivedSoundDataUrl) {
    AppState.customReceivedSoundUrl = settings.customReceivedSoundDataUrl;
    AppState.customReceivedAudio = new Audio(settings.customReceivedSoundDataUrl);
    AppState.customReceivedAudio.preload = 'auto';
  }

  const wallpaperDataUrl = settings.wallpaperMediaDataUrl;
  const wallpaperType = settings.wallpaperMediaType;
  if (wallpaperDataUrl && wallpaperType) {
    const wallpaper = document.getElementById('chatWallpaper');
    const image = document.getElementById('wallpaperImage');
    const video = document.getElementById('wallpaperVideo');
    const themeSelect = document.getElementById('wallpaperTheme');
    if (wallpaper && image && video && themeSelect) {
      AppState.wallpaperUrl = wallpaperDataUrl;
      themeSelect.value = 'custom';
      wallpaper.className = 'chat-wallpaper theme-custom';
      if (wallpaperType === 'video') {
        video.src = wallpaperDataUrl;
        video.currentTime = 0;
        video.play().catch(() => {});
        wallpaper.classList.add('has-video');
      } else {
        image.src = wallpaperDataUrl;
        wallpaper.classList.add('has-image');
      }
    }
  }
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
  if (AppState.connectivityTimer) {
    clearInterval(AppState.connectivityTimer);
    AppState.connectivityTimer = null;
  }
  if (AppState.wallpaperUrl && AppState.wallpaperUrl.startsWith('blob:')) {
    URL.revokeObjectURL(AppState.wallpaperUrl);
  }
  if (AppState.customSentSoundUrl && AppState.customSentSoundUrl.startsWith('blob:')) {
    URL.revokeObjectURL(AppState.customSentSoundUrl);
  }
  if (AppState.customReceivedSoundUrl && AppState.customReceivedSoundUrl.startsWith('blob:')) {
    URL.revokeObjectURL(AppState.customReceivedSoundUrl);
  }
  if (AppState.avatarImageUrl && AppState.avatarImageUrl.startsWith('blob:')) {
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

// Cloud Sync Functions
async function handleCloudSignIn() {
  const email = document.getElementById('cloudEmail')?.value;
  const password = document.getElementById('cloudPassword')?.value;
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  try {
    await FirebaseStorage.signIn(email, password);
    FirebaseStorage.hideLoginModal();
    alert('Logged in successfully!');
  } catch (err) {
    alert('Login failed: ' + err.message);
  }
}

async function handleCloudSignUp() {
  const email = document.getElementById('cloudEmail')?.value;
  const password = document.getElementById('cloudPassword')?.value;
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  if (password.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }
  
  try {
    await FirebaseStorage.signUp(email, password);
    FirebaseStorage.hideLoginModal();
    alert('Account created! You are now logged in.');
  } catch (err) {
    alert('Sign up failed: ' + err.message);
  }
}

async function saveSettingsToCloud() {
  try {
    const settings = loadPersistedSettings();
    await FirebaseStorage.saveSettings(settings);
    alert('Settings saved to cloud!');
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
}

// AI Mode Functions
function loadAIApiKey() {
  const apiKeyInput = document.getElementById('aiApiKey');
  if (!apiKeyInput) return;
  
  try {
    // Check if build-injected API key exists (from Netlify)
    if (window.AIClient && window.AIClient.hasBuildApiKey && window.AIClient.hasBuildApiKey()) {
      // Hide the API key input field since it's already configured
      apiKeyInput.parentElement.style.display = 'none';
      return;
    }
    
    // Otherwise, load from localStorage for manual entry
    const savedKey = localStorage.getItem('whatsappSkitMaker.aiApiKey') || '';
    apiKeyInput.value = savedKey;
    
    // Update the AIClient with the saved key
    if (window.AIClient && savedKey) {
      window.AIClient.setApiKey(savedKey);
    }
  } catch (err) {
    console.warn('Failed to load AI API key:', err);
  }
}

function handleAIApiKeyChange(e) {
  const apiKey = e.target.value;
  
  try {
    localStorage.setItem('whatsappSkitMaker.aiApiKey', apiKey);
    
    // Update the AIClient with the new key
    if (window.AIClient) {
      window.AIClient.setApiKey(apiKey);
    }
  } catch (err) {
    console.warn('Failed to save AI API key:', err);
  }
}

async function generateAIScript() {
  const prompt = document.getElementById('aiPromptInput').value;
  const statusEl = document.getElementById('aiStatus');
  
  if (!prompt) {
    alert('Please enter a prompt to generate a script');
    return;
  }
  
  statusEl.style.display = 'block';
  statusEl.textContent = 'Generating script...';
  statusEl.className = 'ai-status loading';
  
  try {
    const client = window.AIClient;
    const script = await client.generateScript(prompt);
    
    // Populate the script textarea
    document.getElementById('skitScript').value = script;
    parseAndPreview();
    
    statusEl.textContent = 'Script generated successfully!';
    statusEl.className = 'ai-status success';
    setTimeout(() => statusEl.style.display = 'none', 3000);
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.className = 'ai-status error';
  }
}

// Voice Input Functions
let recognition = null;
let isRecording = false;

function toggleVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice input is not supported in your browser. Please use Chrome or Edge.');
    return;
  }

  if (isRecording) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  const voiceBtn = document.getElementById('voiceInputBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  const promptInput = document.getElementById('aiPromptInput');

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add('recording');
    voiceStatus.style.display = 'block';
    voiceStatus.textContent = '🎤 Listening...';
    voiceStatus.className = 'voice-status listening';
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      // Append final transcript to the textarea
      const currentText = promptInput.value;
      promptInput.value = currentText + (currentText ? ' ' : '') + finalTranscript;
    }

    if (interimTranscript) {
      voiceStatus.textContent = '🎤 Listening... ' + interimTranscript;
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    voiceStatus.textContent = '❌ Error: ' + event.error;
    voiceStatus.className = 'voice-status error';
    stopVoiceInput();
  };

  recognition.onend = () => {
    if (isRecording) {
      // If it ended but we're still supposed to be recording, restart it
      recognition.start();
    }
  };

  recognition.start();
}

function stopVoiceInput() {
  isRecording = false;
  
  if (recognition) {
    recognition.stop();
    recognition = null;
  }

  const voiceBtn = document.getElementById('voiceInputBtn');
  const voiceStatus = document.getElementById('voiceStatus');

  voiceBtn.classList.remove('recording');
  voiceStatus.textContent = '✓ Voice input stopped';
  voiceStatus.className = 'voice-status';
  
  setTimeout(() => {
    voiceStatus.style.display = 'none';
  }, 2000);
}

async function organizeAIScript() {
  const rawText = document.getElementById('aiPromptInput').value;
  const statusEl = document.getElementById('aiStatus');
  
  if (!rawText) {
    alert('Please enter raw text to organize');
    return;
  }
  
  statusEl.style.display = 'block';
  statusEl.textContent = 'Organizing script...';
  statusEl.className = 'ai-status loading';
  
  try {
    const client = window.AIClient;
    const organizedScript = await client.organizeScript(rawText);
    
    // Populate the script textarea
    document.getElementById('skitScript').value = organizedScript;
    parseAndPreview();
    
    statusEl.textContent = 'Script organized successfully!';
    statusEl.className = 'ai-status success';
    setTimeout(() => statusEl.style.display = 'none', 3000);
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.className = 'ai-status error';
  }
}

function updateAIModeUI() {
  const mode = document.querySelector('input[name="aiMode"]:checked').value;
  const label = document.getElementById('aiPromptLabel');
  const textarea = document.getElementById('aiPromptInput');
  const button = document.getElementById('aiActionButton');
  
  if (mode === 'generate') {
    label.textContent = 'AI Prompt';
    textarea.placeholder = "Describe the conversation you want to generate...\n\nExample:\n• 'Create a funny conversation about someone forgetting their anniversary'\n• 'Write a flirty chat between two coworkers'";
    button.textContent = '🚀 Generate Script';
  } else {
    label.textContent = 'Raw Text to Organize';
    textarea.placeholder = "Paste your raw conversation text here to organize it into proper WhatsApp format...";
    button.textContent = '✨ Organize Text';
  }
}

async function handleAIAction() {
  const mode = document.querySelector('input[name="aiMode"]:checked').value;
  
  if (mode === 'generate') {
    await generateAIScript();
  } else {
    await organizeAIScript();
  }
}

async function loadSettingsFromCloud() {
  try {
    const settings = await FirebaseStorage.loadSettings();
    if (!settings) {
      alert('No saved settings found in cloud');
      return;
    }
    
    // Apply loaded settings
    applyPersistedControlValues(settings);
    restorePersistedAssets(settings);
    
    // Update UI
    updateContactSettings();
    updateWallpaperSettings();
    updateSoundSettings();
    
    // Update renderer
    if (settings.chatDate) {
      AppState.renderer.setDate(settings.chatDate);
    }
    if (settings.typingSpeed) {
      AppState.renderer.options.typingSpeed = settings.typingSpeed;
    }
    
    // Re-parse script if exists
    if (settings.skitScript) {
      parseAndPreview();
    }
    
    alert('Settings loaded from cloud!');
  } catch (err) {
    alert('Failed to load: ' + err.message);
  }
}
