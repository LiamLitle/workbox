// WorkBox — the storage boundary for the clipboard history.
//
// Everything that reads or writes clipItems goes through here, so encryption
// lives in exactly one place. The in-memory list stays plaintext (the popup
// needs it to render); only what touches chrome.storage.local is encrypted.
//
// Two things make this cheap and safe:
//
//  1. A record written by the popup is remembered in a WeakMap, keyed by the
//     very object the popup holds. Saving again without editing a text reuses
//     the same ciphertext instead of re-encrypting thousands of items.
//
//  2. `len` and `fp` are stored in clear next to the ciphertext. `len` keeps the
//     size accounting exact and `fp` (a keyed fingerprint) lets the background
//     spot duplicates without ever decrypting the list.
//
// The background never decrypts: it reads the raw records, adds one new item
// and writes the array back. Only the popup decrypts, and only to display.
//
// Shared by the service worker and the popup, requirable from Node for tests.
(function (root) {
  'use strict';

  const ITEMS_KEY = 'clipItems';
  const STAGED_KEY = 'wbClipStaged';        // chrome.storage.session only, memory
  const MIGRATION_KEY = 'wbClipMigrated';
  const STAGED_MAX = 200;
  const STAGED_MAX_BYTES = 1024 * 1024;       // total, in characters, for the buffer
  const STAGED_ONE_MAX = 200000;              // one entry above this is not buffered
  const CHUNK = 200;

  const crypto = () => {
    const C = root.WBCrypto;
    if (!C) throw new Error('WBCrypto is not loaded (check the script order)');
    return C;
  };

  let settings = null;      // the envelope, or null when nothing is protected
  let dek = null;           // data key, plaintext, memory only
  let fpKey = null;         // keyed fingerprint key, derived from the same bytes
  let rawKeyCache = null;   // base64 of the data key, for the session store
  let ready = null;         // init() runs once
  const records = new WeakMap();   // in-memory item -> { plain, record }
  let queue = Promise.resolve();   // writes are serialised, never interleaved

  // ---------- chrome.storage plumbing ----------

  function store() {
    if (!root.chrome || !root.chrome.storage || !root.chrome.storage.local) return null;
    return root.chrome.storage.local;
  }
  function sessionStore() {
    if (!root.chrome || !root.chrome.storage || !root.chrome.storage.session) return null;
    return root.chrome.storage.session;
  }
  function lastError() {
    const e = root.chrome && root.chrome.runtime && root.chrome.runtime.lastError;
    return e ? (e.message || 'storage error') : null;
  }
  function get(key) {
    const s = store();
    if (!s) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      s.get(key, (d) => { void lastError(); resolve(d ? d[key] : undefined); });
    });
  }
  // Every write reports whether it worked. A full disk or a serialisation
  // failure must never look like a successful save.
  function set(key, value) {
    const s = store();
    if (!s) return Promise.resolve({ ok: false, error: 'no storage' });
    return new Promise((resolve) => {
      s.set({ [key]: value }, () => {
        const err = lastError();
        resolve({ ok: !err, error: err });
      });
    });
  }
  function remove(keys) {
    const s = store();
    if (!s) return Promise.resolve({ ok: false, error: 'no storage' });
    return new Promise((resolve) => {
      s.remove(keys, () => { const err = lastError(); resolve({ ok: !err, error: err }); });
    });
  }

  function enqueue(job) {
    const run = queue.then(job, job);
    queue = run.catch(() => { });
    return run;
  }

  // ---------- state ----------

  function init() {
    if (ready) return ready;
    ready = (async () => {
      settings = (await get(crypto().SETTINGS_KEY)) || null;
      watchSession();
      if (settings && sessionStore()) {
        try {
          const d = await sessionStore().get(crypto().SESSION_KEY);
          const raw = d && d[crypto().SESSION_KEY];
          if (typeof raw === 'string' && raw) await adoptKey(raw);
        } catch (e) { /* stay locked */ }
      }
      return state();
    })();
    return ready;
  }

  // The service worker and the popup are separate realms: the popup is the one
  // that unlocks, so the background has to notice the key appearing in the
  // session store rather than keeping the "locked" answer it cached at startup.
  let watching = false;
  function watchSession() {
    if (watching) return;
    const area = sessionStore();
    if (!area || !area.onChanged || !area.onChanged.addListener) return;
    watching = true;
    area.onChanged.addListener((changes) => {
      const ch = changes[crypto().SESSION_KEY];
      if (!ch) return;
      if (ch.newValue) adoptKey(ch.newValue).catch(() => { });
      else forgetKey();
    });
  }

  // Re-reads the session store once. Called before flushing what was captured
  // while locked, so those items are stored even if the event was missed.
  async function refresh() {
    await init();
    const area = sessionStore();
    if (!area || !settings) return state();
    try {
      const d = await area.get(crypto().SESSION_KEY);
      const raw = d && d[crypto().SESSION_KEY];
      if (typeof raw === 'string' && raw) await adoptKey(raw);
    } catch (e) { }
    return state();
  }

  function state() {
    return { protected: !!settings, unlocked: !!dek };
  }
  const isProtected = () => !!settings;
  const isUnlocked = () => !!dek;

  async function adoptKey(rawKey) {
    const C = crypto();
    dek = await C.fromRawKey(rawKey);
    rawKeyCache = rawKey;
    try { fpKey = await C.fingerprintKey(rawKey); } catch (e) { fpKey = null; }
    return dek;
  }

  function forgetKey() {
    dek = null; fpKey = null; rawKeyCache = null;
  }

  // ---------- protecting / unprotecting ----------

  // First time a password is set: creates the key, then encrypts everything
  // that is still in clear. The recovery code is returned once, to be shown.
  async function setup(password, opts) {
    opts = opts || {};
    const C = crypto();
    const made = await C.setup(password, opts);
    // Stored before it is adopted: if the write is refused, the module must not
    // believe the vault exists while the storage says otherwise.
    await C.settingsPut(made.settings);
    settings = made.settings;
    await adoptKey(made.rawKey);
    await C.sessionPut(made.rawKey);
    await enqueue(async () => { await migrateCore(); });
    return { recoveryCode: made.recoveryCode };
  }

  async function unlock(password) {
    const C = crypto();
    if (!settings) throw new Error('nothing is protected');
    const r = await C.unlock(password, settings);
    await adoptKey(r.rawKey);
    await C.sessionPut(r.rawKey);
    return true;
  }

  async function unlockWithRecoveryCode(code) {
    const C = crypto();
    if (!settings) throw new Error('nothing is protected');
    const r = await C.unlockWithRecoveryCode(code, settings);
    await adoptKey(r.rawKey);
    await C.sessionPut(r.rawKey);
    return true;
  }

  // Proving who you are, with either secret. Someone who opened the vault with
  // their recovery code has no password to give, and must still be able to change
  // the password or turn protection off.
  async function proveSecret(secret) {
    const C = crypto();
    const typed = String(secret == null ? '' : secret);
    if (!typed) throw new Error('Enter your password or your recovery code.');
    try {
      const r = await C.unlock(typed, settings);
      await adoptKey(r.rawKey);
      return;
    } catch (e) { /* not the password: it may be the recovery code */ }
    const r2 = await C.unlockWithRecoveryCode(typed, settings);   // throws if neither
    await adoptKey(r2.rawKey);
  }

  // The data key never changes: one value is re-wrapped, nothing is rewritten.
  async function changePassword(oldSecret, newPassword, opts) {
    const C = crypto();
    if (!settings) throw new Error('nothing is protected');
    if (String(oldSecret == null ? '' : oldSecret)) await proveSecret(oldSecret);
    else if (!rawKeyCache) throw new Error('locked');
    const ch = await C.rewrapPassword(settings, rawKeyCache, newPassword, opts);
    await C.settingsPut(ch.settings);
    settings = ch.settings;
    return true;
  }

  // Turning protection off has to actually decrypt EVERYTHING the key protects:
  // the list and the compressed bodies of long texts (IndexedDB). The key and its
  // envelopes are deleted last, and only once both writes went through; if
  // anything fails before that, the vault stays exactly as it was. Accepts the
  // password or the recovery code, for the same reason as changePassword.
  // Returns { ok, error?, unreadable, bodiesFailed }.
  async function disable(secret) {
    const C = crypto();
    if (!settings) return { ok: true, unreadable: 0, bodiesFailed: 0 };
    if (String(secret == null ? '' : secret)) await proveSecret(secret);
    else if (!rawKeyCache) throw new Error('locked');
    await adoptKey(rawKeyCache);

    // 1. Bodies of long texts. They are read back with the key, so this has to
    //    happen before the key goes away. Already-plain bodies are left alone.
    let bodiesFailed = 0;
    const Big = root.WBBig;
    if (Big && typeof Big.unprotectBodies === 'function') {
      const r = await Big.unprotectBodies();
      if (!r || r.ok === false) return { ok: false, error: 'bodies: ' + ((r && r.reason) || 'unknown'), unreadable: 0, bodiesFailed: 0 };
      bodiesFailed = r.failed || 0;
    }

    // 2. The list.
    const out = await enqueue(async () => {
      const raw = (await get(ITEMS_KEY)) || [];
      const list = [];
      let unreadable = 0;
      for (const it of raw) {
        if (it && typeof it === 'object' && C.isRecord(it.text)) {
          try {
            const plain = await C.decryptString(dek, it.text, C.PURPOSE.CLIP);
            const copy = Object.assign({}, it, { text: plain });
            delete copy.fp;                  // a keyed print is meaningless without the key
            list.push(copy);
          } catch (e) {
            // Corrupted with the right key: nothing is left to recover, and one
            // bad entry must not stop the person from turning protection off.
            unreadable++;
            const copy = Object.assign({}, it, { text: '', unreadable: true });
            delete copy.fp;
            list.push(copy);
          }
        } else if (it && typeof it === 'object' && it.unreadable && it.broken) {
          unreadable++;
          const copy = Object.assign({}, it, { text: '' });
          delete copy.broken; delete copy.fp;
          list.push(copy);
        } else list.push(it);
      }
      const res = await set(ITEMS_KEY, list);
      return { res, unreadable };
    });
    // 3. Only now is the key allowed to go. A refused write (disk full) keeps the
    //    vault intact so the person can free some space and try again.
    if (!out.res.ok) return { ok: false, error: out.res.error || 'write failed', unreadable: out.unreadable, bodiesFailed };
    settings = null;
    forgetKey();
    await C.sessionClear();
    await remove([C.SETTINGS_KEY, MIGRATION_KEY]);
    return { ok: true, unreadable: out.unreadable, bodiesFailed };
  }

  // ---------- reading and writing the list ----------

  // Returns { items, locked }. locked means "protected but no key in this
  // session yet": the caller must ask for the password before doing anything.
  async function load() {
    await init();
    const C = crypto();
    const raw = (await get(ITEMS_KEY)) || [];
    const list = Array.isArray(raw) ? raw : [];
    if (settings && !dek) return { items: [], locked: true };
    const items = [];
    for (const it of list) {
      if (!it || typeof it !== 'object') { items.push(it); continue; }
      if (C.isRecord(it.text)) {
        if (!dek) { items.push(it); continue; }
        let plain;
        try {
          plain = await C.decryptString(dek, it.text, C.PURPOSE.CLIP);
        } catch (e) {
          // A value that cannot be read is kept as shown, never dropped: the user
          // must be able to see that something is wrong and export the rest. The
          // original ciphertext is kept aside so a later save cannot overwrite it
          // with the empty placeholder.
          items.push(Object.assign({}, it, { text: '', unreadable: true, broken: it.text }));
          continue;
        }
        const copy = Object.assign({}, it, { text: plain });
        records.set(copy, { plain, record: it.text });
        items.push(copy);
      } else {
        items.push(it);
      }
    }
    return { items, locked: false };
  }

  // The plaintext of one item, whether it is stored encrypted or still in clear.
  // Used by the rare paths that really need the content (tier compression), never
  // by the capture path.
  async function decryptItem(it, purpose) {
    await init();
    const C = crypto();
    if (!it || typeof it !== 'object') return '';
    if (typeof it.text === 'string') return it.text;
    if (!C.isRecord(it.text)) return '';
    if (!dek) throw new Error('locked');
    return C.decryptString(dek, it.text, purpose || C.PURPOSE.CLIP);
  }

  async function stampFor(it) {
    const C = crypto();
    const out = { len: it.text.length };
    if (!it.fp && fpKey && it.text) {
      try { out.fp = await C.fingerprint(fpKey, it.text); } catch (e) { }
    }
    return out;
  }

  // Accepts a mixed array: values already encrypted (the background passes its
  // records straight through) and plaintext ones (the popup's in-memory list).
  // Returns { ok, error } so a failed write is never mistaken for a save.
  async function save(items) {
    await init();
    const C = crypto();
    const snapshot = Array.isArray(items) ? items.slice() : [];
    return enqueue(async () => {
      // Nothing is protected: store the list as it is, no crypto involved.
      if (!settings) return set(ITEMS_KEY, snapshot);
      if (!dek) return { ok: false, error: 'locked' };
      const out = [];
      for (const it of snapshot) {
        if (!it || typeof it !== 'object') { out.push(it); continue; }
        // A value that failed to decrypt keeps its original ciphertext: writing
        // the empty placeholder back would destroy what is left to recover.
        if (it.unreadable && it.broken) { out.push(Object.assign({}, it, { text: it.broken })); continue; }
        if (C.isRecord(it.text)) { out.push(it); continue; }
        if (typeof it.text !== 'string') { out.push(it); continue; }
        const cached = records.get(it);
        let record = cached && cached.plain === it.text ? cached.record : null;
        if (!record) {
          record = await C.encryptString(dek, it.text, C.PURPOSE.CLIP);
          records.set(it, { plain: it.text, record });
        }
        const extra = await stampFor(it);
        out.push(Object.assign({}, it, { text: record }, extra));
      }
      return set(ITEMS_KEY, out);
    });
  }

  // ---------- migration ----------
  // Idempotent and resumable: what is already encrypted is left untouched, so
  // running it twice, or after an interruption, is harmless.

  async function migrationState() {
    const C = crypto();
    const raw = (await get(ITEMS_KEY)) || [];
    return C.migrationState(Array.isArray(raw) ? raw : [], 'text');
  }

  async function migrateCore(onProgress) {
    await init();
    const C = crypto();
    if (!dek) return { ok: false, error: 'locked', done: false };
    const first = (await get(ITEMS_KEY)) || [];
    const st0 = C.migrationState(Array.isArray(first) ? first : [], 'text');
    if (st0.done) {
      await set(MIGRATION_KEY, true);
      return { ok: true, done: true, plain: 0 };
    }
    const isPlain = (it) => !!it && typeof it === 'object' && typeof it.text === 'string' && it.text.length > 0;
    let done = 0, failed = null;
    // Each round re-reads the list, encrypts the next CHUNK plain items and writes
    // it back at once. Working from a copy read at the start would overwrite
    // anything the service worker captured in the meantime; this keeps the window
    // to a few milliseconds per round. A half-migrated store stays readable (both
    // helpers accept plaintext and ciphertext), so an interruption can only leave
    // work to redo, never data unreadable.
    for (;;) {
      const raw = (await get(ITEMS_KEY)) || [];
      const cur = Array.isArray(raw) ? raw : [];
      const at = [];
      for (let i = 0; i < cur.length && at.length < CHUNK; i++) if (isPlain(cur[i])) at.push(i);
      if (!at.length) break;
      const next = cur.slice();
      for (const i of at) {
        const it = cur[i];
        const extra = { len: it.text.length };
        if (!it.fp && fpKey) { try { extra.fp = await C.fingerprint(fpKey, it.text); } catch (e) { } }
        next[i] = Object.assign({}, it, { text: await C.encryptString(dek, it.text, C.PURPOSE.CLIP) }, extra);
      }
      const res = await set(ITEMS_KEY, next);
      if (!res.ok) { failed = res.error; break; }
      done += at.length;
      if (onProgress) { try { onProgress({ done, total: st0.plain }); } catch (e) { } }
    }
    const st = await migrationState();
    if (failed) return { ok: false, error: failed, done: false, plain: st.plain };
    if (st.done) await set(MIGRATION_KEY, true);
    return { ok: true, done: st.done, plain: st.plain };
  }

  // External callers go through the write queue; setup() calls migrateCore so it
  // does not wait on a queue it is already inside.
  function migrateNow(onProgress) {
    return enqueue(() => migrateCore(onProgress));
  }

  // A fingerprint for a text the caller is about to store (the background uses
  // it to spot duplicates). Empty string when the vault is locked.
  async function fingerprintOf(text) {
    await init();
    if (!fpKey || !text) return '';
    try { return await crypto().fingerprint(fpKey, String(text)); } catch (e) { return ''; }
  }

  // Binary bodies of very long texts (IndexedDB, see bigtext.js). Same key, so
  // the body of a long text is protected exactly like its preview.
  async function encryptBody(bytes) {
    await init();
    if (!settings) return null;              // nothing protected: keep the old format
    if (!dek) throw new Error('locked');
    return crypto().encryptBody(dek, bytes);
  }
  async function decryptBody(record) {
    await init();
    if (!dek) throw new Error('locked');
    return crypto().decryptBody(dek, record);
  }
  const isBodyRecord = (x) => !!crypto().isBodyRecord(x);

  // ---------- captured while locked ----------
  // Nothing plaintext ever reaches chrome.storage.local, so captures made
  // before the first unlock wait in chrome.storage.session: memory only, wiped
  // when the browser closes, bounded. They are encrypted at the next unlock.

  // Read-modify-write on one key: two copies arriving together (poller plus a
  // page) must not both read the same list and overwrite each other.
  let stageChain = Promise.resolve();
  function inStageQueue(job) {
    const run = stageChain.then(job, job);
    stageChain = run.catch(() => { });
    return run;
  }

  function stage(item) { return inStageQueue(() => stageNow(item)); }
  async function stageNow(item) {
    const s = sessionStore();
    if (!s || !item || typeof item.text !== 'string') return false;
    // A single huge text would eat the session quota on its own; those are left
    // out rather than risking the whole buffer.
    if (item.text.length > STAGED_ONE_MAX) return false;
    try {
      const d = await s.get(STAGED_KEY);
      const list = Array.isArray(d && d[STAGED_KEY]) ? d[STAGED_KEY] : [];
      list.push(item);
      while (list.length > STAGED_MAX) list.shift();
      // Bound the total size too: 200 short texts and 200 long ones are not the
      // same thing, and chrome.storage.session has a fixed quota.
      let total = list.reduce((n, i) => n + (i && typeof i.text === 'string' ? i.text.length : 0), 0);
      while (list.length > 1 && total > STAGED_MAX_BYTES) {
        const dropped = list.shift();
        total -= dropped && typeof dropped.text === 'string' ? dropped.text.length : 0;
      }
      await s.set({ [STAGED_KEY]: list });
      return true;
    } catch (e) { return false; }
  }

  async function stagedCount() {
    const s = sessionStore();
    if (!s) return 0;
    try {
      const d = await s.get(STAGED_KEY);
      return Array.isArray(d && d[STAGED_KEY]) ? d[STAGED_KEY].length : 0;
    } catch (e) { return 0; }
  }

  // Takes the staged items and clears the buffer, so a failure to store them
  // does not silently duplicate them on the next attempt.
  function takeStaged() { return inStageQueue(takeStagedNow); }
  async function takeStagedNow() {
    const s = sessionStore();
    if (!s) return [];
    try {
      const d = await s.get(STAGED_KEY);
      const list = Array.isArray(d && d[STAGED_KEY]) ? d[STAGED_KEY] : [];
      if (!list.length) return [];
      await s.remove(STAGED_KEY);
      return list;
    } catch (e) { return []; }
  }

  const api = {
    ITEMS_KEY, STAGED_KEY, MIGRATION_KEY, STAGED_MAX, STAGED_MAX_BYTES, STAGED_ONE_MAX,
    init, state, isProtected, isUnlocked, refresh,
    setup, unlock, unlockWithRecoveryCode, changePassword, disable,
    load, save, migrateNow, migrationState, fingerprintOf, decryptItem,
    encryptBody, decryptBody, isBodyRecord,
    stage, stagedCount, takeStaged,
    // Test hook: puts the module back in its just-loaded state. In the browser the
    // session area is stable for the life of the realm, so `watching` only has to
    // be cleared here.
    _reset() { ready = null; settings = null; forgetKey(); queue = Promise.resolve(); stageChain = Promise.resolve(); watching = false; }
  };

  root.WBClip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
