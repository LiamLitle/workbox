// Gros textes du presse-papier : le texte complet est compressé (gzip) et rangé
// à part dans IndexedDB, la liste ne garde qu'un court aperçu.
// Partagé entre le popup et le service worker (même origine = même base).
(function (g) {
  'use strict';

  const BIG_CHARS = 100000;       // au-dessus, le texte est rangé à part
  const MAX_CHARS = 5000000;      // plafond : ~90 000 lignes de code
  const PREVIEW_CHARS = 1000;
  const MAX_TEXTS = 5000;                      // saved texts (pinned ones not counted)
  const MAX_IMAGES = 1000;                     // saved images (pinned ones not counted)
  const QUOTA_TEXT = 1024 * 1024 * 1024;       // 1 GB for all saved texts (long ones counted as stored, compressed)
  const QUOTA_IMAGES = 300 * 1024 * 1024;      // 300 MB for all saved images
  const GC_GRACE = 10 * 60 * 1000; // un corps tout neuf n'est jamais nettoyé
  const DB_NAME = 'workbox-bodies';
  const STORE = 'bodies';

  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromise = null; reject(req.error); };
      });
    }
    return dbPromise;
  }
  function tx(mode, run) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const out = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }
  async function gunzip(buf) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  function countLines(text) {
    let n = 1, i = -1;
    while ((i = text.indexOf('\n', i + 1)) !== -1) n++;
    return n;
  }
  function fingerprint(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return text.length + ':' + (h >>> 0);
  }
  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function idAge(id) {
    const ts = parseInt(String(id).split('-')[0], 36);
    return Number.isFinite(ts) ? Date.now() - ts : Infinity;
  }

  const isBig = (text) => typeof text === 'string' && text.length > BIG_CHARS;

  // Ce qu'un corps occupe réellement : la taille du gzip quand le coffre est
  // ouvert, celle du chiffré quand il est protégé.
  function bodySize(stored) {
    if (!stored) return 0;
    if (typeof stored.byteLength === 'number') return stored.byteLength;
    if (stored.ct && typeof stored.ct.byteLength === 'number') return stored.ct.byteLength;
    return 0;
  }

  // Range le texte complet, renvoie l'élément léger à mettre dans clipItems.
  async function make(text) {
    const id = newId();
    const packed = await gzip(text);
    // Un texte long est du presse-papier comme un autre : son corps est chiffré
    // quand la protection est active. Si le coffre est verrouillé, encryptBody
    // lève : mieux vaut échouer que ranger le texte en clair.
    let stored = packed;
    if (g.WBClip) {
      // encryptBody() checks the state itself: it returns null when nothing is
      // protected and throws when the vault is locked. Asking isProtected() here
      // would be wrong — before the settings are read it answers "false", and the
      // body would be written in clear despite an active vault.
      const rec = await g.WBClip.encryptBody(packed);
      if (rec) stored = rec;
    }
    await tx('readwrite', (s) => { s.put(stored, id); });
    return {
      text: text.slice(0, PREVIEW_CHARS),
      big: { id, chars: text.length, lines: countLines(text), bytes: bodySize(stored), fp: fingerprint(text) }
    };
  }

  // Texte complet d'un élément (le texte lui-même s'il n'est pas "big").
  async function load(item) {
    if (!item || !item.big) return item ? String(item.text || '') : '';
    const packed = await tx('readonly', (s) => s.get(item.big.id));
    if (!packed) throw new Error('missing body');
    // Les corps écrits avant la protection sont du gzip nu : on les lit tels
    // quels, sans jamais réécrire quoi que ce soit.
    let raw = packed;
    if (g.WBClip && g.WBClip.isBodyRecord(packed)) raw = await g.WBClip.decryptBody(packed);
    return gunzip(raw);
  }

  // Real size of every stored long text, read from the database (nothing is changed).
  async function measure(items) {
    let bytes = 0, missing = 0;
    for (const it of items || []) {
      if (!it || !it.big) continue;
      const packed = await tx('readonly', (s) => s.get(it.big.id));
      if (packed) bytes += bodySize(packed); else missing++;
    }
    return { bytes, missing };
  }

  // Chiffre les corps enregistrés avant la protection. Sans cette passe, les
  // textes longs écrits plus tôt restent lisibles dans IndexedDB alors que la
  // liste, elle, est chiffrée : c'est une porte ouverte à côté de la porte fermée.
  // Idempotent — un corps déjà chiffré est laissé tel quel — donc rejouable.
  async function migrateBodies() {
    const clip = g.WBClip;
    if (!clip) return { ok: false, reason: 'no-vault', encrypted: 0 };
    if (clip.init) { try { await clip.init(); } catch (e) { } }
    if (!clip.isProtected()) return { ok: true, reason: 'not-protected', encrypted: 0 };
    if (!clip.isUnlocked()) return { ok: false, reason: 'locked', encrypted: 0 };
    let keys = [];
    try { keys = await tx('readonly', (s) => s.getAllKeys()); } catch (e) { return { ok: false, reason: 'read', encrypted: 0 }; }
    let encrypted = 0, failed = 0;
    for (const k of keys || []) {
      try {
        const packed = await tx('readonly', (s) => s.get(k));
        if (!packed || clip.isBodyRecord(packed)) continue;
        const rec = await clip.encryptBody(packed);
        if (rec) { await tx('readwrite', (s) => { s.put(rec, k); }); encrypted++; }
      } catch (e) { failed++; }
    }
    return { ok: true, encrypted, failed };
  }

  // The reverse of migrateBodies: puts every body back to plain gzip. Used when the
  // person removes protection, BEFORE the key is deleted. Without this pass, the
  // long texts would stay encrypted with a key that no longer exists.
  // Idempotent (a plain body is left alone). `failed` counts bodies that could not
  // be read with the right key (corrupted); `ok:false` means the database itself
  // could not be read or written, and the caller must keep the key.
  async function unprotectBodies() {
    const clip = g.WBClip;
    if (!clip) return { ok: true, decrypted: 0, failed: 0 };
    if (!clip.isUnlocked()) return { ok: false, reason: 'locked', decrypted: 0, failed: 0 };
    let keys;
    try { keys = await tx('readonly', (s) => s.getAllKeys()); } catch (e) { return { ok: false, reason: 'read', decrypted: 0, failed: 0 }; }
    let decrypted = 0, failed = 0;
    for (const k of keys || []) {
      let packed;
      try { packed = await tx('readonly', (s) => s.get(k)); } catch (e) { return { ok: false, reason: 'read', decrypted, failed }; }
      if (!packed || !clip.isBodyRecord(packed)) continue;
      let plain;
      try { plain = await clip.decryptBody(packed); } catch (e) { failed++; continue; }
      try {
        const buf = plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength);
        await tx('readwrite', (s) => { s.put(buf, k); });
        decrypted++;
      } catch (e) { return { ok: false, reason: 'write', decrypted, failed }; }
    }
    return { ok: true, decrypted, failed };
  }

  // Supprime les corps que plus aucun élément n'utilise.
  async function gc(clipItems) {
    const keep = new Set((clipItems || []).filter((i) => i && i.big).map((i) => i.big.id));
    const all = await tx('readonly', (s) => s.getAllKeys());
    const gone = (all || []).filter((k) => !keep.has(k) && idAge(k) > GC_GRACE);
    if (!gone.length) return 0;
    await tx('readwrite', (s) => { gone.forEach((k) => s.delete(k)); });
    return gone.length;
  }

  function sizeLabel(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(bytes >= 10737418240 ? 0 : 1).replace(/\.0$/, '') + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }
  function countLabel(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return Math.round(n / 1000) + 'k';
    return n.toLocaleString('en-US');
  }

  // Room taken by the saved texts: each text as it is stored, plus the compressed
  // body of the long ones. Pinned items count too: it is real disk space.
  // `len` est écrit à côté du chiffré : le calcul reste exact sans rien déchiffrer.
  function textBytes(items) {
    let n = 0;
    for (const i of items || []) {
      if (!i) continue;
      if (typeof i.len === 'number') n += i.len;
      else if (typeof i.text === 'string') n += i.text.length;
      if (i.big) n += Number(i.big.bytes) || 0;
    }
    return n;
  }
  // Room taken by the saved images (the base64 text of each one is a third bigger than the picture)
  function imageBytes(images) {
    let n = 0;
    for (const i of images || []) {
      const u = i && i.dataUrl;
      if (typeof u !== 'string') continue;
      n += Math.floor((u.length - (u.indexOf(',') + 1)) * 0.75);
    }
    return n;
  }

  g.WBBig = { BIG_CHARS, MAX_CHARS, PREVIEW_CHARS, MAX_TEXTS, MAX_IMAGES, QUOTA_TEXT, QUOTA_IMAGES, textBytes, imageBytes, isBig, make, load, gc, measure, migrateBodies, unprotectBodies, fingerprint, sizeLabel, countLabel };
})(self);
