// jsQR est un décodeur JS pur (pas de dépendance DOM) — on peut donc l'utiliser
// directement dans le service worker, sans passer par le document offscreen.
importScripts('/lib/jsQR.js');
importScripts('/lib/crypto.js', '/lib/clipstore.js', '/lib/protection.js', '/background/protection-bg.js', '/lib/bigtext.js');

// Éléments non épinglés uniquement — les épinglés sont illimités
const TEXT_LIMIT = WBBig.MAX_TEXTS;
const IMAGE_LIMIT = WBBig.MAX_IMAGES; // beyond this, export as ZIP from the popup rather than raising it again

// Les images copiées arrivent souvent en PNG brut (captures d'écran) — on les
// repasse toutes en JPEG avant stockage, ça change beaucoup sur la taille au fil
// du temps. OffscreenCanvas tourne directement dans le service worker, pas
// besoin du document offscreen pour ça.
async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function compressImageToJpeg(dataUrl, quality = 0.88) {
  try {
    const srcBlob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(srcBlob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    // Le JPEG n'a pas de canal alpha — fond blanc pour éviter que les zones
    // transparentes ne virent au noir.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    // Certaines images (déjà compressées, peu de couleurs, PNG optimisé...) finissent
    // plus lourdes une fois repassées en JPEG — dans ce cas on garde l'original tel quel
    // plutôt que de "compresser" dans le mauvais sens.
    if (jpegBlob.size >= srcBlob.size) {
      return { dataUrl, originalSize: srcBlob.size, compressedSize: srcBlob.size };
    }

    const compressedDataUrl = await blobToDataUrl(jpegBlob);
    return { dataUrl: compressedDataUrl, originalSize: srcBlob.size, compressedSize: jpegBlob.size };
  } catch (e) {
    console.error('compressImageToJpeg:', e);
    return { dataUrl, originalSize: null, compressedSize: null }; // en cas d'échec, on garde l'original plutôt que de perdre l'image
  }
}

// Le bouton "Ouvrir" de qroverlay.js reconnaît aussi bien "https://..." que
// "www.exemple.com" (sans schéma) comme un lien — mais chrome.tabs.create
// échoue silencieusement sur une URL sans schéma. On ajoute https:// si
// besoin, et on rejette tout ce qui n'est pas http/https par sécurité
// (le contenu d'un QR code n'est pas une source de confiance).
function normalizeQrUrl(raw) {
  if (!raw) return null;
  const value = raw.trim();

  // Un texte qui a déjà un schéma non-http (chrome:, javascript:, ftp:...)
  // est rejeté direct, plutôt que de lui coller "https://" devant et obtenir
  // une URL bancale qui ne correspond plus à rien.
  const hasOtherScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) && !/^https?:\/\//i.test(value);
  if (hasOtherScheme) return null;

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null;
  } catch (e) {
    return null;
  }
}

// Capture + recadrage + décodage QR pour la sélection de zone. Tout se fait
// directement ici dans le service worker (OffscreenCanvas + jsQR), sans
// relais vers le document offscreen ni dépendance à BarcodeDetector — ce
// dernier s'appuie sur un modèle ML téléchargé en tâche de fond par Chrome,
// pas toujours présent, et échouait silencieusement (0 résultat, jamais
// d'erreur) même sur des codes parfaitement valides.
async function handleQrAreaSelection(rect, dpr, tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const srcBlob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(srcBlob);

    const { text, foundPattern } = tryDecodeWithPadding(bitmap, rect, dpr);

    if (text) {
      await chrome.storage.local.set({ lastQrResult: { text, timestamp: Date.now() } });
      chrome.tabs.sendMessage(tab.id, { type: 'QR_RESULT', success: true, text, rect }).catch(() => {});
    } else {
      // On distingue "rien de QR ici" (zone mal sélectionnée) de "il y a bien
      // un QR code mais il est illisible" (abîmé, flou, mal formé) — le
      // second cas ne se résoudra pas en refaisant juste la sélection.
      const error = foundPattern
        ? "A QR code seems to be present but it is invalid or damaged."
        : 'No QR code detected. Try leaving a bit of white margin around the code.';
      chrome.tabs.sendMessage(tab.id, { type: 'QR_RESULT', success: false, error, rect }).catch(() => {});
    }
  } catch (e) {
    chrome.tabs.sendMessage(tab.id, { type: 'QR_RESULT', success: false, error: 'Capture or read failed.', rect }).catch(() => {});
  }
}

// Finds every QR code in the visible part of the tab. One screenshot, read
// locally: each visible picture is scanned on its own, then the whole view.
// A code that was read is painted over so the next pass can find another.
async function qrFindAll(msg, tab) {
  if (typeof jsQR !== 'function') return { ok: false };
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  // The screenshot is taken: the page may now show its "searching" message.
  chrome.tabs.sendMessage(tab.id, { type: 'QR_SCANNING' }, { frameId: 0 }).catch(() => {});
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const W = bitmap.width, H = bitmap.height;
  const k = W / Math.max(1, Number(msg.vw) || W);
  const base = new OffscreenCanvas(W, H);
  const bctx = base.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(bitmap, 0, 0);
  const found = [];
  const t0 = Date.now();
  const spent = () => Date.now() - t0 > 9000 || found.length >= 16;

  // One read attempt on a zone, at several sizes: smaller sizes help with
  // dotted or very large codes, a larger one helps with tiny codes.
  const scan = (sx, sy, sw, sh, targets) => {
    const long = Math.max(sw, sh);
    const done = [];
    for (const t of targets) {
      const scale = t > 0 && t <= 4 ? t : Math.min(1, t / long);
      if (done.some((d) => Math.abs(d - scale) < 0.04)) continue;
      done.push(scale);
      const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
      if (w * h > 3200000) continue;
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(base, sx, sy, sw, sh, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      const code = jsQR(d.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (code && code.data && code.location) {
        const L = code.location;
        const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner];
        const xs = pts.map((p) => p.x / scale + sx), ys = pts.map((p) => p.y / scale + sy);
        const x0 = Math.max(0, Math.min.apply(null, xs)), y0 = Math.max(0, Math.min.apply(null, ys));
        const x1 = Math.min(W, Math.max.apply(null, xs)), y1 = Math.min(H, Math.max.apply(null, ys));
        if (x1 - x0 > 8 && y1 - y0 > 8) return { text: code.data, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
    }
    return null;
  };
  const take = (sx, sy, sw, sh, targets, max) => {
    let n = 0;
    for (let i = 0; i < max && !spent(); i++) {
      const r = scan(sx, sy, sw, sh, targets);
      if (!r) break;
      found.push(r); n++;
      const p = Math.max(r.w, r.h) * 0.06;
      bctx.fillStyle = '#808080';
      bctx.fillRect(r.x - p, r.y - p, r.w + 2 * p, r.h + 2 * p);
    }
    return n;
  };

  // 1. Every visible picture, with three margins (a code with no white
  //    border needs some of the page around it, a framed one needs less).
  const rects = Array.isArray(msg.rects) ? msg.rects.slice(0, 60) : [];
  for (const r of rects) {
    if (spent()) break;
    if (!r || !(r.width > 0) || !(r.height > 0)) continue;
    for (const pad of [0.08, 0, 0.3]) {
      const px = r.width * pad, py = r.height * pad;
      const sx = Math.max(0, Math.round((r.x - px) * k)), sy = Math.max(0, Math.round((r.y - py) * k));
      const sw = Math.min(W - sx, Math.round((r.width + 2 * px) * k)), sh = Math.min(H - sy, Math.round((r.height + 2 * py) * k));
      if (sw < 20 || sh < 20) break;
      const small = Math.max(sw, sh) < 260;
      if (take(sx, sy, sw, sh, small ? [1, 2, 1.5, 160, 110] : [1400, 0.7, 320, 220, 160, 110], 3)) break;
    }
  }

  // 2. Codes drawn any other way (CSS backgrounds, frames, part of a larger
  //    picture): overlapping tiles of three sizes, because several codes in
  //    one zone confuse the reader. 3. The whole view, for a very large code.
  const m = Math.min(W, H);
  for (const f of [0.62, 0.34, 1]) {
    const tile = Math.max(220, Math.round(m * f));
    const step = Math.round(tile / 2);
    for (let ty = 0; ty < H - step / 2 && !spent(); ty += step) {
      for (let tx = 0; tx < W - step / 2 && !spent(); tx += step) {
        const tw = Math.min(tile, W - tx), th = Math.min(tile, H - ty);
        take(tx, ty, tw, th, tile < 420 ? [1, 1.6] : [700, 380], 2);
      }
    }
  }
  take(0, 0, W, H, [1800, 1000], 3);

  const codes = found.map((r) => ({ text: r.text, x: r.x / k, y: r.y / k, width: r.w / k, height: r.h / k }));
  if (codes.length === 1) await chrome.storage.local.set({ lastQrResult: { text: codes[0].text, timestamp: Date.now() } });
  return { ok: true, codes };
}

// jsQR a besoin d'une petite "zone tranquille" (marge claire) autour du code
// pour le reconnaître — une sélection à la souris trop précise sur les bords
// noirs suffit à faire échouer la lecture, même sur un code parfaitement
// valide. On retente avec une marge croissante avant d'abandonner.
//
// jsQR.locateOnly (patch WorkBox dans lib/jsQR.js) vérifie juste la présence
// des 3 carrés de repérage, sans exiger un décodage complet réussi — ça sert
// à distinguer une sélection vide d'un vrai QR code présent mais abîmé/invalide.
function tryDecodeWithPadding(bitmap, rect, dpr) {
  if (typeof jsQR !== 'function') return { text: null, foundPattern: false };

  const paddings = [0, 0.25, 0.6];
  let foundPattern = false;

  for (const padRatio of paddings) {
    const padX = rect.width * padRatio;
    const padY = rect.height * padRatio;

    const x0 = Math.max(0, rect.x - padX);
    const y0 = Math.max(0, rect.y - padY);
    const x1 = rect.x + rect.width + padX;
    const y1 = rect.y + rect.height + padY;

    const sx = Math.round(x0 * dpr);
    const sy = Math.round(y0 * dpr);
    const sw = Math.min(bitmap.width - sx, Math.round((x1 - x0) * dpr));
    const sh = Math.min(bitmap.height - sy, Math.round((y1 - y0) * dpr));
    if (sw <= 0 || sh <= 0) continue;

    const result = decodeAtScales(bitmap, sx, sy, sw, sh);
    if (result.text) return result;
    if (result.foundPattern) foundPattern = true;
  }
  return { text: null, foundPattern };
}

// jsQR analyse l'image par blocs fixes de 8x8 pixels pour calculer le
// seuil noir/blanc de chaque zone. Sur une capture haute résolution d'un QR
// stylisé en points, un bloc de 8px peut chevaucher un point ET l'espace
// blanc qui l'entoure, ce qui fausse la lecture — alors qu'un module carré
// classique remplit tout l'espace et pose moins ce problème. Redimensionner
// vers le bas moyenne cette texture en un niveau de gris par module et
// résout souvent le cas (vérifié sur un vrai QR code à points avec logo :
// échec à pleine résolution, lecture correcte une fois réduit).
function decodeAtScales(bitmap, sx, sy, sw, sh) {
  const nativeLongSide = Math.max(sw, sh);
  const scaleTargets = [nativeLongSide, 220, 160, 110].filter((t, i) => i === 0 || t < nativeLongSide);
  let foundPattern = false;

  // On essaie TOUTES les échelles avant d'abandonner — un décodage réussi à
  // une petite échelle ne doit pas être court-circuité juste parce que les
  // repères ont été vus à une échelle plus grande.
  for (const targetLongSide of scaleTargets) {
    const scale = targetLongSide / nativeLongSide;
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) return { text: code.data, foundPattern: true };

    if (!foundPattern && typeof jsQR.locateOnly === 'function') {
      foundPattern = jsQR.locateOnly(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    }
  }
  return { text: null, foundPattern };
}

let WORKBOX_DEBUG = false;
chrome.storage.local.get('debugMode', (data) => { WORKBOX_DEBUG = data.debugMode === true; });
chrome.storage.onChanged.addListener((changes) => { if (changes.debugMode) WORKBOX_DEBUG = changes.debugMode.newValue === true; });
function debugLog(...args) { if (WORKBOX_DEBUG) console.log(...args); }

// Le minuteur écrit son état dans le storage à chaque changement — on se cale
// dessus directement plutôt que de dépendre uniquement du message TMR_SCHEDULE,
// qui peut se perdre si le service worker était en train de s'endormir.
function syncTimerAlarm(st) {
  if (st && st.running && st.endTime) {
    chrome.alarms.create('workboxTimerDone', { when: st.endTime });
  } else {
    chrome.alarms.clear('workboxTimerDone');
  }
}
// Pomodoro: same idea, one alarm per step. When it fires with the popup closed,
// the worker itself moves to the next step and announces it.
const POMO_MAX_STEPS = 12, POMO_MIN_SEC = 5; // same limits as the popup
// Returns a cleaned copy of a running state, or null when it cannot be run
// (old storage format, empty or corrupted steps).
function pomoNormalize(st) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.steps)) return null;
  const steps = st.steps.filter((s) => s && typeof s === 'object').slice(0, POMO_MAX_STEPS)
    .map((s) => Object.assign({}, s, { sec: Math.max(POMO_MIN_SEC, parseInt(s.sec, 10) || 0) }));
  if (!steps.length) return null;
  const idx = st.idx == null ? 0 : st.idx;
  if (!Number.isInteger(idx) || idx < 0 || idx >= steps.length) return null;
  if (typeof st.endTime !== 'number' || !isFinite(st.endTime) || st.endTime <= 0) return null;
  return Object.assign({}, st, { steps, idx });
}
// An unusable running state is written back as stopped: re-arming an alarm on
// its stale endTime would fire at once, again and again.
function pomoStop(st) {
  chrome.alarms.clear('workboxPomoStep');
  return chrome.storage.local.set({ pomoState: Object.assign({}, st, { running: false, endTime: 0, remaining: 0 }) });
}
function syncPomoAlarm(st) {
  if (!st || !st.running) { chrome.alarms.clear('workboxPomoStep'); return; }
  const ok = pomoNormalize(st);
  if (ok) chrome.alarms.create('workboxPomoStep', { when: ok.endTime });
  else pomoStop(st);
}
// The popup plays its own sound while it is open, a notification would double it.
let audioRetry = { idx: -1, ts: 0 };
async function pomoPopupOpen() {
  if (!chrome.runtime.getContexts) return false;
  try {
    const ctxs = await chrome.runtime.getContexts({ contextTypes: ['POPUP', 'TAB'] });
    return ctxs.some((c) => (c.documentUrl || '').split(/[?#]/)[0].endsWith('/popup/popup.html'));
  } catch (e) { return false; }
}
// Returns false when the sequence is over (last step, loop off).
function pomoAdvance(s, now) {
  const late = now - s.endTime > 60000;
  let i = (s.idx || 0) + 1;
  if (i >= s.steps.length) {
    if (!s.loop) { s.running = false; s.idx = 0; s.endTime = 0; s.remaining = 0; return false; }
    i = 0;
  }
  s.idx = i;
  s.endTime = (late ? now : s.endTime) + Math.max(POMO_MIN_SEC, parseInt(s.steps[i].sec, 10) || 0) * 1000;
  return true;
}
chrome.storage.local.get('pomoState', (data) => syncPomoAlarm(data.pomoState));
chrome.storage.local.get('tmrState', (data) => syncTimerAlarm(data.tmrState));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tmrState) syncTimerAlarm(changes.tmrState.newValue);
  if (area === 'local' && changes.pomoState) syncPomoAlarm(changes.pomoState.newValue);
});

