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

// Capture ce qui est copié/coupé sur la page et l'envoie au background

// private sites (Settings > Private sites): nothing is sent from them
let wbPrivateSite = false;
// Clipboard monitoring switch (Settings > Privacy). Reading the clipboard of
// someone who turned it off would defeat the point, so nothing is even sent.
let wbWatch = true;
function wbCheckPrivate(list) {
  const host = location.hostname.toLowerCase();
  wbPrivateSite = Array.isArray(list) && list.some((d) => host === d || host.endsWith('.' + d));
}
try {
  chrome.storage.local.get(['clipBlacklist', 'wbClipWatch'], (r) => {
    void chrome.runtime.lastError;
    wbCheckPrivate(r && r.clipBlacklist);
    wbWatch = !(r && r.wbClipWatch === false);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.clipBlacklist) wbCheckPrivate(ch.clipBlacklist.newValue);
    if (ch.wbClipWatch) wbWatch = ch.wbClipWatch.newValue !== false;
  });
} catch (e) { }

function wbHash(s) {
  let h = 2166136261 >>> 0;
  const step = s.length > 200000 ? 7 : 1;
  for (let i = 0; i < s.length; i += step) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36) + ':' + s.length;
}
function safeSend(text) {
  if (!text || !text.trim()) return;
  if (!wbWatch) return;   // clipboard monitoring is off: not even sent
  if (wbPrivateSite) {
    // not saved, but remembered by a short fingerprint so the clipboard reader does not pick it up later
    try { chrome.runtime.sendMessage({ type: 'private_copy', h: wbHash(text.trim()) }).catch(() => { }); } catch (e) { }
    return;
  }
  try {
    let inputType = '';
    try {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        inputType = (el.type || '').toLowerCase();
      }
    } catch (e) { }

    sendCapture(text.trim(), inputType, text.length).catch(() => { });
  } catch (e) { }
}

// Fallback quand clipboardData ne donne rien directement (arrive sur certains sites) :
// on relit la sélection juste après l'événement
function getSelectedText() {
  let text = '';
  try { text = window.getSelection().toString(); } catch (e) { }
  if (text) return text;

  try {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== end && typeof el.value === 'string') {
        text = el.value.substring(start, end);
      }
    }
  } catch (e) { }
  return text;
}

function captureFromEvent(event) {
  const directText = event?.clipboardData?.getData('text/plain');
  if (directText && directText.trim()) {
    safeSend(directText);
    return;
  }

  setTimeout(() => {
    const fallbackText = getSelectedText();
    if (fallbackText) safeSend(fallbackText);
  }, 100);
}

function checkImageCapture(event) {
  try {
    if (!wbWatch) return;   // clipboard monitoring is off
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (e) => {
          chrome.runtime.sendMessage({
            type: 'clipboard_image',
            dataUrl: e.target.result
          }).catch(() => { });
        };
        reader.readAsDataURL(blob);
      }
    }
  } catch (err) { }
}

// Capture phase (true) pour intercepter avant que le site ne bloque l'event
document.addEventListener('copy', (e) => {
  if (!e.isTrusted) return;
  checkImageCapture(e);
  captureFromEvent(e);
}, true);

document.addEventListener('cut', (e) => {
  if (!e.isTrusted) return;
  checkImageCapture(e);
  captureFromEvent(e);
}, true);

