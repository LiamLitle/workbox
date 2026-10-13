const audio = document.getElementById('audioPlayer');

// Audio files live in their own small database (IndexedDB), one entry per
// track. The playlist kept in the extension's storage only holds names and
// ids, so nothing heavy is read or written until a track is actually played.
const MusicDB = (() => {
  let opening = null;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open('workbox-music', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks');
    r.onsuccess = () => res(r.result);
    r.onerror = () => { opening = null; rej(r.error); };
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('tracks', mode);
      const q = fn(tx.objectStore('tracks'));
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  };
  return {
    put: (id, blob) => run('readwrite', (s) => s.put(blob, id)),
    get: (id) => run('readonly', (s) => s.get(id)),
    del: (id) => run('readwrite', (s) => s.delete(id)),
    clear: () => run('readwrite', (s) => s.clear())
  };
})();

// Only the track being played is in memory. Loading another one, or stopping,
// lets go of the previous file. Asking for the same track again (one song on
// repeat) plays it again without reading the file a second time.
let loadedId = null, loadedUrl = null;
function unloadTrack() {
  if (loadedUrl) { try { URL.revokeObjectURL(loadedUrl); } catch (e) { } }
  loadedUrl = null; loadedId = null;
}
async function loadTrack(id) {
  const blob = await MusicDB.get(id);
  if (!blob) throw new Error('This track is no longer stored.');
  const old = loadedUrl;
  loadedUrl = URL.createObjectURL(blob);
  loadedId = id;
  audio.src = loadedUrl;
  if (old) { try { URL.revokeObjectURL(old); } catch (e) { } }
}
const pasteTarget = document.getElementById('pasteTarget');
let sendProgressInterval = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  switch (msg.action) {
    // Clipboard monitoring switch, pushed by the background. An offscreen
    // document only gets the chrome.runtime messaging APIs, so it cannot read
    // the stored setting itself: it waits to be told.
    case 'WATCH':
      watchAsked = true;
      if (msg.on) startPolling(); else stopPolling();
      sendResponse({ watching: !!pollTimer });
      return false;

    case 'PLAY':
      // A file that cannot be decoded either rejects play() or only fires
      // "error": answer once, with whichever comes first.
      {
        let answered = false;
        const reply = (res) => {
          if (answered) return;
          answered = true;
          audio.removeEventListener('error', onLoadError);
          sendResponse(res);
        };
        const onLoadError = () => reply({ success: false, error: audioErrorText() });
        audio.addEventListener('error', onLoadError);
        const start = () => audio.play().then(() => reply({ success: true })).catch(err => reply({ success: false, error: err.message }));
        if (msg.id && msg.id === loadedId && audio.getAttribute('src')) {
          try { audio.currentTime = 0; } catch (e) { }
          start();
        } else if (msg.id) {
          loadTrack(msg.id).then(start, (e) => reply({ success: false, error: (e && e.message) || 'Cannot load this track.' }));
        } else {
          if (msg.dataUrl) { unloadTrack(); audio.src = msg.dataUrl; }   // playlist saved by an older version
          start();
        }
      }
      break;

    case 'SET_LOOP':
      audio.loop = !!msg.loop;
      sendResponse({ success: true });
      break;

    case 'PAUSE':
      audio.pause();
      sendResponse({ success: true });
      break;

    case 'SET_VOLUME':
      audio.volume = Math.max(0, Math.min(1, msg.volume));
      sendResponse({ success: true });
      break;

    case 'SEEK':
      audio.currentTime = msg.time;
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({
        success: true,
        currentTime: audio.currentTime,
        duration: audio.duration,
        paused: audio.paused,
        volume: audio.volume,
        ended: audio.ended
      });
      break;
      
    case 'STOP':
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      unloadTrack();
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Broadcast state changes directly to the rest of the extension (popup)
function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'AUDIO_STATE_UPDATE',
    currentTime: audio.currentTime,
    duration: audio.duration,
    paused: audio.paused,
    volume: audio.volume,
    ended: audio.ended
  }).catch(() => {}); // catch errors if popup is closed
}