// Site tags that older versions stuck on links (GitHub, YouTube, Spotify...). They
// are gone: a link is just a Link, and the popup gives a site its own filter, with
// its icon and name, once three links come from it. Existing items are cleaned.
const LEGACY_SITE_CATS = [
  '🐙 GitHub', '🎵 Spotify', '🐦 Twitter / X', '📘 Facebook', '📸 Instagram', '🎬 TikTok',
  '📺 YouTube', '💼 LinkedIn', '🗣️ Reddit', '📌 Pinterest', '👻 Snapchat', '💬 WhatsApp',
  '✈️ Telegram', '🧵 Threads', '🎮 Discord', '🎮 Twitch', '🎨 Figma', '📄 Google Drive'
];
// Returns true when something was removed. A link also loses the "Code" tag that
// only Stack Overflow links used to get (text that is code is never a link).
function stripLegacySiteTags(items) {
  let changed = false;
  for (const it of items || []) {
    if (!it || typeof it !== 'object') continue;
    const was = Array.isArray(it.category) ? it.category : (typeof it.category === 'string' ? [it.category] : null);
    if (!was) continue;
    const isLink = was.includes('🔗 Link');
    const kept = was.filter((c) => !LEGACY_SITE_CATS.includes(c) && !(isLink && c === '💻 Code'));
    if (kept.length === was.length) continue;
    it.category = kept.length ? kept : ['🔗 Link'];
    changed = true;
  }
  return changed;
}

