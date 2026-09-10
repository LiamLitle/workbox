// jsQR est un décodeur JS pur (pas de dépendance DOM) — on peut donc l'utiliser
// directement dans le service worker, sans passer par le document offscreen.
importScripts('lib/jsQR.js');

// Éléments non épinglés uniquement — les épinglés sont illimités
const TEXT_LIMIT = 1000;
const IMAGE_LIMIT = 300; // au-delà, exporter en ZIP depuis le popup plutôt que monter ce chiffre

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
chrome.storage.local.get('tmrState', (data) => syncTimerAlarm(data.tmrState));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tmrState) syncTimerAlarm(changes.tmrState.newValue);
});

// Devine la catégorie d'un texte copié. Renvoie un tableau car un lien
// peut être à la fois "Lien" + "GitHub" par exemple.
// Extrait le nom d'hôte d'un texte reconnu comme lien, quel que soit son
// format d'origine ("https://...", "www...." ou juste "exemple.com/page").
// Comparer un vrai nom d'hôte plutôt que de chercher "instagram.com" comme
// simple sous-chaîne évite les faux positifs — un lien du type
// "site.com/redirect?url=instagram.com" ne doit pas être classé Instagram.
function getLinkHostname(t) {
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(t) ? t : `https://${t.replace(/^\/\//, '')}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  } catch (e) {
    return '';
  }
}

// Un réseau peut avoir plusieurs domaines (site principal + domaine de
// raccourci type t.co, wa.me, pin.it...) — la comparaison se fait sur le
// nom d'hôte exact, jamais sur une simple présence de texte dans l'URL.
const SOCIAL_DOMAINS = [
  { hosts: ['github.com', 'gitlab.com', 'bitbucket.org'], cat: '🐙 GitHub' },
  { hosts: ['stackoverflow.com'], suffixes: ['.stackexchange.com'], cat: '💻 Code' },
  { hosts: ['spotify.com', 'open.spotify.com'], cat: '🎵 Spotify' },
  { hosts: ['twitter.com', 'x.com', 't.co'], cat: '🐦 Twitter / X' },
  { hosts: ['facebook.com', 'fb.com', 'fb.watch'], cat: '📘 Facebook' },
  { hosts: ['instagram.com', 'instagr.am'], cat: '📸 Instagram' },
  { hosts: ['tiktok.com', 'vm.tiktok.com'], cat: '🎬 TikTok' },
  { hosts: ['youtube.com', 'youtu.be'], cat: '📺 YouTube' },
  { hosts: ['linkedin.com', 'lnkd.in'], cat: '💼 LinkedIn' },
  { hosts: ['reddit.com', 'redd.it'], cat: '🗣️ Reddit' },
  { hosts: ['pinterest.com', 'pinterest.fr', 'pin.it'], cat: '📌 Pinterest' },
  { hosts: ['snapchat.com'], cat: '👻 Snapchat' },
  { hosts: ['whatsapp.com', 'wa.me'], cat: '💬 WhatsApp' },
  { hosts: ['telegram.org', 't.me'], cat: '✈️ Telegram' },
  { hosts: ['threads.net'], cat: '🧵 Threads' },
  { hosts: ['discord.com', 'discord.gg', 'discordapp.com'], cat: '🎮 Discord' },
  { hosts: ['twitch.tv'], cat: '🎮 Twitch' },
  { hosts: ['figma.com'], cat: '🎨 Figma' },
  { hosts: ['drive.google.com', 'docs.google.com'], cat: '📄 Google Drive' },
];

function detectSocialNetworks(hostname) {
  if (!hostname) return [];
  const cats = [];
  for (const entry of SOCIAL_DOMAINS) {
    const hostMatch = entry.hosts.includes(hostname);
    const suffixMatch = entry.suffixes && entry.suffixes.some(s => hostname.endsWith(s));
    if (hostMatch || suffixMatch) cats.push(entry.cat);
  }
  return cats;
}

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

    cats.push(...detectSocialNetworks(getLinkHostname(t)));

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

let clipboardQueue = Promise.resolve();

// Cœur de la capture presse-papier, partagé entre l'écoute du copier-coller
// (content.js) et l'ajout manuel depuis le menu clic droit — mêmes règles de
// dédoublonnage, de limite et de catégorisation automatique dans les deux cas.
function captureClipboardText(rawText, inputType) {
  return new Promise((resolve) => {
    if (!rawText) { resolve({ status: 'error' }); return; }
    const text = rawText.replace(/\r/g, ''); // évite les doublons \r\n vs \n

    // File d'attente pour sérialiser les écritures storage — deux copies
    // rapprochées ne doivent pas s'écraser l'une l'autre
    clipboardQueue = clipboardQueue.then(() => new Promise(resolveQueue => {
      chrome.storage.local.get(['clipItems', 'deletedClipItems'], (data) => {
        if (chrome.runtime.lastError) { resolve({ status: 'error' }); resolveQueue(); return; }

        // Si un item vient d'être supprimé manuellement, on évite de le
        // recapturer immédiatement (ex: l'utilisateur reclique dessus)
        const deleted = data.deletedClipItems || [];
        const fiveHours = 5 * 3600 * 1000;
        const now = Date.now();
        const freshDeleted = deleted.filter(i => (now - i.timestamp) < fiveHours);
        if (freshDeleted.length !== deleted.length) {
          chrome.storage.local.set({ deletedClipItems: freshDeleted });
        }
        if (freshDeleted.some(i => i.text.replace(/\r/g, '') === text)) {
          resolve({ status: 'ignored_deleted' });
          resolveQueue();
          return;
        }

        let clipItems = data.clipItems || [];
        const unpinnedCount = clipItems.filter(i => !i.pinned).length;
        const isDuplicate = clipItems.some(item => item.text.replace(/\r/g, '') === text);

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
        const existingItem = clipItems.find(item => item.text.replace(/\r/g, '') === text);
        clipItems = clipItems.filter(item => item.text.replace(/\r/g, '') !== text);

        const autoCategory = detectType(text, inputType);
        clipItems.unshift({
          text,
          pinned: existingItem ? existingItem.pinned : false,
          category: autoCategory,
          timestamp: Date.now()
        });

        const pinnedItems = clipItems.filter(i => i.pinned);
        const unpinnedItems = clipItems.filter(i => !i.pinned).slice(0, TEXT_LIMIT);
        clipItems = [...pinnedItems, ...unpinnedItems].sort((a, b) => b.timestamp - a.timestamp);

        chrome.storage.local.set({ clipItems }, () => {
          resolve({ status: chrome.runtime.lastError ? 'error' : 'saved' });
          resolveQueue();
        });
      });
    }));
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type || message.action) {
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

    case 'DETECT_SEARCH_ENGINE': {
      detectSearchEngine();
      sendResponse({ started: true });
      return true;
    }


    case 'AUDIO_TRACK_ENDED': {
      chrome.storage.local.get(['savedPlaylist', 'savedCurrentIndex', 'savedRepeatMode'], (data) => {
        let playlist = data.savedPlaylist || [];
        if (!playlist.length) return;
        let currentIndex = data.savedCurrentIndex !== undefined ? data.savedCurrentIndex : -1;
        let nextIndex = currentIndex + 1;
        if (nextIndex >= playlist.length) {
          if (data.savedRepeatMode) {
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
          dataUrl: playlist[nextIndex].dataUrl
        }).catch(() => { });
      });
      return true;
    }

    case 'clipboard_capture': {
      if (!message.text) return false;
      captureClipboardText(message.text, message.inputType).then(sendResponse);
      return true;
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
        const rates = json.rates || {};
        if (json.result === 'success' && Object.keys(rates).length > 5) {
          await chrome.storage.local.set({ exchangeRates: rates, lastExchangeFetch: now, exchangeRatesOk: true });
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
// sans passer par le popup. removeAll() d'abord pour éviter les erreurs
// "id already exists" au rechargement de l'extension en mode développeur.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'workbox-root', title: 'WorkBox', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'workbox-add-note', parentId: 'workbox-root', title: 'Add to notes', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'workbox-add-clip', parentId: 'workbox-root', title: 'Copy to clipboard', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'workbox-add-todo', parentId: 'workbox-root', title: 'Create a task', contexts: ['selection'] });
  });
});

function notifyContextAction(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title, message });
}

// ---- Search-engine auto-detect (runs here, not in the popup) ----
// chrome.search.query({..., disposition:'NEW_TAB'}) opens a new foreground
// tab, which steals window focus — and an extension action popup closes the
// instant it loses focus. Doing this from the popup meant the whole flow
// (the tabs.onUpdated listener, the eventual storage write, the toast) got
// killed mid-flight the moment the tab opened, before it could ever finish.
// Running it here in the persistent-enough background context means the
// detection survives the popup closing; the result is delivered as a
// system notification instead of an in-popup toast, and the checkbox state
// is just picked up correctly next time the popup is opened (it reads
// chrome.storage.local fresh on every load).
const AI_ENGINE_KEYS_BG = ['blockAiGoogle', 'blockAiBing', 'blockAiBrave', 'blockAiDuckDuckGo', 'blockAiQwant'];
const AI_ENGINE_LABELS_BG = {
  blockAiGoogle: 'Google',
  blockAiBing: 'Bing',
  blockAiBrave: 'Brave Search',
  blockAiDuckDuckGo: 'DuckDuckGo',
  blockAiQwant: 'Qwant'
};
const AI_ENGINE_DOMAIN_MATCHERS_BG = [
  { test: (h) => /(^|\.)google\.[a-z.]+$/i.test(h), key: 'blockAiGoogle' },
  { test: (h) => /(^|\.)bing\.com$/i.test(h), key: 'blockAiBing' },
  { test: (h) => h === 'search.brave.com', key: 'blockAiBrave' },
  { test: (h) => /(^|\.)duckduckgo\.com$/i.test(h), key: 'blockAiDuckDuckGo' },
  { test: (h) => /(^|\.)qwant\.com$/i.test(h), key: 'blockAiQwant' }
];
let detectInFlight = false;

function detectSearchEngine() {
  if (detectInFlight) return;
  if (!chrome.search?.query) {
    notifyContextAction('WorkBox', 'Automatic detection isn\'t available on this browser.');
    return;
  }
  detectInFlight = true;

  let settled = false;
  let detectTabId = null;
  const finish = (message) => {
    if (settled) return;
    settled = true;
    detectInFlight = false;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    if (detectTabId != null) chrome.tabs.remove(detectTabId).catch(() => { });
    notifyContextAction('WorkBox', message);
  };

  function onUpdated(tabId, info, tab) {
    if (tabId !== detectTabId || !tab.url) return;
    let parsed;
    try { parsed = new URL(tab.url); } catch (_) { return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;

    const match = AI_ENGINE_DOMAIN_MATCHERS_BG.find((m) => m.test(parsed.hostname));
    if (match) {
      const update = {};
      AI_ENGINE_KEYS_BG.forEach((k) => { update[k] = k === match.key; });
      chrome.storage.local.set(update);
      finish(`Detected: ${AI_ENGINE_LABELS_BG[match.key]} — protection activated`);
      return;
    }
    if (info.status === 'complete') {
      finish(`Detected engine (${parsed.hostname}) isn't supported yet`);
    }
  }

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onCreated.addListener(function onCreated(tab) {
    chrome.tabs.onCreated.removeListener(onCreated);
    detectTabId = tab.id;
  });

  chrome.search.query({ text: 'workbox-detect-' + Date.now(), disposition: 'NEW_TAB' }, () => {
    if (chrome.runtime.lastError) finish('Detection failed, try again.');
  });

  setTimeout(() => finish('Detection timed out, try again.'), 7000);
}

function generateNoteId() {
  return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function genTodoId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const text = (info.selectionText || '').trim();
  if (!text) return;

  if (info.menuItemId === 'workbox-add-note') {
    chrome.storage.local.get('notes', (data) => {
      const notes = data.notes || [];
      const pageTitle = (tab?.title || 'Page web').slice(0, 60);
      const content = tab?.url ? `Source : ${tab.url}\n\n${text}` : text;
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
chrome.alarms.get('healthCheck', (a) => { if (!a) chrome.alarms.create('healthCheck', { periodInMinutes: 1 }); });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'exchangeRatesUpdate') {
    fetchExchangeRates(false);
  }
  if (alarm.name === 'healthCheck') {
    // Le service worker peut s'endormir et tuer le document offscreen avec lui
    await setupOffscreen();
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
        url: 'offscreen.html',
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
}

setupOffscreen();
