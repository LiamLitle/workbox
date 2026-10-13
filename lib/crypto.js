// WorkBox — encryption of clipboard texts (and their long-text bodies).
//
// Envelope encryption. One random AES-256 key (the DEK) encrypts every stored
// value. The DEK is itself wrapped by a key derived from the user's password
// (the KEK), and wrapped a second time by the recovery code. Nothing derived
// from the password ever encrypts the data directly — that is what lets the
// service worker keep capturing in the background while the popup is closed:
// all it needs is the DEK, which lives in chrome.storage.session (memory only,
// never written to disk).
//
// Changing the password re-wraps the DEK. No stored value is rewritten.
//
// Shared by the service worker (importScripts), the popup (<script>) and the
// Node test suite (require), the same way protection.js and bigtext.js are.
//
// Storage layout
//   chrome.storage.local   wbCryptoSettings  -> { v, kdf, iterations, salt,
//                                                 wrapped, recovery, createdAt }
//   chrome.storage.session wbDekV1           -> base64 of the raw DEK
//   any encrypted value                      -> { v, iv, ct } (base64)
(function (root) {
  'use strict';

  const VERSION = 1;
  const KDF = 'PBKDF2-SHA256';
  const ITERATIONS = 600000;        // OWASP guidance for PBKDF2-HMAC-SHA256
  const SALT_BYTES = 16;
  const IV_BYTES = 12;              // 96 bits, the size AES-GCM is defined for
  const KEY_BYTES = 32;
  const AAD_DEK = 'dek';
  const AAD_PREFIX = 'workbox:v1:';
  // Letters and digits that cannot be confused when read aloud or retyped from
  // paper: no I, L, O, 0 or 1. 31 symbols over 24 characters is ~119 bits.
  const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const RECOVERY_LEN = 24;          // ~120 bits
  const RECOVERY_GROUP = 6;
  // Shown in front of the code ("WP" = WorkBox Password). It is only a label, never part
  // of the secret: it lets WorkBox recognise the code if it lands in the clipboard.
  const RECOVERY_PREFIX = 'WP';
  const SETTINGS_KEY = 'wbCryptoSettings';
  const SESSION_KEY = 'wbDekV1';

  // What each field is bound to. The value is authenticated, not secret: it only
  // makes sure a value encrypted for one field cannot be replayed into another.
  // EXPANDER is reserved: text-expander rules are not encrypted yet.
  const PURPOSE = { CLIP: 'clip', EXPANDER: 'expander' };

  function fail(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  function webcrypto() {
    const c = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (!c || !c.subtle) throw fail('NO_WEBCRYPTO', 'WebCrypto is unavailable in this context.');
    return c;
  }
  function subtle() { return webcrypto().subtle; }
  const utf8 = () => new TextEncoder();
  const unutf8 = () => new TextDecoder();

  const b64 = (() => {
    const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const REV = new Int16Array(128).fill(-1);
    for (let i = 0; i < 64; i++) REV[AL.charCodeAt(i)] = i;
    return { AL, REV };
  })();

  // Chunked on purpose: a 4 MB clipboard text must not build one huge string,
  // and String.fromCharCode.apply would blow the stack on that input.
  function toB64(bytes) {
    const parts = [];
    let buf = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const has1 = i + 1 < bytes.length, has2 = i + 2 < bytes.length;
      const b1 = has1 ? bytes[i + 1] : 0, b2 = has2 ? bytes[i + 2] : 0;
      buf += b64.AL[b0 >> 2] + b64.AL[((b0 & 3) << 4) | (b1 >> 4)]
        + (has1 ? b64.AL[((b1 & 15) << 2) | (b2 >> 6)] : '=')
        + (has2 ? b64.AL[b2 & 63] : '=');
      if (buf.length >= 8192) { parts.push(buf); buf = ''; }
    }
    if (buf) parts.push(buf);
    return parts.join('');
  }

  function fromB64(str) {
    const s = String(str);
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 61) end--;   // trailing '='
    const out = new Uint8Array(Math.floor((end * 3) / 4));
    let acc = 0, bits = 0, o = 0;
    for (let i = 0; i < end; i++) {
      const v = b64.REV[s.charCodeAt(i) & 127];
      if (v < 0) continue;                                   // ignore newlines/spaces
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xff; }
    }
    return o === out.length ? out : out.subarray(0, o);
  }

  const aad = (purpose) => utf8().encode(AAD_PREFIX + (purpose || 'generic'));

  // ---------- encrypted values ----------

  function isRecord(x) {
    return !!x && typeof x === 'object' && x.v === VERSION
      && typeof x.iv === 'string' && typeof x.ct === 'string' && x.ct.length > 0;
  }

  async function encryptString(dek, plaintext, purpose) {
    const iv = webcrypto().getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(purpose) }, dek, utf8().encode(String(plaintext)));
    return { v: VERSION, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }

  async function decryptString(dek, record, purpose) {
    if (!isRecord(record)) throw fail('BAD_DATA', 'Not an encrypted value.');
    let buf;
    try {
      buf = await subtle().decrypt(
        { name: 'AES-GCM', iv: fromB64(record.iv), additionalData: aad(purpose) },
        dek, fromB64(record.ct));
    } catch (e) {
      throw fail('BAD_DATA', 'Value could not be decrypted: wrong key or altered data.');
    }
    return unutf8().decode(buf);
  }

  // Copies of the same text give the same fingerprint, and nothing else does.
  // The background uses it to spot duplicates without ever decrypting the list.
  // Keyed, so a short text cannot be confirmed by guessing: a plain hash of a
  // 10-character clipboard entry would be trivial to brute force.
  async function fingerprintKey(rawKey) {
    const base = await subtle().importKey('raw', fromB64(rawKey), 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: utf8().encode('workbox:v1:fp'), info: utf8().encode('fingerprint') },
      base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  }

  async function fingerprint(key, text) {
    const sig = await subtle().sign('HMAC', key, utf8().encode(String(text)));
    return toB64(new Uint8Array(sig).subarray(0, 16));
  }

  // Same idea for binary payloads (the compressed body of a very long text).
  // Binary in, binary out: IndexedDB stores an ArrayBuffer as-is, so there is no
  // base64 layer inflating what is already a compressed body.
  function isBodyRecord(x) {
    return !!x && typeof x === 'object' && x.v === VERSION
      && x.iv instanceof Uint8Array && (x.ct instanceof ArrayBuffer || ArrayBuffer.isView(x.ct));
  }

  async function encryptBody(dek, bytes) {
    const iv = webcrypto().getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: aad('body') }, dek, bytes);
    return { v: VERSION, iv, ct };
  }

  async function decryptBody(dek, record) {
    if (!isBodyRecord(record)) throw fail('BAD_DATA', 'Not an encrypted body.');
    try {
      return new Uint8Array(await subtle().decrypt(
        { name: 'AES-GCM', iv: record.iv, additionalData: aad('body') }, dek, record.ct));
    } catch (e) {
      throw fail('BAD_DATA', 'Body could not be decrypted: wrong key or altered data.');
    }
  }

  // ---------- key material ----------

  async function deriveKek(secret, salt, iterations) {
    const base = await subtle().importKey('raw', utf8().encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function wrapBytes(kek, raw, aadLabel) {
    const iv = webcrypto().getRandomValues(new Uint8Array(IV_BYTES));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aadLabel }, kek, raw);
    return { v: VERSION, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }

  async function unwrapBytes(kek, wrapped, aadLabel, wrongCode) {
    if (!isRecord(wrapped)) throw fail(wrongCode, 'Missing or malformed envelope.');
    try {
      const raw = await subtle().decrypt(
        { name: 'AES-GCM', iv: fromB64(wrapped.iv), additionalData: aadLabel },
        kek, fromB64(wrapped.ct));
      return new Uint8Array(raw);
    } catch (e) {
      // The GCM authentication tag is the password check: no hash is stored
      // anywhere, so there is nothing extra to keep in sync.
      throw fail(wrongCode, wrongCode === 'WRONG_PASSWORD' ? 'Wrong password.' : 'Wrong recovery code.');
    }
  }

  async function importDek(rawBytes) {
    if (rawBytes.length !== KEY_BYTES) throw fail('BAD_KEY', 'Unexpected key length.');
    return subtle().importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  function newRecoveryCode() {
    // Rejection sampling: 256 is not a multiple of 31, so a plain modulo would make
    // the first symbols slightly more likely. Bytes at or above the largest
    // multiple of 31 are thrown away.
    const n = RECOVERY_ALPHABET.length;
    const limit = 256 - (256 % n);
    let code = '';
    while (code.length < RECOVERY_LEN) {
      const bytes = webcrypto().getRandomValues(new Uint8Array(RECOVERY_LEN * 2));
      for (let i = 0; i < bytes.length && code.length < RECOVERY_LEN; i++) {
        if (bytes[i] < limit) code += RECOVERY_ALPHABET[bytes[i] % n];
      }
    }
    return groupRecovery(code);
  }
  function groupRecovery(code) {
    const groups = [];
    for (let i = 0; i < code.length; i += RECOVERY_GROUP) groups.push(code.slice(i, i + RECOVERY_GROUP));
    return RECOVERY_PREFIX + '-' + groups.join('-');
  }
  // Tolerates lower case, spaces and dashes, so a user can retype it by hand. The WP
  // label is removed: only the 24 random symbols feed the key.
  function normalizeRecovery(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return hasRecoveryPrefix(c) ? c.slice(RECOVERY_PREFIX.length) : c;
  }
  function hasRecoveryPrefix(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length === RECOVERY_PREFIX.length + RECOVERY_LEN && c.startsWith(RECOVERY_PREFIX);
  }
  // The prefix is required: a code typed without it is refused.
  function isWellFormedRecovery(code) {
    if (!hasRecoveryPrefix(code)) return false;
    const c = normalizeRecovery(code);
    for (const ch of c) if (RECOVERY_ALPHABET.indexOf(ch) < 0) return false;
    return true;
  }
  // Is this copied text a recovery code? The capture ignores it, so the code never
  // reaches the history.
  function looksLikeRecoveryCode(text) {
    const t = String(text || '').trim();
    if (t.length > 60 || !/^WP/i.test(t)) return false;
    return isWellFormedRecovery(t);
  }

  function requirePassword(password, min) {
    const p = String(password == null ? '' : password);
    if (p.length < (min == null ? 1 : min)) throw fail('WEAK_PASSWORD', 'Password is too short.');
    return p;
  }

  // ---------- lifecycle ----------

  // Creates the DEK and both envelopes. Returns the settings to store, the code
  // to show the user once, and the DEK ready to use.
  async function setup(password, opts) {
    opts = opts || {};
    const iterations = opts.iterations || ITERATIONS;
    const minLength = opts.minLength == null ? 1 : opts.minLength;
    const pw = requirePassword(password, minLength);

    const dek = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = new Uint8Array(await subtle().exportKey('raw', dek));
    const rawKey = toB64(raw);

    const salt = webcrypto().getRandomValues(new Uint8Array(SALT_BYTES));
    const kek = await deriveKek(pw, salt, iterations);
    const wrapped = await wrapBytes(kek, raw, aad(AAD_DEK));

    const recoveryCode = opts.recoveryCode || newRecoveryCode();
    if (!isWellFormedRecovery(recoveryCode)) {
      raw.fill(0);
      throw fail('BAD_RECOVERY', 'Malformed recovery code.');
    }
    const recSalt = webcrypto().getRandomValues(new Uint8Array(SALT_BYTES));
    const recKek = await deriveKek(normalizeRecovery(recoveryCode), recSalt, iterations);
    const recoveryWrapped = await wrapBytes(recKek, raw, aad(AAD_DEK));

    const settings = {
      v: VERSION, kdf: KDF, iterations,
      salt: toB64(salt), wrapped,
      recovery: { salt: toB64(recSalt), wrapped: recoveryWrapped },
      createdAt: Date.now()
    };

    const key = await importDek(raw);
    raw.fill(0);
    return { settings, dek: key, rawKey, recoveryCode };
  }

  // Rebuilds the DEK from the raw bytes kept in chrome.storage.session.
  async function fromRawKey(rawKey) {
    return importDek(fromB64(rawKey));
  }

  async function unlock(password, settings) {
    if (!settings) throw fail('NOT_CONFIGURED', 'No encryption settings.');
    const kek = await deriveKek(requirePassword(password), fromB64(settings.salt), settings.iterations || ITERATIONS);
    const raw = await unwrapBytes(kek, settings.wrapped, aad(AAD_DEK), 'WRONG_PASSWORD');
    const key = await importDek(raw);
    const rawKey = toB64(raw);
    raw.fill(0);
    return { dek: key, rawKey };
  }

  async function unlockWithRecoveryCode(code, settings) {
    if (!settings || !settings.recovery) throw fail('NOT_CONFIGURED', 'No recovery envelope.');
    if (!isWellFormedRecovery(code)) throw fail('WRONG_RECOVERY_CODE', 'A recovery code starts with WP.');
    const kek = await deriveKek(
      normalizeRecovery(code), fromB64(settings.recovery.salt), settings.iterations || ITERATIONS);
    const raw = await unwrapBytes(kek, settings.recovery.wrapped, aad(AAD_DEK), 'WRONG_RECOVERY_CODE');
    const key = await importDek(raw);
    const rawKey = toB64(raw);
    raw.fill(0);
    return { dek: key, rawKey };
  }

  // Same DEK, new password: one value re-wrapped, no data rewritten.
  async function changePassword(settings, oldPassword, newPassword, opts) {
    opts = opts || {};
    const iterations = opts.iterations || settings.iterations || ITERATIONS;
    const current = await unlock(oldPassword, settings);
    const raw = fromB64(current.rawKey);
    const pw = requirePassword(newPassword, opts.minLength == null ? 1 : opts.minLength);
    const salt = webcrypto().getRandomValues(new Uint8Array(SALT_BYTES));
    const kek = await deriveKek(pw, salt, iterations);
    const wrapped = await wrapBytes(kek, raw, aad(AAD_DEK));
    raw.fill(0);
    return {
      settings: Object.assign({}, settings, { iterations, salt: toB64(salt), wrapped, updatedAt: Date.now() }),
      dek: current.dek, rawKey: current.rawKey
    };
  }

  // Re-wraps a key that is already in hand under a new password. Someone who
  // opened the vault with their recovery code has no password to give, so there
  // is nothing to unwrap: the data key is already available. The recovery
  // envelope is left untouched, so the code the user wrote down keeps working.
  async function rewrapPassword(settings, rawKey, newPassword, opts) {
    opts = opts || {};
    const iterations = opts.iterations || settings.iterations || ITERATIONS;
    const raw = fromB64(rawKey);
    if (raw.length !== KEY_BYTES) throw fail('BAD_KEY', 'Unexpected key length.');
    const pw = requirePassword(newPassword, opts.minLength == null ? 1 : opts.minLength);
    const salt = webcrypto().getRandomValues(new Uint8Array(SALT_BYTES));
    const kek = await deriveKek(pw, salt, iterations);
    const wrapped = await wrapBytes(kek, raw, aad(AAD_DEK));
    raw.fill(0);
    return { settings: Object.assign({}, settings, { iterations, salt: toB64(salt), wrapped, updatedAt: Date.now() }) };
  }

  async function changeRecoveryCode(settings, password, newCode, opts) {
    opts = opts || {};
    const iterations = opts.iterations || settings.iterations || ITERATIONS;
    const current = await unlock(password, settings);
    const raw = fromB64(current.rawKey);
    const code = newCode || newRecoveryCode();
    if (!isWellFormedRecovery(code)) { raw.fill(0); throw fail('BAD_RECOVERY', 'Malformed recovery code.'); }
    const salt = webcrypto().getRandomValues(new Uint8Array(SALT_BYTES));
    const kek = await deriveKek(normalizeRecovery(code), salt, iterations);
    const wrapped = await wrapBytes(kek, raw, aad(AAD_DEK));
    raw.fill(0);
    return {
      settings: Object.assign({}, settings, { recovery: { salt: toB64(salt), wrapped }, updatedAt: Date.now() }),
      recoveryCode: groupRecovery(normalizeRecovery(code))
    };
  }

  // ---------- list helpers ----------
  // Both directions are tolerant: a value that is already in the target state is
  // left alone. That is what makes the migration resumable and idempotent, and
  // it means a half-migrated store still reads correctly.

  async function encryptField(dek, items, field, purpose) {
    const out = [];
    for (const it of items || []) {
      if (!it || typeof it !== 'object') { out.push(it); continue; }
      const v = it[field];
      if (typeof v === 'string' && v.length) {
        out.push(Object.assign({}, it, { [field]: await encryptString(dek, v, purpose) }));
      } else {
        out.push(it);
      }
    }
    return out;
  }

  async function decryptField(dek, items, field, purpose) {
    const out = [];
    for (const it of items || []) {
      if (!it || typeof it !== 'object') { out.push(it); continue; }
      const v = it[field];
      if (isRecord(v)) {
        out.push(Object.assign({}, it, { [field]: await decryptString(dek, v, purpose) }));
      } else {
        out.push(it);
      }
    }
    return out;
  }

  // Counts what a migration still has to do, without touching anything.
  // An empty text is not counted as work: encryptField skips it, so counting it
  // would leave the migration looking unfinished forever.
  function migrationState(items, field) {
    let plain = 0, encrypted = 0, empty = 0;
    for (const it of items || []) {
      if (!it || typeof it !== 'object') continue;
      if (isRecord(it[field])) encrypted++;
      else if (typeof it[field] === 'string') { if (it[field].length) plain++; else empty++; }
    }
    return { plain, encrypted, empty, total: plain + encrypted, done: plain === 0 };
  }

  // ---------- chrome.storage.session plumbing ----------
  // The raw DEK lives here: memory only, cleared when the browser closes, and
  // not readable by content scripts. Never chrome.storage.local.

  function hasSession() {
    return !!(root.chrome && root.chrome.storage && root.chrome.storage.session);
  }
  // Failures here are reported as a boolean, never thrown: losing the session
  // copy of the key only means "locked again after a restart", and it must not
  // be mistaken for a wrong password by the caller.
  async function sessionPut(rawKey) {
    if (!hasSession()) return false;
    try {
      await root.chrome.storage.session.set({ [SESSION_KEY]: rawKey });
      return true;
    } catch (e) { return false; }
  }
  async function sessionGet() {
    if (!hasSession()) return null;
    try {
      const d = await root.chrome.storage.session.get(SESSION_KEY);
      const raw = d && d[SESSION_KEY];
      return typeof raw === 'string' && raw ? fromRawKey(raw) : null;
    } catch (e) { return null; }
  }
  async function sessionClear() {
    if (!hasSession()) return false;
    try {
      await root.chrome.storage.session.remove(SESSION_KEY);
      return true;
    } catch (e) { return false; }
  }
  async function settingsGet() {
    if (!root.chrome || !root.chrome.storage) return null;
    const d = await root.chrome.storage.local.get(SETTINGS_KEY);
    return (d && d[SETTINGS_KEY]) || null;
  }
  async function settingsPut(settings) {
    await root.chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    return settings;
  }

  const api = {
    VERSION, KDF, ITERATIONS, KEY_BYTES, PURPOSE, SETTINGS_KEY, SESSION_KEY,
    isRecord, encryptString, decryptString,
    isBodyRecord, encryptBody, decryptBody, fingerprintKey, fingerprint,
    setup, unlock, unlockWithRecoveryCode, changePassword, changeRecoveryCode, rewrapPassword,
    fromRawKey, newRecoveryCode, normalizeRecovery, isWellFormedRecovery, hasRecoveryPrefix, looksLikeRecoveryCode,
    encryptField, decryptField, migrationState,
    sessionPut, sessionGet, sessionClear, settingsGet, settingsPut
  };

  root.WBCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