// Devine la catégorie d'un texte copié. Renvoie un tableau car un lien
// peut être à la fois "Lien" + "Vidéo" par exemple.
function detectType(text, inputType) {
  const t = (text || '').trim();
  if (!t) return ['📝 Text'];

  let cats = [];

  // Le navigateur nous dit parfois directement le type de champ d'origine,
  // on lui fait confiance avant de deviner avec des regex
  if (inputType === 'password') return ['🔑 Password', '🔒 Private'];
  if (inputType === 'email') return ['✉️ Email', '🔒 Private'];
  if (inputType === 'tel') return ['📞 Phone', '🔒 Private'];

  const isLink = /^(https?|ftp):\/\/[^\s]{4,}/i.test(t) || /^www\.[^\s]{4,}/i.test(t) || /^[a-zA-Z0-9-]{2,}\.(com|fr|org|net|io|dev|app|co|uk|eu)(\/([\S]*))?$/i.test(t);

  if (isLink) {
    cats.push('🔗 Link');

    if (/(?:youtube\.com\/(?:watch|shorts|v|embed|playlist)|youtu\.be\/|tiktok\.com\/.*\/video\/)/i.test(t) || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(t)) {
      cats.push('🎥 Video');
    } else if (/\.(jpeg|jpg|gif|png|webp|svg|bmp|ico)(\?.*)?$/i.test(t)) {
      cats.push('🖼️ Image');
    } else if (/youtube\.com\/post\//i.test(t)) {
      cats.push('📝 Text');
    }

    if (/\.(pdf|docx?|xlsx?|pptx?|txt|csv)(\?.*)?$/i.test(t)) cats.push('📄 Document');

    return cats;
  }

  if (/^#(?:[0-9a-fA-F]{3}){1,2}$/i.test(t) || /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(t) || /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/i.test(t) || /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/i.test(t)) {
    return ['🎨 Color'];
  }

  const apiKeyPatterns = [
    /^sk-[a-zA-Z0-9]{20,}$/,              // OpenAI
    /^sk-proj-[a-zA-Z0-9_-]{40,}$/,       // OpenAI project key
    /^ghp_[a-zA-Z0-9]{36}$/,              // GitHub PAT
    /^gho_[a-zA-Z0-9]{36}$/,              // GitHub OAuth
    /^github_pat_[a-zA-Z0-9_]{22,}$/,     // GitHub fine-grained PAT
    /^xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+$/,  // Slack bot token
    /^xoxp-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+$/, // Slack user token
    /^AIza[0-9a-zA-Z_-]{35}$/,            // Google API key
    /^Bearer\s+[a-zA-Z0-9._\-]+$/,
    /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./, // JWT
    /^AKIA[0-9A-Z]{16}$/,                 // AWS access key
    /^pk_(test|live)_[a-zA-Z0-9]{24,}$/,   // Stripe publishable key
    /^sk_(test|live)_[a-zA-Z0-9]{24,}$/,   // Stripe secret key
    /^SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}$/, // SendGrid
  ];
  if (apiKeyPatterns.some(p => p.test(t))) {
    return ['🔐 API Key', '🔒 Private'];
  }

  let isPrivate = false;

  if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/i.test(t)) {
    cats.push('✉️ Email');
    isPrivate = true;
  } else if (/^(\+|0)[0-9\s\-().]{8,18}$/.test(t) && (t.match(/\d/g) || []).length >= 9) {
    cats.push('📞 Phone');
    isPrivate = true;
  } else if (t.length >= 8 && t.length <= 64 && !/\s/.test(t)) {
    const hasUpper = /[A-Z]/.test(t);
    const hasLower = /[a-z]/.test(t);
    const hasDigit = /[0-9]/.test(t);
    const hasSpecial = /[^A-Za-z0-9]/.test(t);
    const complexity = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);

    // Entropie de Shannon — un mot de passe correct dépasse ~3.2, un mot
    // du dictionnaire ou un chemin de fichier reste en dessous
    const freq = {};
    for (const c of t) freq[c] = (freq[c] || 0) + 1;
    const len = t.length;
    const entropy = -Object.values(freq).reduce((sum, f) => {
      const p = f / len;
      return sum + p * Math.log2(p);
    }, 0);

    const isCommonWord = /^[A-Z][a-z]+\d+[!.]?$/.test(t); // "Hello123!"
    const isFilePath = /^[A-Za-z]:\\|^\/[a-z]/i.test(t);
    const isVersion = /^v?\d+\.\d+\.\d+/i.test(t);

    if (complexity >= 3 && entropy > 3.2 && !isCommonWord && !isFilePath && !isVersion) {
      cats.push('🔑 Password');
      isPrivate = true;
    }
  }

  if (isPrivate) {
    cats.push('🔒 Private');
    return cats;
  }

  const datePatterns = [
    /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/,
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/,
    /^\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}$/i,
    /^\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i,
    /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i,
    /^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$/i,
  ];
  if (datePatterns.some(p => p.test(t))) {
    return ['📅 Date'];
  }

  if (/^\s*[€$£¥₹]\s*[\d\s.,]+\s*$/.test(t) || /^\s*[\d\s.,]+\s*[€$£¥₹]\s*$/.test(t) || /^\d{1,3}([.,]\d{3})*([.,]\d{2})\s*€$/.test(t) || /^\$\s?\d+([.,]\d{1,2})?$/.test(t)) {
    return ['💰 Price'];
  }

  // Détection de langage de code par score : chaque motif ajoute des points,
  // on garde le langage le plus probable si le score dépasse 40
  let codeType = null;
  let maxScore = 0;
  const checkLang = (lang, score) => {
    if (score > maxScore) { maxScore = score; codeType = lang; }
  };

  let jsScore = 0;
  if (t.includes('function ') || t.includes('const ') || t.includes('let ')) jsScore += 25;
  if (t.includes('=>') || t.includes('->')) jsScore += 20;
  if (t.includes('import ') || t.includes('require(')) jsScore += 25;
  if (/\bconsole\.(log|warn|error)\b/.test(t)) jsScore += 30;
  if (/\basync\s|await\s/.test(t)) jsScore += 20;
  checkLang('💻 JavaScript', jsScore);

  let pyScore = 0;
  if (/\bdef\s+\w+\s*\(/.test(t) || /\bclass\s+\w+.*:/.test(t)) pyScore += 40;
  if (/\bfrom\s+\w+\s+import\b/.test(t)) pyScore += 35;
  if (/\bself\.\w+/.test(t) || /\belif\b/.test(t) || /\bprint\s*\(/.test(t)) pyScore += 25;
  if (/^\s{4}(def|if|for|while|return|class)\b/m.test(t)) pyScore += 20;
  checkLang('🐍 Python', pyScore);

  let javaScore = 0;
  if (/\b(public|private|protected)\s+(static\s+)?(void|int|String|class|bool)\b/.test(t)) javaScore += 40;
  if (/\bSystem\.(out|err)\.print/.test(t) || /\bConsole\.Write/.test(t)) javaScore += 35;
  if (/\bnamespace\s+\w+/.test(t) || /\b#include\s*</.test(t)) javaScore += 35;
  checkLang('☕ Java/C#', javaScore);

  let htmlScore = 0;
  if (/<!DOCTYPE\s+html>/i.test(t) || /<html[\s>]/i.test(t)) htmlScore += 50;
  if (/<(div|span|p|h[1-6]|a|img|table|form|input|button|section|header|footer)\b/i.test(t) && /<\/\w+>/i.test(t)) htmlScore += 35;
  checkLang('🌐 HTML', htmlScore);

  let cssScore = 0;
  if (/\{[^}]*(?:color|margin|padding|display|font-size|background|border|width|height)\s*:/i.test(t)) cssScore += 35;
  if (/@media\s|@keyframes\s|@import\s/.test(t)) cssScore += 30;
  if (/\.[a-zA-Z][\w-]*\s*\{/.test(t) || /#[a-zA-Z][\w-]*\s*\{/.test(t)) cssScore += 25;
  checkLang('🎨 CSS', cssScore);

  let sqlScore = 0;
  if (/\bSELECT\s+.+\s+FROM\s+/i.test(t)) sqlScore += 45;
  if (/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(t)) sqlScore += 45;
  checkLang('🗄️ SQL', sqlScore);

  let shScore = 0;
  if (/^#!\/bin\/(bash|sh|zsh)/.test(t)) shScore += 50;
  if (/\b(sudo|chmod|chown|grep|awk|sed|curl|wget|apt|npm|pip|yarn)\s/.test(t)) shScore += 25;
  checkLang('🐚 Shell', shScore);

  let jsonScore = 0;
  if (/^\{[\s\S]*\}$/.test(t) || /^\[[\s\S]*\]$/.test(t)) {
    try { JSON.parse(t); jsonScore += 60; } catch (e) { }
  }
  checkLang('📦 JSON', jsonScore);

  let yamlScore = 0;
  if (/^[\w-]+:\s+.+$/m.test(t) && (t.match(/^[\w-]+:\s/gm) || []).length >= 2) yamlScore += 30;
  checkLang('📄 YAML', yamlScore);

  if (maxScore >= 40) return [codeType];

  if (/^-?[\d]+([.,][\d]+)?$/.test(t)) {
    cats.push('🔢 Number');
    return cats;
  }

  const addressPatterns = [
    /\d+[\s,]+(?:rue|avenue|boulevard|impasse|allée|chemin|place|route|passage|cours)\s/i,
    /\b\d{5}\b\s+[A-ZÀ-Ü]/, // code postal FR + ville
    /\b\d{4}\b\s+[A-ZÀ-Ü]/, // code postal BE/CH
  ];
  if (addressPatterns.some(p => p.test(t)) && t.length < 300) {
    return ['📍 Address'];
  }

  cats.push('📝 Text');
  return cats;
}

const WB_BUILD = 'tiers-2026-10-05';
let clipboardQueue = Promise.resolve();
const captureParts = new Map();   // id -> { parts, got, ts } for texts sent in several parts

// Cœur de la capture presse-papier, partagé entre l'écoute du copier-coller
// (content.js) et l'ajout manuel depuis le menu clic droit — mêmes règles de
// dédoublonnage, de limite et de catégorisation automatique dans les deux cas.
// A text over the size limit is never saved: the person is told in the popup banner
// (stored here, shown by popup.js) and by a system notification.
let tooLargeQueue = Promise.resolve();
function flagTooLarge(chars) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'WorkBox - Text too large',
    message: `This text has ${Number(chars).toLocaleString('en-US')} characters. The limit is ${WBBig.MAX_CHARS.toLocaleString('en-US')}, so it was not saved.`
  });
  // Small history of every refused text (date to the second): the popup compares it
  // with what it has already told the person, so no refusal goes unnoticed.
  tooLargeQueue = tooLargeQueue.then(() => new Promise((done) => {
    chrome.storage.local.get('wbTooLargeLog', (r) => {
      const log = Array.isArray(r && r.wbTooLargeLog) ? r.wbTooLargeLog : [];
      const last = log.length ? log[log.length - 1].ts : 0;
      log.push({ ts: Math.max(Date.now(), last + 1), chars });
      chrome.storage.local.set({ wbTooLargeLog: log.slice(-20) }, done);
    });
  }));
}

// Private sites: nothing is saved from a page whose address is in the user's list
// (Settings > Private sites). The page is the sender's tab, or the tab in front
// when the text comes from the clipboard reader.
function hostIsListed(url, list) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  return list.some((d) => host === d || host.endsWith('.' + d));
}
function wbHash(s) {
  let h = 2166136261 >>> 0;
  const step = s.length > 200000 ? 7 : 1;
  for (let i = 0; i < s.length; i += step) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36) + ':' + s.length;
}
// fingerprints of texts copied on private sites, kept for the session
async function rememberPrivate(h) {
  try {
    const { wbPrivHashes } = await chrome.storage.session.get('wbPrivHashes');
    const list = (Array.isArray(wbPrivHashes) ? wbPrivHashes : []).filter((x) => x !== h);
    list.unshift(h);
    await chrome.storage.session.set({ wbPrivHashes: list.slice(0, 40) });
  } catch (e) { }
}
// Is this capture coming from a private site?
//  - sent by a page: that page decides
//  - read from the clipboard (no page): blocked if the same text was copied on a private site,
//    or if you are in the browser (window in front) on a private site. A text copied in another
//    app, like a code editor, is kept even when a private site is the open tab behind it.
async function captureBlockedHere(senderTab, text) {
  try {
    const { clipBlacklist } = await chrome.storage.local.get('clipBlacklist');
    if (!Array.isArray(clipBlacklist) || !clipBlacklist.length) return false;
    const h = text ? wbHash(String(text).trim()) : '';
    let blocked = false;
    if (senderTab && senderTab.url) blocked = hostIsListed(senderTab.url, clipBlacklist);
    else {
      const { wbPrivHashes } = await chrome.storage.session.get('wbPrivHashes');
      blocked = !!h && Array.isArray(wbPrivHashes) && wbPrivHashes.includes(h);
      if (!blocked) {
        const win = await chrome.windows.getLastFocused();
        if (win && win.focused) {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          blocked = !!(tab && tab.url && hostIsListed(tab.url, clipBlacklist));
        }
      }
    }
    if (blocked && h) await rememberPrivate(h);
    return blocked;
  } catch (e) { return false; }
}