// ── AI answer blocker for search engines ───────────────────────────────
// Brave exposes a URL parameter that turns
// its inline AI answer off without touching anything else on the page
// (source: github.com/jruns/disable-ai). Google is the odd one out: its
// only URL-level switch (udm=14) doesn't just remove the AI Overview, it
// forces the whole page into the "Web" results tab, which also drops
// Images/Videos/Shopping — too big a side effect. So for Google we instead
// remove just the AI Overview block from the DOM, anchored on Google's own
// internal data-async-type="folsrch" marker rather than an obfuscated CSS
// class (those get renamed constantly; this marker is far more stable).
//
// One key per engine in chrome.storage.local (blockAiGoogle / blockAiBrave),
// all switched together by the single on/off control in the popup. A key
// that was never written counts as on. Works the same in any Chromium
// browser (Chrome, Brave, Edge...) — it's keyed off the search engine's
// domain, not the browser.
//
// Ecosia, Yahoo and Yandex aren't covered yet: Ecosia's AI answer is
// blocked server-side (needs network request blocking, not a URL param),
// and no clean bypass parameter is documented for Yahoo/Yandex.
(() => {
  const host = location.hostname;
  const path = location.pathname;
  const hasQuery = new URL(location.href).searchParams.has('q');

  let engine = null;
  if (/(^|\.)google\.[a-z.]+$/i.test(host) && path === '/search') engine = 'Google';
  else if (host === 'search.brave.com' && path === '/search') engine = 'Brave';
  if (!engine) return;

  // lets WorkBox show which engine is in use (no tab is ever opened for that)
  if (window === window.top) { try { chrome.runtime.sendMessage({ type: 'AI_ENGINE_SEEN' }).catch(() => { }); } catch (e) { } }

  const storageKey = 'blockAi' + engine;
  const isDefaultEngine = true;

  function redirectParam(url) {
    // Only add a param when it's completely absent, so we never override an
    // explicit choice already baked into the URL, or fight with a redirect
    // we already did. Google isn't handled here — see hideGoogleAiBlocks().
    let changed = false;
    if (engine === 'Brave' && !url.searchParams.has('summary')) { url.searchParams.set('summary', '0'); changed = true; }
    return changed;
  }

  // Walks up from a marker element to the block directly inside the results
  // container (#rso) or the page banner container (#rcnt), so we hide the
  // whole card instead of just an inner wrapper.
  function findBlockUnderResults(marker) {
    let el = marker;
    while (el && el.parentElement) {
      const parentId = el.parentElement.id;
      if (parentId === 'rso' || parentId === 'rcnt') return el;
      el = el.parentElement;
    }
    return null;
  }

  function hideGoogleAiBlocks() {
    // The AI Overview card is built around an async-loaded module Google
    // tags internally with data-async-type="folsrch" — unlike its CSS
    // classes, this marker has stayed put across their redesigns.
    const overviewMarker = document.querySelector('[data-async-type="folsrch"], [id^="folsrch"]');
    if (overviewMarker) {
      const block = findBlockUnderResults(overviewMarker);
      if (block && block.style.display !== 'none') block.style.display = 'none';
    }

    // "Things to know" is a separate AI-generated panel that can show up
    // even when there's no AI Overview above it.
    const thingsToKnow = document.querySelector('[data-maindata]:not([data-bkt])');
    if (thingsToKnow) {
      const block = findBlockUnderResults(thingsToKnow) || thingsToKnow;
      if (block.style.display !== 'none') block.style.display = 'none';
    }

    // The "AI Mode" tab next to Images/Videos/News has no URL toggle either.
    const firstTab = document.querySelector('[role="list"]')?.children?.[0];
    if (firstTab && /^AI Mode$/i.test((firstTab.innerText || '').trim())) {
      firstTab.style.display = 'none';
    }
  }

  chrome.storage.local.get(storageKey, (res) => {
    // Absent from storage (first run, before the popup has been opened):
    // only the default engine (Google) is active, not both at once.
    const val = res[storageKey];
    const enabled = val === undefined ? isDefaultEngine : val === true;
    if (!enabled) return;

    if (engine === 'Google') {
      hideGoogleAiBlocks();
      new MutationObserver(hideGoogleAiBlocks).observe(document.documentElement, { childList: true, subtree: true });
      return;
    }

    const url = new URL(location.href);
    if (redirectParam(url)) {
      location.replace(url.toString());
      return;
    }

  });
})();


// ── Right-click menu: show only the WorkBox actions that fit what was clicked ──
// Sent on the right-button press, before the menu opens: an image shows the image
// actions only, selected text the text actions, a link the link actions.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || !e.isTrusted) return;
  const t = e.target;
  let kind = 'page', src = '';
  let sel = ''; try { sel = String(window.getSelection() || '').trim(); } catch (err) { }
  if (t instanceof HTMLImageElement) { kind = 'image'; src = (t.currentSrc || t.src || '').slice(0, 2000); }
  else if (sel) kind = 'selection';
  else if (t && t.closest && t.closest('a[href]')) kind = 'link';
  try { chrome.runtime.sendMessage({ type: 'CTX_KIND', kind, src }).catch(() => { }); } catch (err) { }
}, true);

// "Scan the QR code in this image" is only offered when the image holds one. The
// background looks at the image the pointer rests on (a local screenshot of the
// visible tab, nothing is requested from the network).
if (window === window.top) {
  let qrHoverTimer = null, qrHoverSrc = '';
  const qrTell = (msg) => { try { chrome.runtime.sendMessage(msg).catch(() => { }); } catch (e) { } };
  document.addEventListener('mouseout', (e) => {
    if (e.target instanceof HTMLImageElement) { clearTimeout(qrHoverTimer); qrHoverSrc = ''; }
  }, true);
  document.addEventListener('mouseover', (e) => {
    const img = e.target;
    if (!e.isTrusted || !(img instanceof HTMLImageElement)) return;
    const src = (img.currentSrc || img.src || '').slice(0, 2000);
    if (!src || src === qrHoverSrc) return;
    qrHoverSrc = src;
    clearTimeout(qrHoverTimer);
    qrTell({ type: 'QR_IMG_HOVER', src });
    qrHoverTimer = setTimeout(() => {
      if (!img.isConnected || document.visibilityState !== 'visible') return;
      const r = img.getBoundingClientRect();
      if (r.width < 48 || r.height < 48) return;
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      const w = Math.min(window.innerWidth, r.right) - x, h = Math.min(window.innerHeight, r.bottom) - y;
      if (w < 48 || h < 48) return;
      const whole = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
      qrTell({ type: 'QR_IMG_HOVER', src, scan: true, whole, rect: { x, y, width: w, height: h }, dpr: window.devicePixelRatio || 1 });
    }, 250);
  }, true);
}
