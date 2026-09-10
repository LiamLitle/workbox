const audio = document.getElementById('audioPlayer');
const pasteTarget = document.getElementById('pasteTarget');
let sendProgressInterval = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  switch (msg.action) {
    case 'PLAY':
      if (msg.dataUrl) {
        audio.src = msg.dataUrl;
      }
      audio.play().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
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
let lastCopiedText = '';
let lastImagePrefix = '';
let _pendingPasteHandler = null;

try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['lastCopiedText', 'lastImagePrefix'], (data) => {
      if (chrome.runtime.lastError) return;
      if (data.lastCopiedText) lastCopiedText = data.lastCopiedText;
      if (data.lastImagePrefix) lastImagePrefix = data.lastImagePrefix;
    });
  }
} catch (e) { }

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

      const text = clipboardData.getData('text/plain').trim();
      if (text.length > 0) processText(text);

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

async function processText(trimmed) {
  if (trimmed.length > 0 && trimmed !== lastCopiedText) {
    // Les chemins locaux/blob viennent souvent d'un copier-coller interne au navigateur, pas d'un vrai copier
    if (trimmed.startsWith('blob:') || trimmed.match(/^[a-zA-Z]:\\/) || trimmed.startsWith('/') || trimmed.startsWith('file:')) {
      return;
    }

    lastCopiedText = trimmed;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lastCopiedText: trimmed });
      }
    } catch (e) { }

    chrome.runtime.sendMessage({
      type: 'clipboard_capture',
      text: trimmed,
      inputType: ''
    }).catch(() => { });
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
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lastImagePrefix: prefix });
      }

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

setInterval(pollClipboard, 2500);
pollClipboard();