function audioErrorText() {
  return (audio.error && audio.error.message) || 'This audio file cannot be played.';
}

// Tells the popup that the current track failed (unsupported or damaged file).
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return; // STOP empties src, which also fires "error"
  if (sendProgressInterval) {
    clearInterval(sendProgressInterval);
    sendProgressInterval = null;
  }
  chrome.runtime.sendMessage({ type: 'AUDIO_ERROR', error: audioErrorText() }).catch(() => {});
  broadcastState();
});

audio.addEventListener('play', () => {
  if (sendProgressInterval) clearInterval(sendProgressInterval);
  sendProgressInterval = setInterval(broadcastState, 500);
  broadcastState();
});

audio.addEventListener('pause', () => {
  if (sendProgressInterval) {
    clearInterval(sendProgressInterval);
    sendProgressInterval = null;
  }
  broadcastState();
});

audio.addEventListener('ended', () => {
  if (sendProgressInterval) {
    clearInterval(sendProgressInterval);
    sendProgressInterval = null;
  }
  broadcastState();
  chrome.runtime.sendMessage({ type: 'AUDIO_TRACK_ENDED' }).catch(() => {});
});

// Le service worker n'a pas accès au presse-papiers système sans une page
// visible — ce document offscreen sert de proxy : on force un "paste" toutes
// les 2.5s sur une zone cachée et on lit ce qui en ressort.
// Kept in memory only: an offscreen document has no chrome.storage, and the
// background already ignores a text or image it has stored before.
let lastCopiedText = '';
let lastImagePrefix = '';
let _pendingPasteHandler = null;

async function pollClipboard() {
  try {
    pasteTarget.innerHTML = '';
    pasteTarget.focus();

    if (_pendingPasteHandler) {
      pasteTarget.removeEventListener('paste', _pendingPasteHandler);
      _pendingPasteHandler = null;
    }
    const onPaste = async (e) => {
      _pendingPasteHandler = null;
      e.stopPropagation();
      e.preventDefault();

      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      const rawText = clipboardData.getData('text/plain');
      const text = rawText.trim();
      if (text.length > 0) processText(text, rawText.length);

      const items = clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            processImage(blob);
            break; // une seule image à la fois, comme pour une vraie capture d'écran
          }
        }
      }
    };

    _pendingPasteHandler = onPaste;
    pasteTarget.addEventListener('paste', onPaste, { once: true });
    document.execCommand('paste');
  } catch (err) { }
}

// A message between extension parts is limited to ~64 MB (counted in bytes, so
// accented or Asian text reaches it sooner). Long texts are sent in several parts.
function sendCapture(text, inputType, rawLen) {
  const PART = 4000000;
  const chars = Math.max(text.length, rawLen || 0);   // size of what was copied, spaces included
  if (text.length <= PART) return chrome.runtime.sendMessage({ type: 'clipboard_capture', text, inputType, rawLen: chars });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const total = Math.ceil(text.length / PART);
  let chain = Promise.resolve();
  for (let i = 0; i < total; i++) {
    // stops as soon as the extension says the text is too long
    chain = chain.then((prev) => (prev && prev.status === 'too_large') ? prev
      : chrome.runtime.sendMessage({ type: 'clipboard_capture_part', id, index: i, total, inputType, chars, part: text.slice(i * PART, (i + 1) * PART) }));
  }
  return chain;
}

async function processText(trimmed, rawLen) {
  if (trimmed.length > 0 && trimmed !== lastCopiedText) {
    // Les chemins locaux/blob viennent souvent d'un copier-coller interne au navigateur, pas d'un vrai copier
    if (trimmed.startsWith('blob:') || trimmed.match(/^[a-zA-Z]:\\/) || trimmed.startsWith('/') || trimmed.startsWith('file:')) {
      return;
    }

    lastCopiedText = trimmed;

    sendCapture(trimmed, '', rawLen).catch(() => { });
  }
}