function captureClipboardText(rawText, inputType, rawLen, manual) {
  return new Promise((resolve) => {
    if (!rawText) { resolve({ status: 'error' }); return; }
    // The limit counts the text as it was copied (spaces and Windows line breaks
    // included), so nothing above it gets in, whatever the way it arrives.
    const copiedChars = Math.max(rawText.length, Number(rawLen) || 0);
    if (copiedChars > WBBig.MAX_CHARS) { flagTooLarge(copiedChars); resolve({ status: 'too_large' }); return; }
    const text = rawText.replace(/\r/g, ''); // évite les doublons \r\n vs \n
    // WorkBox's own backup link holds the whole backup: never keep it in the history
    if (/^workbox-data:\/\//i.test(text.trim())) { resolve({ status: 'ignored' }); return; }
    // The recovery code of the password: it must never end up in the history, even though
    // the person copies it on purpose (the "Copy code" button).
    if (WBCrypto.looksLikeRecoveryCode(text)) { resolve({ status: 'ignored' }); return; }

    // Very long texts are kept compressed apart (see bigtext.js); the list only
    // holds a short preview. `fp` identifies them for duplicate detection.
    const big = WBBig.isBig(text);
    let fp = big ? WBBig.fingerprint(text) : '';
    // A text is recognised by its fingerprint, never by reading the stored list:
    // the list is encrypted and the background never decrypts it.
    const sameItem = (item) => big
      ? !!(item.big && item.big.fp === fp)
      : (fp ? item.fp === fp : (!item.big && String(item.text).replace(/\r/g, '') === text));

    // File d'attente pour sérialiser les écritures storage — deux copies
    // rapprochées ne doivent pas s'écraser l'une l'autre
    clipboardQueue = clipboardQueue.then(() => new Promise(resolveQueue => {
      chrome.storage.local.get(['clipItems'], async (data) => {
        if (chrome.runtime.lastError) { resolve({ status: 'error' }); resolveQueue(); return; }
        try {

        // The vault is protected but this browser session has not been unlocked
        // yet: nothing may be written, because a plaintext entry must never reach
        // the disk. The text waits in memory (chrome.storage.session) and is
        // encrypted the moment the popup is unlocked.
        //
        // init() first, and it matters: a freshly started service worker has not
        // read the settings yet, so isProtected() would answer "false", the whole
        // "wait while locked" branch would be skipped, and the copy would be sent
        // to a save that refuses it — the text would be lost instead of held.
        await WBClip.init();
        if (WBClip.isProtected() && !WBClip.isUnlocked()) {
          const staged = await WBClip.stage({
            text,
            category: detectType(big ? text.slice(0, 20000) : text, inputType),
            timestamp: Date.now(),
            pinned: false,
            len: text.length
          });
          resolve({ status: staged ? 'staged' : 'locked' });
          resolveQueue();
          return;
        }

        if (!big) fp = await WBClip.fingerprintOf(text);
        let clipItems = data.clipItems || [];
        const unpinnedCount = clipItems.filter(i => !i.pinned).length;
        const isDuplicate = clipItems.some(sameItem);

        if (unpinnedCount >= TEXT_LIMIT && !isDuplicate) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'WorkBox - Limit reached',
            message: `You've reached the limit of ${TEXT_LIMIT} saved texts. Delete or pin some to add more.`
          });
          resolve({ status: 'limit_reached' });
          resolveQueue();
          return;
        }

        // Global room (1 GB): the count limit above does not protect the disk from a few huge texts
        const usedText = WBBig.textBytes(clipItems);
        if (usedText >= WBBig.QUOTA_TEXT && !isDuplicate) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'WorkBox - Text storage full',
            message: `Your saved texts take ${WBBig.sizeLabel(usedText)}, the maximum is ${WBBig.sizeLabel(WBBig.QUOTA_TEXT)}. Delete some texts to make room (see Settings > Storage).`
          });
          resolve({ status: 'quota_reached' });
          resolveQueue();
          return;
        }

        if (unpinnedCount === Math.round(TEXT_LIMIT * 0.8) - 1 && !isDuplicate) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'WorkBox - Warning (80%)',
            message: `You've reached 80% of your text storage capacity (${Math.round(TEXT_LIMIT * 0.8)}/${TEXT_LIMIT}). Consider pinning your favorites.`
          });
        }

        // On retire l'ancienne occurrence pour que l'élément remonte en haut,
        // en gardant son statut épinglé si elle en avait un
        const existingItem = clipItems.find(sameItem);
        clipItems = clipItems.filter(item => !sameItem(item));

        // A re-copied item keeps its tags (Private, Password, custom ones):
        // auto-detection must not undo what the user chose.
        const keptCategory = existingItem && Array.isArray(existingItem.category) && existingItem.category.length
          ? existingItem.category : null;
        const autoCategory = keptCategory || detectType(big ? text.slice(0, 20000) : text, inputType);
        // a text already stored apart keeps its compressed body; a new one gets one
        const entry = big
          ? (existingItem && existingItem.big ? { text: existingItem.text, big: existingItem.big } : await WBBig.make(text))
          : { text };
        clipItems.unshift({
          ...entry,
          pinned: existingItem ? existingItem.pinned : false,
          category: autoCategory,
          timestamp: Date.now()
        });

        const addedBytes = (entry.big ? entry.big.bytes : text.length);
        if (usedText < WBBig.QUOTA_TEXT * 0.8 && usedText + addedBytes >= WBBig.QUOTA_TEXT * 0.8) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'WorkBox - Warning (80%)',
            message: `Your saved texts use 80% of their room (${WBBig.sizeLabel(usedText + addedBytes)} of ${WBBig.sizeLabel(WBBig.QUOTA_TEXT)}). See Settings > Storage.`
          });
        }

        const pinnedItems = clipItems.filter(i => i.pinned);
        const unpinnedItems = clipItems.filter(i => !i.pinned).slice(0, TEXT_LIMIT);
        clipItems = [...pinnedItems, ...unpinnedItems].sort((a, b) => b.timestamp - a.timestamp);

        // Through the vault: what is already encrypted is passed through, the new
        // entry is encrypted here, and a failed write is reported instead of
        // being announced as a save.
        WBClip.save(clipItems).then((res) => {
          resolve({ status: res.ok ? 'saved' : 'error' });
          resolveQueue();
          if (res.ok) runTiers({ texts: true });
        });
        } catch (err) { resolve({ status: 'error' }); resolveQueue(); }
      });
    }));
  });
}

// Clipboard monitoring switch. On by default; turned off from Settings > Privacy
// or by refusing the first-run notice. Cached here because every capture checks
// it, and kept true to the stored value by the listener below. Enforced in the
// background, so it holds whichever side sent the copy — and the offscreen
// document stops reading the clipboard as well (see offscreen.js): a switch that
// keeps reading but stops saving would not be honest.
const WATCH = { on: true };
chrome.storage.local.get('wbClipWatch', (d) => { void chrome.runtime.lastError; WATCH.on = !(d && d.wbClipWatch === false); pushWatchToOffscreen(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.wbClipWatch) {
    WATCH.on = changes.wbClipWatch.newValue !== false;
    pushWatchToOffscreen();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type || message.action) {
    // lets the popup check that both halves of the extension run the same code
    case 'WB_BUILD': {
      sendResponse({ build: WB_BUILD, max: WBBig.MAX_CHARS, tier: TIER_SIZE });
      return false;
    }

    // Sent by the popup right after the vault is unlocked: whatever was copied
    // before that moment waited in memory (see WBClip.stage) and is stored now,
    // through the normal path, so limits, duplicates and quotas still apply.
    case 'WB_FLUSH_STAGED': {
      (async () => {
        // The popup has just unlocked: pick up the key it put in the session
        // store, otherwise these items would be staged all over again.
        await WBClip.refresh();
        const staged = await WBClip.takeStaged();
        let kept = 0;
        for (const it of staged) {
          if (!it || typeof it.text !== 'string' || !it.text.trim()) continue;
          try {
            await captureClipboardText(it.text, '', it.text.length, true);
            kept++;
          } catch (e) { }
        }
        return kept;
      })().then((kept) => sendResponse({ flushed: kept }), () => sendResponse({ flushed: 0 }));
      return true;
    }

    case 'RESET_OFFSCREEN': {
      // the music "Reload" button: a brand new player document
      (async () => {
        try { await chrome.offscreen.closeDocument(); } catch (e) { }
        await setupOffscreen();
      })().then(() => sendResponse({ success: true }), (e) => sendResponse({ success: false, error: e && e.message }));
      return true;
    }

    case 'CLIP_DETECT_TYPES': {
      // same automatic tags as for a text copied on a page, for imported items
      const texts = Array.isArray(message.texts) ? message.texts.slice(0, 5000) : [];
      sendResponse({ types: texts.map((t) => { try { return detectType(String(t)); } catch (e) { return ['📝 Text']; } }) });
      return false;
    }

    case 'CREATE_OFFSCREEN': {
      setupOffscreen()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }

    case 'REFRESH_EXCHANGE_RATES': {
      fetchExchangeRates(true)
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }

    case 'AI_ENGINE_SEEN': {
      // sent by the content script on a search page; the engine is read from
      // the sender's own address, never from the message
      const key = sender.tab && sender.frameId === 0 ? aiEngineOfUrl(sender.url || sender.tab.url || '') : null;
      if (key) aiNoteEngine(key);
      return false;
    }

    case 'AI_ENGINE_SCAN': {
      aiScanTabs();
      return false;
    }


    case 'AUDIO_ERROR': {
      // the popup handles this itself when it is open
      (async () => {
        if (await pomoPopupOpen()) return;
        const data = await chrome.storage.local.get(['savedPlaylist', 'savedCurrentIndex']);
        const list = data.savedPlaylist || [], at = data.savedCurrentIndex;
        if (!list.length || !(at >= 0) || !list[at]) return;
        const now = Date.now();
        // same track failing again within a minute: go to the next one instead
        const again = audioRetry.idx === at && now - audioRetry.ts < 60000;
        const next = again ? (at + 1) % list.length : at;
        if (again && list.length < 2) return;
        audioRetry = { idx: next, ts: now };
        if (next !== at) await chrome.storage.local.set({ savedCurrentIndex: next });
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'PLAY', id: list[next].id, dataUrl: list[next].dataUrl }).catch(() => { });
      })();
      return false;
    }

    case 'AUDIO_TRACK_ENDED': {
      chrome.storage.local.get(['savedPlaylist', 'savedCurrentIndex', 'savedRepeatMode'], (data) => {
        let playlist = data.savedPlaylist || [];
        if (!playlist.length) return;
        let currentIndex = data.savedCurrentIndex !== undefined ? data.savedCurrentIndex : -1;
        const rep = data.savedRepeatMode;   // 'one' | 'all' | 'off' (true/false in older versions)
        let nextIndex = rep === 'one' && currentIndex >= 0 && currentIndex < playlist.length ? currentIndex : currentIndex + 1;
        if (nextIndex >= playlist.length) {
          if (rep === true || rep === 'all') {
            nextIndex = 0;
          } else {
            chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
            chrome.storage.local.set({ savedCurrentIndex: -1 });
            return;
          }
        }
        chrome.storage.local.set({ savedCurrentIndex: nextIndex });
        chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'PLAY',
          id: playlist[nextIndex].id,
          dataUrl: playlist[nextIndex].dataUrl
        }).catch(() => { });
      });
      return true;
    }

    case 'private_copy': {
      if (typeof message.h === 'string') rememberPrivate(message.h);
      return false;
    }

    case 'clipboard_capture': {
      if (!message.text) return false;
      if (!WATCH.on && !message.manual) { sendResponse({ status: 'off' }); return false; }
      (message.manual ? Promise.resolve(false) : captureBlockedHere(sender.tab, message.text)).then((blocked) => {
        if (blocked) sendResponse({ status: 'ignored_site' });
        else captureClipboardText(message.text, message.inputType, message.rawLen, !!message.manual).then(sendResponse);
      });
      return true;
    }

    // a very long text arrives in several parts (see sendCapture): rebuilt here
    case 'clipboard_capture_part': {
      if (!WATCH.on && !message.manual) {
        captureParts.delete(message.id);
        sendResponse({ status: 'off' });
        return false;
      }
      // more than two parts of 4 million characters is already over the limit: refuse
      // at once, before the rest is sent and rebuilt in memory
      if (message.total >= 3 || Number(message.chars) > WBBig.MAX_CHARS) {
        captureParts.delete(message.id);
        flagTooLarge(Number(message.chars) || message.total * 4000000);
        sendResponse({ status: 'too_large' });
        return false;
      }
      const now = Date.now();
      for (const [k, v] of captureParts) if (now - v.ts > 120000) captureParts.delete(k);
      let entry = captureParts.get(message.id);
      if (!entry) { entry = { parts: [], got: 0, ts: now }; captureParts.set(message.id, entry); }
      if (typeof message.part !== 'string' || entry.parts[message.index] !== undefined) { sendResponse({ status: 'error' }); return false; }
      entry.parts[message.index] = message.part;
      entry.got++;
      if (entry.got < message.total) { sendResponse({ status: 'part' }); return false; }
      captureParts.delete(message.id);
      const full = entry.parts.join('').trim();
      if (!full) { sendResponse({ status: 'error' }); return false; }
      (message.manual ? Promise.resolve(false) : captureBlockedHere(sender.tab, full)).then((blocked) => {
        if (blocked) sendResponse({ status: 'ignored_site' });
        else captureClipboardText(full, message.inputType, message.chars, !!message.manual).then(sendResponse);
      });
      return true;
    }

    case 'CTX_KIND': {
      if (sender.tab && Object.prototype.hasOwnProperty.call(WB_MENU_GROUPS, message.kind)) {
        wbMenuKind = message.kind;
        if (message.kind === 'image' && typeof message.src === 'string') wbQrOn = !!qrImageSeen.get(message.src);
        wbMenuApply();
      }
      return false;
    }

    case 'QR_IMG_HOVER': {
      if (sender.tab && sender.frameId === 0 && typeof message.src === 'string') qrImageHover(message, sender.tab);
      return false;
    }

    case 'QR_FIND_ALL': {
      if (!sender.tab || !sender.tab.id || sender.frameId !== 0) return false;
      qrFindAll(message, sender.tab).then(sendResponse, () => sendResponse({ ok: false }));
      return true;
    }

    case 'QR_PICKED': {
      if (sender.tab && typeof message.text === 'string' && message.text.length <= 8000) {
        chrome.storage.local.set({ lastQrResult: { text: message.text, timestamp: Date.now() } });
      }
      return false;
    }

    case 'QR_AREA_SELECTED': {
      if (!sender.tab || !sender.tab.id) return false;
      handleQrAreaSelection(message.rect, message.dpr || 1, sender.tab);
      return false; // le résultat repart vers l'onglet via QR_RESULT, pas par sendResponse
    }

    case 'QR_OPEN_LINK': {
      const url = normalizeQrUrl(message.url);
      if (url) chrome.tabs.create({ url }).catch(() => {});
      return false;
    }

    case 'clipboard_image': {
      if (!message.dataUrl) return false;
      // Images come from a copy too: the same switch applies (a manual paste is
      // a deliberate action and goes through).
      if (!WATCH.on && !message.manual) return false;

      compressImageToJpeg(message.dataUrl).then(({ dataUrl, originalSize, compressedSize }) => {
        const prefix = dataUrl.substring(0, 5000); // suffisant pour détecter un doublon sans comparer le dataURL entier

        clipboardQueue = clipboardQueue.then(() => new Promise(resolveQueue => {
          chrome.storage.local.get(['clipboardImages'], (res) => {
            let clipboardImages = res.clipboardImages || [];
            const unpinnedImgsCount = clipboardImages.filter(i => !i.pinned).length;
            const isImgDuplicate = clipboardImages.some(img => img.dataUrl.substring(0, 5000) === prefix);

            if (unpinnedImgsCount >= IMAGE_LIMIT && !isImgDuplicate) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'WorkBox - Limit reached',
                message: `You've reached the limit of ${IMAGE_LIMIT} saved images. Export them as ZIP then clear the history (Settings), or pin your favorites to add more.`
              });
              sendResponse?.({ status: 'limit_reached' });
              resolveQueue();
              return;
            }

            const usedImg = WBBig.imageBytes(clipboardImages);
            if (usedImg >= WBBig.QUOTA_IMAGES && !isImgDuplicate) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'WorkBox - Image storage full',
                message: `Your saved images take ${WBBig.sizeLabel(usedImg)}, the maximum is ${WBBig.sizeLabel(WBBig.QUOTA_IMAGES)}. Export them as ZIP then delete some (see Settings > Storage).`
              });
              sendResponse?.({ status: 'quota_reached' });
              resolveQueue();
              return;
            }
            const imgBytes = Math.floor((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75);
            if (usedImg < WBBig.QUOTA_IMAGES * 0.8 && usedImg + imgBytes >= WBBig.QUOTA_IMAGES * 0.8) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'WorkBox - Warning (80%)',
                message: `Your saved images use 80% of their room (${WBBig.sizeLabel(usedImg + imgBytes)} of ${WBBig.sizeLabel(WBBig.QUOTA_IMAGES)}). See Settings > Storage.`
              });
            }

            if (unpinnedImgsCount === Math.round(IMAGE_LIMIT * 0.8) - 1 && !isImgDuplicate) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'WorkBox - Warning (80%)',
                message: `You've reached 80% of your image storage capacity (${Math.round(IMAGE_LIMIT * 0.8)}/${IMAGE_LIMIT}). Consider exporting as ZIP or pinning your favorites.`
              });
            }

            const existingImg = clipboardImages.find(img => img.dataUrl.substring(0, 5000) === prefix);
            clipboardImages = clipboardImages.filter(img => img.dataUrl.substring(0, 5000) !== prefix);
            clipboardImages.unshift({ dataUrl, pinned: existingImg ? existingImg.pinned : false, timestamp: Date.now(), originalSize, compressedSize });

            const pinnedImgs = clipboardImages.filter(i => i.pinned);
            const unpinnedImgs = clipboardImages.filter(i => !i.pinned).slice(0, IMAGE_LIMIT);
            clipboardImages = [...pinnedImgs, ...unpinnedImgs].sort((a, b) => b.timestamp - a.timestamp);

            chrome.storage.local.set({ clipboardImages }, () => {
              sendResponse?.({ status: 'image_saved' });
              resolveQueue();
              runTiers({ images: true });
            });
          });
        }));
      });
      return true; // garde le canal sendResponse ouvert pendant la compression asynchrone
    }
  }
  return false;
});

// Taux de change via exchangerate-api.com (API publique, pas de clé requise).
// L'extension utilisait CoinCap avant, mais son API v2 gratuite a fermé en juillet 2026
// (le domaine ne résout même plus) — d'où des taux figés sur les valeurs de secours.
async function fetchExchangeRates(force = false) {
  try {
    const data = await chrome.storage.local.get(['exchangeRates', 'lastExchangeFetch']);
    const now = Date.now();

    if (!force && data.lastExchangeFetch && (now - data.lastExchangeFetch < 3600000)) {
      return; // rafraîchi il y a moins d'une heure
    }

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const json = await res.json();
        const rates = {};
        for (const [code, rate] of Object.entries(json.rates || {})) {
          if (typeof rate === 'number' && isFinite(rate)) rates[code] = rate;
        }
        if (json.result === 'success' && Object.keys(rates).length > 5) {
          // The source publishes one set of rates per day: keep its own date, so the popup can
          // say how old the numbers really are (lastExchangeFetch is only when we asked).
          const asOf = Number(json.time_last_update_unix) > 0 ? Number(json.time_last_update_unix) * 1000 : null;
          await chrome.storage.local.set({ exchangeRates: rates, lastExchangeFetch: now, exchangeRatesAsOf: asOf, exchangeRatesOk: true });
          debugLog('[WorkBox] Exchange rates updated');
          return rates;
        }
      } else {
        console.error(`[WorkBox] exchangerate-api responded ${res.status}`);
      }
    } catch (e) {
      console.error('[WorkBox] Failed to fetch exchange rates:', e);
    }

    // La requête a échoué : on le note pour que le popup puisse prévenir que les taux affichés
    // sont peut-être périmés, plutôt que de laisser croire que tout est à jour
    await chrome.storage.local.set({ exchangeRatesOk: false });
  } catch (err) {
    console.error('fetchExchangeRates:', err);
  }
}