// La compression JPEG se fait une seule fois, côté background.js (compressImageToJpeg) —
// on envoie l'image brute ici pour éviter de la recompresser deux fois avec deux
// qualités différentes, ce qui dégraderait le rendu pour rien.
async function processImage(blob) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const prefix = dataUrl.substring(0, 5000); // suffisant pour détecter un doublon sans comparer tout le dataURL

    if (prefix !== lastImagePrefix) {
      lastImagePrefix = prefix;

      chrome.runtime.sendMessage({
        type: 'clipboard_image',
        dataUrl,
        inputType: 'image'
      }).catch(() => { });

      pasteTarget.innerHTML = '';
    }
  };
  reader.readAsDataURL(blob);
}

// ---- Clipboard polling, and its off switch ----
// Reading starts when the background says so (see the WATCH action above): an
// offscreen document cannot read chrome.storage, and guessing "on" would keep
// reading the clipboard of someone who turned monitoring off. The fallback keeps
// the old behaviour if that message never arrives — a clipboard manager that
// silently stops is worse than one unnecessary read.
let pollTimer = null;
let watchAsked = false;

function startPolling() {
  watchAsked = true;
  if (pollTimer) return;
  pollTimer = setInterval(pollClipboard, 2500);
  pollClipboard();
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (_pendingPasteHandler) {
    try { pasteTarget.removeEventListener('paste', _pendingPasteHandler); } catch (e) { }
    _pendingPasteHandler = null;
  }
}
setTimeout(() => { if (!watchAsked) startPolling(); }, 1500);


// ---- Sound levels for the music animation in the popup ----
// The player is not rerouted: a copy of what it plays is measured, so the
// sound itself can never be affected. Levels are only computed while a popup
// is listening on the port.
let levelCtx = null, levelNode = null, levelSrc = null, levelBins = null;
const levelPorts = new Set();
let levelTimer = null;

function attachLevels() {
  try {
    if (!audio.captureStream) return;
    const stream = audio.captureStream();
    if (!stream.getAudioTracks().length) return;
    if (!levelCtx) {
      levelCtx = new AudioContext();
      levelNode = levelCtx.createAnalyser();
      levelNode.fftSize = 1024;
      levelNode.smoothingTimeConstant = 0.6;
      levelBins = new Uint8Array(levelNode.frequencyBinCount);
    }
    if (levelSrc) { try { levelSrc.disconnect(); } catch (e) { } }
    levelSrc = levelCtx.createMediaStreamSource(stream);
    levelSrc.connect(levelNode);
    if (levelCtx.state !== 'running') levelCtx.resume().catch(() => { });
  } catch (e) { }
}
audio.addEventListener('playing', () => { if (levelPorts.size) attachLevels(); });

function sendLevels() {
  let b = 0, m = 0, h = 0;
  const s = [];
  if (levelNode && !audio.paused) {
    levelNode.getByteFrequencyData(levelBins);
    const hz = (levelCtx.sampleRate / 2) / levelBins.length;
    const avg = (from, to) => {
      const i0 = Math.max(1, Math.round(from / hz)), i1 = Math.min(levelBins.length - 1, Math.round(to / hz));
      let s = 0; for (let i = i0; i <= i1; i++) s += levelBins[i];
      return s / ((i1 - i0 + 1) * 255);
    };
    b = avg(40, 250); m = avg(250, 2000); h = avg(2000, 9000);
    // sixteen bands from 50 Hz to 11 kHz, each about 1.4 times higher than the one before;
    // high bands are naturally quieter, so they are lifted a little
    let f = 50;
    for (let n = 0; n < 16; n++) { const f1 = f * 1.4; s.push(Math.min(1, avg(f, f1) * (1 + n * 0.07))); f = f1; }
  } else { for (let n = 0; n < 16; n++) s.push(0); }
  for (const p of levelPorts) { try { p.postMessage({ b, m, h, s }); } catch (e) { levelPorts.delete(p); } }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wb-audio-levels') return;
  levelPorts.add(port);
  if (!audio.paused) attachLevels();
  if (!levelTimer) levelTimer = setInterval(sendLevels, 40);
  port.onDisconnect.addListener(() => {
    levelPorts.delete(port);
    if (!levelPorts.size && levelTimer) { clearInterval(levelTimer); levelTimer = null; }
  });
});