chrome.runtime.onStartup.addListener(() => fetchExchangeRates(false));
chrome.runtime.onInstalled.addListener(() => fetchExchangeRates(true));

// Menu clic droit sur une sélection de texte : accès direct à trois outils
// sans passer par le popup.
//
// onInstalled et onStartup peuvent se déclencher tous les deux dans la même
// session (mise à jour, puis démarrage). Les deux passes appellent removeAll()
// avant de recréer : entrelacées, la seconde recréation retombe sur les
// identifiants de la première, et Chrome refuse chaque élément avec
// "Cannot create item with duplicate id workbox-…". D'où la garde ci-dessous :
// une seule passe par vie de service worker. Les callbacks lisent en plus
// lastError, sinon Chrome remonte "Unchecked runtime.lastError" pour chaque
// création refusée.
let ctxMenusDone = false;
function createContextMenus() {
  if (ctxMenusDone) return;
  ctxMenusDone = true;
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) { ctxMenusDone = false; return; }
    const quiet = () => { void chrome.runtime.lastError; };
    const add = (id, title, contexts) => chrome.contextMenus.create({ id, parentId: 'workbox-root', title, contexts }, quiet);
    chrome.contextMenus.create({ id: 'workbox-root', title: 'WorkBox', contexts: ['selection', 'link', 'image', 'page'] }, quiet);
    add('workbox-add-note', 'Add to notes', ['selection']);
    add('workbox-add-clip', 'Copy to clipboard', ['selection']);
    add('workbox-add-todo', 'Create a task', ['selection']);
    add('workbox-sel-qr', 'Create a QR code from this text', ['selection']);
    add('workbox-sel-shortcut', 'Create a text shortcut', ['selection']);
    add('workbox-sel-calc', 'Calculate', ['selection']);
    add('workbox-link-check', 'Check this link', ['link']);
    add('workbox-link-qr', 'Create a QR code of this link', ['link']);
    add('workbox-link-save', 'Save this link', ['link']);
    chrome.contextMenus.create({ id: 'workbox-img-scan', parentId: 'workbox-root', title: 'Scan the QR code in this image', contexts: ['image'], visible: false }, quiet);
    add('workbox-img-compress', 'Compress this image', ['image']);
    add('workbox-img-save', 'Save this image', ['image']);
    add('workbox-page-qr', 'Create a QR code of this page', ['page']);
    add('workbox-page-note', 'Save this page to notes', ['page']);
    add('workbox-page-scan', 'Scan a QR code on this page', ['page']);
  });
}
chrome.runtime.onInstalled.addListener(createContextMenus);
// The menus can be missing after a browser restart (profile restored, extension re-enabled)
chrome.runtime.onStartup.addListener(createContextMenus);

function notifyContextAction(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title, message });
}

// ---- AI-free search: which engine is really used, learnt without opening anything ----
// Chrome gives extensions no way to read the default search engine. Instead
// the content script reports every search page it runs on, and every ten
// minutes the open tabs are looked at too. Purely informative: blocking is
// on for every supported engine at once.
const AI_ENGINE_DOMAIN_MATCHERS_BG = [
  { test: (h) => /(^|\.)google\.[a-z.]+$/i.test(h), key: 'blockAiGoogle' },
  { test: (h) => h === 'search.brave.com', key: 'blockAiBrave' }
];
function aiEngineOfUrl(url) {
  try {
    const u = new URL(url);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.pathname !== '/search') return null;
    const m = AI_ENGINE_DOMAIN_MATCHERS_BG.find((x) => x.test(u.hostname));
    return m ? m.key : null;
  } catch (e) { return null; }
}
async function aiNoteEngine(key) {
  const { aiEngineSeen } = await chrome.storage.local.get('aiEngineSeen');
  // same engine as before: nothing worth a storage write
  if (aiEngineSeen && aiEngineSeen.key === key && Date.now() - aiEngineSeen.ts < 10 * 60 * 1000) return;
  await chrome.storage.local.set({ aiEngineSeen: { key, ts: Date.now() } });
}
async function aiScanTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    let best = null;
    for (const t of tabs) {
      const key = aiEngineOfUrl(t.url || '');
      if (key && (!best || (t.lastAccessed || 0) > best.at)) best = { key, at: t.lastAccessed || 0 };
    }
    if (best) await aiNoteEngine(best.key);
  } catch (e) { }
}

function generateNoteId() {
  return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function genTodoId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// Actions that continue inside the popup leave a short-lived note in storage,
// which the popup picks up when it opens.
async function openPopupWith(pending) {
  await chrome.storage.local.set({ wbPending: Object.assign({ ts: Date.now() }, pending) });
  try {
    await chrome.action.openPopup();
  } catch (e) {
    notifyContextAction('WorkBox', 'Open WorkBox (toolbar icon or Alt+W) to continue.');
  }
}

// Which images are known to hold a QR code (src -> decoded text, or '' for none).
// Filled while the pointer rests on an image, so the menu entry can be hidden
// for images without a code.
const qrImageSeen = new Map();
let qrImageCurrent = '', qrImageLastShot = 0;
// What the last right-click landed on ('' = unknown: Chrome's own context rules apply).
// One click = one group of actions, even for an image inside a link or with text selected.
const WB_MENU_GROUPS = {
  selection: ['workbox-add-note', 'workbox-add-clip', 'workbox-add-todo', 'workbox-sel-qr', 'workbox-sel-shortcut', 'workbox-sel-calc'],
  link: ['workbox-link-check', 'workbox-link-qr', 'workbox-link-save'],
  image: ['workbox-img-compress', 'workbox-img-save'],
  page: ['workbox-page-qr', 'workbox-page-note', 'workbox-page-scan']
};
let wbMenuKind = '', wbQrOn = false;
function wbMenuApply() {
  const set = (id, visible) => chrome.contextMenus.update(id, { visible }, () => { void chrome.runtime.lastError; });
  for (const kind of Object.keys(WB_MENU_GROUPS)) WB_MENU_GROUPS[kind].forEach((id) => set(id, !wbMenuKind || wbMenuKind === kind));
  set('workbox-img-scan', wbQrOn && (!wbMenuKind || wbMenuKind === 'image'));
}
function qrMenuVisible(on) { wbQrOn = !!on; wbMenuApply(); }
async function qrImageHover(msg, tab) {
  const src = msg.src;
  qrImageCurrent = src;
  if (qrImageSeen.has(src)) { qrMenuVisible(!!qrImageSeen.get(src)); return; }
  qrMenuVisible(false);
  if (!msg.scan || !msg.rect) return;
  const now = Date.now();
  if (now - qrImageLastShot < 600) return; // captureVisibleTab is limited to a couple of calls per second
  qrImageLastShot = now;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const dpr = Number(msg.dpr) > 0 ? Number(msg.dpr) : 1, r = msg.rect;
    const sx = Math.max(0, Math.round(r.x * dpr)), sy = Math.max(0, Math.round(r.y * dpr));
    const sw = Math.min(bitmap.width - sx, Math.round(r.width * dpr)), sh = Math.min(bitmap.height - sy, Math.round(r.height * dpr));
    if (sw < 20 || sh < 20) return;
    const text = decodeAtScales(bitmap, sx, sy, sw, sh).text || '';
    // a partly hidden image may hide its code: only remember "none" for a fully visible one
    if (text || msg.whole) {
      qrImageSeen.set(src, text);
      if (qrImageSeen.size > 300) qrImageSeen.delete(qrImageSeen.keys().next().value);
    }
    if (qrImageCurrent === src) qrMenuVisible(!!text);
  } catch (e) { }
}

async function scanQrFromImageUrl(srcUrl) {
  const blob = await (await fetch(srcUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  // white background first: a transparent PNG would otherwise decode as all black
  const k = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return decodeAtScales(canvas, 0, 0, w, h).text;
}

// Alt+S : manual QR selection on the current page, without opening the popup.
// Alt+C : open WorkBox straight on the clipboard history.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-clipboard') openPopupWith({ tool: 'clipboard' });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'scan-qr-area') return;
  try {
    if (!tab || !tab.id) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__workboxQrMode = 'manual'; } });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/protection.js', 'content/qroverlay.js'] });
  } catch (e) {
    notifyContextAction('WorkBox', 'Not available on this page (browser pages, Web Store...).');
  }
});

function handleWorkboxMenu(info, tab) {
  const id = info.menuItemId;
  const isWeb = (u) => /^https?:/i.test(u || '');

  if (id === 'workbox-link-check') {
    let v = null;
    try { v = WBProtection.evaluate(info.linkUrl); } catch (e) { }
    let host = ''; try { host = new URL(info.linkUrl).hostname; } catch (e) { }
    if (v && v.type === 'danger') notifyContextAction('⚠️ WorkBox - This link looks dangerous', (v.reason || '') + ' (' + host + ')');
    else if (v && v.type === 'adult') notifyContextAction('🔞 WorkBox - Adult website', host);
    else if (!isWeb(info.linkUrl)) notifyContextAction('WorkBox - Not a web link', 'Only http and https links can be checked.');
    else notifyContextAction('✓ WorkBox - No warning sign found', host);
    return true;
  }
  if (id === 'workbox-link-qr') { openPopupWith({ tool: 'qrgen', text: info.linkUrl }); return true; }
  if (id === 'workbox-link-save') {
    captureClipboardText(info.linkUrl).then((res) => {
      notifyContextAction('📋 WorkBox - Link saved', res && res.status === 'saved' ? 'The link is in your clipboard history.' : 'This link was already saved.');
    });
    return true;
  }
  if (id === 'workbox-img-scan') {
    const known = qrImageSeen.get((info.srcUrl || '').slice(0, 2000));
    (known ? Promise.resolve(known) : scanQrFromImageUrl(info.srcUrl)).then(async (text) => {
      if (!text) { notifyContextAction('WorkBox - No QR code found', 'No QR code was detected in this image.'); return; }
      await chrome.storage.local.set({ lastQrResult: { text, timestamp: Date.now() } });
      openPopupWith({ tool: 'qr' });
    }).catch(() => notifyContextAction('WorkBox - Cannot read this image', 'The image could not be loaded.'));
    return true;
  }
  if (id === 'workbox-img-compress') { openPopupWith({ tool: 'compress', url: info.srcUrl }); return true; }
  if (id === 'workbox-img-save') { openPopupWith({ tool: 'clipimage', url: info.srcUrl }); return true; }
  if (id === 'workbox-page-qr') {
    if (!isWeb(tab && tab.url)) notifyContextAction('WorkBox', 'Not available on this page.');
    else openPopupWith({ tool: 'qrgen', text: tab.url });
    return true;
  }
  if (id === 'workbox-page-note') {
    chrome.storage.local.get('notes', (data) => {
      const notes = data.notes || [];
      const pageTitle = ((tab && tab.title) || 'Web page').slice(0, 60);
      const newNote = { id: generateNoteId(), title: pageTitle, content: ((tab && tab.title) || '') + '\n' + ((tab && tab.url) || ''), createdAt: Date.now() };
      notes.push(newNote);
      chrome.storage.local.set({ notes, activeNoteId: newNote.id }, () => notifyContextAction('📝 WorkBox - Page saved', `Note created for "${pageTitle}".`));
    });
    return true;
  }
  if (id === 'workbox-page-scan') {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/protection.js', 'content/qroverlay.js'] })
      .catch(() => notifyContextAction('WorkBox', 'Not available on this page (browser pages, Web Store...).'));
    return true;
  }
  const text = (info.selectionText || '').trim();
  if (id === 'workbox-sel-qr' && text) { openPopupWith({ tool: 'qrgen', text: text.slice(0, 2000) }); return true; }
  if (id === 'workbox-sel-shortcut' && text) { openPopupWith({ tool: 'expander', text: text.slice(0, 5000) }); return true; }
  if (id === 'workbox-sel-calc' && text) { openPopupWith({ tool: 'calc', text: text.slice(0, 200) }); return true; }
  return false;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (handleWorkboxMenu(info, tab)) return;
  const text = (info.selectionText || '').trim();
  if (!text) return;

  if (info.menuItemId === 'workbox-add-note') {
    chrome.storage.local.get('notes', (data) => {
      const notes = data.notes || [];
      const pageTitle = (tab?.title || 'Web page').slice(0, 60);
      const content = tab?.url ? `Source: ${tab.url}\n\n${text}` : text;
      const newNote = { id: generateNoteId(), title: pageTitle, content, createdAt: Date.now() };
      notes.push(newNote);
      chrome.storage.local.set({ notes, activeNoteId: newNote.id }, () => {
        notifyContextAction('📝 WorkBox - Note added', `New note created from "${pageTitle}".`);
      });
    });
  } else if (info.menuItemId === 'workbox-add-clip') {
    captureClipboardText(text).then((res) => {
      if (res.status === 'saved') {
        notifyContextAction('📋 WorkBox - Added to clipboard', 'The selection has been saved in WorkBox.');
      }
    });
  } else if (info.menuItemId === 'workbox-add-todo') {
    chrome.storage.local.get('todoItems', (data) => {
      const todoItems = data.todoItems || [];
      todoItems.unshift({ id: genTodoId(), text, done: false, priority: 'normal', createdAt: Date.now() });
      chrome.storage.local.set({ todoItems }, () => {
        notifyContextAction('✅ WorkBox - Task created', text.length > 80 ? text.slice(0, 80) + '…' : text);
      });
    });
  }
});

chrome.alarms.get('exchangeRatesUpdate', (a) => { if (!a) chrome.alarms.create('exchangeRatesUpdate', { periodInMinutes: 4 * 60 }); });
// Earlier versions protected one engine at a time: when any was on, switch them all on.
chrome.runtime.onInstalled.addListener(async () => {
  const r = await chrome.storage.local.get(['blockAiGoogle', 'blockAiBrave']);
  if (r.blockAiGoogle === undefined && r.blockAiBrave === undefined) return;
  const on = r.blockAiGoogle === true || r.blockAiBrave === true;
  if (r.blockAiGoogle !== on || r.blockAiBrave !== on) chrome.storage.local.set({ blockAiGoogle: on, blockAiBrave: on });
});
chrome.alarms.get('aiEngineScan', (a) => { if (!a) chrome.alarms.create('aiEngineScan', { periodInMinutes: 10 }); });
chrome.alarms.get('healthCheck', (a) => { if (!a) chrome.alarms.create('healthCheck', { periodInMinutes: 1 }); });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'exchangeRatesUpdate') {
    fetchExchangeRates(false);
  }
  if (alarm.name === 'aiEngineScan') {
    aiScanTabs();
  }
  if (alarm.name === 'healthCheck') {
    // Le service worker peut s'endormir et tuer le document offscreen avec lui
    await setupOffscreen();
  }
  if (alarm.name === 'workboxPomoStep') {
    const { pomoState: raw } = await chrome.storage.local.get('pomoState');
    if (!raw || !raw.running) return;
    const st = pomoNormalize(raw);
    if (!st) { await pomoStop(raw); return; }
    const now = Date.now();
    // the popup may already have moved on: only act if this step is really over
    if (now < st.endTime - 500) { syncPomoAlarm(st); return; }
    // A late alarm can have skipped several short steps: catch up to the one
    // that is running now and announce only that one.
    let goes = pomoAdvance(st, now);
    for (let n = 0; n < 500 && goes && st.endTime <= now; n++) goes = pomoAdvance(st, now);
    if (goes && st.endTime <= now) st.endTime = now + st.steps[st.idx].sec * 1000;
    await chrome.storage.local.set({ pomoState: st });
    if (await pomoPopupOpen()) return;
    const step = st.steps[st.idx];
    const mins = Math.floor(step.sec / 60), secs = step.sec % 60;
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: goes ? 'WorkBox - ' + (step.name || 'Step ' + (st.idx + 1)) : 'WorkBox - Sequence finished',
      message: goes ? 'Step ' + (st.idx + 1) + ' of ' + st.steps.length + ' · ' + mins + ':' + String(secs).padStart(2, '0') : 'All your steps are done.'
    });
  }
  if (alarm.name === 'workboxTimerDone') {
    chrome.storage.local.remove('tmrState');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '⏰ WorkBox - Timer finished',
      message: 'Time is up!'
    });
  }
});

let creatingOffscreenPromise = null;

// The offscreen document cannot read chrome.storage — only the messaging APIs
// are exposed to it — so the clipboard switch is pushed to it from here, both
// after it is created and whenever the setting changes.
function pushWatchToOffscreen() {
  try {
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'WATCH', on: WATCH.on }, () => { void chrome.runtime.lastError; });
  } catch (e) { }
}

async function setupOffscreen() {
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = (async () => {
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existingContexts.length > 0) return;

    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['AUDIO_PLAYBACK', 'CLIPBOARD'],
        justification: 'Play local music in the background and listen for clipboard changes'
      });
    } catch (e) {
      // Une autre invocation a pu créer le document entre-temps, ce n'est pas une vraie erreur
      if (!e.message.includes('Only a single offscreen document may be created')) {
        console.error('Error creating offscreen document:', e);
      }
    }
  })();

  await creatingOffscreenPromise;
  creatingOffscreenPromise = null;
  // Runs whether the document was just created or already there, so its clip
  // reader always ends up matching the stored switch.
  pushWatchToOffscreen();
}

setupOffscreen();


// ---- TAB TRIAGE: background tabs wait in a red group until you visit them ----
// A tab opened from a page without being shown (middle-click, Ctrl+click) joins the red
// "Not opened yet" group. When you open it, it leaves the group (no group while you are
// on it). When you switch away, it joins the green "Already opened" group.
// Sites on the white list are never touched. Tabs are never closed, only grouped.
const TRIAGE_DEFAULTS = { todo: { title: '🔴 Not opened yet', color: 'red' }, done: { title: '🟢 Already opened', color: 'green' } };
// names used before the colored dots were added: groups that still carry them keep working
const TRIAGE_OLD_TITLES = { todo: 'Not opened yet', done: 'Already opened' };
const TRIAGE = JSON.parse(JSON.stringify(TRIAGE_DEFAULTS));
function triageApplyNames(n) {
  ['todo', 'done'].forEach((k) => {
    const v = n && n[k] || {};
    TRIAGE[k].title = (typeof v.title === 'string' && v.title.trim()) ? v.title.trim().slice(0, 40) : TRIAGE_DEFAULTS[k].title;
    TRIAGE[k].color = v.color || TRIAGE_DEFAULTS[k].color;
  });
}
let triageQueue = Promise.resolve();
const triageRun = (fn) => (triageQueue = triageQueue.then(fn, fn).catch(() => { }));
async function triageSettings() {
  const r = await chrome.storage.local.get(['tabTriage', 'tabTriageWhitelist', 'tabTriageNames']);
  triageApplyNames(r.tabTriageNames);
  return { on: r.tabTriage === true, white: Array.isArray(r.tabTriageWhitelist) ? r.tabTriageWhitelist : [] };
}
function triageWhite(url, white) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { return false; }
  return white.some((d) => host === d || host.endsWith('.' + d));
}
// Chrome refuses to group/ungroup while a tab is being clicked or dragged ("Tabs cannot be
// edited right now"), which is exactly when we want to act: wait a moment and try again.
async function triageRetry(fn) {
  let err;
  for (let i = 0; i < 12; i++) {
    try { return await fn(); } catch (e) {
      err = e;
      if (!/cannot be edited|dragging|No tab with id/i.test(String(e && e.message))) throw e;
      if (/No tab with id/i.test(String(e.message))) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw err;
}
async function triageGroupFor(windowId, kind) {
  const found = await chrome.tabGroups.query({ windowId, title: TRIAGE[kind].title });
  return found.length ? found[0].id : null;
}
async function triagePut(tabId, windowId, kind) {
  const spec = TRIAGE[kind];
  const existing = await triageGroupFor(windowId, kind);
  const groupId = await triageRetry(() => chrome.tabs.group(existing != null ? { tabIds: [tabId], groupId: existing } : { tabIds: [tabId], createProperties: { windowId } }));
  if (existing == null && groupId != null) await triageRetry(() => chrome.tabGroups.update(groupId, { title: spec.title, color: spec.color, collapsed: false }));
}
// tabs.session state survives the service worker sleeping
async function triageState() {
  const r = await chrome.storage.session.get('triage');
  return r.triage || { visiting: [], active: {} };
}
const triageSave = (s) => chrome.storage.session.set({ triage: s });

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId == null || tab.active) return;
  triageRun(async () => {
    const cfg = await triageSettings();
    if (!cfg.on) return;
    const url = tab.pendingUrl || tab.url || '';
    if (url && !/^https?:|^about:blank$/.test(url)) return;
    if (triageWhite(url, cfg.white)) return;
    const fresh = await chrome.tabs.get(tab.id);
    if (fresh.active || fresh.groupId > -1) return;
    await triagePut(tab.id, fresh.windowId, 'todo');
  });
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  triageRun(async () => {
    const cfg = await triageSettings();
    const st = await triageState();
    const prev = st.active[windowId];
    st.active[windowId] = tabId;
    // the tab you just left, if it was one you opened from the red group, is now "already opened"
    if (prev != null && prev !== tabId && st.visiting.includes(prev)) {
      st.visiting = st.visiting.filter((id) => id !== prev);
      try {
        const old = await chrome.tabs.get(prev);
        if (cfg.on && old.groupId === -1 && !triageWhite(old.url || '', cfg.white)) await triagePut(prev, old.windowId, 'done');
      } catch (_) { /* tab was closed */ }
    }
    // the tab you just opened leaves the red group and stays ungrouped while you are on it
    if (cfg.on) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId > -1) {
        const grp = await chrome.tabGroups.get(tab.groupId);
        if (grp.title === TRIAGE.todo.title || grp.title === TRIAGE_OLD_TITLES.todo) {
          await triageRetry(() => chrome.tabs.ungroup(tabId));
          if (!st.visiting.includes(tabId)) st.visiting.push(tabId);
        }
      }
    }
    await triageSave(st);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  triageRun(async () => {
    const st = await triageState();
    if (st.visiting.includes(tabId)) { st.visiting = st.visiting.filter((id) => id !== tabId); await triageSave(st); }
  });
});

// Renaming or recoloring a group in the popup updates the groups that already exist.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.tabTriageNames) return;
  triageRun(async () => {
    const before = JSON.parse(JSON.stringify(TRIAGE));
    triageApplyNames(changes.tabTriageNames.oldValue);
    const old = JSON.parse(JSON.stringify(TRIAGE));
    triageApplyNames(changes.tabTriageNames.newValue);
    const groups = await chrome.tabGroups.query({});
    for (const k of ['todo', 'done']) {
      for (const g of groups.filter((x) => x.title === old[k].title)) {
        await chrome.tabGroups.update(g.id, { title: TRIAGE[k].title, color: TRIAGE[k].color }).catch(() => { });
      }
    }
  });
});

// Compressed bodies of long texts: once an item is deleted (or falls out of the
// history), its body is cleaned up a few seconds later.
let bigGcTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.clipItems) return;
  clearTimeout(bigGcTimer);
  bigGcTimer = setTimeout(() => {
    chrome.storage.local.get('clipItems', (d) => { WBBig.gc(d.clipItems || []).catch(() => { }); });
  }, 3000);
});

// Texts saved in full by an older version: convert the long ones once, in the
// background, so the popup never has to load them.
function migrateLegacyBig() {
  clipboardQueue = clipboardQueue.then(() => new Promise((done) => {
    chrome.storage.local.get('clipItems', async (d) => {
      try {
        const items = Array.isArray(d.clipItems) ? d.clipItems : [];
        if (!items.some((i) => i && !i.big && WBBig.isBig(i.text))) { done(); return; }
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          if (!it || it.big || !WBBig.isBig(it.text)) continue;
          const made = await WBBig.make(it.text);
          items[k] = { ...it, text: made.text, big: made.big };
        }
        // Through the vault: the converted item carries a plaintext preview that
        // must be encrypted like any other text.
        await WBClip.save(items);
      } catch (e) { }
      done();
    });
  }));
}
chrome.runtime.onInstalled.addListener(migrateLegacyBig);
chrome.runtime.onStartup.addListener(migrateLegacyBig);

// One-time clean-up of the site tags that no longer exist (see LEGACY_SITE_CATS).
// Only the category lists change, never a text, so it works while the vault is
// locked too; the write goes through the vault and is simply retried at the next
// start if it cannot happen yet.
function dropLegacySiteTags() {
  clipboardQueue = clipboardQueue.then(() => new Promise((done) => {
    chrome.storage.local.get('clipItems', async (d) => {
      try {
        const items = Array.isArray(d.clipItems) ? d.clipItems : [];
        if (stripLegacySiteTags(items)) await WBClip.save(items);
      } catch (e) { }
      done();
    });
  }));
}
chrome.runtime.onInstalled.addListener(dropLegacySiteTags);
chrome.runtime.onStartup.addListener(dropLegacySiteTags);

// The 5-hour memory of deleted texts is gone, and its switch with it: the keys
// are removed, which also erases the plaintext copies they kept.
function dropDeletedMemory() {
  chrome.storage.local.remove(['deletedClipItems', 'clipDeletedBlock'], () => { void chrome.runtime.lastError; });
}
chrome.runtime.onInstalled.addListener(dropDeletedMemory);
chrome.runtime.onStartup.addListener(dropDeletedMemory);

// ── Automatic compression by tiers ─────────────────────────────────────────────
// Unpinned items are ranked from the newest. The first 100 stay exactly as copied;
// each following block of 100 is squeezed harder, once, in the background:
//   images: tier 1 (101-200) at most 1600 px / quality 0.7, tier 2 (201+) 1000 px / 0.55
//   texts : from the 101st on, a text of 20,000+ characters is stored compressed apart
//           (like the very long ones: preview in the list, full text on Copy).
// An item is only ever moved to a harder tier, never recompressed twice at the same one,
// and pinned items are never touched.
const TIER_SIZE = 100;
const IMG_TIERS = [null, { side: 1600, quality: 0.7 }, { side: 1000, quality: 0.55 }];
const TEXT_PACK_MIN = 20000;

async function recompressDataUrl(dataUrl, side, quality) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { dataUrl: await blobToDataUrl(blob), size: blob.size };
}

// Position of each unpinned item among the unpinned ones, newest first.
function tierRanks(list) {
  const order = list.map((o, i) => ({ i, t: (o && o.timestamp) || 0, pinned: !!(o && o.pinned) }))
    .filter((x) => !x.pinned).sort((a, b) => b.t - a.t);
  const rank = new Map();
  order.forEach((x, n) => rank.set(x.i, n));
  return rank;
}

function runTiers(what) {
  clipboardQueue = clipboardQueue.then(() => new Promise((done) => {
    const keys = [];
    if (!what || what.texts) keys.push('clipItems');
    if (!what || what.images) keys.push('clipboardImages');
    chrome.storage.local.get(keys, async (d) => {
      let more = false;
      try {
        const out = {};
        if (keys.includes('clipboardImages')) {
          const imgs = Array.isArray(d.clipboardImages) ? d.clipboardImages : [];
          const rank = tierRanks(imgs);
          let budget = 12, changed = false;
          for (let i = 0; i < imgs.length; i++) {
            const img = imgs[i];
            if (!img || img.pinned || !rank.has(i)) continue;
            const want = Math.min(IMG_TIERS.length - 1, Math.floor(rank.get(i) / TIER_SIZE));
            if (want <= (img.tier || 0)) continue;
            if (budget <= 0) { more = true; break; }
            budget--;
            try {
              const r = await recompressDataUrl(img.dataUrl, IMG_TIERS[want].side, IMG_TIERS[want].quality);
              if (r.dataUrl.length < img.dataUrl.length) { img.dataUrl = r.dataUrl; img.compressedSize = r.size; }
            } catch (e) { }
            img.tier = want;
            changed = true;
          }
          if (changed) out.clipboardImages = imgs;
        }
        if (keys.includes('clipItems')) {
          const items = Array.isArray(d.clipItems) ? d.clipItems : [];
          const rank = tierRanks(items);
          let budget = 20, changed = false;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it || it.pinned || it.big || !rank.has(i) || rank.get(i) < TIER_SIZE) continue;
            // The length is kept in clear next to the ciphertext, so the decision
            // costs nothing; only the items actually converted are decrypted.
            const len = typeof it.len === 'number' ? it.len : (typeof it.text === 'string' ? it.text.length : 0);
            if (len < TEXT_PACK_MIN) continue;
            if (budget <= 0) { more = true; break; }
            budget--;
            try {
              const plain = await WBClip.decryptItem(it);
              if (!plain || plain.length < TEXT_PACK_MIN) continue;
              const made = await WBBig.make(plain);
              items[i] = { ...it, text: made.text, big: made.big };
              changed = true;
            } catch (e) { }
          }
          // Nothing here goes into `out`: the list is rewritten through the vault,
          // which re-encrypts the previews that were just created.
          if (changed) await WBClip.save(items);
        }
        if (Object.keys(out).length) await new Promise((r) => chrome.storage.local.set(out, r));
      } catch (e) { }
      done();
      if (more) setTimeout(() => runTiers(what), 1000);
    });
  }));
}
chrome.runtime.onInstalled.addListener(() => runTiers());
chrome.runtime.onStartup.addListener(() => runTiers());



// Ask the browser not to clear WorkBox's databases (long texts, music) when the disk is short on room.
// The answer is kept so Settings > Storage can show it.
(async function askPersistentStorage() {
  try {
    if (!(navigator.storage && navigator.storage.persist)) return;
    const ok = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    chrome.storage.local.set({ wbPersisted: !!ok });
  } catch (e) { }
})();
