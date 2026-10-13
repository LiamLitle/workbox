document.addEventListener('DOMContentLoaded', () => {

  // @module 01-icons  (dev/popup-src/01-icons.js)
  // ---- Line icons (replace emoji in the interface) ----
  // Icons are CSS masks defined in popup.css (.ico[data-i="name"]), so they follow the text colour.
  // Category names such as '📝 Text' are stored data and stay as they are; only what is shown changes.
  const ICON_OF_EMOJI = {
    '📝': 'text', '🔗': 'link', '🎥': 'video', '🖼️': 'image', '🎨': 'color', '🔒': 'private',
    '🔑': 'password', '✉️': 'email', '📞': 'phone', '💻': 'code', '🔢': 'number', '📅': 'date',
    '💰': 'price', '📍': 'address', '🔐': 'apikey', '📄': 'document', '📋': 'list', '📌': 'pin',
    '🏷️': 'tag', '🎵': 'music', '🗜️': 'compress', '🛡️': 'protection', '🔎': 'aisearch',
    '🔄': 'convert', '⏱️': 'timer', '⚡': 'text', '📷': 'qr', '🗂️': 'tabs'
  };
  const ico = (name, gap) => `<span class="ico${gap ? ' ico-gap' : ''}" data-i="${name}" aria-hidden="true"></span>`;
  // '📝 Text' -> icon + escaped 'Text'. Unknown leading emoji are dropped.
  function iconLabelHtml(label) {
    const s = String(label);
    const m = s.match(/^(\p{Extended_Pictographic}️?)\s*/u);
    if (!m) return escapeHtml(s);
    const name = ICON_OF_EMOJI[m[1]] || ICON_OF_EMOJI[m[1].replace('️', '')];
    const rest = escapeHtml(s.slice(m[0].length));
    return name ? ico(name, true) + rest : rest;
  }
  // @module 02-tab-triage  (dev/popup-src/02-tab-triage.js)
  // Tab triage module (the sorting itself happens in background.js)
  (function initTabTriage() {
    const box = document.getElementById('tabTriageToggle');
    if (!box) return;
    const area = document.getElementById('tabTriageWhite');
    const addBtn = document.getElementById('tabTriageAddCurrent');
    const stateEl = document.getElementById('ttState');
    const COLORS = { grey: '#9aa0a6', blue: '#4f8df5', red: '#ee5a52', yellow: '#f4c430', green: '#3bb273', pink: '#ec6bb0', purple: '#9b6bf2', cyan: '#2cc3d6', orange: '#f28b30' };
    const DEF = { todo: { title: '🔴 Not opened yet', color: 'red' }, done: { title: '🟢 Already opened', color: 'green' } };
    const ui = {
      todo: { input: document.getElementById('ttNameTodo'), colors: document.getElementById('ttColorsTodo'), chip: document.getElementById('ttChipTodo') },
      done: { input: document.getElementById('ttNameDone'), colors: document.getElementById('ttColorsDone'), chip: document.getElementById('ttChipDone') }
    };
    let names = JSON.parse(JSON.stringify(DEF));
    let on = false;

    const clean = (txt) => Array.from(new Set(String(txt).split(/[\s,;]+/).map((s) => {
      s = s.trim().toLowerCase();
      try { if (/^https?:/.test(s)) s = new URL(s).hostname; } catch (_) { }
      return s.replace(/^www\./, '').replace(/\/.*$/, '');
    }).filter(Boolean)));

    // Dark or light text, whichever reads better on the group color
    function textOn(hex) {
      const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14110d' : '#ffffff';
    }
    function paintSwitch() {
      box.setAttribute('aria-checked', on ? 'true' : 'false');
      box.classList.toggle('off', !on);
      stateEl.textContent = on ? 'Tab triage is on' : 'Tab triage is off';
    }
    function paintGroups() {
      ['todo', 'done'].forEach((k) => {
        const u = ui[k], n = names[k];
        u.chip.querySelector('b').textContent = n.title || DEF[k].title;
        const col = COLORS[n.color] || COLORS.grey;
        u.chip.style.setProperty('--chip', col);
        u.chip.style.setProperty('--chip-text', textOn(col));
        u.colors.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset.color === n.color ? 'true' : 'false'));
      });
    }
    const saveNames = () => chrome.storage.local.set({ tabTriageNames: names });

    ['todo', 'done'].forEach((k) => {
      const u = ui[k];
      Object.keys(COLORS).forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tt-dot'; b.dataset.color = c; b.title = c;
        b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c);
        b.style.background = COLORS[c];
        b.addEventListener('click', () => { names[k].color = c; paintGroups(); saveNames(); });
        u.colors.appendChild(b);
      });
      u.input.addEventListener('input', () => { names[k].title = u.input.value; paintGroups(); });
      u.input.addEventListener('change', () => {
        names[k].title = u.input.value.trim() || DEF[k].title;
        u.input.value = names[k].title;
        paintGroups(); saveNames();
      });
    });
    document.getElementById('ttReset').addEventListener('click', () => {
      names = JSON.parse(JSON.stringify(DEF));
      ['todo', 'done'].forEach((k) => { ui[k].input.value = names[k].title; });
      paintGroups(); saveNames();
      showToast('Names and colors reset');
    });

    chrome.storage.local.get(['tabTriage', 'tabTriageWhitelist', 'tabTriageNames'], (r) => {
      on = r.tabTriage === true;
      const n = r.tabTriageNames || {};
      ['todo', 'done'].forEach((k) => {
        names[k] = { title: (n[k] && n[k].title) || DEF[k].title, color: (n[k] && n[k].color) || DEF[k].color };
        ui[k].input.value = names[k].title;
      });
      if (area) area.value = (r.tabTriageWhitelist || []).join('\n');
      paintSwitch(); paintGroups();
    });
    box.addEventListener('click', () => {
      on = !on; paintSwitch();
      chrome.storage.local.set({ tabTriage: on });
      showToast(on ? 'Tab triage on' : 'Tab triage off');
    });
    const saveList = () => { const list = clean(area.value); area.value = list.join('\n'); chrome.storage.local.set({ tabTriageWhitelist: list }); };
    area.addEventListener('change', saveList);
    addBtn.addEventListener('click', async () => {
      try {
        const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const host = new URL(t.url).hostname.replace(/^www\./, '');
        area.value = clean(area.value + '\n' + host).join('\n');
        saveList();
        showToast('Added ' + host);
      } catch (_) { showToast('No site to add'); }
    });
  })();

  // @module 03-app-lock  (dev/popup-src/03-app-lock.js)
  // App lock : hash local du mot de passe, vérifié au démarrage du popup
  // Legacy only: the SHA-256 hash of a password set by an older version. It is
  // never written again — the vault's own envelope replaces it — but it is still
  // checked once, so an update can turn an existing password into a real key
  // instead of asking the user to choose a new one.
  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function askSecureConfirm(title, desc, callback) {
    chrome.storage.local.get('appLockHash', (data) => {
      // A password is set once the vault is protected; the legacy hash still
      // counts, so a user who has not opened the popup since the update is asked
      // for it rather than being let through.
      const hasPassword = WBClip.isProtected() || !!data.appLockHash;
      const overlay = document.getElementById('passwordConfirmModalOverlay');
      const titleEl = document.getElementById('passwordConfirmTitle');
      const descEl = document.getElementById('passwordConfirmDesc');
      const inputWrap = document.getElementById('passwordConfirmInputWrapper');
      const input = document.getElementById('passwordConfirmInput');
      const error = document.getElementById('passwordConfirmError');
      const btnCancel = document.getElementById('passwordConfirmCancelBtn');
      const btnOk = document.getElementById('passwordConfirmOkBtn');

      if (!overlay) {
        // Fallback natif si le modal n'est pas dans le HTML
        if (hasPassword) {
          const pwd = prompt(`🔒 ${title}\n\nEnter your password to confirm:`);
          if (pwd !== null) callback(true, pwd.trim());
          else callback(false);
        } else {
          if (confirm(`⚠️ ${title}\n\n${desc}`)) callback(true, null);
          else callback(false);
        }
        return;
      }

      // Configurer le modal
      titleEl.textContent = title;
      descEl.textContent = desc;
      input.value = '';
      error.style.opacity = '0';
      
      if (hasPassword) {
        inputWrap.style.display = 'block';
      } else {
        inputWrap.style.display = 'none';
      }

      overlay.classList.add('active');
      setTimeout(() => { if (hasPassword) input.focus(); else btnOk.focus(); }, 100);

      // Gestionnaires d'événements temporaires
      // document level: Escape must work even when nothing inside the dialog has focus
      const onDocKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault(); e.stopPropagation();
        cleanup(); callback(false);
      };
      const cleanup = () => {
        overlay.classList.remove('active');
        btnCancel.onclick = null;
        btnOk.onclick = null;
        input.onkeydown = null;
        overlay.onkeydown = null;
        document.removeEventListener('keydown', onDocKey, true);
      };
      document.addEventListener('keydown', onDocKey, true);

      const submit = async () => {
        if (hasPassword && !input.value.trim()) {
          error.textContent = 'Please enter a password';
          error.style.opacity = '1';
          input.focus();
          return;
        }
        if (hasPassword) {
          const typed = input.value.trim();
          let ok = false;
          if (WBClip.isProtected()) {
            // Either secret is accepted: someone who opened the vault with their
            // recovery code has no password to type here.
            try { await WBClip.unlock(typed); ok = true; }
            catch (e) {
              try { await WBClip.unlockWithRecoveryCode(typed); ok = true; } catch (e2) { ok = false; }
            }
          } else {
            ok = (await hashPassword(typed)) === data.appLockHash;
          }
          if (!ok) {
            error.textContent = WBClip.isProtected() ? 'Wrong password or recovery code' : 'Incorrect password';
            error.style.opacity = '1';
            input.focus();
            return;
          }
        }
        cleanup();
        callback(true, hasPassword ? input.value.trim() : null);
      };
      btnCancel.onclick = () => { cleanup(); callback(false); };
      btnOk.onclick = submit;
      input.onkeydown = (e) => {
        error.style.opacity = '0';
        if (e.key === 'Enter') submit();
      };
    });
  }

  function initAppLock() {
    const overlay = document.getElementById('appLockOverlay');
    const lockInput = document.getElementById('appLockInput');
    const lockError = document.getElementById('appLockError');
    const forgotBtn = document.getElementById('appLockForgotBtn');
    const forgotPanel = document.getElementById('appLockForgotPanel');
    const recoveryInput = document.getElementById('appLockRecoveryInput');
    const recoveryBtn = document.getElementById('appLockRecoveryBtn');
    const recoveryError = document.getElementById('appLockRecoveryError');
    const saveBtn = document.getElementById('appLockSaveBtn');
    const removeBtn = document.getElementById('appLockRemoveBtn');
    const settingsInput = document.getElementById('appLockSettingsInput');
    const statusBanner = document.getElementById('appLockStatusBanner');

    const BANNER_ACTIVE = '<div style="margin-bottom:10px;font-size:11px;color:#22c55e;">Lock <strong>enabled</strong> — saved texts are <strong>encrypted</strong></div>';
    const BANNER_NONE   = '<div style="margin-bottom:10px;font-size:11px;color:#ffc107;">No password set. Saved texts are <strong>not encrypted</strong>.</div>';

    // Settings pane: with a password already set, only a "Reset password" button
    // shows; the new-password field appears once it is pressed.
    let resetting = false;
    function syncPasswordUi() {
      if (!saveBtn) return;
      const on = WBClip.isProtected();
      if (settingsInput) settingsInput.style.display = (!on || resetting) ? '' : 'none';
      saveBtn.textContent = !on ? 'Set the password' : (resetting ? 'Save new password' : 'Reset password');
      if (removeBtn) removeBtn.className = on ? 'wb-link-btn' : removeBtn.className;
    }

    function setBackgroundInert(on) {
      Array.from(document.body.children).forEach(el => {
        if (el === overlay || el.tagName === 'SCRIPT') return;
        if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
      });
    }
    function showLock() { overlay.classList.add('active'); setBackgroundInert(true); setTimeout(() => lockInput && lockInput.focus(), 120); }
    function hideLock() { overlay.classList.remove('active'); setBackgroundInert(false); }

    function showRecoveryCode(code) {
      const rcOverlay = document.getElementById('recoveryCodeOverlay');
      const rcDisplay = document.getElementById('recoveryCodeDisplay');
      const rcCopyBtn = document.getElementById('recoveryCodeCopyBtn');
      const rcCloseBtn = document.getElementById('recoveryCodeCloseBtn');
      if (!rcOverlay || !rcDisplay) return;
      // WP + four groups, laid out in a grid so it never wraps in the middle of a group
      rcDisplay.textContent = '';
      const parts = String(code).split('-');
      parts.forEach((p, i) => {
        const span = document.createElement('span');
        if (i === 0) span.className = 'rc-wp';
        span.textContent = p;
        rcDisplay.appendChild(span);
      });
      rcOverlay.classList.add('active');
      if (rcCopyBtn) rcCopyBtn.onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
          rcCopyBtn.textContent = 'Copied';
          setTimeout(() => { rcCopyBtn.textContent = 'Copy'; }, 2000);
        }).catch(() => { });
      };
      if (rcCloseBtn) rcCloseBtn.onclick = () => rcOverlay.classList.remove('active');
    }

    // Everything that may still be in clear: the list first, then the compressed
    // bodies of the long texts, which live in IndexedDB and need their own pass —
    // without it, texts saved before the password would stay readable there.
    async function migrateAll() {
      try { await WBClip.migrateNow(); } catch (e) { }
      try { await WBBig.migrateBodies(); } catch (e) { }
    }

    // Runs once the key is in hand, whichever way it was obtained.
    async function afterUnlock() {
      hideLock();
      if (lockInput) lockInput.value = '';
      if (lockError) lockError.style.opacity = '0';
      if (removeBtn) removeBtn.style.display = 'block';
      if (statusBanner) { statusBanner.innerHTML = BANNER_ACTIVE; statusBanner.style.display = 'block'; }
      // Show the list first: a migration can take a moment on a long history and
      // must not hold the popup hostage. Both helpers read plaintext and
      // ciphertext, so the list is right before, during and after.
      loadClipboard();
      try {
        await migrateAll();
        // Store whatever was copied while the vault was locked. The flush lands
        // back through storage.onChanged, which refreshes the list.
        chrome.runtime.sendMessage({ type: 'WB_FLUSH_STAGED' }, () => { void chrome.runtime.lastError; });
      } catch (e) { }
    }

    (async () => {
      await WBClip.init();
      const data = await new Promise((r) => chrome.storage.local.get(['appLockHash'], r));
      const legacyHash = data && data.appLockHash ? data.appLockHash : '';
      const protectedNow = WBClip.isProtected();
      // A password is needed when the vault is protected but this browser session
      // has no key yet, or when an older version's password is still in place.
      const needPassword = protectedNow ? !WBClip.isUnlocked() : !!legacyHash;
      syncPasswordUi();

      document.body.classList.remove('app-loading');
      if (statusBanner) statusBanner.style.display = 'block';

      if (!needPassword) {
        overlay.classList.remove('active');
        if (statusBanner) statusBanner.innerHTML = protectedNow ? BANNER_ACTIVE : BANNER_NONE;
        if (protectedNow) {
          if (removeBtn) removeBtn.style.display = 'block';
          // an interrupted migration is finished quietly in the background
          WBClip.migrateNow().catch(() => { });
        }
        return;
      }

      showLock();
      if (removeBtn) removeBtn.style.display = 'block';
      if (statusBanner) statusBanner.innerHTML = protectedNow ? BANNER_ACTIVE : BANNER_NONE;
      // One attempt at a time. `silent` is used while typing: a wrong guess then says
      // nothing and keeps what was typed; only Enter reports a wrong password.
      let attempting = false;
      let autoTimer = null;
      const fail = () => {
        lockError.style.opacity = '1';
        lockInput.select();
        setTimeout(() => { lockError.style.opacity = '0'; }, 2500);
      };
      async function tryUnlock(silent) {
        const typed = lockInput.value.trim();
        if (attempting || !typed) { if (!silent && !typed) fail(); return; }
        attempting = true;
        try {
          if (protectedNow) {
            await WBClip.unlock(typed);
          } else {
            // Password from an older version: check it, then build the vault with
            // that same password. Nothing to re-enter, nothing to reset.
            if ((await hashPassword(typed)) !== legacyHash) { throw new Error('WRONG'); }
            const made = await WBClip.setup(typed, { minLength: 1 });
            chrome.storage.local.remove(['appRecoveryCode'], () => { void chrome.runtime.lastError; });
            await afterUnlock();
            showRecoveryCode(made.recoveryCode);
            showToast(typed.length < 8
              ? '🔐 Saved texts are now encrypted. Your password is short — change it in Settings.'
              : '🔐 Saved texts are now encrypted.');
            return;
          }
          await afterUnlock();
        } catch (e) {
          if (!silent) fail();
        } finally {
          attempting = false;
        }
      }
      // The right password opens the lock by itself shortly after typing stops
      // (from 8 characters, the minimum when a password is set; shorter ones use Enter).
      lockInput.addEventListener('input', () => {
        lockError.style.opacity = '0';
        clearTimeout(autoTimer);
        if (lockInput.value.trim().length >= 8) autoTimer = setTimeout(() => tryUnlock(true), 450);
      });
      lockInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(autoTimer); tryUnlock(false); }
      });

        // Toggle panneau "Mot de passe oublié"
        if (forgotBtn && forgotPanel) {
          let forgotOpen = false;
          forgotBtn.addEventListener('click', () => {
            forgotOpen = !forgotOpen;
            forgotPanel.style.display = forgotOpen ? 'block' : 'none';
          });
        }

        // Recovery code: it opens the vault, it does not throw it away. The data
        // stays encrypted and the user can set a new password in Settings.
        if (recoveryBtn) {
          if (recoveryInput) recoveryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') recoveryBtn.click(); });
          recoveryBtn.addEventListener('click', async () => {
            recoveryError.textContent = '';
            const code = recoveryInput.value.trim();
            if (!protectedNow) {
              recoveryError.textContent = 'No recovery code configured.';
              return;
            }
            if (!code) { recoveryError.textContent = 'Enter your recovery code.'; return; }
            try {
              await WBClip.unlockWithRecoveryCode(code);
              recoveryInput.value = '';
              await afterUnlock();
              showToast('🔓 Unlocked with the recovery code. Set a new password in Settings.');
            } catch (e) {
              recoveryError.textContent = 'Incorrect code. It starts with WP.';
            }
          });
        }
    })();

    // Set (or change) the password from the settings pane.
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (WBClip.isProtected() && !resetting) {
          resetting = true; syncPasswordUi();
          if (settingsInput) settingsInput.focus();
          return;
        }
        const pwd = settingsInput ? settingsInput.value.trim() : '';
        if (!pwd) { showToast('Enter a password.'); return; }
        if (pwd.length < 8) { showToast('Minimum 8 characters.'); return; }

        if (WBClip.isProtected()) {
          // Changing the password re-wraps the key: it does not rewrite the data,
          // but it must be proved first — with the current password or with the
          // recovery code, since whoever forgot the password only has that.
          askSecureConfirm('Change password', 'Enter your current password or your recovery code, then the new password.', async (confirmed, current) => {
            if (!confirmed) return;
            try {
              await WBClip.changePassword(current || '', pwd, { minLength: 8 });
              if (settingsInput) settingsInput.value = '';
              resetting = false; syncPasswordUi();
              showToast('🔐 Password changed. Your saved texts were not touched.');
            } catch (e) {
              showToast('❌ ' + (e && e.message ? e.message : 'Could not change the password.'));
            }
          });
          return;
        }

        try {
          const made = await WBClip.setup(pwd, { minLength: 8 });
          if (settingsInput) settingsInput.value = '';
          if (removeBtn) removeBtn.style.display = 'block';
          syncPasswordUi();
          if (statusBanner) statusBanner.innerHTML = BANNER_ACTIVE;
          showRecoveryCode(made.recoveryCode);
          // The long texts already stored have a compressed body of their own.
          WBBig.migrateBodies().catch(() => { });
        } catch (e) {
          showToast('❌ ' + (e && e.message ? e.message : 'Could not set the password.'));
        }
      });
    }

    // Removing protection decrypts everything: keeping the key while dropping the
    // password would leave the label without the substance.
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        askSecureConfirm('Remove protection', 'Your saved texts will be stored as plain data again. Enter your password or your recovery code to confirm.', async (confirmed, pwd) => {
          if (!confirmed) return;
          try {
            const r = await WBClip.disable(pwd || '');
            if (r && r.ok === false) {
              // Nothing was removed: the key is still there and the texts are intact.
              showToast('❌ Could not remove protection (' + (r.error || 'write failed') + '). Nothing was changed. Free some space and try again.');
              return;
            }
            removeBtn.style.display = 'none';
            resetting = false; syncPasswordUi();
            if (statusBanner) statusBanner.innerHTML = BANNER_NONE;
            const lost = r ? (r.unreadable || 0) + (r.bodiesFailed || 0) : 0;
            showToast(lost
              ? '🔓 Protection removed. ' + lost + ' damaged text' + (lost > 1 ? 's' : '') + ' could not be recovered.'
              : '🔓 Protection removed. Saved texts are no longer encrypted.');
          } catch (e) {
            const wrong = e && (e.code === 'WRONG_RECOVERY_CODE' || e.code === 'WRONG_PASSWORD' || e.code === 'NOT_CONFIGURED');
            showToast(wrong ? '❌ Incorrect password.' : '❌ Could not remove protection: ' + (e && e.message ? e.message : 'unknown error'));
          }
        });
      });
    }
  }

  initAppLock();

  try {
    const badge = document.getElementById('headerBadge');
    if (badge) badge.textContent = 'v' + chrome.runtime.getManifest().version + ' Lite';
  } catch (_) { }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  const _panelsContainer = document.querySelector('.panels-container');
  let _sessionScrollTimer = null;

  function saveSessionState(partial) {
    try {
      chrome.storage.session.get('wb_navState', (data) => {
        if (chrome.runtime.lastError) return;
        const state = Object.assign(data.wb_navState || {}, partial);
        chrome.storage.session.set({ wb_navState: state });
      });
    } catch (e) { /* session storage not available */ }
  }

  function restoreSessionState() {
    try {
      chrome.storage.session.get('wb_navState', (data) => {
        if (chrome.runtime.lastError || !data.wb_navState) return;
        const s = data.wb_navState;
        // Restore active section
        if (s.activeSection) switchToPanel(s.activeSection);
        // Restore clip tab (text/image)
        if (s.clipTab) {
          const tabBtn = document.querySelector(`.clip-tab-btn[data-cliptab="${s.clipTab}"]`);
          if (tabBtn) tabBtn.click();
        }
        // Restore category filter
        if (s.clipFilter !== undefined) {
          clipFilter = s.clipFilter;
          renderClipCategories();
          renderClipList();
        }
        // Restore scroll with delay for DOM render
        if (s.scrollPos !== undefined && _panelsContainer) {
          setTimeout(() => { _panelsContainer.scrollTop = s.scrollPos; }, 50);
        }
      });
    } catch (e) { /* session storage not available */ }
  }


  const settingsOpenBtn = document.getElementById('settingsOpenBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');


  settingsOpenBtn.addEventListener('click', () => {
    settingsOverlay.classList.add('active');
  });
  settingsCloseBtn.addEventListener('click', () => settingsOverlay.classList.remove('active'));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('active');
  });

  // @module 04-ai-search-block  (dev/popup-src/04-ai-search-block.js)
  // ---- AI-FREE SEARCH TOOL PANEL ----
  // One switch for everything: when it is on, the AI answer is skipped on
  // every supported engine at once, so nobody has to say which one they use.
  // The engine shown under the cloud is only information: the background
  // learns it from real searches and from open tabs, without opening anything.
  (function initAiSearch() {
    const AI_KEYS = ['blockAiGoogle', 'blockAiBrave'];
    const ENGINE_NAMES = { blockAiGoogle: 'Google', blockAiBrave: 'Brave Search' };
    const orb = document.getElementById('aiOrb');
    const cv = document.getElementById('aiCloud');
    const stateEl = document.getElementById('aiState');
    const subEl = document.getElementById('aiSub');
    const detectEl = document.getElementById('aiDetect');
    if (!orb || !cv) return;

    let on = true, seen = null, browser = '';

    async function browserName() {
      try {
        if (navigator.brave && typeof navigator.brave.isBrave === 'function' && await navigator.brave.isBrave()) return 'Brave';
      } catch (_) { /* fall through to the user agent */ }
      const ua = navigator.userAgent;
      if (/Edg\//.test(ua)) return 'Edge';
      if (/OPR\//.test(ua)) return 'Opera';
      if (/Vivaldi/.test(ua)) return 'Vivaldi';
      return 'Chrome';
    }

    function reflect() {
      orb.setAttribute('aria-checked', on ? 'true' : 'false');
      orb.classList.toggle('off', !on);
      stateEl.textContent = on ? 'AI answers blocked' : 'AI answers allowed';
      subEl.textContent = on ? 'Your searches show the classic list of links.' : 'Click the cloud to block them again.';
      const engine = seen && ENGINE_NAMES[seen.key];
      detectEl.textContent = engine
        ? 'Detected: ' + engine + (browser ? ' on ' + browser : '')
        : (browser ? browser + ' · ' : '') + 'works on Google and Brave Search';
    }

    chrome.storage.local.get(AI_KEYS.concat('aiEngineSeen'), (res) => {
      const noneSet = AI_KEYS.every((k) => res[k] === undefined);
      on = noneSet || AI_KEYS.some((k) => res[k] === true);
      // earlier versions protected one engine at a time: bring both in line
      if (AI_KEYS.some((k) => res[k] !== on)) {
        const fix = {}; AI_KEYS.forEach((k) => { fix[k] = on; });
        chrome.storage.local.set(fix);
      }
      seen = res.aiEngineSeen || null;
      target = on ? 1 : 0; mix = target;
      reflect();
    });
    browserName().then((n) => { browser = n; reflect(); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.aiEngineSeen) { seen = changes.aiEngineSeen.newValue || null; reflect(); }
      if (changes.blockAiGoogle || changes.blockAiBrave) {
        chrome.storage.local.get(AI_KEYS, (res) => {
          const now = AI_KEYS.some((k) => res[k] === true);
          if (now !== on) { on = now; target = on ? 1 : 0; reflect(); }
        });
      }
    });
    // ask the background to look at the open tabs right now
    chrome.runtime.sendMessage({ type: 'AI_ENGINE_SCAN' }).catch(() => { });

    orb.addEventListener('click', () => {
      on = !on;
      target = on ? 1 : 0;
      const update = {}; AI_KEYS.forEach((k) => { update[k] = on; });
      chrome.storage.local.set(update);
      reflect();
      showToast(on ? 'AI answers blocked' : 'AI answers allowed');
    });

    // ----- the cloud: an AI sparkle made of points, struck out when blocked -----
    let seed = 90210;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const star = [];
    const f52 = (x, y) => Math.pow(Math.abs(x), 0.52) + Math.pow(Math.abs(y), 0.52);
    // one 3D sparkle: a four-point star with real volume. Thick and dense at the heart, thin at the tips,
    // a crisp outline of brighter points, and a few faint rays reaching out past the tips.
    //   q = 0 on the outline … 1 at the centre (drives thickness, density and colour)
    const addSpark = (cx0, cy0, S, nBody, nEdge, nRay, thick) => {
      let n = 0;
      while (n < nBody) {
        const x = rnd() * 2 - 1, y = rnd() * 2 - 1, f = f52(x, y);
        if (f > 1) continue;
        const q = 1 - f;
        if (rnd() > 0.3 + 0.7 * Math.sqrt(q)) continue;         // denser towards the centre
        const zz = (rnd() + rnd() - 1) * thick * Math.pow(q, 0.75);
        star.push({ x: cx0 + x * S, y: cy0 + y * S, z: zz * S / 0.86, q, ph: rnd() * 6.283, a: rnd() * 6.283, r: 0.55 + rnd() * 0.9 + q * 0.5, lift: 0.25 + rnd() });
        n++;
      }
      for (let i = 0; i < nEdge; i++) {                          // the outline: |x|^0.52 + |y|^0.52 = 1
        const u = rnd(), sx0 = rnd() < 0.5 ? -1 : 1, sy0 = rnd() < 0.5 ? -1 : 1;
        const x = sx0 * Math.pow(u, 1 / 0.52), y = sy0 * Math.pow(1 - u, 1 / 0.52);
        star.push({ x: cx0 + x * S, y: cy0 + y * S, z: (rnd() - 0.5) * 0.03 * S, q: 0, edge: true, ph: rnd() * 6.283, a: rnd() * 6.283, r: 0.7 + rnd() * 0.6, lift: 0.25 + rnd() });
      }
      for (let i = 0; i < nRay; i++) {                           // faint rays past the four tips
        const horiz = i % 2 === 0, dir = rnd() < 0.5 ? -1 : 1, d = 1.03 + Math.pow(rnd(), 1.6) * 0.5;
        star.push({ x: cx0 + (horiz ? dir * d : (rnd() - 0.5) * 0.02) * S, y: cy0 + (horiz ? (rnd() - 0.5) * 0.02 : dir * d) * S, z: 0, q: 0, ray: true, rayK: (d - 1) / 0.5, ph: rnd() * 6.283, a: rnd() * 6.283, r: 0.5 + rnd() * 0.5, lift: 0.25 + rnd() });
      }
    };
    addSpark(0, 0, 0.86, 1500, 360, 70, 0.34);                  // the big sparkle
    addSpark(0.66, -0.62, 0.26, 260, 90, 16, 0.14);              // the small companion
    const dust = [];                        // loose points floating around
    for (let i = 0; i < 130; i++) dust.push({ x: (rnd() * 2 - 1) * 2.1, y: (rnd() * 2 - 1) * 1.5, z: (rnd() * 2 - 1) * 0.9, ph: rnd() * 6.283, v: 0.02 + rnd() * 0.05, lift: 0.25 + rnd() });
    // when AI is blocked a black hole opens and swallows the sparkle: dark core + glowing disc of points
    const disc = [], holeCore = [];
    for (let i = 0; i < 520; i++) { const rr = 0.5 + Math.pow(rnd(), 0.8) * 0.72; disc.push({ r: rr, a: rnd() * 6.283, ph: rnd() * 6.283, k: rnd() }); }
    for (let i = 0; i < 240; i++) { const y = 1 - (i / 239) * 2, rr = Math.sqrt(1 - y * y), ga = i * 2.399963; holeCore.push({ x: Math.cos(ga) * rr, y, z: Math.sin(ga) * rr }); }

    const ctx = cv.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, last = 0, t = 0, mix = 1, target = 1, hover = 0, hoverTo = 0;
    orb.addEventListener('mouseenter', () => { hoverTo = 1; });
    orb.addEventListener('mouseleave', () => { hoverTo = 0; });
    orb.addEventListener('focus', () => { if (orb.matches(':focus-visible')) hoverTo = 1; });
    orb.addEventListener('blur', () => { hoverTo = 0; });
    const ease = (v) => v * v * (3 - 2 * v);

    function draw(now) {
      requestAnimationFrame(draw);
      const visible = cv.checkVisibility ? cv.checkVisibility({ visibilityProperty: true }) : cv.offsetParent !== null;
      const box = visible ? cv.getBoundingClientRect() : null;
      if (!box || !box.width) { last = now; return; }
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W !== box.width || H !== box.height) { W = box.width; H = box.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      if (!calm) t += dt;
      mix += (target - mix) * (calm ? 1 : Math.min(1, dt * 1.1));
      hover += (hoverTo - hover) * Math.min(1, dt * 3.5);
      const m = ease(Math.max(0, Math.min(1, mix)));   // 1 = AI blocked

      const ry = Math.sin(t * 0.5) * 0.72, rx = Math.sin(t * 0.37) * 0.2;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const R = Math.min(W, H) * 0.3;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const put = (x, y, z, r, a, color) => {
        const X = x * cy + z * sy, Z0 = -x * sy + z * cy;
        const Y = y * cx - Z0 * sx, Z = y * sx + Z0 * cx;
        const k = 1 / (1 - Z * 0.3);
        ctx.globalAlpha = Math.max(0, Math.min(1, a * (0.7 + Z * 0.3)));
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(W / 2 + X * R * k, H / 2 + Y * R * k, Math.max(0.3, r * k), 0, 6.2832); ctx.fill();
      };

      // under the pointer the points lift: each rises by its own amount,
      // comes forward a little and bobs
      const up = (p) => hover * (0.05 + p.lift * 0.22 + Math.sin(t * 1.6 + p.ph) * 0.035);
      const fwd = (p) => hover * p.lift * 0.22;

      // dust: floats up when AI is allowed, falls into the black hole when it is blocked
      for (const d of dust) {
        if (!calm) {
          if (m > 0.25) {
            const dd = Math.hypot(d.x, d.y) || 1, v = (0.06 + 0.3 / (dd * dd + 0.2)) * dt * m;
            d.x += (-d.x / dd) * v + (-d.y / dd) * v * 0.9; d.y += (-d.y / dd) * v + (d.x / dd) * v * 0.9;
            if (dd < 0.3) { const an = rnd() * 6.283; d.x = Math.cos(an) * 2.1; d.y = Math.sin(an) * 1.5; }
          } else { d.y -= d.v * (1 + hover * 3) * dt; if (d.y < -1.6) d.y = 1.6; }
        }
        const dd2 = Math.hypot(d.x, d.y);
        put(d.x + Math.sin(t * 0.4 + d.ph) * 0.05, d.y, d.z, 0.7, (0.2 + hover * 0.15) * Math.min(1, dd2 / 0.5), '#a78bfa');
      }

      // black hole (opens when AI is blocked): glow, back half of the disc, dark core, front half of the disc
      if (m > 0.01) {
        const Rc = 0.36 * m;
        const g = ctx.createRadialGradient(W / 2, H / 2, R * Rc * 0.8, W / 2, H / 2, R * 1.7);
        g.addColorStop(0, 'rgba(167,139,250,' + (0.5 * m).toFixed(3) + ')');
        g.addColorStop(0.2, 'rgba(124,58,237,' + (0.25 * m).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(124,58,237,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 1.7, 0, 6.2832); ctx.fill();
        const drawDisc = (front) => {
          for (const q of disc) {
            const a = q.a + t * 1.1 / Math.pow(q.r, 1.4);
            const s = Math.sin(a);
            if ((s >= 0) !== front) continue;
            const rr = Rc * 1.15 + (q.r - 0.5) * m * 1.1 * 0.9 + 0.0;
            const heat = 1 - Math.min(1, (q.r - 0.5) / 0.72);
            put(Math.cos(a) * rr, s * rr * 0.32, s * rr * 0.9, 0.8 + q.k * 0.7, m * (0.35 + 0.55 * heat), heat > 0.7 ? '#f1eaff' : heat > 0.35 ? '#c4b5fd' : '#8b5cf6');
          }
        };
        drawDisc(false);
        ctx.globalAlpha = m; ctx.fillStyle = '#020108';
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R * Rc, 0, 6.2832); ctx.fill();
        for (const c of holeCore) {
          const ca = Math.cos(t * 0.2), sa = Math.sin(t * 0.2);
          const x1 = c.x * ca + c.z * sa, z1 = -c.x * sa + c.z * ca, y2 = c.y * 0.9 - z1 * 0.44, z2 = c.y * 0.44 + z1 * 0.9, d = (z2 + 1) / 2;
          ctx.globalAlpha = m * (0.2 + 0.5 * d * d); ctx.fillStyle = d > 0.7 ? '#4a3a8a' : '#2a2050';
          ctx.beginPath(); ctx.arc(W / 2 + x1 * R * Rc * 0.97, H / 2 + y2 * R * Rc * 0.97, 0.6 + d * 0.8, 0, 6.2832); ctx.fill();
        }
        ctx.save();
        ctx.globalAlpha = m; ctx.shadowColor = 'rgba(167,139,250,0.95)'; ctx.shadowBlur = 12; ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R * Rc, 0, 6.2832); ctx.stroke();
        ctx.restore();
        drawDisc(true);
      }

      // the sparkle: lit when AI is allowed; when blocked every point spirals into the hole and goes out
      const pulse = 1 + Math.sin(t * 2.1) * 0.04 * (1 - m);
      if (m < 0.98) {                                       // soft light behind the sparkle
        const gl = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 1.35);
        gl.addColorStop(0, 'rgba(180,150,255,' + (0.28 * (1 - m)).toFixed(3) + ')');
        gl.addColorStop(0.45, 'rgba(124,58,237,' + (0.10 * (1 - m)).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(124,58,237,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 1.35, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of star) {
        const s = Math.max(0, Math.min(1, m * 1.4 - (p.ph / 6.283) * 0.4));
        const r0 = Math.hypot(p.x, p.y), a0 = Math.atan2(p.y, p.x);
        const rr = r0 * Math.pow(1 - s, 1.4) * pulse, aa = a0 + s * s * 5.5;
        const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr - up(p) * (1 - s);
        // a shimmer travels outwards from the heart along the rays
        const tw = 0.72 + 0.28 * Math.sin(t * 2.4 + p.ph) + 0.25 * Math.max(0, Math.sin(t * 2.2 - r0 * 5)) ;
        const col = s > 0.45 ? '#f1eaff' : p.ray ? '#cbbcff' : p.edge ? '#e4dcff' : p.q > 0.7 ? '#ffffff' : p.q > 0.35 ? '#d3c5ff' : '#a78bfa';
        put(x, y, p.z * (1 - s) + Math.sin(t * 0.9 + p.ph) * 0.05 * (1 - s) + fwd(p), p.r * (1 - s * 0.6), (p.ray ? 0.25 * (1 - p.rayK) : p.edge ? 0.6 : 0.3 + 0.35 * p.q) * Math.min(1.3, tw) * (1 - s * s), col);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(draw);
  })();

  // @module 05-bottom-nav-shortcuts  (dev/popup-src/05-bottom-nav-shortcuts.js)
  // ---- BOTTOM NAV & GRID MENU NAVIGATION ----
  const panels = document.querySelectorAll('.panel');
  const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item[data-tab]');
  const gridItems = document.querySelectorAll('.grid-item[data-tab]');
  const gridOverlay = document.getElementById('gridOverlay');
  const gridMenuTrigger = document.getElementById('gridMenuTrigger');
  const gridCloseBtn = document.getElementById('gridCloseBtn');
  const gridOverlayBackdrop = document.getElementById('gridOverlayBackdrop');

  function switchToPanel(tabName) {
    // Handle legacy stopwatch session redirect
    if (tabName === 'stopwatch') {
      tabName = 'timer';
      const tBtn = document.getElementById('tmrTabTimer');
      const sBtn = document.getElementById('tmrTabStopwatch');
      const tView = document.getElementById('tmrView');
      const sView = document.getElementById('swView');
      if (sBtn && sView) {
        sBtn.classList.add('active'); if(tBtn) tBtn.classList.remove('active');
        sView.style.display = ''; if(tView) tView.style.display = 'none';
      }
    }

    // Deactivate all nav items
    bottomNavItems.forEach(b => b.classList.remove('active'));
    gridItems.forEach(g => g.classList.remove('active'));
    gridMenuTrigger.classList.remove('active');

    // Activate the correct nav item (bottom bar or grid)
    const navMatch = document.querySelector('.bottom-nav .nav-item[data-tab="' + tabName + '"]');
    const gridMatch = document.querySelector('.grid-item[data-tab="' + (tabName === 'qrgen' ? 'qr' : tabName) + '"]');
    if (navMatch) {
      navMatch.classList.add('active');
    } else if (gridMatch) {
      gridMatch.classList.add('active');
      // Highlight the ••• button to show "more" is active
      gridMenuTrigger.classList.add('active');
    }

    // Switch panel
    panels.forEach(p => p.classList.remove('active'));
    const targetPanel = document.getElementById('panel-' + tabName);
    if (targetPanel) targetPanel.classList.add('active');

    // Close grid overlay if open
    gridOverlay.classList.remove('open');

    // Session: save active section
    saveSessionState({ activeSection: tabName });
  }

  // Appuyer sur "." sans être dans un champ de texte ouvre directement la calculatrice
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable;
    // Ignorer si un champ est actif, si un modal est ouvert, ou si une touche modif est pressée
    if (isTyping) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const lockVisible = document.getElementById('appLockOverlay')?.classList.contains('active');
    if (lockVisible) return;

    if (e.key === '.') {
      e.preventDefault();
      switchToPanel('calculator');
      // Focus le champ de saisie pour pouvoir taper immédiatement
      const calcField = document.getElementById('calcInputField');
      if (calcField) calcField.focus();
    }
  });


  // @module 06-tool-tips  (dev/popup-src/06-tool-tips.js)
  // ---- Discreet "try this tool" suggestions ----
  // Sometimes, when the popup opens, a small banner suggests a tool the person
  // has never (or almost never) used. "Not interested" hides that tool's banner
  // for good. State lives in chrome.storage.local under "wbTips".
  const TIP_TOOLS = {
    colorpicker: { icon: '🎨', title: 'Color Picker', text: 'Pick any color on your screen with the picker and copy its HEX, RGB or HSL.' },
    password:    { icon: '🔐', title: 'Password Generator', text: 'Create strong, unique passwords in one click.' },
    converter:   { icon: '🔄', title: 'Converter', text: 'Convert units and currencies instantly, without leaving the browser.' },
    timer:       { icon: '⏱️', title: 'Timer & Stopwatch', text: 'Start a timer or stopwatch right from the toolbar.' },
    expander:    { icon: '⚡', title: 'Text Shortcuts', text: 'Type a short code like !mail anywhere and it expands into your full text.' },
    qr:          { icon: '📷', title: 'QR Code', text: 'Scan a QR code from any page, or create your own with colors and a logo.' },
    compress:    { icon: '🗜️', title: 'Compress', text: 'Shrink your images quickly to save space.' },
    tabtriage:   { icon: '🗂️', title: 'Tab Triage', text: 'Tabs you open with the mouse wheel wait in a colored group until you have been on them.' },
    aisearch:    { icon: '🔎', title: 'AI-free Search', text: 'Skip the AI answers on Google or Brave and keep the classic list of links.' },
    protection:  { icon: '🛡️', title: 'Protection', text: 'Get warned before landing on dangerous or adult websites.' },
    notes:       { icon: '📝', title: 'Notes', text: 'Jot things down in a quick notepad that is always one click away.' },
    music:       { icon: '🎵', title: 'Music', text: 'Play your own audio files from the popup.' }
  };
  const TIP_MIN_OPENS = 4;               // let newcomers settle in first
  const TIP_COOLDOWN = 8 * 3600 * 1000;  // at most one banner every 8 hours
  const TIP_CHANCE = 0.55;               // "sometimes", not every time
  let tipCurrent = null;

  // Every change to wbTips goes through here, one after the other: two overlapping
  // read-modify-write cycles would silently drop each other's fields.
  let wbTipsQueue = Promise.resolve();
  function updateWbTips(change) {
    wbTipsQueue = wbTipsQueue.then(() => new Promise((resolve) => {
      try {
        chrome.storage.local.get('wbTips', (res) => {
          const st = (res && res.wbTips && typeof res.wbTips === 'object') ? res.wbTips : {};
          try { change(st); } catch (_) { }
          chrome.storage.local.set({ wbTips: st }, resolve);
        });
      } catch (_) { resolve(); }
    }));
  }

  function noteToolUsed(tab) {
    if (!tab) return;
    if (tab === 'qrgen') tab = 'qr';
    updateWbTips((st) => {
      st.usage = st.usage || {};
      st.usage[tab] = (st.usage[tab] || 0) + 1;
    });
  }

  function hideTipBanner(animate) {
    const el = document.getElementById('tipBanner');
    if (!el || el.hidden) return;
    if (!animate) { el.hidden = true; return; }
    el.classList.add('leaving');
    setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 200);
  }

  function noteBackupDone() {
    updateWbTips((st) => {
      st.lastBackup = Date.now();
      st.backupSnoozeUntil = 0;
    });
    if (tipCurrentMode === 'backup') hideTipBanner(true);
  }

  const DAY = 24 * 3600 * 1000;
  const BACKUP_FIRST_AFTER = 14 * DAY;   // never exported: remind after 2 weeks
  const BACKUP_REPEAT_AFTER = 30 * DAY;  // already exported once: remind after 1 month
  const BACKUP_SNOOZE = 3 * DAY;
  const UPDATE_SNOOZE = 1 * DAY;
  const UPDATE_CHECK_EVERY = 12 * 3600 * 1000;
  let tipCurrentMode = null;
  const markWhatsNewSeen = () => updateWbTips((st) => { try { st.whatsNewSeen = chrome.runtime.getManifest().version; } catch (_) { } });
  const CLIP_NOTICE = 'It reads your clipboard in the background, about every 2.5 seconds, so a text copied anywhere — in the browser or not — lands in your history. Everything stays on this device, nothing is sent to a server. You can exclude sites, and encrypt the texts with a password. Is that OK?';
  // The written guide ships with the extension, so it is always as recent as the version installed
  const openGuide = () => {
    const url = chrome.runtime.getURL('pages/guide.html');
    try { chrome.tabs.create({ url }); } catch (_) { window.open(url, '_blank', 'noopener'); }
  };
  document.getElementById('openGuideBtn')?.addEventListener('click', openGuide);

  // Version check shown in Settings > Help: the popup and the background must run the same code.
  (function showBuildInfo() {
    const el = document.getElementById('buildInfo');
    if (!el) return;
    const limit = (WBBig.MAX_CHARS / 1000000) + ' million characters';
    const render = (bgOk) => {
      el.textContent = 'v' + chrome.runtime.getManifest().version + ' · text limit ' + limit
        + (bgOk ? ' · background up to date ✓' : ' · background is an older version: reload WorkBox in the extensions page');
    };
    try {
      chrome.runtime.sendMessage({ type: 'WB_BUILD' }, (r) => {
        render(!chrome.runtime.lastError && !!r && r.max === WBBig.MAX_CHARS && r.tier === 100);
      });
    } catch (_) { render(false); }
  })();

  function showTipBanner(mode, key, icon, title, text, goLabel, noLabel) {
    const banner = document.getElementById('tipBanner');
    tipCurrent = key;
    tipCurrentMode = mode;
    document.getElementById('tipIcon').textContent = icon;
    document.getElementById('tipTitle').textContent = title;
    document.getElementById('tipText').textContent = text;
    document.getElementById('tipGo').textContent = goLabel;
    document.getElementById('tipNo').textContent = noLabel;
    document.getElementById('tipNo').hidden = (mode === 'toolarge' || mode === 'watchoff');
    document.getElementById('tipBanner').querySelector('.tip-tag').textContent = mode === 'whatsnew' ? 'Updated' : mode === 'welcome' ? 'Welcome' : mode === 'watchoff' ? 'Done' : mode === 'tool' ? 'Suggestion' : mode === 'tutorial' ? (key === 'welcome' ? 'Welcome' : 'New') : mode === 'toolarge' ? 'Notice' : 'Reminder';
    banner.hidden = false;
  }

  // A copied text over the size limit is not saved: say so in the banner. The background
  // keeps a small log of every refusal (wbTooLargeLog); the banner shows what is newer than
  // the last refusal already shown (wbTips.tooLargeSeen).
  const fmtNum = (c) => Number(c).toLocaleString('en-US');
  function showTooLargeBanner(entries) {
    const max = WBBig.MAX_CHARS;
    const last = entries[entries.length - 1];
    const over = Math.max(0, last.chars - max);
    const text = entries.length === 1
      ? 'The text you copied has ' + fmtNum(last.chars) + ' characters. WorkBox keeps texts up to ' + fmtNum(max) + ' characters, so this one is ' + fmtNum(over) + ' over and was not saved. Your history was not changed. To keep it, copy it in two parts.'
      : entries.length + ' copied texts were over the ' + fmtNum(max) + '-character limit and were not saved. The latest has ' + fmtNum(last.chars) + ' characters (' + fmtNum(over) + ' over). Your history was not changed.';
    showTipBanner('toolarge', 'toolarge', '⚠️', 'Text not saved', text, 'OK', '');
  }
  const freshRefusals = (log, st) => (Array.isArray(log) ? log : []).filter(e => e && e.ts > (st.tooLargeSeen || 0));
  // Marks the refusals as seen only once the banner is really on screen.
  function markRefusalsShown(st, entries) {
    const upTo = entries[entries.length - 1].ts;
    st.tooLargeSeen = upTo;
    st.tooLargeShown = { upTo, at: Date.now() };
  }
  function showTooLargeIfNew() {
    if (document.getElementById('appLockOverlay')?.classList.contains('active')) return;
    chrome.storage.local.get('wbTooLargeLog', (r) => updateWbTips((st) => {
      const fresh = freshRefusals(r && r.wbTooLargeLog, st);
      if (!fresh.length) return;
      showTooLargeBanner(fresh);
      markRefusalsShown(st, fresh);
    }));
  }

  function initTips() {
    const banner = document.getElementById('tipBanner');
    if (!banner) return;
    const now = Date.now();
    chrome.storage.local.get(['textExpanderRules', 'clipItems', 'notes', 'todoItems', 'wbLinkActive', 'wbTooLargeLog'], (res) => updateWbTips((st) => {
      st.usage = st.usage || {};
      st.dismissed = st.dismissed || {};
      st.opens = (st.opens || 0) + 1;
      st.firstSeen = st.firstSeen || now;
      // Set on the very first open: the welcome steps stay pending until each one is really answered.
      if (st.opens === 1) st.welcomePending = true;
      const lockVisible = document.getElementById('appLockOverlay')?.classList.contains('active');

      // A pending update that has since been installed is no longer pending
      try {
        if (st.updatePending && st.updatePending === chrome.runtime.getManifest().version) st.updatePending = null;
      } catch (_) { }

      let plan = null; // what to show, decided before touching the DOM

      // 1) Update available (the browser itself tells us; WorkBox contacts no server)
      if (!lockVisible && st.updatePending && now > (st.updateSnoozeUntil || 0)) {
        plan = { mode: 'update' };
      }
      // 1a) Copied texts were too long to be saved: tell the person (marked as seen
      //     only once the banner is really displayed, below)
      const refused = freshRefusals(res.wbTooLargeLog, st);
      if (!lockVisible && refused.length) plan = { mode: 'toolarge', entries: refused };
      // 1d) After an update: one line pointing to the changelog, once per version.
      //     A fresh install has nothing to compare with, so it only records the version.
      let currentVersion = '';
      try { currentVersion = chrome.runtime.getManifest().version; } catch (_) { }
      if (currentVersion && st.whatsNewSeen !== currentVersion) {
        if (st.opens <= 1) st.whatsNewSeen = currentVersion;
        else if (!plan && !lockVisible) plan = { mode: 'whatsnew', version: currentVersion };   // recorded when a button is pressed
      }
      // 1b) The video tutorial, offered a single time: as a welcome on a fresh install,
      //     as a short "new" note for people who already use WorkBox. Never shown again.
      if (!plan && !lockVisible && !st.tutorialShown) {
        plan = { mode: 'tutorial', fresh: !!st.welcomePending };   // recorded when a button is pressed
      }
      // 1c) First opens, before anything else: say plainly what WorkBox does with
      //     the clipboard, and let the person refuse. Asked once; the answer is
      //     remembered, and "no" really turns the reading off.
      if (!lockVisible && !st.consent && st.welcomePending && !(plan && plan.mode === 'tutorial' && plan.fresh)) plan = { mode: 'welcome' };
      // 2a) Offer to switch on the backup link once there is something worth protecting
      if (!plan && !lockVisible && st.opens >= 2 && res.wbLinkActive !== true && !st.activateDone && now > (st.activateSnoozeUntil || 0)) {
        const clips = (res.clipItems || []).length;
        const notesWithText = (res.notes || []).filter(n => n && String(n.content || '').trim()).length;
        const tasks = (res.todoItems || []).length;
        if (clips >= 10 || notesWithText >= 1 || tasks >= 1) plan = { mode: 'activate' };
      }
      // 2b) Backup reminder: 2 weeks without ever exporting, then every month
      if (!plan && !lockVisible && st.opens >= 2) {
        const since = st.lastBackup || st.firstSeen;
        const threshold = st.lastBackup ? BACKUP_REPEAT_AFTER : BACKUP_FIRST_AFTER;
        if (now - since > threshold && now > (st.backupSnoozeUntil || 0)) plan = { mode: 'backup' };
      }
      // 3) Occasional tool suggestion
      if (!plan && st.opens >= TIP_MIN_OPENS && !lockVisible && now - (st.lastShown || 0) > TIP_COOLDOWN && Math.random() < TIP_CHANCE) {
        const hasRules = (res.textExpanderRules || []).some(r => r && r.shortcut && r.text);
        const candidates = Object.keys(TIP_TOOLS).filter((k) => {
          if (st.dismissed[k]) return false;
          if (k === 'expander') return !hasRules && (st.usage[k] || 0) <= 1;
          return (st.usage[k] || 0) <= 1;
        });
        const fresh = candidates.filter(k => !(st.usage[k] > 0));
        const pool = fresh.length ? fresh : candidates;
        if (pool.length) { plan = { mode: 'tool', tool: pool[Math.floor(Math.random() * pool.length)] }; st.lastShown = now; }
      }

      if (plan) {
        setTimeout(() => {
          if (plan.mode === 'toolarge') {
            showTooLargeBanner(plan.entries);
            updateWbTips((s3) => markRefusalsShown(s3, plan.entries));
          } else if (plan.mode === 'welcome') {
            showTipBanner('welcome', 'welcome', '👋', 'What WorkBox does', CLIP_NOTICE, 'Yes, keep it on', 'No, turn it off');
          } else if (plan.mode === 'tutorial') {
            if (plan.fresh) showTipBanner('tutorial', 'welcome', '👋', 'Welcome to WorkBox', 'All the tools are behind the ··· button, and your data stays on this device. A one-minute tour shows you where everything is.', 'Take the tour', 'No thanks');
            else showTipBanner('tutorial', 'tutorial', '📖', 'Quick tour', 'A one-minute tour now shows you where every tool is.', 'Take the tour', 'No thanks');
          } else if (plan.mode === 'whatsnew') {
            showTipBanner('whatsnew', 'whatsnew', '✨', 'WorkBox ' + plan.version, 'WorkBox has been updated. See what is new in the changelog.', 'See what\'s new', 'No thanks');
          } else if (plan.mode === 'update') {
            showTipBanner('update', 'update', '⬆️', 'Update available', 'A new version of WorkBox is ready. Restart the extension to get the latest improvements.', 'Update now', 'Later');
          } else if (plan.mode === 'activate') {
            showTipBanner('activate', 'activate', '🛡️', 'Protect your data', 'Turn on your backup link in one click. It keeps a copy of your notes, clipboard and tasks, and updates itself as you work.', 'Activate', 'Later');
          } else if (plan.mode === 'backup') {
            const never = !st.lastBackup;
            showTipBanner('backup', 'backup', '💾', 'Back up your data',
              never ? 'You have not saved a backup yet. Export a link or a file so your notes and clipboard are safe.'
                    : 'It has been over a month since your last backup. Export a fresh copy to keep it up to date.',
              'Back up now', 'Later');
          } else {
            const t = TIP_TOOLS[plan.tool];
            showTipBanner('tool', plan.tool, t.icon, t.title, t.text, 'Try it', 'Not interested');
          }
        }, 900);
      }

      // Ask the browser (not a WorkBox server) whether an update is waiting, at most twice a day
      if (!st.updatePending && now - (st.lastUpdateCheck || 0) > UPDATE_CHECK_EVERY) {
        try {
          const save = (status, version) => updateWbTips((s2) => {
            s2.lastUpdateCheck = Date.now();
            if (status === 'update_available') s2.updatePending = version || 'new';
          });
          const p = chrome.runtime.requestUpdateCheck();
          if (p && typeof p.then === 'function') {
            p.then((r) => save(r && r.status, r && r.version)).catch(() => { });
          }
        } catch (_) { }
      }
    }));

    document.getElementById('tipGo')?.addEventListener('click', () => {
      if (!tipCurrent) return;
      const mode = tipCurrentMode, key = tipCurrent;
      hideTipBanner(false);
      if (mode === 'toolarge') return;
      if (mode === 'watchoff') return;   // the confirmation simply goes away
      if (mode === 'welcome') {
        // The answer is remembered: asked once, never again.
        updateWbTips((st) => { st.consent = { accepted: true, at: Date.now() }; });
        setClipWatch(true);
        return;
      }
      if (mode === 'update') { try { chrome.runtime.reload(); } catch (_) { } return; }
      if (mode === 'whatsnew') {
        markWhatsNewSeen();
        const url = chrome.runtime.getURL('pages/changelogs.html');
        try { chrome.tabs.create({ url }); } catch (_) { window.open(url, '_blank', 'noopener'); }
        return;
      }
      if (mode === 'tutorial') { updateWbTips((st) => { st.tutorialShown = true; }); (window.wbStartTour || openGuide)(); return; }
      if (mode === 'activate') {
        createBackupLink().then((ok) => { if (ok) updateWbTips((s2) => { s2.activateDone = true; }); });
        return;
      }
      if (mode === 'backup') { document.getElementById('settingsOverlay')?.classList.add('active'); return; }
      noteToolUsed(key);
      switchToPanel(key);
    });
    document.getElementById('tipNo')?.addEventListener('click', () => {
      if (!tipCurrent) return;
      const mode = tipCurrentMode, key = tipCurrent;
      if (mode === 'welcome') {
        // A refusal has to mean something, otherwise it is a lie: reading stops
        // right away, and the switch in Settings is the only way back.
        updateWbTips((st) => { st.consent = { accepted: false, at: Date.now() }; });
        setClipWatch(false);
        // The question turns into its answer, in the same banner: a toast lasts
        // 1.5 s, and this is the one message that must really be read.
        showTipBanner('watchoff', 'watchoff', '🔒', 'Clipboard is off',
          'WorkBox no longer reads your clipboard, so nothing you copy is being saved. To turn it back on: Settings → Privacy → "Save what I copy".',
          'Got it', '');
        return;
      }
      if (mode === 'tutorial' && key === 'welcome') {
        // Welcome declined: the clipboard question comes right after, in the same banner
        updateWbTips((st) => { st.tutorialShown = true; });
        chrome.storage.local.get('wbTips', (r) => {
          const t = (r && r.wbTips) || {};
          if (!t.consent) showTipBanner('welcome', 'welcome', '👋', 'What WorkBox does', CLIP_NOTICE, 'Yes, keep it on', 'No, turn it off');
          else hideTipBanner(true);
        });
        return;
      }
      hideTipBanner(true);
      updateWbTips((st) => {
        st.dismissed = st.dismissed || {};
        if (mode === 'update') st.updateSnoozeUntil = Date.now() + UPDATE_SNOOZE;
        else if (mode === 'activate') {
          st.activateLaters = (st.activateLaters || 0) + 1;
          if (st.activateLaters >= 3) st.activateDone = true;                 // third "Later": stop asking
          else st.activateSnoozeUntil = Date.now() + (st.activateLaters === 1 ? 3 : 14) * DAY;
        }
        else if (mode === 'backup') st.backupSnoozeUntil = Date.now() + BACKUP_SNOOZE;
        else if (mode === 'tutorial') st.tutorialShown = true;
        else if (mode === 'whatsnew') { try { st.whatsNewSeen = chrome.runtime.getManifest().version; } catch (_) { } }
        else if (mode === 'toolarge') { /* marked as seen when displayed: nothing to remember */ }
        else st.dismissed[key] = true;
      });
    });
  }
  initTips();

  // @module 07-clipboard-watch-switch  (dev/popup-src/07-clipboard-watch-switch.js)
  // ----- Clipboard monitoring switch -----
  // Off means WorkBox stops reading the clipboard entirely; the switch is enforced
  // in the background, in the content scripts and in the offscreen document. The
  // standing notice is the point: before it, "WorkBox is off" and "WorkBox is
  // broken" looked exactly the same.
  function reflectClipWatch(on) {
    const toggle = document.getElementById('clipWatchToggle');
    if (toggle) toggle.checked = on;
    // The clipboard panel shows the disconnected state. Nothing is hidden or
    // disabled: the history already saved stays readable and copyable.
    const off = document.getElementById('clipOffBanner');
    if (off) off.hidden = on;
  }
  function setClipWatch(on, opts) {
    on = on !== false;
    chrome.storage.local.set({ wbClipWatch: on }, () => { void chrome.runtime.lastError; });
    reflectClipWatch(on);
    if (opts && opts.toast) {
      showToast(on ? '✅ Clipboard monitoring is on.' : '🔒 Clipboard monitoring is off.');
    }
  }
  (function initClipWatch() {
    // The stored value arrives asynchronously: if the toggle is clicked before it
    // does, that late answer must not flip the switch back under the user's finger.
    let touched = false;
    chrome.storage.local.get('wbClipWatch', (r) => {
      void chrome.runtime.lastError;
      if (!touched) reflectClipWatch(!(r && r.wbClipWatch === false));
    });
    const toggle = document.getElementById('clipWatchToggle');
    if (toggle) toggle.addEventListener('change', () => { touched = true; setClipWatch(toggle.checked, { toast: true }); });
    // Another context may have changed it (the first-run notice, a second window)
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.wbClipWatch) reflectClipWatch(ch.wbClipWatch.newValue !== false);
    });
  })();
  // popup already open when a text is refused: the banner appears right away
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.wbTooLargeLog) showTooLargeIfNew();
  });
  // opened or brought back to the front later: check once more
  window.addEventListener('focus', () => setTimeout(showTooLargeIfNew, 300));

  // @module 08-shell-ui  (dev/popup-src/08-shell-ui.js)
  // QR Code: Scanner / Generator sub-tabs
  document.querySelectorAll('[data-qrtab]').forEach(b => {
    b.addEventListener('click', () => { noteToolUsed('qr'); switchToPanel(b.dataset.qrtab); });
  });

  // Bottom nav bar clicks
  bottomNavItems.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) noteToolUsed(btn.dataset.tab);
      switchToPanel(btn.dataset.tab);
    });
  });

  // Grid item clicks
  gridItems.forEach(btn => {
    btn.addEventListener('click', () => {
      noteToolUsed(btn.dataset.tab);
      switchToPanel(btn.dataset.tab);
    });
  });

  // Grid overlay open/close
  gridMenuTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    gridOverlay.classList.toggle('open');
  });

  gridCloseBtn.addEventListener('click', () => {
    gridOverlay.classList.remove('open');
  });

  gridOverlayBackdrop.addEventListener('click', () => {
    gridOverlay.classList.remove('open');
  });

  // ---- SCROLL SESSION PERSISTENCE (debounced 300ms) ----
  if (_panelsContainer) {
    _panelsContainer.addEventListener('scroll', () => {
      clearTimeout(_sessionScrollTimer);
      _sessionScrollTimer = setTimeout(() => {
        saveSessionState({ scrollPos: _panelsContainer.scrollTop });
      }, 300);
    });
  }

  // ---- TOAST ----
  const toast = document.getElementById('toast');
  let toastTimeout;
  function showToast(msg = 'Copied!') {
    toast.textContent = msg;
    toast.classList.remove('hide');
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.classList.remove('hide'), 200);
    }, 1500);
  }


  // @module 09-clipboard-store  (dev/popup-src/09-clipboard-store.js)
  function copyText(text) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text)
      .then(() => showToast())
      .catch(err => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast();
        } catch (e) { }
      });
  }

  // A long text lives compressed apart: the list only shows a preview, and the
  // full text is read back at the moment it is copied.
  async function copyItem(item) {
    if (!item || !item.big) { copyText(item ? item.text : ''); return; }
    showToast('⏳ Copying ' + WBBig.countLabel(item.big.lines) + ' lines…');
    try { copyText(await WBBig.load(item)); }
    catch (e) { showToast('❌ This long text could not be read.'); }
  }
  function bigMetaHtml(item) {
    return '<div class="clip-big-meta">' + WBBig.countLabel(item.big.lines) + ' lines · '
      + WBBig.sizeLabel(item.big.chars) + ' · stored compressed · click to copy all</div>';
  }

  const clipList = document.getElementById('clipList');
  const clipCatsEl = document.getElementById('clipCategories');
  const clipSearch = document.getElementById('clipSearch');
  const clipClearBtn = document.getElementById('clipClearBtn');

  let clipItems = [];   // { text, pinned, category, timestamp }
  let clipFilter = 'all';
  let clipSearchQuery = '';
  let clipDateMode = 'all';
  let clipDateCustomVal = 0;

  // Reading goes through the vault: the stored values are decrypted here, once,
  // and the rest of the popup keeps working on plaintext as it always did.
  async function loadClipboard() {
    let res;
    try {
      res = await WBClip.load();
    } catch (e) {
      return;   // a failed read must never empty the list
    }
    if (res.locked) return;   // the lock screen is up; it reloads the list itself
    {
      let all = [];
      if (res.items && res.items.length) {
        // Nettoyage automatique des liens blob/fichiers qui auraient pu passer
        all = res.items.filter(item => {
          const t = item.text || '';
          return !t.startsWith('blob:') && !t.match(/^[a-zA-Z]:\\/) && !t.startsWith('/') && !t.startsWith('file:');
        });
      }
      // A very long text saved by an older version is still inside the list: showing
      // it would freeze the popup. Show everything else now, convert it, then add it back.
      const legacy = all.filter(i => i && !i.big && typeof i.text === 'string' && WBBig.isBig(i.text));
      if (legacy.length) {
        clipItems = all.filter(i => !legacy.includes(i));
        migrateLongTexts(all);
      } else {
        clipItems = all;
        const retagged = stripLegacySiteTags(clipItems);
        if (all.length !== (res.items || []).length || retagged) saveClipboard(true);
      }

      renderClipCategories();
      renderClipList();
      // Load images count too
      chrome.storage.local.get('clipboardImages', d => {
        clipboardImages = d.clipboardImages || [];
        updateClipCounts();
      });
    }
  }

  // Texts saved by an older version are kept in full inside the list: move the
  // long ones to their own compressed body so the popup stays light. While this
  // runs, nothing is written back, so the list can never lose an item.
  let _migrating = false;
  async function migrateLongTexts(all) {
    if (_migrating) return;
    _migrating = true;
    let result = all;
    try {
      result = [];
      for (const it of all) {
        if (it && !it.big && WBBig.isBig(it.text)) {
          const made = await WBBig.make(it.text);
          result.push({ ...it, text: made.text, big: made.big });
        } else result.push(it);
      }
    } catch (e) { result = all; }
    // items added or changed on screen in the meantime are kept
    const shown = new Set(clipItems);
    const back = result.filter(i => !shown.has(i) && !clipItems.some(c => c.timestamp === i.timestamp && (c.text === i.text || (i.big && c.big && c.big.fp === i.big.fp))));
    clipItems = clipItems.concat(back).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    _migrating = false;
    saveClipboard(true);
    renderClipCategories();
    renderClipList();
    updateClipCounts();
  }

  let ignoreStorageChanges = false;
  let _ignoreStorageTimer = null;
  let _lastLocalClipWrite = 0;
  // Storage echoes of our own write are not re-rendered for a short while.
  // Anything captured after this moment is still merged in (see storage.onChanged).
  function beginLocalClipWrite() {
    ignoreStorageChanges = true;
    _lastLocalClipWrite = Date.now();
    clearTimeout(_ignoreStorageTimer);
    _ignoreStorageTimer = setTimeout(() => { ignoreStorageChanges = false; }, 300);
  }
  let _clipSaveWarned = false;
  function saveClipboard(silent = false) {
    if (_migrating) return;
    if (silent) beginLocalClipWrite();
    // Writing goes through the vault (encryption included) and reports back: a
    // save that did not happen must never look like "Copied!".
    WBClip.save(clipItems).then((res) => {
      if (res && res.ok) { _clipSaveWarned = false; return; }
      if (res && res.error === 'locked') {
        if (!_clipSaveWarned) {
          _clipSaveWarned = true;
          showToast('🔒 Unlock WorkBox to keep saving your clipboard.');
        }
        return;
      }
      showToast('⚠️ Could not save your clipboard history (' + ((res && res.error) || 'unknown error') + ').');
    }).catch(() => {
      showToast('⚠️ Could not save your clipboard history.');
    });
  }
  const findClipImage = (imgObj) => {
    let k = clipboardImages.indexOf(imgObj);
    if (k < 0) k = clipboardImages.findIndex(c => c && c.dataUrl === imgObj.dataUrl && c.timestamp === imgObj.timestamp);
    return k;
  };

  const clipTabs = document.querySelectorAll('.clip-tab-btn');
  clipTabs.forEach((b) => b.addEventListener('click', () => { if (typeof clipSel !== 'undefined') clipSel.clear(); }));
  const clipImageListEl = document.getElementById('clipImageList');
  const clipImageContainer = document.getElementById('clipImageContainer');
  let clipboardImages = [];

  // @module 10-clipboard-selection  (dev/popup-src/10-clipboard-selection.js)
  // ---- Selection mode for the clipboard history ----
  // A small square shows on the item under the pointer. Ticking one turns the
  // selection mode on: clicking an item then ticks it instead of copying it,
  // Shift+click ticks everything between two items, and a bar at the bottom
  // acts on all ticked items at once.
  const clipSel = (function () {
    const picked = { text: new Set(), image: new Set() };
    const order = { text: [], image: [] };     // keys in the order they are shown
    const boxes = { text: new Map(), image: new Map() };
    let kind = 'text', anchor = null, bar = null, menu = null, armed = 0;
    const panel = document.getElementById('panel-clipboard');
    const BUILT_IN = {
      'Text': '📝 Text', 'Code': '💻 Code', 'Link': '🔗 Link', 'Video': '🎥 Video', 'Image': '🖼️ Image', 'Email': '✉️ Email',
      'Phone': '📞 Phone', 'Number': '🔢 Number', 'Color': '🎨 Color', 'Date': '📅 Date', 'Price': '💰 Price', 'Address': '📍 Address', 'Private': '🔒 Private'
    };
    const KEEP = ['🔑 Password', '🔒 Private'];   // moving an item never unmasks it

    const keyOf = (obj, k) => k === 'text'
      ? 't' + obj.timestamp + '|' + obj.text.length + '|' + obj.text.slice(0, 24)
      : 'i' + obj.timestamp + '|' + String(obj.dataUrl).length;
    const active = () => picked[kind].size > 0;
    const chosen = () => (kind === 'text' ? clipItems : clipboardImages).filter((o) => o && picked[kind].has(keyOf(o, kind)));

    function paint() {
      boxes[kind].forEach((el, key) => { el.classList.toggle('clip-picked', picked[kind].has(key)); });
      if (panel) panel.classList.toggle('clip-selecting', active());
      drawBar();
    }
    const ensure = {};   // per kind: draws every item still waiting below the fold (see progressiveList)
    function begin(k) { order[k] = []; boxes[k].clear(); ensure[k] = null; }
    function setEnsure(k, fn) { ensure[k] = fn; }
    function attach(el, obj, k) {
      const key = keyOf(obj, k);
      order[k].push(key); boxes[k].set(key, el);
      el.classList.add('clip-selectable');
      if (picked[k].has(key)) el.classList.add('clip-picked');
      const box = document.createElement('button');
      box.className = 'clip-sel-box';
      box.type = 'button';
      box.title = 'Select';
      box.setAttribute('aria-label', 'Select this item');
      el.appendChild(box);
      const toggle = (e) => {
        kind = k;
        if (e.shiftKey && anchor && order[k].includes(anchor)) {
          // everything between the last ticked item and this one
          const a = order[k].indexOf(anchor), b = order[k].indexOf(key);
          for (let n = Math.min(a, b); n <= Math.max(a, b); n++) picked[k].add(order[k][n]);
        } else if (picked[k].has(key)) picked[k].delete(key);
        else picked[k].add(key);
        anchor = key;
        paint();
      };
      box.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); toggle(e); });
      // in selection mode the whole item is the tick box, and nothing else on it reacts
      el.addEventListener('click', (e) => {
        if (!active() || kind !== k || e.target === box) return;
        e.stopPropagation(); e.preventDefault();
        toggle(e);
      }, true);
      el.addEventListener('mousedown', (e) => { if (active() && e.shiftKey) e.preventDefault(); });   // no text selection while Shift+clicking
    }
    function clear() {
      picked.text.clear(); picked.image.clear(); anchor = null; closeMenu();
      paint();
    }
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    function prune() {   // forget ticks whose item no longer exists
      for (const k of ['text', 'image']) {
        const alive = new Set((k === 'text' ? clipItems : clipboardImages).filter(Boolean).map((o) => keyOf(o, k)));
        picked[k].forEach((key) => { if (!alive.has(key)) picked[k].delete(key); });
      }
    }
    function refresh() {
      prune();
      if (kind === 'text') { renderClipCategories(); renderClipList(); } else renderClipImages();
      updateClipCounts();
      paint();
    }
    function saveFile(name, data, type) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    const stamp = () => new Date().toISOString().slice(0, 10);

    // ----- actions -----
    function doPin() {
      const list = chosen();
      const pin = !list.every((o) => o.pinned);
      list.forEach((o) => { o.pinned = pin; });
      if (kind === 'text') saveClipboard(true); else chrome.storage.local.set({ clipboardImages });
      showToast(list.length + (pin ? ' pinned' : ' unpinned'));
      clear(); refresh();
    }
    function doDelete(btn) {
      if (!armed) { btn.textContent = 'Click again'; btn.classList.add('danger'); armed = setTimeout(() => { armed = 0; drawBar(); }, 3000); return; }
      clearTimeout(armed); armed = 0;
      const gone = new Set(chosen());
      const n = gone.size;
      if (kind === 'text') { clipItems = clipItems.filter((o) => !gone.has(o)); saveClipboard(true); }
      else { clipboardImages = clipboardImages.filter((o) => !gone.has(o)); chrome.storage.local.set({ clipboardImages }); }
      showToast(n + ' deleted');
      clear(); refresh();
    }
    function doMove(tag) {
      const list = chosen();
      list.forEach((o) => {
        const old = Array.isArray(o.category) ? o.category : [];
        o.category = [tag].concat(old.filter((t) => KEEP.includes(t) && t !== tag));
      });
      saveClipboard(true);
      showToast(list.length + ' moved to ' + tag.replace(/^[^\p{L}\p{N}]+/u, ''));
      clear(); refresh();
    }
    async function doDownload(format) {
      const list = chosen();
      if (!list.length) return;
      if (kind === 'text') {
        // long texts are read back in full from their compressed body
        const full = await Promise.all(list.map(async (o) => { try { return await WBBig.load(o); } catch (e) { return o.text; } }));
        if (format === 'json') {
          saveFile('workbox-clipboard-' + stamp() + '.json', JSON.stringify(list.map((o, n) => ({ text: full[n], category: o.category || [], timestamp: o.timestamp, pinned: !!o.pinned })), null, 2), 'application/json');
        } else {
          saveFile('workbox-clipboard-' + stamp() + '.txt', full.join('\n\n---\n\n') + '\n', 'text/plain');
        }
      } else {
        const ext = (o) => { const m = /^data:image\/([a-z0-9+]+)/i.exec(o.dataUrl || ''); return m ? (m[1] === 'jpeg' ? 'jpg' : m[1].replace('+xml', '')) : 'jpg'; };
        if (list.length === 1) saveFile('workbox-image-' + stamp() + '.' + ext(list[0]), new Blob([dataUrlToBytes(list[0].dataUrl)]));
        else saveFile('workbox-images-' + stamp() + '.zip', new Blob([buildZip(list.map((o, n) => ({ name: 'image-' + String(n + 1).padStart(3, '0') + '.' + ext(o), data: dataUrlToBytes(o.dataUrl) })))], { type: 'application/zip' }));
      }
      showToast(list.length + (list.length === 1 ? ' item' : ' items') + ' downloaded');
      closeMenu();
    }

    // ----- small menus above the bar -----
    function openMenu(build) {
      const was = menu && menu.dataset.kind;
      closeMenu();
      menu = document.createElement('div');
      menu.className = 'clip-sel-menu';
      build(menu);
      if (was && was === menu.dataset.kind) { menu = null; return; }   // second click on the same button closes it
      bar.appendChild(menu);
    }
    function tagMenu(m) {
      m.dataset.kind = 'tag';
      const title = document.createElement('div'); title.className = 'clip-sel-menu-title'; title.textContent = 'Move to a category'; m.appendChild(title);
      const wrap = document.createElement('div'); wrap.className = 'clip-sel-chips'; m.appendChild(wrap);
      const names = Object.keys(BUILT_IN).concat(customTags.map((t) => t.name).filter((n) => n !== 'Password' && !BUILT_IN[n]));
      names.forEach((n) => {
        const b = document.createElement('button'); b.className = 'cat-tag'; b.textContent = n;
        b.addEventListener('click', () => doMove(BUILT_IN[n] || n));
        wrap.appendChild(b);
      });
      const row = document.createElement('div'); row.className = 'clip-sel-new';
      const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'New category'; inp.maxLength = 24; inp.setAttribute('aria-label', 'New category name');
      const ok = document.createElement('button'); ok.className = 'btn btn-primary btn-sm'; ok.textContent = 'Create';
      const make = () => {
        const name = inp.value.trim();
        if (!name) { inp.focus(); return; }
        const same = names.find((n) => n.toLowerCase() === name.toLowerCase());
        if (same) { doMove(BUILT_IN[same] || same); return; }
        customTags.push({ name, colorKey: 'violet', colorBase: 'rgba(139,92,246,' });
        chrome.storage.local.set({ clipCustomTags: customTags });
        doMove(name);
      };
      ok.addEventListener('click', make);
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') make(); if (e.key === 'Escape') closeMenu(); });
      row.append(inp, ok); m.appendChild(row);
    }
    function downloadMenu(m) {
      m.dataset.kind = 'dl';
      const title = document.createElement('div'); title.className = 'clip-sel-menu-title'; title.textContent = 'Download as'; m.appendChild(title);
      const wrap = document.createElement('div'); wrap.className = 'clip-sel-chips'; m.appendChild(wrap);
      [['txt', 'Text file (.txt)'], ['json', 'JSON file (.json)']].forEach(([f, label]) => {
        const b = document.createElement('button'); b.className = 'cat-tag'; b.textContent = label;
        b.addEventListener('click', () => doDownload(f));
        wrap.appendChild(b);
      });
    }

    function drawBar() {
      if (!panel) return;
      const n = picked[kind].size;
      if (!n) { if (bar) { bar.remove(); bar = null; menu = null; } return; }
      if (!bar) { bar = document.createElement('div'); bar.className = 'clip-sel-bar'; panel.appendChild(bar); }
      const keep = menu;
      bar.textContent = '';
      const count = document.createElement('span'); count.className = 'clip-sel-count'; count.textContent = n + ' selected';
      bar.appendChild(count);
      const btn = (label, fn, cls) => { const b = document.createElement('button'); b.className = 'clip-sel-btn' + (cls ? ' ' + cls : ''); b.textContent = label; b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); }); bar.appendChild(b); return b; };
      const total = order[kind].length;
      btn(n >= total && !ensure[kind] ? 'None' : 'All', () => { if (ensure[kind]) ensure[kind](); if (n >= order[kind].length) clear(); else { order[kind].forEach((k) => picked[kind].add(k)); paint(); } });
      if (kind === 'text') btn('Move', () => openMenu(tagMenu));
      btn(chosen().every((o) => o.pinned) ? 'Unpin' : 'Pin', doPin);
      if (kind === 'text') btn('Download', () => openMenu(downloadMenu));
      else btn(n > 1 ? 'Download ZIP' : 'Download', () => doDownload());
      btn('Delete', doDelete, 'del');
      const x = btn('✕', clear, 'close'); x.title = 'Leave selection (Esc)'; x.setAttribute('aria-label', 'Leave selection');
      if (keep) { menu = keep; bar.appendChild(menu); }
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && active() && panel && panel.classList.contains('active')) { e.stopPropagation(); if (menu) closeMenu(); else clear(); }
    }, true);
    return { begin, attach, clear, paint, setEnsure };
  })();

  // @module 11-clipboard-pinned-and-images  (dev/popup-src/11-clipboard-pinned-and-images.js)
  // Container for pinned view
  const clipPinnedContainer = (() => {
    const d = document.createElement('div');
    d.id = 'clipPinnedContainer';
    d.style.cssText = 'display:none; flex-direction:column; gap:8px;';
    document.getElementById('clipImageContainer').parentNode.insertBefore(d, document.getElementById('clipImageContainer').nextSibling);
    return d;
  })();

  function updateClipCounts() {
    const countText   = document.getElementById('clipCountText');
    const countImage  = document.getElementById('clipCountImage');
    const countPinned = document.getElementById('clipCountPinned');
    if (countText)   countText.textContent   = clipItems.length;
    if (countImage)  countImage.textContent  = clipboardImages.length;
    if (countPinned) countPinned.textContent = 
      clipItems.filter(i => i.pinned).length + clipboardImages.filter(i => i.pinned).length;
  }

  function renderPinnedView() {
    clipPinnedContainer.innerHTML = '';
    // Pinned text items
    const pinnedTexts = clipItems.filter(i => i.pinned);
    // Pinned images
    const pinnedImgs = clipboardImages.filter(i => i.pinned);

    if (pinnedTexts.length === 0 && pinnedImgs.length === 0) {
      clipPinnedContainer.innerHTML = '<div class="clip-empty">No pinned items</div>';
      return;
    }

    // Section images épinglées
    if (pinnedImgs.length > 0) {
      const secTitle = document.createElement('div');
      secTitle.style.cssText = 'font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;';
      secTitle.textContent = '🖼️ Pinned images';
      clipPinnedContainer.appendChild(secTitle);
      const grid = document.createElement('div');
      grid.className = 'clip-image-list';
      pinnedImgs.forEach((imgObj) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'clip-image-item';
        itemDiv.innerHTML = `
          <div class="clip-image-thumbnail">
            <img src="${imgObj.dataUrl}" alt="Pinned image">
          </div>
          <div class="clip-image-info">
            <div class="clip-image-time">${formatTime(imgObj.timestamp)}</div>
            <div class="clip-image-footer">
              ${imgObj.originalSize ? `<button title="View size before/after compression" data-action="size"><span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/bar-chart.svg'); mask-image: url('../icons/svg/bar-chart.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span></button>` : ''}
              <button title="Download (compressed file, without going through clipboard)" data-action="download"><span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/import.svg'); mask-image: url('../icons/svg/import.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span></button>
              <button title="Copy" data-action="copy">
                <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/copier.svg'); mask-image: url('../icons/svg/presse%20papier/copier.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
              </button>
              <button title="Unpin" data-action="unpin" style="color:#F43F5E;"><span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/pin.svg'); mask-image: url('../icons/svg/presse%20papier/pin.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span></button>
              <button title="Delete" data-action="del" class="btn-delete">
                <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/delete.svg'); mask-image: url('../icons/svg/presse%20papier/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
              </button>
            </div>
          </div>
        `;
        itemDiv.querySelector('[data-action="size"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const before = formatBytes(imgObj.originalSize);
          const after = formatBytes(imgObj.compressedSize);
          const pct = (imgObj.originalSize && imgObj.compressedSize) ? Math.round((1 - imgObj.compressedSize / imgObj.originalSize) * 100) : null;
          showToast(pct === null ? `📊 ${before} → ${after}` : `📊 ${before} → ${after} (${pct > 0 ? '-' : ''}${pct}%)`);
        });
        itemDiv.querySelector('[data-action="download"]').addEventListener('click', (e) => {
          e.stopPropagation();
          downloadImage(imgObj);
        });
        itemDiv.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.toBlob(async (blob) => {
              try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('✅ Image copied!'); }
              catch (err) { showToast('❌ Copy error'); }
            }, 'image/png');
          };
          img.src = imgObj.dataUrl;
        });
        itemDiv.querySelector('[data-action="unpin"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const k = findClipImage(imgObj);
          if (k < 0) { renderPinnedView(); return; }
          clipboardImages[k].pinned = false;
          chrome.storage.local.set({ clipboardImages });
          renderPinnedView();
          updateClipCounts();
        });
        itemDiv.querySelector('[data-action="del"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const k = findClipImage(imgObj);
          if (k > -1) {
            clipboardImages.splice(k, 1);
            chrome.storage.local.set({ clipboardImages });
          }
          renderPinnedView();
          updateClipCounts();
        });
        grid.appendChild(itemDiv);
      });
      clipPinnedContainer.appendChild(grid);
    }

    // Section textes épinglés
    if (pinnedTexts.length > 0) {
      const secTitle2 = document.createElement('div');
      secTitle2.style.cssText = 'font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:0.5px;text-transform:uppercase;margin-top:8px;margin-bottom:4px;';
      secTitle2.textContent = '📝 Pinned texts';
      clipPinnedContainer.appendChild(secTitle2);
      const savedFilter = clipFilter;
      const savedTab = document.querySelector('.clip-tab-btn.active')?.dataset.cliptab;
      // Temporarily render text pinned items
      pinnedTexts.forEach((item) => {
        const idxOf = () => { let k = clipItems.indexOf(item); if (k < 0) k = clipItems.findIndex(c => c && c.text === item.text && c.timestamp === item.timestamp); return k; };
        let cats = item.category || ['📝 Text'];
        if (typeof cats === 'string') cats = [cats];
        let badgesHtml = '';
        cats.forEach(c => {
          const conf = catConfig[c] || { name: c, key: c };
          badgesHtml += `<span class="clip-cat-badge" style="margin-right:4px;display:inline-flex;align-items:center;"><span>${escapeHtml(conf.name)}</span></span>`;
        });
        const isPassword = isSecretCat(cats);
        const trimmedText = (item.text.length > WBBig.BIG_CHARS ? item.text.slice(0, WBBig.PREVIEW_CHARS) : item.text).trim();
        let safeText = isPassword ? '••••••••' : escapeHtml(censorText(trimmedText));
        const el = document.createElement('div');
        el.className = 'clip-item pinned';
        el.innerHTML = `
          <div class="clip-header-info">
            <div style="display:flex;flex-wrap:wrap;">${badgesHtml}</div>
            <span class="clip-time">${formatTime(item.timestamp)}</span>
          </div>
          <div class="clip-text-content">
            <div class="clip-text-preview clamp" title="Click to copy" ${isPassword ? 'style="font-family:monospace;letter-spacing:2px;color:#a78bfa;"' : ''}>${safeText}${item.big && !isPassword ? ' …' : ''}</div>
            ${item.big ? bigMetaHtml(item) : ''}
          </div>
          <div class="clip-footer">
            <button title="Copy" data-action="copy">
              <span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask-image:url('../icons/svg/presse%20papier/copier.svg');mask-image:url('../icons/svg/presse%20papier/copier.svg');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>
            </button>
            ${isPassword ? `<button title="View" data-action="reveal" style="font-size:14px;">👁️</button>` : ''}
            <button title="Unpin" data-action="unpin" class="is-pinned">
              <span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask-image:url('../icons/svg/presse%20papier/pin.svg');mask-image:url('../icons/svg/presse%20papier/pin.svg');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>
            </button>
            <button title="Delete" data-action="del" class="btn-delete">
              <span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask-image:url('../icons/svg/presse%20papier/delete.svg');mask-image:url('../icons/svg/presse%20papier/delete.svg');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>
            </button>
          </div>
        `;
        el.querySelector('[data-action="copy"]').addEventListener('click', e => { e.stopPropagation(); copyItem(item); });
        el.querySelector('.clip-text-preview').addEventListener('click', e => { e.stopPropagation(); copyItem(item); });
        el.querySelector('[data-action="reveal"]')?.addEventListener('click', e => {
          e.stopPropagation();
          const preview = el.querySelector('.clip-text-preview');
          const btn = e.currentTarget;
          if (btn.dataset.revealed === '1') {
            preview.textContent = '••••••••';
            preview.style.fontFamily = 'monospace'; preview.style.letterSpacing = '2px'; preview.style.color = '#a78bfa';
            btn.dataset.revealed = '0'; btn.title = 'View';
          } else {
            preview.textContent = item.text;
            preview.style.fontFamily = ''; preview.style.letterSpacing = ''; preview.style.color = '';
            btn.dataset.revealed = '1'; btn.title = 'Hide';
          }
        });
        el.querySelector('[data-action="unpin"]').addEventListener('click', e => {
          e.stopPropagation();
          const k = idxOf();
          if (k > -1) { clipItems[k].pinned = false; saveClipboard(true); }
          renderPinnedView();
          renderClipCategories(); updateClipCounts();
        });
        el.querySelector('[data-action="del"]').addEventListener('click', e => {
          e.stopPropagation();
          { const __k = idxOf(); if (__k > -1) clipItems.splice(__k, 1); };
          saveClipboard(true);
          renderPinnedView();
          renderClipCategories(); updateClipCounts();
        });
        clipPinnedContainer.appendChild(el);
      });
    }
  }

  clipTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      clipTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.cliptab;

      if (tab === 'text') {
        clipImageContainer.style.opacity = '0';
        clipPinnedContainer.style.opacity = '0';
        setTimeout(() => {
          clipList.style.display = 'flex';
          clipImageContainer.style.display = 'none';
          clipPinnedContainer.style.display = 'none';
          clipCatsEl.style.display = 'flex';
          { const ta = document.getElementById('clipTextActions'); if (ta) ta.style.display = 'flex'; }
          renderClipList();
          clipList.style.opacity = '0';
          requestAnimationFrame(() => { clipList.style.opacity = '1'; clipCatsEl.style.opacity = '1'; });
        }, 150);
      } else if (tab === 'image') {
        clipList.style.opacity = '0';
        clipCatsEl.style.opacity = '0';
        clipPinnedContainer.style.opacity = '0';
        setTimeout(() => {
          clipList.style.display = 'none';
          clipImageContainer.style.display = 'flex';
          clipPinnedContainer.style.display = 'none';
          clipCatsEl.style.display = 'none';
          { const ta = document.getElementById('clipTextActions'); if (ta) ta.style.display = 'none'; }
          renderClipImages();
          clipImageContainer.style.opacity = '0';
          requestAnimationFrame(() => { clipImageContainer.style.opacity = '1'; clipCatsEl.style.opacity = '1'; });
        }, 150);
      } else if (tab === 'pinned') {
        clipList.style.opacity = '0';
        clipImageContainer.style.opacity = '0';
        clipCatsEl.style.opacity = '0';
        setTimeout(() => {
          clipList.style.display = 'none';
          clipImageContainer.style.display = 'none';
          clipCatsEl.style.display = 'none';
          { const ta = document.getElementById('clipTextActions'); if (ta) ta.style.display = 'none'; }
          clipPinnedContainer.style.display = 'flex';
          clipPinnedContainer.style.flexDirection = 'column';
          renderPinnedView();
          clipPinnedContainer.style.opacity = '0';
          requestAnimationFrame(() => { clipPinnedContainer.style.opacity = '1'; });
        }, 150);
      }

      // Session: save active clip tab
      saveSessionState({ clipTab: tab });
    });
  });

  // Long lists are drawn a screenful at a time: the first items at once, the next ones
  // as the end of the list comes into view. A selection ("All") draws the rest first.
  const progressiveHandlers = {};
  function progressiveList(container, kind, total, first, more, renderRange) {
    if (progressiveHandlers[kind]) { document.removeEventListener('scroll', progressiveHandlers[kind], true); progressiveHandlers[kind] = null; }
    let shown = 0, sentinel = null, queued = false;
    // "near the end" is measured on the 1 px marker after the last drawn item, wherever the
    // scrolling happens (the list itself or the panel around it), 500 px ahead of the screen.
    function check() {
      queued = false;
      if (!sentinel || shown >= total || !container.offsetParent) return;
      if (sentinel.getBoundingClientRect().top < window.innerHeight + 500) draw(more);
    }
    function onScroll() { if (!queued) { queued = true; requestAnimationFrame(check); } }
    function park() {
      if (sentinel) { sentinel.remove(); sentinel = null; }
      if (shown >= total) {
        if (progressiveHandlers[kind]) { document.removeEventListener('scroll', progressiveHandlers[kind], true); progressiveHandlers[kind] = null; }
        return;
      }
      sentinel = document.createElement('div');
      sentinel.style.cssText = 'height:1px;grid-column:1/-1;';
      container.appendChild(sentinel);
    }
    function draw(n) {
      const to = Math.min(total, shown + n);
      if (to <= shown) return;
      renderRange(shown, to);
      shown = to;
      park();
      if (shown >= total) clipSel.setEnsure(kind, null);
      else onScroll();   // still short of the screen's end: keep going
    }
    progressiveHandlers[kind] = onScroll;
    document.addEventListener('scroll', onScroll, true);
    clipSel.setEnsure(kind, () => { if (shown < total) draw(total - shown); });
    draw(first);
  }

  function renderClipImages() {
    clipImageListEl.innerHTML = '';
    clipSel.begin('image');
    if (clipboardImages.length === 0) {
      clipImageListEl.innerHTML = '<div class="clip-empty" style="grid-column: 1 / -1;">No images copied</div>';
      return;
    }
    const now = Date.now();
    const startOf = (d) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r.getTime(); };
    const endOf   = (d) => { const r = new Date(d); r.setHours(23, 59, 59, 999); return r.getTime(); };

    const filteredImages = clipboardImages.filter(imgObj => {
      const t = imgObj.timestamp || 0;
      if (clipDateMode === 'all') return true;
      if (clipDateMode === '1h') return (now - t) <= 3600000;
      if (clipDateMode === 'today') return t >= startOf(new Date()) && t <= now;
      if (clipDateMode === 'yesterday') {
        const yd = new Date(); yd.setDate(yd.getDate() - 1);
        return t >= startOf(yd) && t <= endOf(yd);
      }
      if (clipDateMode === 'week') {
        const ws = new Date(); const dow = ws.getDay() || 7;
        ws.setDate(ws.getDate() - (dow - 1)); ws.setHours(0,0,0,0);
        return t >= ws.getTime();
      }
      if (clipDateMode === 'month') {
        const ms = new Date(); ms.setDate(1); ms.setHours(0,0,0,0);
        return t >= ms.getTime();
      }
      if (clipDateMode === 'custom') return !clipDateCustomVal || t >= clipDateCustomVal;
      return true;
    });

    if (filteredImages.length === 0) {
      const msg = clipboardImages.length === 0
        ? 'No images copied'
        : `No images for this filter`;
      clipImageListEl.innerHTML = `<div class="clip-empty" style="grid-column: 1 / -1;">${msg}</div>`;
      return;
    }

    const FIRST_IMG = 30;
    function renderChunkImg(startIndex, endIndex) {
      const chunk = filteredImages.slice(startIndex, endIndex);
      if (chunk.length === 0) return;

      const fragment = document.createDocumentFragment();
      chunk.forEach((imgObj) => {

      const isNew = (now - imgObj.timestamp) < 600;
      const itemDiv = document.createElement('div');
      itemDiv.className = 'clip-image-item' + (isNew ? ' clip-image--new clipboard-item--new' : '');

      const diff = now - imgObj.timestamp;
      let timeStr = formatTime(imgObj.timestamp);

      itemDiv.innerHTML = `
        <div class="clip-image-thumbnail">
          <img src="${imgObj.dataUrl}" alt="Copied Image">
        </div>
        <div class="clip-image-info">
          <div class="clip-image-time">${timeStr}</div>
          <div class="clip-image-footer">
            ${imgObj.originalSize ? `<button title="View size before/after compression" data-action="size"><span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/bar-chart.svg'); mask-image: url('../icons/svg/bar-chart.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span></button>` : ''}
            <button title="Download (compressed file, without going through clipboard)" data-action="download"><span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/import.svg'); mask-image: url('../icons/svg/import.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span></button>
            <button title="Copy" data-action="copy">
              <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/copier.svg'); mask-image: url('../icons/svg/presse%20papier/copier.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
            </button>
            <button title="${imgObj.pinned ? 'Unpin' : 'Pin'}" data-action="pin" style="${imgObj.pinned ? 'color:#F43F5E;' : 'opacity:0.5;'}"><span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/pin.svg'); mask-image: url('../icons/svg/presse%20papier/pin.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span></button>
            <button title="Delete" data-action="del" class="btn-delete">
              <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/delete.svg'); mask-image: url('../icons/svg/presse%20papier/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
            </button>
          </div>
        </div>
      `;

      itemDiv.querySelector('[data-action="size"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const before = formatBytes(imgObj.originalSize);
        const after = formatBytes(imgObj.compressedSize);
        const pct = (imgObj.originalSize && imgObj.compressedSize) ? Math.round((1 - imgObj.compressedSize / imgObj.originalSize) * 100) : null;
        showToast(pct === null ? `\ud83d\udcca ${before} \u2192 ${after}` : `\ud83d\udcca ${before} \u2192 ${after} (${pct > 0 ? '-' : ''}${pct}%)`);
      });

      itemDiv.querySelector('[data-action="download"]').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadImage(imgObj);
      });

      itemDiv.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(async (pngBlob) => {
            try {
              if (pngBlob) {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': pngBlob })
                ]);
                showToast('\u2705 Image copied!');
              } else {
                throw new Error('Blob creation failed');
              }
            } catch (err) {
              console.error('Clipboard error:', err);
              showToast('\u274c Copy error');
            }
          }, 'image/png');
        };
        img.onerror = () => showToast('\u274c Image error');
        img.src = imgObj.dataUrl;
      });

      itemDiv.querySelector('[data-action="pin"]').addEventListener('click', (e) => {
        e.stopPropagation();
        imgObj.pinned = !imgObj.pinned;
        chrome.storage.local.set({ clipboardImages });
        updateClipCounts();
        const btn = e.currentTarget;
        btn.title = imgObj.pinned ? 'Unpin' : 'Pin';
        btn.style.color = imgObj.pinned ? '#F43F5E' : '';
        btn.style.opacity = imgObj.pinned ? '1' : '0.5';
        showToast(imgObj.pinned ? '📌 Pinned!' : 'Unpinned');
      });

      itemDiv.querySelector('[data-action="del"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const realIdx = findClipImage(imgObj);
        if (realIdx > -1) {
          clipboardImages.splice(realIdx, 1);
          beginLocalClipWrite();
          chrome.storage.local.set({ clipboardImages });
          updateClipCounts();

          const currentHeight = itemDiv.offsetHeight;
          itemDiv.style.height = currentHeight + 'px';
          itemDiv.style.transition = 'opacity 0.2s ease, transform 0.2s ease, height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease, margin 0.3s ease';
          itemDiv.style.overflow = 'hidden';

          requestAnimationFrame(() => {
            itemDiv.style.opacity = '0';
            itemDiv.style.transform = 'scale(0.95) translateY(10px)';
            setTimeout(() => {
              itemDiv.style.height = '0px';
              itemDiv.style.padding = '0px';
              itemDiv.style.margin = '0px';
              itemDiv.style.borderWidth = '0px';
              setTimeout(() => {
                itemDiv.remove();
                if (clipImageListEl.children.length === 0) {
                  clipImageListEl.innerHTML = '<div class="clip-empty" style="grid-column: 1 / -1;">No images copied</div>';
                }
              }, 300);
            }, 180);
          });
        }
      });
      clipSel.attach(itemDiv, imgObj, 'image');
      fragment.appendChild(itemDiv);
    });
    
    clipImageListEl.appendChild(fragment);
  }

  progressiveList(clipImageListEl, 'image', filteredImages.length, FIRST_IMG, FIRST_IMG, renderChunkImg);
}

  chrome.storage.local.get('clipboardImages', data => {
    clipboardImages = data.clipboardImages || [];
  });

  // @module 12-clipboard-zip-and-helpers  (dev/popup-src/12-clipboard-zip-and-helpers.js)
  // Générateur de .zip en mode "store" (pas de compression, inutile sur du JPEG déjà compressé)
  function makeCRCTable() {
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }
  const CRC_TABLE = makeCRCTable();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Construit un .zip en mode "store" (les JPEG sont déjà compressés, inutile de recompresser)
  function buildZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const centralEntries = [];
    let offset = 0;

    files.forEach(f => {
      const nameBytes = encoder.encode(f.name);
      const data = f.data;
      const crc = crc32(data);

      const localHeader = new DataView(new ArrayBuffer(30));
      localHeader.setUint32(0, 0x04034b50, true);
      localHeader.setUint16(4, 20, true);
      localHeader.setUint16(6, 0, true);
      localHeader.setUint16(8, 0, true);
      localHeader.setUint16(10, 0, true);
      localHeader.setUint16(12, 0, true);
      localHeader.setUint32(14, crc, true);
      localHeader.setUint32(18, data.length, true);
      localHeader.setUint32(22, data.length, true);
      localHeader.setUint16(26, nameBytes.length, true);
      localHeader.setUint16(28, 0, true);

      chunks.push(new Uint8Array(localHeader.buffer), nameBytes, data);
      centralEntries.push({ nameBytes, crc, size: data.length, offset });
      offset += 30 + nameBytes.length + data.length;
    });

    const centralStart = offset;
    centralEntries.forEach(e => {
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, 0, true);
      central.setUint16(14, 0, true);
      central.setUint32(16, e.crc, true);
      central.setUint32(20, e.size, true);
      central.setUint32(24, e.size, true);
      central.setUint16(28, e.nameBytes.length, true);
      central.setUint16(30, 0, true);
      central.setUint16(32, 0, true);
      central.setUint16(34, 0, true);
      central.setUint16(36, 0, true);
      central.setUint32(38, 0, true);
      central.setUint32(42, e.offset, true);
      chunks.push(new Uint8Array(central.buffer), e.nameBytes);
      offset += 46 + e.nameBytes.length;
    });
    const centralSize = offset - centralStart;

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, centralEntries.length, true);
    end.setUint16(10, centralEntries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, centralStart, true);
    end.setUint16(20, 0, true);
    chunks.push(new Uint8Array(end.buffer));

    let total = 0;
    chunks.forEach(c => { total += c.length; });
    const out = new Uint8Array(total);
    let pos = 0;
    chunks.forEach(c => { out.set(c, pos); pos += c.length; });
    return out;
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const exportImagesZipBtn = document.getElementById('exportImagesZipBtn');
  const clearImagesHistoryBtn = document.getElementById('clearImagesHistoryBtn');

  if (exportImagesZipBtn) {
    exportImagesZipBtn.addEventListener('click', () => {
      if (clipboardImages.length === 0) {
        showToast('No images to export.');
        return;
      }
      const originalLabel = exportImagesZipBtn.innerHTML;
      try {
        exportImagesZipBtn.disabled = true;
        exportImagesZipBtn.textContent = '⏳ Generating...';

        const files = clipboardImages.map((img, i) => ({
          name: `image-${String(i + 1).padStart(4, '0')}.jpg`,
          data: dataUrlToBytes(img.dataUrl)
        }));
        const zipBytes = buildZip(files);
        const blob = new Blob([zipBytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `workbox-images-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        showToast(`📦 ZIP exported (${files.length} image(s))!`);
      } catch (e) {
        showToast('Error creating the ZIP.');
      } finally {
        exportImagesZipBtn.disabled = false;
        exportImagesZipBtn.innerHTML = originalLabel;
      }
    });
  }

  if (clearImagesHistoryBtn) {
    clearImagesHistoryBtn.addEventListener('click', () => {
      const unpinnedCount = clipboardImages.filter(i => !i.pinned).length;
      if (unpinnedCount === 0) {
        showToast('Nothing to clear (no unpinned images).');
        return;
      }
      askSecureConfirm(
        "Clear image history",
        `Delete ${unpinnedCount} unpinned image(s)? Remember to export them as ZIP first if needed. Pinned images 📌 are kept.`,
        (confirmed) => {
          if (!confirmed) return;
          clipboardImages = clipboardImages.filter(i => i.pinned);
          chrome.storage.local.set({ clipboardImages }, () => {
            renderClipImages();
            updateClipCounts();
            showToast('🗑️ Image history cleared.');
          });
        }
      );
    });
  }

  // Contourne la limite PNG-only du presse-papier système : un téléchargement
  // direct n'a pas cette contrainte, le fichier obtenu est donc vraiment le JPEG compressé.
  function downloadImage(imgObj) {
    const ext = imgObj.dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = imgObj.dataUrl;
    a.download = `workbox-image-${imgObj.timestamp || Date.now()}.${ext}`;
    a.click();
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '?';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}min ago`;
    if (hours < 24 && now.getDate() === date.getDate()) {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    const __y = new Date(now); __y.setDate(__y.getDate() - 1);
    if (__y.toDateString() === date.toDateString()) {
      return `Yesterday ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  }

  // Censure les emails pour la sécurité : "john.doe@gmail.com" → "jo###@gmail.com"
  function censorText(text) {
    if (!text) return '';
    return String(text).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (email) => {
      const [local, domain] = email.split('@');
      const visible = local.substring(0, 2);
      return visible + '###@' + domain;
    });
  }

  // @module 13-clipboard-tags  (dev/popup-src/13-clipboard-tags.js)
  // Site tags of older versions (GitHub, YouTube...): removed. The same list lives in
  // background.js, which cleans the stored items; this covers a popup that loaded
  // the list first, so the old tags cannot be written back.
  const LEGACY_SITE_CATS = [
    '🐙 GitHub', '🎵 Spotify', '🐦 Twitter / X', '📘 Facebook', '📸 Instagram', '🎬 TikTok',
    '📺 YouTube', '💼 LinkedIn', '🗣️ Reddit', '📌 Pinterest', '👻 Snapchat', '💬 WhatsApp',
    '✈️ Telegram', '🧵 Threads', '🎮 Discord', '🎮 Twitch', '🎨 Figma', '📄 Google Drive'
  ];
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

  const CAT_ICONS = '../icons/svg/presse papier/categorie/';
  // categories whose text is never shown in clear until the user asks for it
  const isSecretCat = (cats) => cats.includes('🔑 Password') || cats.includes('🔐 API Key');
  const catConfig = {
    '📝 Text': { name: '📝 Text', key: 'Text' },
    '🔗 Link': { name: '🔗 Link', key: '🔗 Link' },
    '🎥 Video': { name: '🎥 Video', key: '🎥 Video' },
    '🖼️ Image': { name: '🖼️ Image', key: '🖼️ Image' },
    '🎨 Color': { name: '🎨 Color', key: '🎨 Color' },
    '🔒 Private': { name: '🔒 Private', key: '🔒 Private' },
    '🔑 Password': { name: '🔑 Password', key: '🔑 Password' },
    '✉️ Email': { name: '✉️ Email', key: '✉️ Email' },
    '📞 Phone': { name: '📞 Phone', key: '📞 Phone' },
    '💻 Code': { name: '💻 Code', key: '💻 Code' },
    '🔢 Number': { name: '🔢 Number', key: '🔢 Number' },
    '📅 Date': { name: '📅 Date', key: '📅 Date' },
    '💰 Price': { name: '💰 Price', key: '💰 Price' },
    '📍 Address': { name: '📍 Address', key: '📍 Address' },
    '🔐 API Key': { name: '🔐 API Key', key: '🔐 API Key' },
    '📄 Document': { name: '📄 Document', key: '📄 Document' }
  };

  // Tag modal (replaces prompt())
  function showTagModal(callback) {
    const overlay = document.getElementById('tagModalOverlay');
    const input = document.getElementById('tagModalInput');
    const okBtn = document.getElementById('tagModalOk');
    const cancelBtn = document.getElementById('tagModalCancel');
    input.value = '';
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    const colorMap = {
      purple: 'rgba(139,92,246,',
      blue: 'rgba(56,189,248,',
      green: 'rgba(34,197,94,',
      orange: 'rgba(251,146,60,',
      pink: 'rgba(236,72,153,',
      red: 'rgba(239,68,68,',
      cyan: 'rgba(34,211,238,'
    };
    let selectedColor = 'purple';

    document.querySelectorAll('.tag-color-opt').forEach(opt => {
      opt.style.outline = 'none';
      opt.addEventListener('click', () => {
        document.querySelectorAll('.tag-color-opt')
          .forEach(o => o.style.outline = 'none');
        opt.style.outline = '2px solid #fff';
        selectedColor = opt.dataset.color;
      });
    });
    // Sélectionne purple par défaut
    const defaultOpt = document.querySelector('.tag-color-opt[data-color="purple"]');
    if (defaultOpt) defaultOpt.style.outline = '2px solid #fff';

    function confirm() {
      const val = input.value.trim();
      overlay.style.display = 'none';
      if (val) callback(val, selectedColor, colorMap[selectedColor]);
    }
    function cancel() { overlay.style.display = 'none'; }
    okBtn.onclick = confirm;
    cancelBtn.onclick = cancel;
    input.onkeydown = (e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); };
  }

  // Custom tags
  let customTags = [];
  chrome.storage.local.get('clipCustomTags', d => {
    customTags = d.clipCustomTags || [];
    renderClipCategories();
  });

  // @module 14-clipboard-site-chips  (dev/popup-src/14-clipboard-site-chips.js)
  // ===== Automatic site labels for copied links (all local, derived from the text) =====
  const SITE_KNOWN = [
    [['youtube.com', 'youtu.be'], 'YouTube'], [['github.com', 'githubusercontent.com'], 'GitHub'],
    [['wikipedia.org'], 'Wikipedia'], [['amazon.com', 'amazon.fr', 'amazon.de', 'amazon.co.uk', 'amazon.es', 'amazon.it', 'amzn.to'], 'Amazon'],
    [['google.com', 'google.fr'], 'Google'], [['x.com', 'twitter.com'], 'X'], [['reddit.com', 'redd.it'], 'Reddit'],
    [['linkedin.com'], 'LinkedIn'], [['facebook.com', 'fb.com'], 'Facebook'], [['instagram.com'], 'Instagram'],
    [['tiktok.com'], 'TikTok'], [['twitch.tv'], 'Twitch'], [['netflix.com'], 'Netflix'], [['spotify.com'], 'Spotify'],
    [['stackoverflow.com'], 'Stack Overflow'], [['gitlab.com'], 'GitLab'], [['notion.so', 'notion.site'], 'Notion'],
    [['discord.com', 'discord.gg'], 'Discord'], [['whatsapp.com', 'wa.me'], 'WhatsApp'], [['pinterest.com', 'pinterest.fr'], 'Pinterest'],
    [['medium.com'], 'Medium'], [['dropbox.com'], 'Dropbox'], [['figma.com'], 'Figma'], [['canva.com'], 'Canva'],
    [['npmjs.com'], 'npm'], [['apple.com'], 'Apple'], [['microsoft.com', 'live.com', 'office.com'], 'Microsoft'],
    [['ebay.com', 'ebay.fr'], 'eBay'], [['leboncoin.fr'], 'Leboncoin'], [['lemonde.fr'], 'Le Monde'], [['openai.com', 'chatgpt.com'], 'OpenAI'],
    [['claude.ai', 'anthropic.com'], 'Claude'], [['vercel.app', 'vercel.com'], 'Vercel'], [['bbc.com', 'bbc.co.uk'], 'BBC']
  ];
  const SITE_MAP = {};
  SITE_KNOWN.forEach(([domains, name]) => domains.forEach((d) => { SITE_MAP[d] = { key: domains[0], name }; }));
  const SLD = /^(co|com|org|net|gov|edu|ac)$/;
  function siteRegistrable(host) {
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const n = parts.length;
    return (SLD.test(parts[n - 2]) && parts[n - 1].length === 2) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  }
  const siteInfoCache = new Map();
  // Returns { key, name, domain, hint, origin } for a text that is one single web link, else null.
  function siteInfo(text) {
    if (typeof text !== 'string') return null;
    if (siteInfoCache.has(text)) return siteInfoCache.get(text);
    let out = null;
    const t = text.trim();
    if (t.length < 200 && /^https?:\/\/[^\s]+$/i.test(t)) {
      try {
        const u = new URL(t);
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (host && host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':')) {
          const reg = siteRegistrable(host);
          const known = SITE_MAP[reg] || SITE_MAP[host];
          let name, key;
          if (known) { name = known.name; key = known.key; }
          else {
            const label = reg.split('.');
            name = label.length >= 3 && SLD.test(label[label.length - 2]) ? label[label.length - 3] : label[0];
            key = reg;
          }
          // a few sites tell what kind of page it is
          let hint = '';
          const path = u.pathname;
          if (key === 'youtube.com') hint = /^\/(watch|shorts|live)\b/.test(path) || host === 'youtu.be' ? 'video' : (/^\/playlist/.test(path) ? 'playlist' : '');
          else if (key === 'github.com' && host === 'github.com') hint = /^\/[^/]+\/[^/]+\/?$/.test(path) ? 'repo' : '';
          else if (key === 'google.com' && /^\/maps/.test(path) || host === 'maps.google.com') hint = 'place';
          else if (key === 'wikipedia.org' && /^\/wiki\//.test(path)) hint = 'article';
          out = { key, name: name.charAt(0).toUpperCase() + name.slice(1), domain: reg, hint, origin: u.origin };
          if (key === 'google.com' && !hint && host !== 'google.com' && host !== 'google.fr') out.name = 'Google';
        }
      } catch (e) { out = null; }
    }
    if (siteInfoCache.size > 3000) siteInfoCache.clear();
    siteInfoCache.set(text, out);
    return out;
  }
  // The window is dark: a black logo (GitHub, X, TikTok...) would vanish on it. An
  // icon whose visible pixels are nearly all black is shown inverted, so it turns
  // white. Coloured icons, and icons on a light square, are left alone. The icon
  // comes from the extension's own origin, so reading its pixels is allowed.
  const favBlackCache = new Map();
  function favIsBlack(img, origin) {
    if (favBlackCache.has(origin)) return favBlackCache.get(origin);
    let black = false;
    try {
      const n = 16, c = document.createElement('canvas');
      c.width = c.height = n;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, n, n);
      const d = cx.getImageData(0, 0, n, n).data;
      let seen = 0, dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;                       // transparent: ignored
        seen++;
        if (Math.max(d[i], d[i + 1], d[i + 2]) < 80) dark++;       // near black in every channel (a dark red is not black)
      }
      black = seen >= 8 && dark / seen >= 0.9;
    } catch (e) { black = false; }
    if (favBlackCache.size > 500) favBlackCache.clear();
    favBlackCache.set(origin, black);
    return black;
  }
  // The site's icon comes from the browser's own favicon cache: no network request.
  function siteFavEl(info, size) {
    const wrap = document.createElement('span');
    wrap.className = 'site-fav';
    const letter = document.createElement('span');
    letter.className = 'site-fav-letter'; letter.textContent = info.name.charAt(0).toUpperCase();
    wrap.appendChild(letter);
    try {
      const img = document.createElement('img');
      img.alt = ''; img.width = size || 14; img.height = size || 14; img.loading = 'lazy';
      img.src = chrome.runtime.getURL('_favicon/') + '?pageUrl=' + encodeURIComponent(info.origin + '/') + '&size=32';
      img.addEventListener('load', () => {
        if (img.naturalWidth > 1) {
          letter.style.display = 'none';
          if (favIsBlack(img, info.origin)) img.classList.add('fav-inverted');
        } else img.remove();
      });
      img.addEventListener('error', () => img.remove());
      wrap.appendChild(img);
    } catch (e) { }
    return wrap;
  }
  const SITE_CHIP_MIN = 3, SITE_CHIP_MAX = 8, SITE_CHIPS_WHEN_MENU = 5;
  function siteStats() {
    const m = new Map();
    clipItems.forEach((item) => {
      if (!item || !item.text) return;
      let cats = item.category || []; if (typeof cats === 'string') cats = [cats];
      if (isSecretCat(cats) || cats.includes('🔒 Private')) return;
      const info = siteInfo(item.text);
      if (!info) return;
      const e = m.get(info.key) || { key: info.key, name: info.name, domain: info.domain, origin: info.origin, count: 0 };
      e.count++; m.set(info.key, e);
    });
    // most links first, then A to Z
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  function itemSiteKey(item) {
    let cats = item.category || []; if (typeof cats === 'string') cats = [cats];
    if (isSecretCat(cats) || cats.includes('🔒 Private')) return null;
    const i = siteInfo(item.text); return i ? i.key : null;
  }
  function closeSitesMenu() { const m = document.getElementById('clipSitesMenu'); if (m) m.remove(); }
  function openSitesMenu(anchor, sites) {
    closeSitesMenu();
    const menu = document.createElement('div');
    menu.id = 'clipSitesMenu'; menu.className = 'clip-sites-menu';
    const search = document.createElement('input');
    search.type = 'text'; search.placeholder = 'Search a site'; search.setAttribute('aria-label', 'Search a site');
    const list = document.createElement('div'); list.className = 'clip-sites-list';
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = '';
      const shown = sites.filter((s) => !q || s.name.toLowerCase().includes(q) || s.domain.includes(q));
      shown.forEach((s) => {
        const b = document.createElement('button');
        b.className = 'clip-sites-row' + (clipFilter === 'site:' + s.key ? ' active' : '');
        b.title = s.domain;
        b.appendChild(siteFavEl(s, 14));
        const n = document.createElement('span'); n.className = 'clip-sites-name'; n.textContent = s.name; b.appendChild(n);
        const c = document.createElement('span'); c.className = 'clip-sites-count'; c.textContent = s.count; b.appendChild(c);
        b.addEventListener('click', () => { clipFilter = 'site:' + s.key; closeSitesMenu(); renderClipCategories(); renderClipList(); saveSessionState({ clipFilter }); });
        list.appendChild(b);
      });
      if (!shown.length) { const e = document.createElement('div'); e.className = 'clip-sites-empty'; e.textContent = 'No site found'; list.appendChild(e); }
    };
    search.addEventListener('input', draw);
    menu.appendChild(search); menu.appendChild(list);
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 250) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 228)) + 'px';
    draw(); search.focus();
    const off = (e) => { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { closeSitesMenu(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc, true); } };
    const esc = (e) => { if (e.key === 'Escape') { closeSitesMenu(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc, true); } };
    document.addEventListener('mousedown', off, true); document.addEventListener('keydown', esc, true);
  }

  // @module 15-clipboard-categories  (dev/popup-src/15-clipboard-categories.js)
  // Build category filter chips automatically from existing items
  function renderClipCategories() {
    clipCatsEl.innerHTML = '';

    // Count items per auto-detected type (handling arrays)
    const typeCounts = {};
    clipItems.forEach(item => {
      let cats = item.category || ['📝 Text'];
      if (typeof cats === 'string') cats = [cats]; // Backward compatibility
      cats.forEach(c => {
        typeCounts[c] = (typeCounts[c] || 0) + 1;
      });
    });

    function createChip(filterVal, label, count, key) {
      const chip = document.createElement('button');
      chip.className = 'cat-tag' + (clipFilter === filterVal ? ' active' : '');
      chip.setAttribute('data-cat', key);

      // Pas d'icône ici : l'emoji est déjà dans le label (ex: "📝 Texte"),
      // un logo à côté ferait doublon.
      const span = document.createElement('span');
      span.textContent = `${label} (${count})`;
      chip.appendChild(span);

      chip.addEventListener('click', () => { clipFilter = filterVal; renderClipCategories(); renderClipList(); saveSessionState({ clipFilter: filterVal }); });
      return chip;
    }

    // "All" chip
    clipCatsEl.appendChild(createChip('all', '📋 All', clipItems.length, 'all'));

    // One chip per detected type
    for (const [type, count] of Object.entries(typeCounts)) {
      const conf = catConfig[type] || { name: type, key: 'Text' };
      clipCatsEl.appendChild(createChip(type, conf.name, count, conf.key));
    }

    // Site chips: only sites with enough links, most links first; the rest sit in the Sites menu
    const sites = siteStats();
    if (clipFilter.startsWith('site:') && !sites.some((s) => 'site:' + s.key === clipFilter)) { clipFilter = 'all'; }
    const eligible = sites.filter((s) => s.count >= SITE_CHIP_MIN);
    const useMenu = sites.length > SITE_CHIP_MAX;
    let chipSites = useMenu ? eligible.slice(0, SITE_CHIPS_WHEN_MENU) : eligible;
    const active = sites.find((s) => 'site:' + s.key === clipFilter);
    if (active && !chipSites.includes(active)) chipSites = chipSites.concat(active);
    chipSites.forEach((s) => {
      const chip = document.createElement('button');
      chip.className = 'cat-tag site-chip' + (clipFilter === 'site:' + s.key ? ' active' : '');
      chip.setAttribute('data-cat', 'site'); chip.title = s.domain;
      chip.appendChild(siteFavEl(s, 13));
      const span = document.createElement('span'); span.textContent = `${s.name} (${s.count})`; chip.appendChild(span);
      chip.addEventListener('click', () => { clipFilter = 'site:' + s.key; renderClipCategories(); renderClipList(); saveSessionState({ clipFilter }); });
      clipCatsEl.appendChild(chip);
    });
    if (useMenu) {
      const more = document.createElement('button');
      more.className = 'cat-tag site-chip'; more.setAttribute('data-cat', 'site');
      more.textContent = `🌐 Sites (${sites.length}) ▾`;
      more.addEventListener('click', (e) => { e.stopPropagation(); if (document.getElementById('clipSitesMenu')) closeSitesMenu(); else openSitesMenu(more, siteStats()); });
      clipCatsEl.appendChild(more);
    }

    // Custom tags
    customTags.forEach((tag, i) => {
      const btn = document.createElement('button');
      btn.className = 'cat-tag' + (clipFilter === tag.name ? ' active' : '');
      btn.dataset.cat = tag.name;

      // Apply custom color
      const base = tag.colorBase || 'rgba(139,92,246,';
      btn.style.background = base + '0.15)';
      btn.style.borderColor = base + '0.5)';
      btn.style.color = base + '0.9)';

      btn.innerHTML = `
        <span class="cat-icon" style="
          -webkit-mask-image: url('${CAT_ICONS}tag.svg');
          mask-image: url('${CAT_ICONS}tag.svg');
          -webkit-mask-size: contain; mask-size: contain;
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
          width:13px; height:13px; display:inline-block;
          background-color: currentColor;
        "></span>
        <span>${escapeHtml(tag.name)}</span>
        <span class="tag-delete-btn" data-tagidx="${i}" title="Delete"
          style="margin-left:4px; opacity:0.4; font-size:10px; cursor:pointer;">✕</span>
      `;
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-delete-btn')) return;
        clipFilter = tag.name;
        renderClipCategories();
        renderClipList();
        saveSessionState({ clipFilter: tag.name });
      });
      btn.querySelector('.tag-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        customTags.splice(i, 1);
        chrome.storage.local.set({ clipCustomTags: customTags });
        renderClipCategories();
      });
      clipCatsEl.appendChild(btn);
    });

    // Bouton "+" pour créer un tag
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'cat-tag';
    addTagBtn.style.opacity = '0.5';
    addTagBtn.textContent = '+ Tag';
    addTagBtn.addEventListener('click', () => {
      showTagModal((name, colorKey, colorBase) => {
        customTags.push({ name, colorKey, colorBase });
        chrome.storage.local.set({ clipCustomTags: customTags });
        renderClipCategories();
      });
    });
    clipCatsEl.appendChild(addTagBtn);
    collapseCategoryChips();
  }

  // Only the first 5 chips show; a small "+N" link reveals the rest.
  const CAT_CHIPS_SHOWN = 5;
  let catsExpanded = false;
  function collapseCategoryChips() {
    const kids = [...clipCatsEl.children];
    if (kids.length <= CAT_CHIPS_SHOWN) return;
    const mkToggle = (text) => {
      const b = document.createElement('button');
      b.className = 'cat-more'; b.type = 'button'; b.textContent = text;
      b.addEventListener('click', () => { catsExpanded = !catsExpanded; renderClipCategories(); });
      return b;
    };
    if (catsExpanded) { clipCatsEl.appendChild(mkToggle('less')); return; }
    let hidden = 0;
    kids.forEach((k, i) => { if (i >= CAT_CHIPS_SHOWN && !k.classList.contains('active')) { k.classList.add('cat-hidden'); hidden++; } });
    if (hidden) clipCatsEl.appendChild(mkToggle('+' + hidden + ' more'));
  }

  // @module 16-clipboard-list  (dev/popup-src/16-clipboard-list.js)
  function renderClipList() {
    const q = clipSearchQuery.trim().toLowerCase();
    const now = Date.now();
    const filtered = clipItems
      .filter(item => {
        let cats = item.category || ['📝 Text'];
        if (typeof cats === 'string') cats = [cats];
        if (clipFilter.startsWith('site:')) return itemSiteKey(item) === clipFilter.slice(5);
        return clipFilter === 'all' || cats.includes(clipFilter);
      })
      .filter(item => !q || item.text.toLowerCase().includes(q))
      .filter(item => {
        if (clipDateMode === 'all') return true;
        const itemTime = item.timestamp || 0;

        // Helpers pour bornes de journée
        const startOf = (d) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r.getTime(); };
        const endOf   = (d) => { const r = new Date(d); r.setHours(23, 59, 59, 999); return r.getTime(); };

        if (clipDateMode === '1h') {
          // Dernière heure glissante
          return (now - itemTime) <= 3600000;

        } else if (clipDateMode === 'today') {
          // Aujourd'hui uniquement
          return itemTime >= startOf(new Date()) && itemTime <= now;

        } else if (clipDateMode === 'yesterday') {
          // Hier UNIQUEMENT (de minuit à 23:59)
          const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          return itemTime >= startOf(yesterdayDate) && itemTime <= endOf(yesterdayDate);

        } else if (clipDateMode === 'week') {
          // Cette semaine (depuis le lundi 00:00)
          const weekStart = new Date();
          const dayOfWeek = weekStart.getDay() || 7; // 0=Dim → 7, sinon 1=Lun…6=Sam
          weekStart.setDate(weekStart.getDate() - (dayOfWeek - 1));
          weekStart.setHours(0, 0, 0, 0);
          return itemTime >= weekStart.getTime();

        } else if (clipDateMode === 'month') {
          // Ce mois (depuis le 1er du mois 00:00)
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          return itemTime >= monthStart.getTime();

        } else if (clipDateMode === 'custom') {
          if (!clipDateCustomVal) return true;
          return itemTime >= clipDateCustomVal;
        }

        return true;
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    if (filtered.length === 0) {
      let emptyMsg = 'No results';
      if (clipItems.length === 0) {
        emptyMsg = '📋 Copy text on any page, it will appear here automatically';
      } else if (clipDateMode !== 'all') {
        const dateLabels = {
          '1h':        'the last hour',
          'today':     'today',
          'yesterday': 'yesterday',
          'week':      'this week',
          'month':     'this month',
          'custom':    'this period'
        };
        const label = dateLabels[clipDateMode] || 'this filter';
        emptyMsg = `📅 No items copied ${clipFilter !== 'all' ? 'in this category ' : ''}for ${label}`;
      } else if (clipFilter !== 'all') {
        emptyMsg = '🔍 No text found for this category';
      } else if (q) {
        emptyMsg = `🔍 No results for "${q}"`;
      }
      const empty = document.createElement('div');
      empty.className = 'clip-empty';
      empty.style.cssText = 'text-align: center; padding: 20px; color: var(--text-muted);';
      empty.textContent = emptyMsg;
      clipList.replaceChildren(empty);
      return;
    }

    clipList.innerHTML = '';
    clipSel.begin('text');
    
    // Chunked rendering to prevent blocking UI for large lists
    const FIRST_TEXT = 40;
    function renderChunk(startIndex, endIndex) {
      const chunk = filtered.slice(startIndex, endIndex);
      if (chunk.length === 0) return;
      
      const fragment = document.createDocumentFragment();
      chunk.forEach((item) => {
      if (!item || !item.text) return; // Skip les items corrompus
      const idxOf = () => { let k = clipItems.indexOf(item); if (k < 0) k = clipItems.findIndex(c => c && c.text === item.text && c.timestamp === item.timestamp); return k; };

      let cats = item.category || ['📝 Text'];
      if (typeof cats === 'string') cats = [cats];

      let badgesHtml = '';
      cats.forEach(c => {
        const conf = catConfig[c] || { name: c, key: c };
        // Pas d'icône : l'emoji est déjà dans conf.name, un logo ferait doublon.
        let bHtml = `<span>${escapeHtml(conf.name)}</span>`;

        if (cats.length > 1 || c !== '📝 Text') {
          bHtml += `<span class="cat-remove-btn" data-remove="${escapeHtml(c)}" style="margin-left:6px; padding:2px; font-size:10px; cursor:pointer;" title="Remove tag">✕</span>`;
        }

        badgesHtml += `<span class="clip-cat-badge" data-cat="${escapeHtml(conf.key)}" style="margin-right:4px; display:inline-flex; align-items:center;">${bHtml}</span>`;
      });

      // If it's a color, add a little swatch indicator
      if (cats.includes('🎨 Color')) {
        badgesHtml += `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${escapeHtml(item.text)}; border:1px solid #fff; margin-left:4px; vertical-align:middle;"></span>`;
      }

      const trimmedText = (item.text.length > WBBig.BIG_CHARS ? item.text.slice(0, WBBig.PREVIEW_CHARS) : item.text).trim();
      const isNew = (Date.now() - item.timestamp) < 600;
      const isPassword = cats.includes('🔑 Password');
      const isMasked = isSecretCat(cats);
      const isNumericTabular = /^[\d\s.,+-]+$/.test(trimmedText);

      let safeText;
      if (isMasked) {
        safeText = '••••••••';
      } else {
        safeText = escapeHtml(censorText(trimmedText));
        safeText = safeText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="clip-text-link">$1</a>');
      }

      const primaryCat = (catConfig[cats[0]] && catConfig[cats[0]].key) || cats[0];

      const el = document.createElement('div');
      el.className = 'clip-item' + (item.pinned ? ' pinned' : '') + (isNew ? ' clipboard-item--new' : '');
      el.setAttribute('data-cat', primaryCat);
      el.innerHTML = `
        <div class="clip-header-info">
          <div style="display:flex; flex-wrap:wrap;">${badgesHtml}</div>
          <span class="clip-time">${formatTime(item.timestamp)}</span>
        </div>
        <div class="clip-text-content">
          <div class="clip-text-preview clamp ${isNumericTabular ? 'tabular-nums' : ''}" title="Click to copy" ${isMasked ? 'style="font-family:monospace; letter-spacing:2px; color:#a78bfa;"' : ''}>${safeText}${item.big && !isMasked ? ' …' : ''}</div>
          ${item.big ? bigMetaHtml(item) : ''}
        </div>
        <div class="clip-footer">
          <button title="Copy" data-action="copy">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/copier.svg'); mask-image: url('../icons/svg/presse%20papier/copier.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
          ${isMasked ? `<button title="View" data-action="reveal" style="font-size:14px;">👁️</button>` : ''}
          <button title="${isPassword ? 'Remove password marking' : 'Mark as password'}" data-action="toggle-password">
            ${isPassword ? '🔓' : '🔐'}
          </button>
          <button title="${item.pinned ? 'Unpin' : 'Pin'}" data-action="pin" class="${item.pinned ? 'is-pinned' : ''}">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/pin.svg'); mask-image: url('../icons/svg/presse%20papier/pin.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
          <button title="Add a tag" data-action="addtag">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/add-tags.svg'); mask-image: url('../icons/svg/presse%20papier/add-tags.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
          <button title="Delete" data-action="del" class="btn-delete">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/presse%20papier/delete.svg'); mask-image: url('../icons/svg/presse%20papier/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
        </div>
      `;
      if (!isMasked && !cats.includes('🔒 Private')) {
        const sInfo = siteInfo(item.text);
        const slot = el.querySelector('.clip-header-info > div');
        if (sInfo && slot) {
          const sb = document.createElement('span');
          sb.className = 'clip-site-badge'; sb.title = sInfo.domain;
          sb.appendChild(siteFavEl(sInfo, 12));
          const sn = document.createElement('span'); sn.textContent = sInfo.name + (sInfo.hint ? ' · ' + sInfo.hint : ''); sb.appendChild(sn);
          slot.appendChild(sb);
        }
      }

      el.querySelectorAll('.cat-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tagToRemove = btn.getAttribute('data-remove');
          let newCats = clipItems[idxOf()].category.filter(c => c !== tagToRemove);
          if (newCats.length === 0) newCats = ['📝 Text'];
          clipItems[idxOf()].category = newCats;
          saveClipboard(true);

          const badgeEl = btn.closest('.clip-cat-badge');
          if (badgeEl) {
            badgeEl.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            badgeEl.style.opacity = '0';
            badgeEl.style.transform = 'scale(0.8)';
            setTimeout(() => {
              renderClipCategories();
              // Si l'item n'appartient plus au filtre actif, on le retire avec animation fluide
              if (clipFilter !== 'all' && !newCats.includes(clipFilter)) {
                el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.95)';
                el.style.height = '0px';
                el.style.padding = '0px';
                el.style.margin = '0px';
                el.style.overflow = 'hidden';
                setTimeout(() => el.remove(), 300);
              } else {
                // Sinon on re-rend juste la liste
                renderClipList();
              }
            }, 200);
          }
        });
      });

      const textPreview = el.querySelector('.clip-text-preview');

      textPreview?.addEventListener('click', (e) => {
        e.stopPropagation();
        // a link inside the text opens in a new tab; it must not copy the item as well
        if (e.target.closest('a.clip-text-link')) return;
        copyItem(item);
      });

      el.querySelector('[data-action="copy"]')?.addEventListener('click', e => {
        e.stopPropagation();
        copyItem(item);
      });

      el.querySelector('[data-action="reveal"]')?.addEventListener('click', e => {
        e.stopPropagation();
        const preview = el.querySelector('.clip-text-preview');
        const btn = e.currentTarget;
        if (btn.dataset.revealed === '1') {
          preview.textContent = '••••••••';
          preview.style.fontFamily = 'monospace';
          preview.style.letterSpacing = '2px';
          preview.style.color = '#a78bfa';
          btn.dataset.revealed = '0';
          btn.title = 'View';
        } else {
          preview.textContent = item.text;
          preview.style.fontFamily = '';
          preview.style.letterSpacing = '';
          preview.style.color = '';
          btn.dataset.revealed = '1';
          btn.title = 'Hide';
        }
      });

      el.querySelector('[data-action="pin"]')?.addEventListener('click', e => {
        e.stopPropagation();
        const k = idxOf();
        if (k < 0) return;
        clipItems[k].pinned = !clipItems[k].pinned;
        saveClipboard(true);
        const btn = e.currentTarget;
        btn.classList.toggle('is-pinned', clipItems[k].pinned);
        btn.title = clipItems[k].pinned ? 'Unpin' : 'Pin';
        el.classList.toggle('pinned', clipItems[k].pinned);
        renderClipCategories(); updateClipCounts();
      });

      el.querySelector('[data-action="toggle-password"]')?.addEventListener('click', e => {
        e.stopPropagation();
        let itemCats = clipItems[idxOf()].category || ['📝 Text'];
        if (typeof itemCats === 'string') itemCats = [itemCats];
        const pwTag = '🔑 Password';
        const isPassword = itemCats.includes(pwTag);

        if (isPassword) {
          itemCats = itemCats.filter(c => c !== pwTag);
          if (itemCats.length === 0) itemCats = ['📝 Text'];
        } else {
          itemCats.push(pwTag);
        }
        clipItems[idxOf()].category = itemCats;
        saveClipboard(true);

        const btn = e.currentTarget;
        btn.innerHTML = !isPassword ? '🔓' : '🔐';
        btn.title = !isPassword ? 'Remove password marking' : 'Mark as password';

        const previewEl = el.querySelector('.clip-text-preview');
        const revealBtn = el.querySelector('[data-action="reveal"]');
        if (revealBtn) { revealBtn.dataset.revealed = '0'; revealBtn.title = 'View'; }
        if (previewEl) {
          if (isSecretCat(itemCats)) {
            previewEl.textContent = '••••••••';
            previewEl.style.fontFamily = 'monospace';
            previewEl.style.letterSpacing = '2px';
            previewEl.style.color = '#a78bfa';
          } else {
            previewEl.textContent = clipItems[idxOf()].text.substring(0, 100);
            previewEl.style.fontFamily = '';
            previewEl.style.letterSpacing = '';
            previewEl.style.color = '';
          }
        }
      });

      el.querySelector('[data-action="addtag"]')?.addEventListener('click', e => {
        e.stopPropagation();

        // Ferme les autres dropdowns ouverts
        document.querySelectorAll('.addtag-dropdown').forEach(d => d.remove());

        const btn = e.currentTarget;
        const allTags = [
          'Text', 'Code', 'Link', 'Video', 'Image', 'Email',
          'Phone', 'Number', 'Color', 'Date', 'Price', 'Address', 'Private',
          ...customTags.map(t => t.name).filter(n => n !== 'Password')
        ];

        const rect = btn.getBoundingClientRect();
        const dropdown = document.createElement('div');
        dropdown.className = 'addtag-dropdown';
        dropdown.style.cssText = `
          position: fixed;
          z-index: 99999;
          top: ${rect.bottom + 6}px;
          right: ${window.innerWidth - rect.right}px;
          background: rgba(18,13,40,0.97);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(139,92,246,0.35);
          border-radius: 12px;
          padding: 8px;
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          gap: 6px;
          max-width: 220px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        `;

        const header = document.createElement('div');
        header.textContent = 'Assign a tag';
        header.style.cssText = `
          width: 100%;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.8px;
          color: rgba(255,255,255,0.3);
          text-transform: uppercase;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 2px;
        `;
        dropdown.appendChild(header);

        allTags.forEach(tag => {
          const row = document.createElement('div');
          row.textContent = tag;
          row.style.cssText = `
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            background: rgba(139,92,246,0.15);
            border: 1px solid rgba(139,92,246,0.35);
            color: rgba(139,92,246,0.9);
            transition: all 0.15s;
            white-space: nowrap;
          `;
          row.onmouseenter = () => {
            row.style.background = 'rgba(139,92,246,0.3)';
            row.style.color = '#fff';
          };
          row.onmouseleave = () => {
            row.style.background = 'rgba(139,92,246,0.15)';
            row.style.color = 'rgba(139,92,246,0.9)';
          };

          row.addEventListener('click', (evt) => {
            evt.stopPropagation();
            const item = clipItems[idxOf()];

            const reverseCatMap = {
              'Text': '📝 Text', 'Code': '💻 Code', 'Link': '🔗 Link',
              'Video': '🎥 Video', 'Image': '🖼️ Image', 'Email': '✉️ Email',
              'Phone': '📞 Phone', 'Number': '🔢 Number', 'Color': '🎨 Color', 'Private': '🔒 Private',
              'Date': '📅 Date', 'Price': '💰 Price', 'Address': '📍 Address'
            };

            const mappedTag = reverseCatMap[tag] || tag;
            item.category = Array.isArray(item.category) ? item.category : ['📝 Text'];
            if (!item.category.includes(mappedTag)) {
              item.category.push(mappedTag);
            }
            saveClipboard(true);

            const badgesCont = el.querySelector('.clip-header-info div:first-child');
            if (badgesCont) {
              badgesCont.style.transition = 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
              badgesCont.style.opacity = '0';
              badgesCont.style.transform = 'scale(0.95)';

              setTimeout(() => {
                let bHtml = '';
                item.category.forEach(c => {
                  const conf = catConfig[c] || { name: c, key: c };
                  // Pas d'icône : l'emoji est déjà dans conf.name.
                  let badgeHtml = `<span>${escapeHtml(conf.name)}</span>`;

                  if (item.category.length > 1 || c !== '📝 Text') {
                    badgeHtml += `<span class="cat-remove-btn" data-remove="${escapeHtml(c)}" style="margin-left:6px; padding:2px; font-size:10px; cursor:pointer;" title="Remove tag">✕</span>`;
                  }

                  bHtml += `<span class="clip-cat-badge" data-cat="${escapeHtml(conf.key)}" style="margin-right:4px; display:inline-flex; align-items:center;">${badgeHtml}</span>`;
                });

                if (item.category.includes('🎨 Color')) {
                  bHtml += `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${escapeHtml(item.text)}; border:1px solid #fff; margin-left:4px; vertical-align:middle;"></span>`;
                }

                badgesCont.innerHTML = bHtml;

                // Re-attach delete listeners so the preview UI is fully interactive
                badgesCont.querySelectorAll('.cat-remove-btn').forEach(btn => {
                  btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tagToRemove = btn.getAttribute('data-remove');
                    let newCats = item.category.filter(c => c !== tagToRemove);
                    if (newCats.length === 0) newCats = ['📝 Text'];
                    item.category = newCats;
                    saveClipboard(true);

                    const badgeEl = btn.closest('.clip-cat-badge');
                    if (badgeEl) {
                      badgeEl.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                      badgeEl.style.opacity = '0';
                      badgeEl.style.transform = 'scale(0.8)';
                      setTimeout(() => {
                        renderClipCategories();
                        if (clipFilter !== 'all' && !newCats.includes(clipFilter)) {
                          el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                          el.style.opacity = '0';
                          el.style.transform = 'scale(0.95)';
                          el.style.height = '0px';
                          el.style.padding = '0px';
                          el.style.margin = '0px';
                          el.style.overflow = 'hidden';
                          setTimeout(() => el.remove(), 300);
                        } else {
                          renderClipList();
                        }
                      }, 200);
                    }
                  });
                });

                badgesCont.style.opacity = '1';
                badgesCont.style.transform = 'scale(1)';

                setTimeout(() => {
                  badgesCont.style.transition = '';
                  badgesCont.style.transform = '';

                  renderClipCategories();

                  if (clipFilter !== 'all' && !item.category.includes(clipFilter)) {
                    el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    el.style.opacity = '0';
                    el.style.transform = 'scale(0.95)';
                    el.style.height = '0px';
                    el.style.padding = '0px';
                    el.style.margin = '0px';
                    el.style.overflow = 'hidden';
                    setTimeout(() => el.remove(), 300);
                  }
                }, 150);
              }, 150);
            }
            dropdown.remove();
          });
          dropdown.appendChild(row);
        });

        document.body.appendChild(dropdown);

        const closeDrop = (evt) => {
          if (!dropdown.contains(evt.target)) {
            dropdown.remove();
            document.removeEventListener('click', closeDrop);
          }
        };
        setTimeout(() => document.addEventListener('click', closeDrop), 0);
      });

      el.querySelector('[data-action="del"]')?.addEventListener('click', e => {
        e.stopPropagation();
        { const __k = idxOf(); if (__k > -1) clipItems.splice(__k, 1); };
        saveClipboard(true);
        updateClipCounts();

        const currentHeight = el.offsetHeight;
        el.style.height = currentHeight + 'px';
        el.style.transition = 'opacity 0.2s ease, transform 0.2s ease, height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease, margin 0.3s ease';
        el.style.overflow = 'hidden';

        requestAnimationFrame(() => {
          el.style.opacity = '0';
          el.style.transform = 'scale(0.95) translateX(-10px)';
          setTimeout(() => {
            el.style.height = '0px';
            el.style.padding = '0px';
            el.style.margin = '0px';
            el.style.borderWidth = '0px';
            setTimeout(() => {
              el.remove();
              renderClipCategories();
              if (clipList.children.length === 0) {
                clipList.innerHTML = '<div class="clip-empty">📋 Copy text on any page, it will appear here automatically</div>';
              }
            }, 300);
          }, 180);
        });
      });

      clipSel.attach(el, item, 'text');
      fragment.appendChild(el);
    });

    clipList.appendChild(fragment);
  }

  progressiveList(clipList, 'text', filtered.length, FIRST_TEXT, FIRST_TEXT, renderChunk);
}

  // @module 17-clipboard-filters  (dev/popup-src/17-clipboard-filters.js)
  // --- Search & Clear ---
  clipSearch.addEventListener('input', e => {
    clipSearchQuery = e.target.value;
    renderClipList();
  });

  const clipDateFilterEl = document.getElementById('clipDateFilter');
  const clipDateCustomEl = document.getElementById('clipDateCustom');

  function refreshActiveClipTab() {
    const activeTab = document.querySelector('.clip-tab-btn.active')?.dataset.cliptab || 'text';
    if (activeTab === 'text')   renderClipList();
    else if (activeTab === 'image')  renderClipImages();
    else if (activeTab === 'pinned') renderPinnedView();
  }

  if (clipDateFilterEl) {
    clipDateFilterEl.addEventListener('change', e => {
      clipDateMode = e.target.value;
      if (clipDateMode === 'custom') {
        clipDateCustomEl.style.display = 'block';
        clipDateCustomVal = clipDateCustomEl.value ? new Date(clipDateCustomEl.value).getTime() : 0;
      } else {
        clipDateCustomEl.style.display = 'none';
        clipDateCustomVal = 0;
      }
      refreshActiveClipTab();
    });
  }
  if (clipDateCustomEl) {
    clipDateCustomEl.addEventListener('change', e => {
      clipDateCustomVal = e.target.value ? new Date(e.target.value).getTime() : 0;
      refreshActiveClipTab();
    });
  }



  const clipInfoBtn = document.getElementById('clipInfoBtn');
  const clipInfoModal = document.getElementById('clipInfoModal');
  const clipInfoOkBtn = document.getElementById('clipInfoOkBtn');

  if (clipInfoBtn && clipInfoModal && clipInfoOkBtn) {
    clipInfoBtn.addEventListener('click', () => {
      clipInfoModal.style.display = 'flex';
      clipInfoModal.style.opacity = '0';
      setTimeout(() => clipInfoModal.style.opacity = '1', 10);
      clipInfoModal.style.transition = 'opacity 0.2s ease-out';
    });

    const closeModal = () => {
      clipInfoModal.style.opacity = '0';
      setTimeout(() => clipInfoModal.style.display = 'none', 200);
    };

    clipInfoOkBtn.addEventListener('click', closeModal);
    clipInfoModal.addEventListener('click', (e) => {
      if (e.target === clipInfoModal) closeModal();
    });
  }


  loadClipboard();

  // ── Bouton "Clear all" : toujours le clipboard texte uniquement, quel que
  // soit l'onglet actif (Images a son propre bouton "Clear history" dédié).
  if (clipClearBtn) {
    clipClearBtn.addEventListener('click', () => {
      if (clipItems.length === 0) return;
      const pinned = clipItems.filter(i => i.pinned);
      askSecureConfirm('Clear text history', `Confirm deletion of ${clipItems.length - pinned.length} item(s)?\n(Pinned items are kept)`, async (confirmed, pwd) => {
        if (!confirmed) return;
        if (pwd) {
          const data = await new Promise(r => chrome.storage.local.get('appLockHash', r));
          const enteredHash = await hashPassword(pwd);
          if (enteredHash !== data.appLockHash) { showToast('❌ Incorrect password.'); return; }
        }
        clipItems = pinned; // keep pinned
        saveClipboard(true);
        renderClipList();
        renderClipCategories(); updateClipCounts();
        showToast('🗑️ All text deleted');
      });
    });
  }

  // Restore session state after initial load
  setTimeout(restoreSessionState, 60);


  // @module 18-clipboard-paste-and-live  (dev/popup-src/18-clipboard-paste-and-live.js)
  // ---- MANUAL PASTE BUTTON ----
  const clipPasteBtn = document.getElementById('clipPasteBtn');

  // detectTypePopup supprimé — la catégorisation est gérée par background.js (source unique de vérité)

  // The clipboard holds a picture instead of text: hand it to the same capture path as copied images.
  async function pasteClipboardImage() {
    let blob = null;
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'));
        if (type) { blob = await it.getType(type); break; }
      }
    } catch (_) { return false; }
    if (!blob) return false;
    const dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result); r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (!dataUrl) { showToast('❌ Capture error'); return true; }
    chrome.runtime.sendMessage({ type: 'clipboard_image', dataUrl }, (resp) => {
      const status = chrome.runtime.lastError ? 'error' : (resp && resp.status);
      if (status === 'image_saved') showToast('✅ Image pasted from clipboard!');
      else if (status === 'limit_reached') showToast('❌ Image limit reached');
      else showToast('❌ Capture error');
    });
    return true;
  }

  // Reads the clipboard text. A very long text can come back empty from readText(),
  // so two other ways are tried before giving up.
  async function readClipboardText() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { /* try the next way */ }
    if (text && text.trim()) return text;
    try {
      for (const it of await navigator.clipboard.read()) {
        if (it.types.includes('text/plain')) { text = await (await it.getType('text/plain')).text(); if (text && text.trim()) return text; }
      }
    } catch (e) { /* try the next way */ }
    try {
      const ta = document.createElement('textarea');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(ta); ta.focus();
      document.execCommand('paste');
      text = ta.value; ta.remove();
    } catch (e) { /* nothing left to try */ }
    return text || '';
  }

  async function handlePaste() {
    try {
      const text = await readClipboardText();
      if (!text || !text.trim()) {
        if (await pasteClipboardImage()) return;
        showToast('❌ Clipboard is empty');
        return;
      }
      const trimmed = text.trim();

      // Déléguer catégorisation + stockage au background.js (source unique de vérité)
      let resp = null;
      const chars = Math.max(trimmed.length, text.length);   // size of what was copied, spaces included
      try {
        if (trimmed.length <= 4000000) resp = await chrome.runtime.sendMessage({ type: 'clipboard_capture', text: trimmed, inputType: '', rawLen: chars, manual: true });
        else {
          // a message is limited to ~64 MB: a long text goes in several parts
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const total = Math.ceil(trimmed.length / 4000000);
          for (let i = 0; i < total; i++) {
            resp = await chrome.runtime.sendMessage({ type: 'clipboard_capture_part', id, index: i, total, inputType: '', chars, manual: true, part: trimmed.slice(i * 4000000, (i + 1) * 4000000) });
            if (resp && resp.status === 'too_large') break;
          }
        }
      } catch (e) { resp = null; }
      const status = resp && resp.status;
      if (status === 'off') showToast('🔒 Clipboard monitoring is off — turn it on in Settings → Privacy');
      else if (status === 'staged') showToast('🔒 Held: it will be saved once the vault is unlocked');
      else if (status === 'locked') showToast('🔒 Unlock WorkBox to save this text');
      else if (status === 'limit_reached') showToast('❌ Text limit reached');
      else if (status === 'quota_reached') showToast('❌ Text storage is full (see Settings > Storage)');
      else if (status === 'too_large') { setTimeout(showTooLargeIfNew, 400); showToast('❌ Text too large (' + Math.round(WBBig.MAX_CHARS / 1000000) + ' million characters max)'); }
      else if (status === 'saved') showToast('✅ Pasted from clipboard!');
      else showToast('❌ Capture error');
    } catch (err) {
      showToast('❌ Clipboard access denied');
    }
  }

  clipPasteBtn.addEventListener('click', handlePaste);

  // Polling 200ms supprimé — content.js capture déjà les copy/cut en temps réel.
  // L'UI se met à jour via chrome.storage.onChanged (ligne ~1382).

  // ---- LIVE UPDATE: refresh when content scripts add new items ----
  let _clipReloadTimer = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.clipItems) {
      // What is stored is now encrypted, so the raw array cannot be dropped into
      // the list: the only safe way to pick up a change is to read it back
      // through the vault, which decrypts. Our own writes echo back here too;
      // the short delay keeps a re-render from landing in the middle of a local
      // edit, and nothing is ever lost — only shown a moment later.
      clearTimeout(_clipReloadTimer);
      _clipReloadTimer = setTimeout(() => { loadClipboard(); }, ignoreStorageChanges ? 350 : 0);
    }
    if (area === 'local' && changes.clipboardImages) {
      const incoming = Array.isArray(changes.clipboardImages.newValue) ? changes.clipboardImages.newValue : [];
      const activeTab = document.querySelector('.clip-tab-btn.active')?.dataset.cliptab;
      if (!ignoreStorageChanges) {
        clipboardImages = incoming;
        if (activeTab === 'image') renderClipImages();
        updateClipCounts();
      } else {
        const sig = (i) => i.timestamp + '|' + String(i.dataUrl).length;
        const have = new Set(clipboardImages.map(sig));
        const added = incoming.filter(i => i && typeof i.dataUrl === 'string' && i.timestamp >= _lastLocalClipWrite && !have.has(sig(i)));
        if (added.length) {
          const heads = new Set(added.map(i => i.dataUrl.substring(0, 5000)));
          clipboardImages = added.concat(clipboardImages.filter(i => !heads.has(String(i.dataUrl).substring(0, 5000))));
          beginLocalClipWrite();
          chrome.storage.local.set({ clipboardImages });
          if (activeTab === 'image') renderClipImages();
          updateClipCounts();
        }
      }
    }
  });

  // Live-reload quand le background ajoute un élément

  // @module 19-calculator  (dev/popup-src/19-calculator.js)
  const calcExpr = document.getElementById('calcExpr');
  const calcResult = document.getElementById('calcResult');
  const calcHist = document.getElementById('calcHistory');
  let calcInput = '';
  let calcHistory = [];

  // --- Simple AST Math Parser (No Eval/Function for MV3 CSP) ---
  function mathEval(str) {
    let idx = 0;
    // Replace visual operators with tokens
    str = str.replace(/\s+/g, '')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, 'P') // P for PI
      .replace(/²/g, '^2');

    if (!str) return 0;

    // "200+10%" adds 10% of 200: a lone percentage after + or - is taken of the left operand
    function parseExpr() {
      let left = parseTerm().v;
      while (idx < str.length) {
        const op = str[idx];
        if (op !== '+' && op !== '-') break;
        idx++;
        const t = parseTerm();
        const add = t.pct ? left * t.v : t.v;
        left = op === '+' ? left + add : left - add;
      }
      return left;
    }

    function parseTerm() {
      let left = parseUnary(), single = true;
      while (idx < str.length) {
        if (str[idx] === '*') { idx++; left *= parseUnary(); single = false; }
        else if (str[idx] === '/') { idx++; left /= parseUnary(); single = false; }
        else break;
      }
      return { v: left, pct: single && str[idx - 1] === '%' };
    }

    // unary minus binds less tightly than ^, so -2^2 is -(2^2)
    function parseUnary() {
      let sign = 1;
      while (idx < str.length && (str[idx] === '-' || str[idx] === '+')) {
        if (str[idx] === '-') sign *= -1;
        idx++;
      }
      return sign * parsePower();
    }

    // right-associative: 2^3^2 is 2^(3^2)
    function parsePower() {
      const base = parsePrimary();
      if (str[idx] === '^') { idx++; return Math.pow(base, parseUnary()); }
      return base;
    }

    function parsePrimary() {
      let val;
      if (str[idx] === '√') {
        idx++;
        val = Math.sqrt(parsePrimary());
      } else if (str[idx] === 'P') {
        idx++;
        val = Math.PI;
      } else if (str[idx] === '(') {
        idx++;
        val = parseExpr();
        if (str[idx] !== ')') return NaN;
        idx++;
      } else {
        let start = idx;
        while (idx < str.length && /[0-9.]/.test(str[idx])) idx++;
        if (start === idx) return NaN;
        const __num = str.substring(start, idx);
        if ((__num.match(/\./g) || []).length > 1) return NaN;
        val = parseFloat(__num);
      }

      while (idx < str.length && str[idx] === '%') {
        val /= 100;
        idx++;
      }
      return val;
    }

    const __res = parseExpr();
    if (idx !== str.length) return NaN;
    return __res;
  }

  function loadCalcHistory() {
    chrome.storage.local.get('calcHistory', data => {
      if (data.calcHistory) calcHistory = data.calcHistory;
      renderCalcHistory();
    });
  }

  function saveCalcHistory() {
    chrome.storage.local.set({ calcHistory });
  }

  function renderCalcHistory() {
    if (calcHistory.length === 0) {
      calcHist.innerHTML = '<div class="clip-empty" style="padding:10px 0">No history</div>';
      return;
    }
    calcHist.innerHTML = '';

    // Reverse loop or index preserving map to attach listeners correctly
    calcHistory.forEach((h, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'calc-history-item';

      const contentEl = document.createElement('div');
      contentEl.className = 'calc-history-content';
      contentEl.innerHTML = `
        <span class="calc-history-expr">${escapeHtml(h.expr)}</span>
        <span class="calc-history-val">= ${escapeHtml(String(h.result))}</span>
      `;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'calc-history-del';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = `<span style="display:inline-block; width:12px; height:12px; background-color:currentColor; -webkit-mask-image: url('../icons/svg/calcul/delete.svg'); mask-image: url('../icons/svg/calcul/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>`;

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        calcHistory.splice(index, 1);
        saveCalcHistory();
        renderCalcHistory();
      });

      // Optionally clicking the whole item could load it back...
      contentEl.addEventListener('click', () => {
        calcInput = String(h.result);
        calcExpr.textContent = calcInput;
        setCalcResult('0');
      });

      itemEl.appendChild(contentEl);
      itemEl.appendChild(deleteBtn);
      calcHist.appendChild(itemEl);
    });
  }

  const calcInputField = document.getElementById('calcInputField');
  const calcGrid = document.getElementById('calcGrid');

  // long results get a smaller font instead of being cut off
  // The last result that was not an error: while typing, an unfinished expression
  // ("8*") must not flash "Error", so the preview falls back to this value.
  let calcLastGood = '0';
  function setCalcResult(value) {
    if (value !== 'Error') calcLastGood = String(value);
    calcResult.textContent = value;
    calcResult.style.fontSize = '';
    let size = parseFloat(getComputedStyle(calcResult).fontSize) || 28;
    while (size > 12 && calcResult.scrollWidth > calcResult.clientWidth) {
      size -= 1;
      calcResult.style.fontSize = size + 'px';
    }
  }

  function calcRefreshPreview() {
    const expr = calcInputField.value.trim();
    calcExpr.textContent = expr;
    if (!expr) {
      setCalcResult('0');
      return;
    }
    // "Error" only appears when Enter or = is pressed (calcSubmit), never while typing
    try {
      const r = mathEval(expr);
      setCalcResult(isFinite(r) ? (parseFloat(r.toPrecision(12))) : calcLastGood);
    } catch (e) {
      setCalcResult(calcLastGood);
    }
  }

  function calcClear() {
    calcInputField.value = '';
    calcExpr.textContent = '';
    setCalcResult('0');
  }

  function calcSubmit() {
    const expr = calcInputField.value.trim();
    if (!expr) return;
    try {
      const result = mathEval(expr);
      if (!isFinite(result)) { setCalcResult('Error'); return; }
      const rounded = parseFloat(result.toPrecision(12));
      setCalcResult(rounded);
      // Enter pressed again on the result that is already the latest history row
      if (calcHistory[0] && String(calcHistory[0].result) === expr && String(rounded) === expr) return;
      calcHistory.unshift({ expr: expr, result: rounded });
      if (calcHistory.length > 20) calcHistory.pop();
      saveCalcHistory();
      renderCalcHistory();
      // Prêt pour l'opération suivante, en repartant du résultat
      calcInputField.value = String(rounded);
      calcExpr.textContent = String(rounded);
    } catch (e) {
      setCalcResult('Error');
    }
  }

  if (calcInputField) {
    // Auto-focus when panel becomes active
    const observer = new MutationObserver(() => {
      const panel = document.getElementById('panel-calculator');
      if (panel && panel.classList.contains('active')) {
        calcInputField.focus();
      }
    });
    observer.observe(document.getElementById('panel-calculator'), { attributes: true, attributeFilter: ['class'] });

    calcInputField.addEventListener('input', calcRefreshPreview);

    // Handle Enter to save and Esc to clear
    calcInputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        calcSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        calcClear();
      } else {
        // Flash le bouton correspondant à la touche tapée au clavier, pour
        // relier visuellement la frappe physique au pavé à l'écran.
        const key = e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key === '-' ? '−' : e.key;
        const btn = calcGrid && calcGrid.querySelector(`[data-val="${CSS.escape(key)}"]`);
        if (btn) {
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 120);
        }
      }
    });

    // Override clicking history item to fill input instead of just textContent
    calcHist.addEventListener('click', (e) => {
      const content = e.target.closest('.calc-history-content');
      if (content) {
        const val = content.querySelector('.calc-history-val').textContent.replace('=', '').trim();
        calcInputField.value = val;
        calcExpr.textContent = val;
        setCalcResult('0');
        calcInputField.focus();
      }
    });
  }

  if (calcGrid) {
    calcGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-calc]');
      if (!btn) return;
      const action = btn.dataset.calc;
      if (action === 'insert') {
        calcInputField.value += btn.dataset.val;
        calcRefreshPreview();
      } else if (action === 'backspace') {
        calcInputField.value = calcInputField.value.slice(0, -1);
        calcRefreshPreview();
      } else if (action === 'clear') {
        calcClear();
      } else if (action === 'submit') {
        calcSubmit();
      }
      calcInputField.focus();
    });
  }

  // Clear history button
  const calcClearHistBtn = document.getElementById('calcClearHistBtn');
  if (calcClearHistBtn) {
    calcClearHistBtn.addEventListener('click', () => {
      calcHistory = [];
      saveCalcHistory();
      renderCalcHistory();
      showToast('🗑️ History cleared');
    });
  }

  loadCalcHistory();



  // @module 20-notes  (dev/popup-src/20-notes.js)
  const noteArea = document.getElementById('noteArea');    // <textarea>
  const notePreviewArea = document.getElementById('notePreviewArea');
  const noteStatus = document.getElementById('noteStatus');
  const noteStats = document.getElementById('noteStats');
  const noteTabsScroll = document.getElementById('noteTabsScroll');
  const noteSearch = document.getElementById('noteSearch');
  const noteAddBtn = document.getElementById('noteAddBtn');
  const noteDeleteBtn = document.getElementById('noteDeleteBtn');
  const noteMdToggle = document.getElementById('noteMdToggle');
  const noteContextMenu = document.getElementById('noteContextMenu');
  const noteCtxPin = document.getElementById('noteCtxPin');
  const noteCtxColorOpts = document.querySelectorAll('.note-color-opt');
  const noteCtxExportTxt = document.getElementById('noteCtxExportTxt');
  const noteCtxExportMd = document.getElementById('noteCtxExportMd');

  let notes = [];
  let activeNoteId = null;
  let shownNoteId = null; // note actually displayed in the textarea
  let noteSearchQuery = '';
  let noteTimer;
  let isPreviewMode = false;
  let currentCtxNoteId = null;
  let draggedNoteId = null;

  function generateNoteId() {
    return 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ── Markdown renderer ──────────────────────────────────────
  function renderMarkdown(text) {
    if (!text) return '<p style="color:var(--text-muted);font-size:12px;">No content to display</p>';
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = html.split('\n');
    const result = [];
    let inList = false; // false, 'ul' or 'ol'
    let codeLines = null; // raw lines of the fenced block being read
    const closeList = () => { if (inList) { result.push('</' + inList + '>'); inList = false; } };
    const pushCode = () => {
      result.push('<pre style="background:rgba(0,0,0,0.3);border-radius:6px;padding:10px;font-family:monospace;font-size:12px;overflow-x:auto;margin:6px 0;"><code>' + codeLines.join('\n') + '</code></pre>');
      codeLines = null;
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Fenced code block: everything up to the closing fence is kept as typed
      if (/^\s*```/.test(line)) {
        if (codeLines) pushCode();
        else { closeList(); codeLines = []; }
        continue;
      }
      if (codeLines) { codeLines.push(line); continue; }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        closeList();
        result.push('<hr style="border:0;border-top:1px solid rgba(255,255,255,0.12);margin:10px 0;">');
        continue;
      }
      // H1
      if (/^# (.+)/.test(line)) {
        closeList();
        result.push('<h1 style="font-size:20px;font-weight:800;color:#c4b5fd;margin:10px 0 4px;line-height:1.2;">' + applyInline(line.replace(/^# /, '')) + '</h1>');
        continue;
      }
      // H2
      if (/^## (.+)/.test(line)) {
        closeList();
        result.push('<h2 style="font-size:16px;font-weight:700;color:#a78bfa;margin:8px 0 3px;line-height:1.2;">' + applyInline(line.replace(/^## /, '')) + '</h2>');
        continue;
      }
      // H3
      if (/^### (.+)/.test(line)) {
        closeList();
        result.push('<h3 style="font-size:14px;font-weight:600;color:#8b5cf6;margin:6px 0 2px;">' + applyInline(line.replace(/^### /, '')) + '</h3>');
        continue;
      }
      // Blockquote
      if (/^&gt; (.+)/.test(line)) {
        closeList();
        result.push('<blockquote style="border-left:3px solid #7c3aed;padding-left:10px;color:rgba(255,255,255,0.55);font-style:italic;margin:4px 0;">' + applyInline(line.replace(/^&gt; /, '')) + '</blockquote>');
        continue;
      }
      // Unordered list
      if (/^[-*] (.+)/.test(line)) {
        if (inList !== 'ul') { closeList(); result.push('<ul style="padding-left:18px;margin:4px 0;">'); inList = 'ul'; }
        result.push('<li style="margin:2px 0;">' + applyInline(line.replace(/^[-*] /, '')) + '</li>');
        continue;
      }
      // Ordered list
      if (/^\d+\. (.+)/.test(line)) {
        if (inList !== 'ol') { closeList(); result.push('<ol style="padding-left:18px;margin:4px 0;">'); inList = 'ol'; }
        result.push('<li style="margin:2px 0;">' + applyInline(line.replace(/^\d+\. /, '')) + '</li>');
        continue;
      }
      // Anything that is not a list item ends the list
      closeList();
      // Empty line
      if (line.trim() === '') {
        result.push('<div style="height:6px;"></div>');
        continue;
      }
      // Normal paragraph
      result.push('<p style="margin:3px 0;line-height:1.55;">' + applyInline(line) + '</p>');
    }
    if (codeLines) pushCode();
    closeList();
    return result.join('');
  }

  // N'autorise que des schémas d'URL sans risque d'exécution de code
  // (bloque javascript:, data:, vbscript:, etc.) et échappe les guillemets
  // pour empêcher toute évasion de l'attribut href.
  function sanitizeMdUrl(url) {
    const trimmed = String(url || '').trim();
    const safe = /^(https?:|mailto:|\/|#)/i.test(trimmed) && !/^javascript:/i.test(trimmed);
    const escaped = trimmed.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    return safe ? escaped : '#';
  }

  function applyInline(text) {
    // inline code is left untouched by the emphasis rules
    return text.split(/(`[^`]+`)/).map((part, i) => {
      if (i % 2) return '<code style="background:rgba(0,0,0,0.35);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12px;">' + part.slice(1, -1) + '</code>';
      // Bold **text** or __text__
      part = part.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      part = part.replace(/(?<![\w_])__(.+?)__(?![\w_])/g, '<strong>$1</strong>');
      // Italic *text* or _text_ : the markers must hug the text and not sit inside a word or a number
      part = part.replace(/(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])/g, '<em>$1</em>');
      part = part.replace(/(?<![\w_])_(?![\s_])(.+?)(?<![\s_])_(?![\w_])/g, '<em>$1</em>');
      // Strikethrough ~~text~~
      part = part.replace(/~~(.+?)~~/g, '<del>$1</del>');
      // Links [text](url): the URL is validated and escaped to prevent HTML/JS injection
      return part.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) =>
        `<a href="${sanitizeMdUrl(url)}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;">${label}</a>`
      );
    }).join('');
  }
  // ────────────────────────────────────────────────────────────

  function loadNotes() {
    chrome.storage.local.get(['notes', 'activeNoteId'], data => {
      notes = data.notes || [];

      if (notes.length === 0) {
        notes = [{ id: generateNoteId(), title: 'Note 1', content: '', createdAt: Date.now() }];
        saveNotes(true);
      }
      activeNoteId = data.activeNoteId || notes[0].id;
      renderNoteTabs();
      showNote(activeNoteId);
    });
  }

  function saveNotes(silent = false) {
    if (shownNoteId && noteArea) {
      const note = notes.find(n => n.id === shownNoteId);
      if (note) {
        note.content = noteArea.value;
      }
    }
    chrome.storage.local.set({ notes, activeNoteId });
  }

  function updateNoteStats() {
    if (!noteArea) return;
    const text = noteArea.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    if (noteStats) noteStats.textContent = `${words} word${words > 1 ? 's' : ''} · ${chars} chars.`;
  }

  function renderNoteTabs() {
    if (!noteTabsScroll) return;
    noteTabsScroll.innerHTML = '';
    notes.sort((a, b) => (a.pinned && !b.pinned ? -1 : !a.pinned && b.pinned ? 1 : 0));

    const q = noteSearchQuery.trim().toLowerCase();
    notes.forEach((note, i) => {
      const matches = !q || (note.title || '').toLowerCase().includes(q) || (note.content || '').toLowerCase().includes(q);
      const tab = document.createElement('button');
      tab.className = 'note-tab' + (note.id === activeNoteId ? ' active' : '') + (note.pinned ? ' pinned' : '') + (matches ? '' : ' dimmed');
      if (note.color) { tab.style.backgroundColor = note.color; tab.style.borderColor = note.color; }
      tab.draggable = true;

      const titleSpan = document.createElement('span');
      titleSpan.textContent = note.title || `Note ${i + 1}`;
      tab.appendChild(titleSpan);

      // Del button
      const delBtn = document.createElement('button');
      delBtn.className = 'note-tab-del';
      delBtn.textContent = '×';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (notes.length <= 1) { showToast('⚠️ Cannot delete the last note'); return; }
        notes = notes.filter(n => n.id !== note.id);
        if (activeNoteId === note.id) activeNoteId = notes[0].id;
        saveNotes();
        renderNoteTabs();
        showNote(activeNoteId);
        showToast('🗑️ Note deleted');
      });
      tab.appendChild(delBtn);

      tab.addEventListener('click', e => {
        if (e.target.tagName.toLowerCase() === 'input') return;
        saveNotes();
        activeNoteId = note.id;
        showNote(note.id);
        saveNotes();
        // no re-render here: replacing the tab between two clicks would swallow the double-click
        noteTabsScroll.querySelectorAll('.note-tab').forEach(t => t.classList.toggle('active', t === tab));
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      });

      tab.addEventListener('dblclick', () => {
        if (tab.querySelector('input')) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = note.title || `Note ${i + 1}`;
        input.style.cssText = 'width:110px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:inherit;font:inherit;outline:none;padding:1px 4px;';
        titleSpan.replaceWith(input);
        input.focus(); input.select();
        let cancelled = false;
        const save = () => {
          if (cancelled) return;
          note.title = input.value.trim() || `Note ${i + 1}`;
          saveNotes(); renderNoteTabs();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') { cancelled = true; renderNoteTabs(); }
        });
      });

      tab.addEventListener('contextmenu', e => {
        e.preventDefault();
        currentCtxNoteId = note.id;
        if (noteCtxPin) noteCtxPin.textContent = note.pinned ? '📌 Unpin' : '📌 Pin';
        noteContextMenu.classList.add('show');
        // the menu is positioned inside the (transformed) panel: measure where 0,0 really is
        noteContextMenu.style.left = '0px'; noteContextMenu.style.top = '0px';
        const box = noteContextMenu.getBoundingClientRect();
        const x = Math.max(4, Math.min(e.clientX, window.innerWidth - box.width - 4));
        const y = Math.max(4, Math.min(e.clientY, window.innerHeight - box.height - 4));
        noteContextMenu.style.left = `${x - box.left}px`;
        noteContextMenu.style.top = `${y - box.top}px`;
      });

      tab.addEventListener('dragstart', e => { draggedNoteId = note.id; e.dataTransfer.effectAllowed = 'move'; tab.style.opacity = '0.5'; });
      tab.addEventListener('dragend', () => { tab.style.opacity = '1'; draggedNoteId = null; });
      tab.addEventListener('dragover', e => e.preventDefault());
      tab.addEventListener('drop', e => {
        e.preventDefault();
        if (draggedNoteId && draggedNoteId !== note.id) {
          const from = notes.findIndex(n => n.id === draggedNoteId);
          const to = notes.findIndex(n => n.id === note.id);
          const [moved] = notes.splice(from, 1);
          notes.splice(to, 0, moved);
          saveNotes(); renderNoteTabs();
        }
      });

      noteTabsScroll.appendChild(tab);
    });
    const current = noteTabsScroll.querySelector('.note-tab.active');
    if (current) current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateNoteTabNav();
  }

  // Arrows on each side of the note tabs, shown only when there is more to see
  // that way; the mouse wheel also moves the row sideways.
  const noteTabPrev = document.getElementById('noteTabPrev');
  const noteTabNext = document.getElementById('noteTabNext');
  function updateNoteTabNav() {
    if (!noteTabsScroll || !noteTabPrev || !noteTabNext) return;
    const max = noteTabsScroll.scrollWidth - noteTabsScroll.clientWidth;
    noteTabPrev.hidden = max <= 2 || noteTabsScroll.scrollLeft <= 2;
    noteTabNext.hidden = max <= 2 || noteTabsScroll.scrollLeft >= max - 2;
    // soft fade on the side where notes continue
    noteTabsScroll.classList.toggle('fade-left', !noteTabPrev.hidden);
    noteTabsScroll.classList.toggle('fade-right', !noteTabNext.hidden);
  }
  if (noteTabsScroll && noteTabPrev && noteTabNext) {
    const step = (dir) => noteTabsScroll.scrollBy({ left: dir * Math.max(120, noteTabsScroll.clientWidth * 0.7), behavior: 'smooth' });
    noteTabPrev.addEventListener('click', () => step(-1));
    noteTabNext.addEventListener('click', () => step(1));
    noteTabsScroll.addEventListener('scroll', updateNoteTabNav, { passive: true });
    noteTabsScroll.addEventListener('wheel', (e) => {
      if (noteTabsScroll.scrollWidth <= noteTabsScroll.clientWidth) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      noteTabsScroll.scrollLeft += d;
    }, { passive: false });
    window.addEventListener('resize', updateNoteTabNav);
  }

  function showNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note || !noteArea) return;
    shownNoteId = note.id;
    noteArea.value = note.content || '';
    updateNoteStats();
    // Reset preview mode when switching
    if (isPreviewMode) refreshPreview();
  }

  function refreshPreview() {
    if (!noteArea || !notePreviewArea) return;
    notePreviewArea.innerHTML = renderMarkdown(noteArea.value);
  }

  // ── Toolbar helpers (insert Markdown in textarea) ──────────
  function insertMd(before, after = '', placeholder = 'text') {
    if (!noteArea) return;
    noteArea.focus();
    const start = noteArea.selectionStart;
    const end = noteArea.selectionEnd;
    const sel = noteArea.value.substring(start, end) || placeholder;
    const insert = before + sel + after;
    noteArea.setRangeText(insert, start, end, 'select');
    noteArea.dispatchEvent(new Event('input'));
  }

  function insertLinePrefix(prefix) {
    if (!noteArea) return;
    noteArea.focus();
    const start = noteArea.selectionStart;
    const lineStart = noteArea.value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = noteArea.value.substring(lineStart, noteArea.value.indexOf('\n', start) >>> 0 || noteArea.value.length);
    if (currentLine.startsWith(prefix)) {
      // Remove prefix
      noteArea.setRangeText('', lineStart, lineStart + prefix.length, 'end');
    } else {
      noteArea.setRangeText(prefix, lineStart, lineStart, 'end');
    }
    noteArea.dispatchEvent(new Event('input'));
  }

  // Toolbar buttons
  const noteBoldBtn = document.getElementById('noteBoldBtn');
  const noteItalicBtn = document.getElementById('noteItalicBtn');
  const noteCodeBtn = document.getElementById('noteCodeBtn');
  const noteH1Btn = document.getElementById('noteH1Btn');
  const noteH2Btn = document.getElementById('noteH2Btn');
  const noteListBtn = document.getElementById('noteListBtn');
  const noteQuoteBtn = document.getElementById('noteQuoteBtn');

  if (noteBoldBtn) noteBoldBtn.addEventListener('click', () => insertMd('**', '**', 'bold'));
  if (noteItalicBtn) noteItalicBtn.addEventListener('click', () => insertMd('*', '*', 'italic'));
  if (noteCodeBtn) noteCodeBtn.addEventListener('click', () => insertMd('`', '`', 'code'));
  if (noteH1Btn) noteH1Btn.addEventListener('click', () => insertLinePrefix('# '));
  if (noteH2Btn) noteH2Btn.addEventListener('click', () => insertLinePrefix('## '));
  if (noteListBtn) noteListBtn.addEventListener('click', () => insertLinePrefix('- '));
  if (noteQuoteBtn) noteQuoteBtn.addEventListener('click', () => insertLinePrefix('> '));

  // Toggle Preview
  if (noteMdToggle) {
    noteMdToggle.addEventListener('click', () => {
      isPreviewMode = !isPreviewMode;
      if (isPreviewMode) {
        refreshPreview();
        noteArea.style.display = 'none';
        notePreviewArea.style.display = 'block';
        noteMdToggle.style.color = '#a78bfa';
        noteMdToggle.title = 'Back to editing';
      } else {
        noteArea.style.display = 'block';
        notePreviewArea.style.display = 'none';
        noteMdToggle.style.color = '';
        noteMdToggle.title = 'Markdown preview';
        noteArea.focus();
      }
    });
  }

  // Auto-save
  if (noteArea) {
    noteArea.addEventListener('input', () => {
      updateNoteStats();
      if (noteStatus) { noteStatus.textContent = '…'; noteStatus.className = 'note-status saving'; }
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        noteTimer = null;
        saveNotes();
        if (noteStatus) { noteStatus.textContent = '✓ Saved'; noteStatus.className = 'note-status saved'; }
      }, 400);
    });

    // The popup can close before the 400 ms timer fires: write the pending text first
    const flushNote = () => { if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; saveNotes(); } };
    window.addEventListener('pagehide', flushNote);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNote(); });

    // Keyboard shortcuts
    noteArea.addEventListener('keydown', e => {
      // Tab → insert 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        noteArea.setRangeText('  ', noteArea.selectionStart, noteArea.selectionEnd, 'end');
        noteArea.dispatchEvent(new Event('input'));
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); insertMd('**', '**', 'bold'); }
        if (e.key === 'i') { e.preventDefault(); insertMd('*', '*', 'italic'); }
        if (e.key === 's') { e.preventDefault(); saveNotes(); if (noteStatus) { noteStatus.textContent = '✓ Saved'; noteStatus.className = 'note-status saved'; } }
      }
    });
  }

  if (noteSearch) {
    noteSearch.addEventListener('input', e => {
      noteSearchQuery = e.target.value;
      renderNoteTabs();
    });
  }

  // Add note
  if (noteAddBtn) {
    noteAddBtn.addEventListener('click', () => {
      saveNotes();
      const newNote = { id: generateNoteId(), title: `Note ${notes.length + 1}`, content: '', createdAt: Date.now() };
      notes.push(newNote);
      activeNoteId = newNote.id;
      saveNotes();
      renderNoteTabs();
      showNote(newNote.id);
      if (noteArea) noteArea.focus();
    });
  }

  // Delete note
  if (noteDeleteBtn) {
    noteDeleteBtn.addEventListener('click', () => {
      if (notes.length <= 1) { showToast('⚠️ Cannot delete the last note'); return; }
      notes = notes.filter(n => n.id !== activeNoteId);
      activeNoteId = notes[0].id;
      saveNotes();
      renderNoteTabs();
      showNote(activeNoteId);
      showToast('🗑️ Note deleted');
    });
  }

  // Context menu
  if (noteCtxPin) {
    noteCtxPin.addEventListener('click', () => {
      const note = notes.find(n => n.id === currentCtxNoteId);
      if (note) { note.pinned = !note.pinned; saveNotes(); renderNoteTabs(); }
      noteContextMenu.classList.remove('show');
    });
  }

  const noteCtxRename = document.getElementById('noteCtxRename');
  if (noteCtxRename) {
    noteCtxRename.addEventListener('click', () => {
      noteContextMenu.classList.remove('show');
      const tabs = noteTabsScroll.querySelectorAll('.note-tab');
      const idx = notes.findIndex(n => n.id === currentCtxNoteId);
      if (idx >= 0 && tabs[idx]) tabs[idx].dispatchEvent(new MouseEvent('dblclick'));
    });
  }

  noteCtxColorOpts.forEach(opt => {
    opt.addEventListener('click', e => {
      const note = notes.find(n => n.id === currentCtxNoteId);
      if (note) { note.color = e.target.dataset.color || ''; saveNotes(); renderNoteTabs(); }
    });
  });

  if (noteCtxExportTxt) {
    noteCtxExportTxt.addEventListener('click', () => {
      const note = notes.find(n => n.id === currentCtxNoteId);
      if (!note) return;
      const blob = new Blob([note.content || ''], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (note.title || 'note') + '.txt';
      a.click();
      noteContextMenu.classList.remove('show');
    });
  }

  if (noteCtxExportMd) {
    noteCtxExportMd.addEventListener('click', () => {
      const note = notes.find(n => n.id === currentCtxNoteId);
      if (!note) return;
      const blob = new Blob([note.content || ''], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (note.title || 'note') + '.md';
      a.click();
      noteContextMenu.classList.remove('show');
    });
  }

  const noteCtxDelete = document.getElementById('noteCtxDelete');
  if (noteCtxDelete) {
    noteCtxDelete.addEventListener('click', () => {
      if (notes.length <= 1) { showToast('⚠️ Cannot delete the last note'); noteContextMenu.classList.remove('show'); return; }
      notes = notes.filter(n => n.id !== currentCtxNoteId);
      if (activeNoteId === currentCtxNoteId) activeNoteId = notes[0].id;
      saveNotes(); renderNoteTabs(); showNote(activeNoteId);
      noteContextMenu.classList.remove('show');
      showToast('🗑️ Note deleted');
    });
  }

  // Close context menu on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#noteContextMenu')) noteContextMenu.classList.remove('show');
  });

  // ── "All notes" overview (for when the tab bar gets too crowded) ──
  const noteAllBtn = document.getElementById('noteAllBtn');
  const allNotesModal = document.getElementById('allNotesModal');
  const allNotesList = document.getElementById('allNotesList');
  const allNotesCloseBtn = document.getElementById('allNotesCloseBtn');

  function renderAllNotesList() {
    if (!allNotesList) return;
    allNotesList.innerHTML = '';
    notes.forEach((note, i) => {
      const row = document.createElement('div');
      row.className = 'all-notes-row' + (note.id === activeNoteId ? ' active' : '');

      const dot = document.createElement('span');
      dot.className = 'all-notes-row-dot';
      if (note.color) dot.style.background = note.color.replace('0.3', '0.9');
      else if (note.pinned) dot.style.background = 'rgba(167,139,250,0.9)';

      const info = document.createElement('div');
      info.className = 'all-notes-row-info';
      const title = document.createElement('div');
      title.className = 'all-notes-row-title';
      title.textContent = note.title || `Note ${i + 1}`;
      const snippet = document.createElement('div');
      snippet.className = 'all-notes-row-snippet';
      snippet.textContent = (note.content || '').replace(/\s+/g, ' ').trim().slice(0, 50) || 'Empty note';
      info.appendChild(title);
      info.appendChild(snippet);

      const delBtn = document.createElement('button');
      delBtn.className = 'all-notes-row-del';
      delBtn.innerHTML = '<span class="trash-svg-icon" style="width:12px;height:12px;"></span>';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (notes.length <= 1) { showToast('⚠️ Cannot delete the last note'); return; }
        notes = notes.filter(n => n.id !== note.id);
        if (activeNoteId === note.id) activeNoteId = notes[0].id;
        saveNotes();
        renderNoteTabs();
        showNote(activeNoteId);
        renderAllNotesList();
      });

      row.appendChild(dot);
      row.appendChild(info);
      row.appendChild(delBtn);
      row.addEventListener('click', () => {
        saveNotes();
        activeNoteId = note.id;
        showNote(note.id);
        renderNoteTabs();
        closeAllNotesModal();
      });
      allNotesList.appendChild(row);
    });
  }

  function closeAllNotesModal() {
    if (!allNotesModal) return;
    allNotesModal.style.opacity = '0';
    setTimeout(() => allNotesModal.style.display = 'none', 200);
  }

  if (noteAllBtn && allNotesModal) {
    noteAllBtn.addEventListener('click', () => {
      renderAllNotesList();
      allNotesModal.style.display = 'flex';
      allNotesModal.style.opacity = '0';
      allNotesModal.style.transition = 'opacity 0.2s ease-out';
      setTimeout(() => allNotesModal.style.opacity = '1', 10);
    });
    allNotesModal.addEventListener('click', e => {
      if (e.target === allNotesModal) closeAllNotesModal();
    });
  }
  if (allNotesCloseBtn) allNotesCloseBtn.addEventListener('click', closeAllNotesModal);

  loadNotes();

  // @module 21-todo  (dev/popup-src/21-todo.js)
  // ── Switcher Notes / Todo ──────────────────────────────────
  const btnViewNotes = document.getElementById('btnViewNotes');
  const btnViewTodo  = document.getElementById('btnViewTodo');
  const notesView    = document.getElementById('notesView');
  const todoViewEl   = document.getElementById('todoView');

  if (btnViewNotes && btnViewTodo) {
    btnViewNotes.addEventListener('click', () => {
      btnViewNotes.classList.add('active');
      btnViewTodo.classList.remove('active');
      notesView.style.display = '';
      todoViewEl.style.display = 'none';
    });
    btnViewTodo.addEventListener('click', () => {
      btnViewTodo.classList.add('active');
      btnViewNotes.classList.remove('active');
      notesView.style.display = 'none';
      todoViewEl.style.display = '';
      renderTodos();
    });
  }

  let todoItems = []; // [{ id, text, done, priority, createdAt }]  (priority is kept for old backups, no longer shown)

  const todoInput        = document.getElementById('todoInput');
  const todoAddBtn       = document.getElementById('todoAddBtn');
  const todoListWrap     = document.getElementById('todoListWrap');
  const todoStatsEl      = document.getElementById('todoStats');
  const todoClearCompBtn = document.getElementById('todoClearCompletedBtn');

  function genTodoId() { return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function loadTodos() {
    chrome.storage.local.get('todoItems', data => {
      todoItems = data.todoItems || [];
      renderTodos();
    });
  }

  function saveTodos() {
    chrome.storage.local.set({ todoItems });
    renderTodos();
  }

  function renderTodos() {
    if (!todoListWrap) return;
    const total = todoItems.length;
    const done = todoItems.filter(t => t.done).length;
    const left = total - done;
    if (todoStatsEl) todoStatsEl.textContent = total === 0 ? 'Nothing to do' : (left === 0 ? 'All done' : `${left} left`);
    if (todoClearCompBtn) todoClearCompBtn.hidden = done === 0;

    todoListWrap.innerHTML = '';
    if (total === 0) {
      todoListWrap.innerHTML = '<div class="todo-empty">No tasks yet</div>';
      return;
    }

    // open tasks first, finished ones at the bottom; each group keeps its order
    const ordered = todoItems.filter(t => !t.done).concat(todoItems.filter(t => t.done));
    ordered.forEach(task => {
      const el = document.createElement('div');
      el.className = 'todo-item' + (task.done ? ' done' : '');
      el.innerHTML = `
        <input type="checkbox" class="todo-check" ${task.done ? 'checked' : ''} aria-label="Done">
        <span class="todo-text" title="Double-click to edit">${escHtml(task.text)}</span>
        <button class="todo-btn-del" title="Delete" aria-label="Delete">✕</button>
      `;

      el.querySelector('.todo-check').addEventListener('change', () => {
        const t = todoItems.find(x => x.id === task.id);
        if (t) { t.done = !t.done; saveTodos(); }
      });

      // Double-click the text to edit it
      el.querySelector('.todo-text').addEventListener('dblclick', (e) => {
        const textEl = e.currentTarget;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = task.text;
        input.maxLength = 300;
        input.className = 'todo-inline-edit';
        textEl.replaceWith(input);
        input.focus();
        input.select();
        let cancelled = false;
        input.addEventListener('blur', () => {
          if (cancelled) return;
          const t = todoItems.find(x => x.id === task.id);
          if (t && input.value.trim()) t.text = input.value.trim();
          saveTodos();
        });
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') input.blur();
          if (ev.key === 'Escape') { cancelled = true; renderTodos(); }
        });
      });

      el.querySelector('.todo-btn-del').addEventListener('click', () => {
        todoItems = todoItems.filter(x => x.id !== task.id);
        saveTodos();
      });

      todoListWrap.appendChild(el);
    });
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function addTodo() {
    const text = todoInput ? todoInput.value.trim() : '';
    if (!text) return;
    todoItems.unshift({ id: genTodoId(), text, done: false, priority: 'normal', createdAt: Date.now() });
    todoInput.value = '';
    saveTodos();
    todoInput.focus();
  }

  if (todoInput) todoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
  if (todoAddBtn) todoAddBtn.addEventListener('click', addTodo);

  if (todoClearCompBtn) {
    todoClearCompBtn.addEventListener('click', () => {
      todoItems = todoItems.filter(t => !t.done);
      saveTodos();
    });
  }

  loadTodos();
  // @module 22-colors  (dev/popup-src/22-colors.js)
  const colorInput = document.getElementById('colorInput');
  const colorHex = document.getElementById('colorHex');
  const colorRgb = document.getElementById('colorRgb');
  const colorHsl = document.getElementById('colorHsl');
  const colorHistEl = document.getElementById('colorHistory');
  const colorPinnedEl = document.getElementById('colorPinned');
  const colorPinnedSection = document.getElementById('colorPinnedSection');
  const paletteGrid = document.getElementById('paletteGrid');
  let colorHistList = []; // Array of { hex: string, pinned: boolean }

  // Color palettes
  const PALETTES = {
    material: ['#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'],
    pastel: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D4BAFF', '#FFB3DE', '#B3FFF0', '#FFE5B3', '#B3D4FF', '#E8B3FF', '#B3FFB3', '#FFB3B3', '#B3FFFF', '#FFE0B3', '#D5B3FF'],
    neon: ['#FF0080', '#FF00FF', '#8000FF', '#0040FF', '#00FFFF', '#00FF40', '#80FF00', '#FFFF00', '#FF8000', '#FF0040', '#FF0000', '#FF00BF', '#4000FF', '#00BFFF', '#00FF80', '#BFFF00'],
    dark: ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#2c2c54', '#474787', '#3d3d6b', '#2e2e50', '#1b1b3a', '#252547', '#0d0d1a', '#3a3a5c', '#28284e', '#1f1f3d', '#363658', '#44446b']
  };
  let activePalette = 'material';

  function loadColorHistory() {
    chrome.storage.local.get(['colorHistory', 'colorCurrent'], data => {
      const history = Array.isArray(data.colorHistory) ? data.colorHistory : [];
      let recents = 0;
      colorHistList = history
        .map(item => typeof item === 'string' ? { hex: item, pinned: false } : item)
        .filter(item => item && typeof item.hex === 'string' && /^#[0-9a-f]{6}$/i.test(item.hex))
        .map(item => ({ hex: item.hex, pinned: item.pinned === true }))
        .filter(item => item.pinned || ++recents <= COLOR_RECENT_MAX);
      renderColorHistory();
      if (typeof data.colorCurrent === 'string' && /^#[0-9a-f]{6}$/i.test(data.colorCurrent)) {
        colorInput.value = data.colorCurrent;
        updateColorDisplay(colorInput.value);
      }
    });
  }

  const COLOR_RECENT_MAX = 20;
  function saveColorHistory() {
    chrome.storage.local.set({ colorHistory: colorHistList });
  }
  // the colour on show comes back at the next opening
  let colorCurrentTimer = null;
  function rememberCurrentColor(hex) {
    clearTimeout(colorCurrentTimer);
    colorCurrentTimer = setTimeout(() => chrome.storage.local.set({ colorCurrent: hex }), 250);
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  function updateColorDisplay(hex) {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    colorHex.textContent = hex.toUpperCase();
    colorRgb.textContent = `rgb(${r}, ${g}, ${b})`;
    colorHsl.textContent = `hsl(${h}, ${s}%, ${l}%)`;
    rememberCurrentColor(hex);
    try { syncColorWheel(hex); } catch (_) { }
  }

  function addToColorHistory(hex) {
    hex = hex.toUpperCase();
    const existingIdx = colorHistList.findIndex(item => item.hex.toUpperCase() === hex);

    // If it already exists, move it to the front (keeping its pin status)
    if (existingIdx !== -1) {
      const item = colorHistList.splice(existingIdx, 1)[0];
      colorHistList.unshift(item);
    } else {
      colorHistList.unshift({ hex, pinned: false });
    }

    // Limit to 20 maximum items, but NEVER remove pinned items
    let unpinnedCount = colorHistList.filter(item => !item.pinned).length;
    while (unpinnedCount > COLOR_RECENT_MAX) {
      // Find the last unpinned item and remove it
      for (let i = colorHistList.length - 1; i >= 0; i--) {
        if (!colorHistList[i].pinned) {
          colorHistList.splice(i, 1);
          unpinnedCount--;
          break;
        }
      }
    }

    saveColorHistory();
    renderColorHistory();
  }

  let colorPickTimer;

  // Live preview while dragging (don't save to history)
  colorInput.addEventListener('input', () => {
    updateColorDisplay(colorInput.value);

    // Auto-save if user pauses for 0.6 seconds
    clearTimeout(colorPickTimer);
    colorPickTimer = setTimeout(() => {
      addToColorHistory(colorInput.value);
    }, 600);
  });

  // Only add to history when the user FINISHES picking (mouse release)
  colorInput.addEventListener('change', () => {
    clearTimeout(colorPickTimer);
    addToColorHistory(colorInput.value);
    document.body.classList.remove('color-picking-mini');
  });

  // ---- Eyedropper: pick a color from anywhere on screen in one click ----
  // Real screen-wide sampling (not limited to the current tab), unlike the
  // native <input type=color> dialog which stays confined to its own panel.
  const colorEyedropperBtn = document.getElementById('colorEyedropperBtn');
  if (colorEyedropperBtn) {
    if (!('EyeDropper' in window)) {
      colorEyedropperBtn.disabled = true;
      colorEyedropperBtn.title = 'Not available on this browser';
    } else {
      colorEyedropperBtn.addEventListener('click', async () => {
        try {
          const eyeDropper = new EyeDropper();
          const result = await eyeDropper.open();
          colorInput.value = result.sRGBHex;
          updateColorDisplay(result.sRGBHex);
          addToColorHistory(result.sRGBHex);
        } catch (err) {
          // Esc pressed — picking cancelled, nothing to do.
        }
      });
    }
  }


  // ---- Color wheel (single main button opens it) ----
  const colorMainBtn = document.getElementById('colorMainBtn');
  const colorWheelPop = document.getElementById('colorWheelPop');
  const colorWheelWrap = document.getElementById('colorWheelWrap');
  const colorWheelCanvas = document.getElementById('colorWheelCanvas');
  const colorWheelMarker = document.getElementById('colorWheelMarker');
  const colorWheelBright = document.getElementById('colorWheelBright');
  const wheelState = { h: 262, s: 0.8, v: 0.93, dragging: false };

  function hsvToHex(h, s, v) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + to(f(5)) + to(f(3)) + to(f(1));
  }
  function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    let h = 0;
    if (d) {
      if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60;
      else if (max === G) h = ((B - R) / d + 2) * 60;
      else h = ((R - G) / d + 4) * 60;
    }
    return { h, s: max ? d / max : 0, v: max };
  }

  function drawColorWheel() {
    if (!colorWheelCanvas) return;
    const ctx = colorWheelCanvas.getContext('2d');
    const size = colorWheelCanvas.width, R = size / 2;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - R, dy = y + 0.5 - R, dist = Math.hypot(dx, dy);
        const i = (y * size + x) * 4;
        if (dist > R) { img.data[i + 3] = 0; continue; }
        let hue = Math.atan2(dy, dx) * 180 / Math.PI; if (hue < 0) hue += 360;
        const hex = hsvToHex(hue, Math.min(1, dist / R), wheelState.v);
        img.data[i] = parseInt(hex.slice(1, 3), 16);
        img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[i + 3] = dist > R - 1 ? 180 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function placeWheelMarker() {
    if (!colorWheelMarker || !colorWheelWrap) return;
    const w = colorWheelWrap.clientWidth || 160, R = w / 2;
    const a = wheelState.h * Math.PI / 180;
    colorWheelMarker.style.left = (R + Math.cos(a) * wheelState.s * R) + 'px';
    colorWheelMarker.style.top = (R + Math.sin(a) * wheelState.s * R) + 'px';
    colorWheelMarker.style.background = hsvToHex(wheelState.h, wheelState.s, wheelState.v);
  }
  function syncColorWheel(hex) {
    if (colorMainBtn) colorMainBtn.style.backgroundColor = hex;
    if (!colorWheelPop || wheelState.dragging) return;
    const hsv = hexToHsv(hex);
    const vChanged = Math.abs(hsv.v - wheelState.v) > 0.004;
    if (hsv.s > 0.001 && hsv.v > 0.001) wheelState.h = hsv.h; // keep hue for grays/black
    wheelState.s = hsv.s;
    wheelState.v = hsv.v;
    if (colorWheelBright) {
      colorWheelBright.value = Math.round(hsv.v * 100);
      colorWheelBright.style.setProperty('--wheel-color', hsvToHex(wheelState.h, wheelState.s || 1, 1));
    }
    if (!colorWheelPop.hidden) { if (vChanged) drawColorWheel(); placeWheelMarker(); }
  }
  function applyWheelColor(final) {
    const hex = hsvToHex(wheelState.h, wheelState.s, wheelState.v);
    colorInput.value = hex;
    colorInput.dispatchEvent(new Event(final ? 'change' : 'input', { bubbles: true }));
  }

  if (colorMainBtn && colorWheelPop) {
    colorMainBtn.addEventListener('click', () => {
      const open = colorWheelPop.hidden;
      colorWheelPop.hidden = !open;
      colorMainBtn.setAttribute('aria-expanded', String(open));
      if (open) { syncColorWheel(colorInput.value); drawColorWheel(); placeWheelMarker(); }
    });
    const pickAt = (e) => {
      const rect = colorWheelWrap.getBoundingClientRect(), R = rect.width / 2;
      let dx = e.clientX - rect.left - R, dy = e.clientY - rect.top - R;
      const dist = Math.hypot(dx, dy);
      let hue = Math.atan2(dy, dx) * 180 / Math.PI; if (hue < 0) hue += 360;
      wheelState.h = hue;
      wheelState.s = Math.min(1, dist / R);
      if (wheelState.v < 0.02) { wheelState.v = 1; if (colorWheelBright) colorWheelBright.value = 100; drawColorWheel(); }
      placeWheelMarker();
      applyWheelColor(false);
    };
    colorWheelWrap.addEventListener('pointerdown', (e) => {
      wheelState.dragging = true;
      colorWheelWrap.setPointerCapture(e.pointerId);
      pickAt(e);
    });
    colorWheelWrap.addEventListener('pointermove', (e) => { if (wheelState.dragging) pickAt(e); });
    const endDrag = () => {
      if (!wheelState.dragging) return;
      wheelState.dragging = false;
      applyWheelColor(true);
    };
    colorWheelWrap.addEventListener('pointerup', endDrag);
    colorWheelWrap.addEventListener('pointercancel', endDrag);
    colorWheelBright.addEventListener('input', () => {
      wheelState.v = colorWheelBright.value / 100;
      colorWheelBright.style.setProperty('--wheel-color', hsvToHex(wheelState.h, wheelState.s || 1, 1));
      wheelState.dragging = true; // avoid re-sync flicker while sliding
      drawColorWheel(); placeWheelMarker();
      applyWheelColor(false);
      wheelState.dragging = false;
    });
    colorWheelBright.addEventListener('change', () => applyWheelColor(true));
  }

  // Rétrécit la fenêtre de l'extension pendant l'ouverture du sélecteur natif
  // (utile pour la pipette manuelle, qui a besoin de voir la page derrière le
  // popup). Revient à la normale dès qu'une couleur est choisie ou que le
  // picker perd le focus (annulation).
  colorInput.addEventListener('click', () => {
    document.body.classList.add('color-picking-mini');
  });
  colorInput.addEventListener('blur', () => {
    document.body.classList.remove('color-picking-mini');
  });

  function renderColorHistory() {
    colorHistEl.innerHTML = '';
    if (colorPinnedEl) colorPinnedEl.innerHTML = '';

    // Split lists
    const pinnedItems = colorHistList.filter(item => item.pinned);
    const recentItems = colorHistList.filter(item => !item.pinned);

    // Toggle Pinned Section visibility
    if (colorPinnedSection) {
      colorPinnedSection.style.display = pinnedItems.length > 0 ? 'block' : 'none';
    }

    // Render Recent empty state
    if (recentItems.length === 0) {
      colorHistEl.innerHTML = '<div class="clip-empty" style="width:100%">No recent colors</div>';
    }

    // Render both lists
    const renderItem = (item, container) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'color-swatch-wrapper' + (item.pinned ? ' pinned' : '');

      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = item.hex;
      swatch.title = item.hex;

      const pinBtn = document.createElement('div');
      pinBtn.className = 'color-pin-btn';
      pinBtn.innerHTML = '📌';
      pinBtn.title = item.pinned ? 'Unpin' : 'Pin';

      swatch.addEventListener('click', () => {
        colorInput.value = item.hex;
        updateColorDisplay(item.hex);
        copyText(item.hex);
      });

      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.pinned = !item.pinned;
        // Keep pinned colors at the front of the raw array
        colorHistList.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        saveColorHistory();
        renderColorHistory();
      });

      wrapper.appendChild(swatch);
      wrapper.appendChild(pinBtn);
      container.appendChild(wrapper);
    };

    if (colorPinnedEl) pinnedItems.forEach(item => renderItem(item, colorPinnedEl));
    recentItems.forEach(item => renderItem(item, colorHistEl));
  }

  // Palette rendering
  function renderPalette(name) {
    activePalette = name;
    paletteGrid.innerHTML = '';
    (PALETTES[name] || []).forEach(hex => {
      const swatch = document.createElement('div');
      swatch.className = 'color-palette-swatch';
      swatch.style.backgroundColor = hex;
      swatch.title = hex;
      swatch.addEventListener('click', () => {
        colorInput.value = hex;
        updateColorDisplay(hex);
        addToColorHistory(hex);
        copyText(hex);
      });
      paletteGrid.appendChild(swatch);
    });
    // Update active tab
    document.querySelectorAll('#paletteTabs .cat-tag').forEach(t => {
      t.classList.toggle('active', t.dataset.palette === name);
    });
  }

  document.querySelectorAll('#paletteTabs .cat-tag').forEach(tab => {
    tab.addEventListener('click', () => renderPalette(tab.dataset.palette));
  });

  // Copy color codes on click
  document.querySelectorAll('.color-code-row').forEach(row => {
    row.addEventListener('click', () => {
      const val = row.querySelector('.color-code-value').textContent;
      copyText(val);
    });
  });

  updateColorDisplay(colorInput.value);
  clearTimeout(colorCurrentTimer); // the default colour of the page is not a choice worth storing
  loadColorHistory();
  renderPalette('material');

  // @module 23-passwords  (dev/popup-src/23-passwords.js)
  const pwOutputsList = document.getElementById('pwOutputsList');
  const pwLength = document.getElementById('pwLength');
  const pwLengthVal = document.getElementById('pwLengthVal');
  const pwQuantity = document.getElementById('pwQuantity');
  const pwUpper = document.getElementById('pwUpper');
  const pwLower = document.getElementById('pwLower');
  const pwDigits = document.getElementById('pwDigits');
  const pwSymbols = document.getElementById('pwSymbols');
  const pwExcludeSimilar = document.getElementById('pwExcludeSimilar');
  const pwAutoCopy = document.getElementById('pwAutoCopy');

  const pwStrengthFill = document.getElementById('pwStrengthFill');
  const pwStrengthLabel = document.getElementById('pwStrengthLabel');
  const pwGenerateBtn = document.getElementById('pwGenerateBtn');

  const pwHistoryList = document.getElementById('pwHistoryList');
  const pwClearHistoryBtn = document.getElementById('pwClearHistoryBtn');

  // Word list removed for security
  let pwHistory = [];

  function loadPwHistory() {
    chrome.storage.local.get('pwHistory', data => {
      pwHistory = data.pwHistory || [];
      renderPwHistory();
    });
  }

  function savePwHistory() {
    chrome.storage.local.set({ pwHistory: pwHistory.slice(0, 20) });
  }

  function renderPwHistory() {
    if (pwHistory.length === 0) {
      pwHistoryList.innerHTML = '<div class="clip-empty">No history</div>';
      return;
    }
    pwHistoryList.innerHTML = '';
    pwHistory.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'pw-history-item';

      const pwdSpan = document.createElement('span');
      pwdSpan.className = 'pw-history-pw';
      pwdSpan.textContent = '••••••••••';

      let isVisible = false;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'pw-history-date';
      const d = new Date(item.timestamp);
      dateSpan.textContent = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

      const actions = document.createElement('div');
      actions.className = 'pw-history-actions';

      const visBtn = document.createElement('button');
      visBtn.className = 'pw-hist-btn';
      visBtn.textContent = 'Show';
      visBtn.onclick = () => {
        isVisible = !isVisible;
        pwdSpan.textContent = isVisible ? item.password : '••••••••••';
        visBtn.textContent = isVisible ? 'Hide' : 'Show';
      };

      const copyBtn = document.createElement('button');
      copyBtn.className = 'pw-hist-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = () => copyText(item.password);

      actions.appendChild(dateSpan);
      actions.appendChild(visBtn);
      actions.appendChild(copyBtn);

      el.appendChild(pwdSpan);
      el.appendChild(actions);
      pwHistoryList.appendChild(el);
    });
  }

  pwClearHistoryBtn.addEventListener('click', () => {
    pwHistory = [];
    savePwHistory();
    renderPwHistory();
  });

  function addToPwHistory(passwords) {
    const timestamp = Date.now();
    passwords.forEach(pw => {
      pwHistory.unshift({ password: pw, timestamp });
    });
    pwHistory = pwHistory.slice(0, 20);
    savePwHistory();
    renderPwHistory();
  }

  pwLength.addEventListener('input', () => {
    pwLengthVal.textContent = pwLength.value;
  });

  // length, quantity and the options come back at the next opening
  const pwChecks = { upper: pwUpper, lower: pwLower, digits: pwDigits, symbols: pwSymbols, excludeSimilar: pwExcludeSimilar, autoCopy: pwAutoCopy };
  function savePwSettings() {
    const st = { length: Number(pwLength.value), quantity: Number(pwQuantity.value) };
    Object.keys(pwChecks).forEach(k => { st[k] = pwChecks[k].checked; });
    chrome.storage.local.set({ pwSettings: st });
  }
  chrome.storage.local.get('pwSettings', (data) => {
    const st = data && data.pwSettings;
    if (!st || typeof st !== 'object') return;
    const len = Math.round(Number(st.length));
    if (len >= Number(pwLength.min) && len <= Number(pwLength.max)) { pwLength.value = len; pwLengthVal.textContent = len; }
    if ([1, 2, 3, 4, 5].includes(Number(st.quantity))) pwQuantity.value = String(Number(st.quantity));
    Object.keys(pwChecks).forEach(k => { if (typeof st[k] === 'boolean') pwChecks[k].checked = st[k]; });
  });
  [pwLength, pwQuantity, ...Object.values(pwChecks)].forEach(el => el.addEventListener('change', savePwSettings));

  // the button shipped in the page, shown until the first password replaces the row
  const pwCopyBtn = document.getElementById('pwCopyBtn');
  if (pwCopyBtn) pwCopyBtn.addEventListener('click', () => showToast('Generate a password first'));

  // "Decrypting" effect: the characters flicker and lock in from left to right.
  // Only what is shown moves; the password itself is already final (and is what
  // gets copied). A new click, or reduced-motion in the system, cuts it short.
  let pwAnim = 0;
  function revealPasswords(rows, pws, charset, done) {
    const token = ++pwAnim;
    pwGenerateBtn.classList.remove('pw-busy');
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
    const total = Math.min(1100, 400 + Math.max(...pws.map(x => x.length)) * 8);
    const t0 = performance.now();
    let last = 0;
    pwGenerateBtn.classList.add('pw-busy');
    pwStrengthLabel.textContent = 'Generating…';
    pwStrengthLabel.style.color = 'var(--text-muted)';
    pwStrengthFill.style.transition = 'none';
    pwStrengthFill.style.width = '0%';
    void pwStrengthFill.offsetWidth;
    pwStrengthFill.style.transition = 'width .6s cubic-bezier(.22,1,.36,1), background-color .3s';
    rows.forEach((r) => r.classList.add('pw-scrambling'));
    function frame(now) {
      if (token !== pwAnim) return;
      const prog = Math.max(0, Math.min(1, (now - t0) / total));   // the first frame can be stamped just before t0
      if (now - last >= 40 || prog === 1) {
        last = now;
        rows.forEach((row, k) => {
          const span = row.firstChild, pw = pws[k];
          const locked = Math.floor(prog * pw.length);
          span.textContent = pw.slice(0, locked);
          if (locked < pw.length) {
            let tail = '';
            for (let i = locked; i < pw.length; i++) tail += charset[Math.floor(Math.random() * charset.length)];
            const t = document.createElement('span');
            t.className = 'pw-scr';
            t.textContent = tail;
            span.appendChild(t);
          }
        });
      }
      if (prog < 1) { requestAnimationFrame(frame); return; }
      pwGenerateBtn.classList.remove('pw-busy');
      rows.forEach((r) => { r.classList.remove('pw-scrambling'); r.classList.add('pw-revealed'); setTimeout(() => r.classList.remove('pw-revealed'), 750); });
      done();
    }
    requestAnimationFrame(frame);
  }

  function generatePassword() {
    const len = parseInt(pwLength.value);
    const qty = parseInt(pwQuantity.value);
    let passwords = [];

    // Base character sets
    let sets = [];
    if (pwUpper.checked) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (pwLower.checked) sets.push('abcdefghijklmnopqrstuvwxyz');
    if (pwDigits.checked) sets.push('0123456789');
    if (pwSymbols.checked) sets.push('!@#$%^&*()_+-=[]{}|;:,.<>?');

    if (sets.length === 0) {
      pwAnim++; pwGenerateBtn.classList.remove('pw-busy');
      pwOutputsList.innerHTML = `<div class="pw-output-row"><span class="pw-output">Check at least one option</span></div>`;
      pwStrengthLabel.textContent = '—';
      pwStrengthFill.style.width = '0%';
      return;
    }

    if (pwExcludeSimilar.checked) {
      sets = sets.map(s => s.replace(/[OIloli01]/g, ''));
    }

    const fullCharset = sets.join('');

    for (let q = 0; q < qty; q++) {
      let pwArray = [];
      // Guarantee at least 1 character from each chosen set if length permits
      let remainingLen = len;
      sets.forEach(set => {
        if (remainingLen > 0 && set.length > 0) {
          const rand = new Uint32Array(1);
          crypto.getRandomValues(rand);
          pwArray.push(set[rand[0] % set.length]);
          remainingLen--;
        }
      });

      // Fill the rest randomly
      if (remainingLen > 0 && fullCharset.length > 0) {
        const rand = new Uint32Array(remainingLen);
        crypto.getRandomValues(rand);
        for (let i = 0; i < remainingLen; i++) {
          pwArray.push(fullCharset[rand[i] % fullCharset.length]);
        }
      }

      // Shuffle securely
      for (let i = pwArray.length - 1; i > 0; i--) {
        const r = new Uint32Array(1);
        crypto.getRandomValues(r);
        const j = r[0] % (i + 1);
        [pwArray[i], pwArray[j]] = [pwArray[j], pwArray[i]];
      }

      passwords.push(pwArray.join(''));
    }

    // Render outputs
    pwOutputsList.innerHTML = '';
    const pwRows = [];
    passwords.forEach(pw => {
      const row = document.createElement('div');
      row.className = 'pw-output-row';
      const span = document.createElement('span');
      span.className = 'pw-output';
      span.textContent = pw;
      const btn = document.createElement('button');
      btn.className = 'pw-copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = (e) => { e.stopPropagation(); copyText(pw); };
      // the whole row copies too: a bigger target than the small button
      row.title = 'Click to copy';
      row.addEventListener('click', () => { if (!String(getSelection())) copyText(pw); });

      row.appendChild(span);
      row.appendChild(btn);
      pwOutputsList.appendChild(row);
      pwRows.push(row);
    });

    revealPasswords(pwRows, passwords, fullCharset, () => updateStrength(passwords[0], fullCharset.length));
    addToPwHistory(passwords);

    if (pwAutoCopy.checked && passwords.length > 0) {
      copyText(passwords.join('\n'));
    }
  }

  function updateStrength(pw, poolSize) {
    // Entropy = length * log2(poolSize)
    const entropy = pw.length * Math.log2(poolSize || 1);
    
    let label = 'Very weak', color = '#f87171', pct = 15;
    
    if (entropy > 120) {
      label = 'Excellent'; color = '#8b5cf6'; pct = 100;
    } else if (entropy > 80) {
      label = 'Very strong'; color = '#22d3ee'; pct = 100;
    } else if (entropy > 60) {
      label = 'Strong'; color = '#34d399'; pct = 85;
    } else if (entropy > 45) {
      label = 'Good'; color = '#a3e635'; pct = 70;
    } else if (entropy > 30) {
      label = 'Fair'; color = '#fbbf24'; pct = 50;
    } else if (entropy > 20) {
      label = 'Weak'; color = '#fb923c'; pct = 30;
    }

    pwStrengthFill.style.width = pct + '%';
    pwStrengthFill.style.backgroundColor = color;
    pwStrengthLabel.textContent = `${label} (~${Math.round(entropy)} bits)`;
    pwStrengthLabel.style.color = color;
  }

  pwGenerateBtn.addEventListener('click', generatePassword);

  loadPwHistory();

  // @module 24-converter  (dev/popup-src/24-converter.js)
  const convUnitA = document.getElementById('convUnitA');
  const convUnitB = document.getElementById('convUnitB');
  const convSwapBtn = document.getElementById('convSwapBtn');
  const convInputA = document.getElementById('convInputA');
  const convInputB = document.getElementById('convInputB');
  const convRateInfo = document.getElementById('convRateInfo');
  const convRateFreshness = document.getElementById('convRateFreshness');
  const convRefreshRatesBtn = document.getElementById('convRefreshRatesBtn');
  const convCopyA = document.getElementById('convCopyA');
  const convCopyB = document.getElementById('convCopyB');
  const convCurrencyTable = document.getElementById('convCurrencyTable');
  const convCountrySearch = document.getElementById('convCountrySearch');
  const convCountryList = document.getElementById('convCountryList');

  // Accepte "1,5" ou "1 234,56" (clavier français) aussi bien que "1.5" —
  // un <input type="number"> classique rejette silencieusement la virgule
  // selon la langue de Chrome, ce qui donnait des conversions fausses sans erreur visible
  function parseUserNumber(str) {
    if (str === null || str === undefined) return NaN;
    let s = String(str).trim().replace(/[\s\u00a0\u202f]/g, '');
    const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) {
      // both present: the last one is the decimal mark, the other groups thousands
      const dec = comma > dot ? ',' : '.';
      s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
    } else if (comma >= 0) {
      s = s.indexOf(',') !== comma ? s.split(',').join('') : s.replace(',', '.');
    } else if (s.indexOf('.') !== dot) {
      s = s.split('.').join('');
    }
    return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
  }

  // ---------- CURRENCY DATA ----------
  let currencyRates = {}; // unités par 1 USD (voir background.js)
  let ratesLastUpdated = null;
  let ratesAsOf = null;          // date of the rates themselves (the source updates once a day)
  let ratesAreLive = true;

  const currencyMeta = [
    { code: 'EUR', flag: '🇪🇺', name: 'Euro', symbol: '€', country: 'Eurozone' },
    { code: 'USD', flag: '🇺🇸', name: 'US Dollar', symbol: '$', country: 'United States' },
    { code: 'GBP', flag: '🇬🇧', name: 'Pound Sterling', symbol: '£', country: 'United Kingdom' },
    { code: 'JPY', flag: '🇯🇵', name: 'Yen', symbol: '¥', country: 'Japan' },
    { code: 'CHF', flag: '🇨🇭', name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland' },
    { code: 'CAD', flag: '🇨🇦', name: 'Canadian Dollar', symbol: '$', country: 'Canada' },
    { code: 'AUD', flag: '🇦🇺', name: 'Australian Dollar', symbol: '$', country: 'Australia' },
    { code: 'CNY', flag: '🇨🇳', name: 'Yuan', symbol: '¥', country: 'China' },
    { code: 'KRW', flag: '🇰🇷', name: 'Won', symbol: '₩', country: 'South Korea' },
    { code: 'INR', flag: '🇮🇳', name: 'Rupee', symbol: '₹', country: 'India' },
    { code: 'SGD', flag: '🇸🇬', name: 'Singapore Dollar', symbol: '$', country: 'Singapore' },
    { code: 'HKD', flag: '🇭🇰', name: 'Hong Kong Dollar', symbol: '$', country: 'Hong Kong' },
    { code: 'TWD', flag: '🇹🇼', name: 'Taiwan Dollar', symbol: '$', country: 'Taiwan' },
    { code: 'THB', flag: '🇹🇭', name: 'Baht', symbol: '฿', country: 'Thailand' },
    { code: 'MYR', flag: '🇲🇾', name: 'Ringgit', symbol: 'RM', country: 'Malaysia' },
    { code: 'IDR', flag: '🇮🇩', name: 'Indonesian Rupiah', symbol: 'Rp', country: 'Indonesia' },
    { code: 'PHP', flag: '🇵🇭', name: 'Philippine Peso', symbol: '₱', country: 'Philippines' },
    { code: 'VND', flag: '🇻🇳', name: 'Dong', symbol: '₫', country: 'Vietnam' },
    { code: 'AED', flag: '🇦🇪', name: 'UAE Dirham', symbol: 'د.إ', country: 'United Arab Emirates' },
    { code: 'SAR', flag: '🇸🇦', name: 'Riyal', symbol: '﷼', country: 'Saudi Arabia' },
    { code: 'ILS', flag: '🇮🇱', name: 'Shekel', symbol: '₪', country: 'Israel' },
    { code: 'TRY', flag: '🇹🇷', name: 'Turkish Lira', symbol: '₺', country: 'Turkey' },
    { code: 'ZAR', flag: '🇿🇦', name: 'Rand', symbol: 'R', country: 'South Africa' },
    { code: 'EGP', flag: '🇪🇬', name: 'Egyptian Pound', symbol: '£', country: 'Egypt' },
    { code: 'NGN', flag: '🇳🇬', name: 'Naira', symbol: '₦', country: 'Nigeria' },
    { code: 'MAD', flag: '🇲🇦', name: 'Dirham', symbol: 'MAD', country: 'Morocco' },
    { code: 'MXN', flag: '🇲🇽', name: 'Mexican Peso', symbol: '$', country: 'Mexico' },
    { code: 'BRL', flag: '🇧🇷', name: 'Real', symbol: 'R$', country: 'Brazil' },
    { code: 'ARS', flag: '🇦🇷', name: 'Argentine Peso', symbol: '$', country: 'Argentina' },
    { code: 'CLP', flag: '🇨🇱', name: 'Chilean Peso', symbol: '$', country: 'Chile' },
    { code: 'COP', flag: '🇨🇴', name: 'Colombian Peso', symbol: '$', country: 'Colombia' },
    { code: 'CRC', flag: '🇨🇷', name: 'Colón', symbol: '₡', country: 'Costa Rica' },
    { code: 'NOK', flag: '🇳🇴', name: 'Norwegian Krone', symbol: 'kr', country: 'Norway' },
    { code: 'SEK', flag: '🇸🇪', name: 'Swedish Krona', symbol: 'kr', country: 'Sweden' },
    { code: 'DKK', flag: '🇩🇰', name: 'Danish Krone', symbol: 'kr', country: 'Denmark' },
    { code: 'PLN', flag: '🇵🇱', name: 'Zloty', symbol: 'zł', country: 'Poland' },
    { code: 'CZK', flag: '🇨🇿', name: 'Czech Koruna', symbol: 'Kč', country: 'Czechia' },
    { code: 'HUF', flag: '🇭🇺', name: 'Forint', symbol: 'Ft', country: 'Hungary' },
    { code: 'RON', flag: '🇷🇴', name: 'Leu', symbol: 'lei', country: 'Romania' },
  ];

  const fallbackRates = {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151, CHF: 0.90, CAD: 1.36, AUD: 1.52,
    CNY: 7.25, KRW: 1380, INR: 83.5, SGD: 1.35, HKD: 7.8, TWD: 32, THB: 36,
    MYR: 4.7, IDR: 16000, PHP: 58, VND: 25400, AED: 3.67, SAR: 3.75, ILS: 3.7,
    TRY: 32, ZAR: 18.5, EGP: 48, NGN: 1500, MAD: 10, MXN: 16.5, BRL: 5.1,
    ARS: 880, CLP: 950, COP: 3900, CRC: 500, NOK: 10.5, SEK: 10.5, DKK: 6.9, PLN: 3.9,
    CZK: 23.5, HUF: 360, RON: 4.6
  };

  function fetchCurrencyRates() {
    chrome.storage.local.get(['exchangeRates', 'lastExchangeFetch', 'exchangeRatesAsOf', 'exchangeRatesOk'], (data) => {
      ratesAreLive = data.exchangeRatesOk !== false;
      ratesLastUpdated = data.lastExchangeFetch || null;
      ratesAsOf = data.exchangeRatesAsOf || null;

      if (data.exchangeRates) {
        currencyRates = data.exchangeRates;
        // Au cas où une devise aurait disparu de l'API entre-temps
        currencyMeta.forEach(cm => {
          if (!currencyRates[cm.code]) currencyRates[cm.code] = fallbackRates[cm.code] || 1;
        });
      } else {
        currencyRates = fallbackRates;
        ratesAreLive = false;
      }
      buildCurrencyUnits();
      updateRateFreshnessUI();
      recomputeConversion();
    });
  }

  // Si le popup était déjà ouvert quand l'alarme de fond a rafraîchi les taux
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.exchangeRates || changes.exchangeRatesOk)) {
      fetchCurrencyRates();
    }
  });

  function updateRateFreshnessUI() {
    if (!convRateFreshness) return;
    if (convCategory !== 'Currency') {
      convRateFreshness.textContent = '';
      if (convRefreshRatesBtn) convRefreshRatesBtn.style.display = 'none';
      return;
    }

    if (convRefreshRatesBtn) convRefreshRatesBtn.style.display = 'inline';

    if (!ratesAreLive) {
      convRateFreshness.textContent = '⚠️ Fallback rate (last update attempt failed)';
      convRateFreshness.style.color = '#f59e0b';
    } else if (ratesAsOf) {
      const day = new Date(ratesAsOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      convRateFreshness.textContent = `Daily rates, as of ${day}. Live sites can differ slightly.`;
      convRateFreshness.style.color = '';
    } else if (ratesLastUpdated) {
      const mins = Math.round((Date.now() - ratesLastUpdated) / 60000);
      const when = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
      convRateFreshness.textContent = `Rates updated ${when}`;
      convRateFreshness.style.color = '';
    } else {
      convRateFreshness.textContent = '';
    }
  }

  if (convRefreshRatesBtn) {
    convRefreshRatesBtn.addEventListener('click', () => {
      convRefreshRatesBtn.disabled = true;
      convRefreshRatesBtn.textContent = '⏳';
      chrome.runtime.sendMessage({ action: 'REFRESH_EXCHANGE_RATES' }, () => {
        void chrome.runtime.lastError;
        fetchCurrencyRates();
        convRefreshRatesBtn.disabled = false;
        convRefreshRatesBtn.textContent = '🔄';
      });
    });
  }

  // Recalcule le résultat affiché avec les taux les plus récents, sans que
  // l'utilisateur ait besoin de retaper sa valeur
  function recomputeConversion() {
    if (convInputA.value) {
      const val = parseUserNumber(convInputA.value);
      if (!isNaN(val)) convInputB.value = roundConv(convert(val, convUnitA.value, convUnitB.value), convCategory);
    } else if (convInputB.value) {
      const val = parseUserNumber(convInputB.value);
      if (!isNaN(val)) convInputA.value = roundConv(convert(val, convUnitB.value, convUnitA.value), convCategory);
    }
  }

  // ---------- UNIT DATABASE ----------
  const unitCategories = {
    'Length': {
      icon: '📏', base: 'm',
      units: {
        'nm': { label: 'Nanometer (nm)', toBase: v => v / 1e9, fromBase: v => v * 1e9 },
        'µm': { label: 'Micrometer (µm)', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
        'mm': { label: 'Millimeter (mm)', toBase: v => v / 1000, fromBase: v => v * 1000 },
        'cm': { label: 'Centimeter (cm)', toBase: v => v / 100, fromBase: v => v * 100 },
        'dm': { label: 'Decimeter (dm)', toBase: v => v / 10, fromBase: v => v * 10 },
        'm': { label: 'Meter (m)', toBase: v => v, fromBase: v => v },
        'km': { label: 'Kilometer (km)', toBase: v => v * 1000, fromBase: v => v / 1000 },
        'in': { label: 'Inch (in)', toBase: v => v * 0.0254, fromBase: v => v / 0.0254 },
        'ft': { label: 'Foot (ft)', toBase: v => v * 0.3048, fromBase: v => v / 0.3048 },
        'yd': { label: 'Yard (yd)', toBase: v => v * 0.9144, fromBase: v => v / 0.9144 },
        'mi': { label: 'Mile (mi)', toBase: v => v * 1609.344, fromBase: v => v / 1609.344 },
        'nmi': { label: 'Nautical mile (nmi)', toBase: v => v * 1852, fromBase: v => v / 1852 },
        'ly': { label: 'Light-year (ly)', toBase: v => v * 9.461e15, fromBase: v => v / 9.461e15 },
      }
    },
    'Weight': {
      icon: '⚖️', base: 'kg',
      units: {
        'mg': { label: 'Milligram (mg)', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
        'g': { label: 'Gram (g)', toBase: v => v / 1000, fromBase: v => v * 1000 },
        'kg': { label: 'Kilogram (kg)', toBase: v => v, fromBase: v => v },
        't': { label: 'Tonne (t)', toBase: v => v * 1000, fromBase: v => v / 1000 },
        'oz': { label: 'Ounce (oz)', toBase: v => v * 0.0283495, fromBase: v => v / 0.0283495 },
        'lb': { label: 'Pound (lb)', toBase: v => v * 0.453592, fromBase: v => v / 0.453592 },
        'st': { label: 'Stone (st)', toBase: v => v * 6.35029, fromBase: v => v / 6.35029 },
        'ct': { label: 'Carat (ct)', toBase: v => v * 0.0002, fromBase: v => v / 0.0002 },
      }
    },
    'Volume': {
      icon: '🧪', base: 'L',
      units: {
        'mL': { label: 'Milliliter (mL)', toBase: v => v / 1000, fromBase: v => v * 1000 },
        'cL': { label: 'Centiliter (cL)', toBase: v => v / 100, fromBase: v => v * 100 },
        'dL': { label: 'Deciliter (dL)', toBase: v => v / 10, fromBase: v => v * 10 },
        'L': { label: 'Liter (L)', toBase: v => v, fromBase: v => v },
        'm3': { label: 'Cubic meter (m³)', toBase: v => v * 1000, fromBase: v => v / 1000 },
        'tsp': { label: 'Teaspoon', toBase: v => v * 0.00492892, fromBase: v => v / 0.00492892 },
        'tbsp': { label: 'Tablespoon', toBase: v => v * 0.0147868, fromBase: v => v / 0.0147868 },
        'cup': { label: 'Cup', toBase: v => v * 0.236588, fromBase: v => v / 0.236588 },
        'pt': { label: 'Pint (pt)', toBase: v => v * 0.473176, fromBase: v => v / 0.473176 },
        'galUS': { label: 'Gallon US (gal)', toBase: v => v * 3.78541, fromBase: v => v / 3.78541 },
        'galUK': { label: 'Gallon UK (gal)', toBase: v => v * 4.54609, fromBase: v => v / 4.54609 },
        'bbl': { label: 'Barrel (bbl)', toBase: v => v * 158.987, fromBase: v => v / 158.987 },
      }
    },
    'Temperature': {
      icon: '🌡️', base: 'C',
      units: {
        'C': { label: 'Celsius (°C)', toBase: v => v, fromBase: v => v },
        'F': { label: 'Fahrenheit (°F)', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
        'K': { label: 'Kelvin (K)', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
        'R': { label: 'Rankine (°R)', toBase: v => (v - 491.67) * 5 / 9, fromBase: v => v * 9 / 5 + 491.67 },
      }
    },
    'Area': {
      icon: '📐', base: 'm2',
      units: {
        'mm2': { label: 'mm²', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
        'cm2': { label: 'cm²', toBase: v => v / 1e4, fromBase: v => v * 1e4 },
        'm2': { label: 'm²', toBase: v => v, fromBase: v => v },
        'km2': { label: 'km²', toBase: v => v * 1e6, fromBase: v => v / 1e6 },
        'ha': { label: 'Hectare (ha)', toBase: v => v * 1e4, fromBase: v => v / 1e4 },
        'are': { label: 'Are (a)', toBase: v => v * 100, fromBase: v => v / 100 },
        'ac': { label: 'Acre (ac)', toBase: v => v * 4046.86, fromBase: v => v / 4046.86 },
        'sqft': { label: 'Square foot (ft²)', toBase: v => v * 0.092903, fromBase: v => v / 0.092903 },
        'sqmi': { label: 'Square mile (mi²)', toBase: v => v * 2.59e6, fromBase: v => v / 2.59e6 },
      }
    },
    'Speed': {
      icon: '🚀', base: 'ms',
      units: {
        'ms': { label: 'm/s', toBase: v => v, fromBase: v => v },
        'kmh': { label: 'km/h', toBase: v => v / 3.6, fromBase: v => v * 3.6 },
        'mph': { label: 'mph', toBase: v => v * 0.44704, fromBase: v => v / 0.44704 },
        'kn': { label: 'Knot (kn)', toBase: v => v * 0.514444, fromBase: v => v / 0.514444 },
        'mach': { label: 'Mach', toBase: v => v * 340.29, fromBase: v => v / 340.29 },
      }
    },
    'Time': {
      icon: '⏱️', base: 's',
      units: {
        'ns': { label: 'Nanosecond (ns)', toBase: v => v / 1e9, fromBase: v => v * 1e9 },
        'µs': { label: 'Microsecond (µs)', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
        'ms': { label: 'Millisecond (ms)', toBase: v => v / 1000, fromBase: v => v * 1000 },
        's': { label: 'Second (s)', toBase: v => v, fromBase: v => v },
        'min': { label: 'Minute (min)', toBase: v => v * 60, fromBase: v => v / 60 },
        'h': { label: 'Hour (h)', toBase: v => v * 3600, fromBase: v => v / 3600 },
        'j': { label: 'Day (d)', toBase: v => v * 86400, fromBase: v => v / 86400 },
        'sem': { label: 'Week', toBase: v => v * 604800, fromBase: v => v / 604800 },
        'mois': { label: 'Month (30d)', toBase: v => v * 2592000, fromBase: v => v / 2592000 },
        'an': { label: 'Year (365d)', toBase: v => v * 31536000, fromBase: v => v / 31536000 },
        'dec': { label: 'Decade', toBase: v => v * 315360000, fromBase: v => v / 315360000 },
        'siecle': { label: 'Century', toBase: v => v * 3153600000, fromBase: v => v / 3153600000 },
        'mill': { label: 'Millennium', toBase: v => v * 31536000000, fromBase: v => v / 31536000000 },
      }
    },
    'Currency': {
      icon: '💰', base: 'USD',
      units: {} // Built dynamically
    }
  };

  function buildCurrencyUnits() {
    const cur = unitCategories['Currency'];
    cur.units = {};
    currencyMeta.forEach(cm => {
      const rate = currencyRates[cm.code] || fallbackRates[cm.code] || 1;
      cur.units[cm.code] = {
        label: `${cm.flag} ${cm.code} ${cm.symbol}`,
        toBase: v => v / (currencyRates[cm.code] || rate),
        fromBase: v => v * (currencyRates[cm.code] || rate),
      };
    });
    // If converter is already showing Currency, refresh dropdowns
    if (convCategory === 'Currency') {
      populateUnitDropdowns();
      renderCountryTable();
    }
  }

  // ---------- STATE ----------
  let convCategory = 'Length';

  // Build with fallback first
  currencyMeta.forEach(cm => { currencyRates[cm.code] = fallbackRates[cm.code] || 1; });
  buildCurrencyUnits();

  // Then fetch real rates
  fetchCurrencyRates();

  function getCatData() { return unitCategories[convCategory]; }

  // ---------- RENDER CATEGORIES ----------
  const convCatSelect = document.getElementById('convCategorySelect');





  let isCatSelectInit = false;
  function initConvCategories() {
    convCatSelect.innerHTML = '';
    for (const [name, cat] of Object.entries(unitCategories)) {
      const opt = new Option(cat.icon + ' ' + name, name);
      convCatSelect.appendChild(opt);
    }
    convCatSelect.value = convCategory;

    if (!isCatSelectInit) {
      convCatSelect.addEventListener('change', (e) => {
        convCategory = e.target.value;
        populateUnitDropdowns();
        updateConvLabels();
        clearConvInputs();
        toggleCurrencyTable();
        updateRateFreshnessUI();
      });
      isCatSelectInit = true;
    }
  }

  // ---------- POPULATE DROPDOWNS ----------
  function populateUnitDropdowns() {
    const cat = getCatData();
    const keys = Object.keys(cat.units);
    const prevA = convUnitA.value;
    const prevB = convUnitB.value;

    convUnitA.innerHTML = '';
    convUnitB.innerHTML = '';
    keys.forEach(key => {
      const optA = new Option(cat.units[key].label, key);
      const optB = new Option(cat.units[key].label, key);
      convUnitA.appendChild(optA);
      convUnitB.appendChild(optB);
    });

    // Restore previous selection or default to first two
    if (keys.includes(prevA)) { convUnitA.value = prevA; }
    else if (keys.length >= 1) { convUnitA.value = keys[0]; }

    if (keys.includes(prevB)) { convUnitB.value = prevB; }
    else if (keys.length >= 2) { convUnitB.value = keys[1]; }
  }

  // ---------- LABELS ----------
  function updateConvLabels() {
    const cat = getCatData();
    updateRateInfo();
  }

  function updateRateInfo() {
    const cat = getCatData();
    const uA = convUnitA.value;
    const uB = convUnitB.value;
    if (!cat.units[uA] || !cat.units[uB]) return;
    const converted = cat.units[uB].fromBase(cat.units[uA].toBase(1));
    // 6 significant figures, not 8 raw decimal places — "1.1564" reads,
    // "1.15640492" doesn't.
    const rounded = converted === 0 ? 0 : Number(converted.toPrecision(6));
    // show what the user sees in the lists ("d", "km/h", "m²"), not the internal keys
    const sym = (key) => {
      if (convCategory === 'Currency') return key;
      const label = cat.units[key].label, m = /\(([^)]+)\)\s*$/.exec(label);
      return m ? m[1] : label;
    };
    convRateInfo.textContent = `1 ${sym(uA)} = ${rounded} ${sym(uB)}`;
  }

  // ---------- CURRENCY TABLE ----------
  function toggleCurrencyTable() {
    if (convCategory === 'Currency') {
      convCurrencyTable.style.display = 'block';
      document.getElementById('convRatesCredit').style.display = '';
      renderCountryTable();
    } else {
      convCurrencyTable.style.display = 'none';
      document.getElementById('convRatesCredit').style.display = 'none';
    }
  }

  function renderCountryTable(filter = '') {
    const query = filter.toLowerCase();
    let html = '<div class="conv-country-grid">';

    currencyMeta.forEach(cm => {
      const stored = Number(currencyRates[cm.code]);
      const rate = Number.isFinite(stored) && stored > 0 ? stored : (fallbackRates[cm.code] || '—');
      const searchStr = `${cm.country} ${cm.name} ${cm.code} ${cm.symbol}`.toLowerCase();
      if (query && !searchStr.includes(query)) return;

      const rateStr = typeof rate === 'number' ? (rate < 0.01 ? rate.toExponential(4) : rate.toFixed(rate < 10 ? 4 : 2)) : rate;
      html += `
        <div class="conv-currency-card" data-code="${cm.code}">
          <div class="conv-currency-flag">${cm.flag}</div>
          <div class="conv-currency-info">
            <span class="conv-currency-code">${cm.code}</span>
            <span class="conv-currency-rate">${rateStr}</span>
          </div>
        </div>`;
    });

    html += '</div>';
    convCountryList.innerHTML = html;

    // Add click listeners to cards
    const cards = convCountryList.querySelectorAll('.conv-currency-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const code = card.getAttribute('data-code');
        // Auto-select EUR as base (Unit A) and clicked currency as target (Unit B)
        convUnitA.value = 'EUR';
        convUnitB.value = code;
        updateConvLabels();

        // Ensure starting value is 1 if empty
        if (!convInputA.value) {
          convInputA.value = '1';
        }

        // Trigger conversion immediately
        const val = parseUserNumber(convInputA.value);
        if (!isNaN(val)) {
          convInputB.value = roundConv(convert(val, convUnitA.value, convUnitB.value), convCategory);
        }
      });
    });
  }

  // --- INITIALIZATION ---
  initConvCategories();
  populateUnitDropdowns();
  updateConvLabels();
  toggleCurrencyTable();


  convCountrySearch.addEventListener('input', () => {
    renderCountryTable(convCountrySearch.value.trim());
  });

  // ---------- CONVERSION ----------
  function convert(value, fromKey, toKey) {
    const cat = getCatData();
    const from = cat.units[fromKey];
    const to = cat.units[toKey];
    if (!from || !to) return NaN;
    const base = from.toBase(value);
    return to.fromBase(base);
  }

  // La monnaie n'a pas besoin de 8 décimales pour être lisible ; les autres
  // catégories gardent plus de précision (utile pour les petites unités scientifiques)
  function roundConv(v, category) {
    if (isNaN(v)) return '';
    if (Math.abs(v) < 0.000001 && v !== 0) return v.toExponential(4);
    // small values keep their significant digits (1 VND in GBP must not read 0)
    if (Math.abs(v) < 1 && v !== 0) return Number(v.toPrecision(6));
    if (category === 'Currency') {
      const decimals = Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 3 : 4;
      return Math.round(v * 10 ** decimals) / 10 ** decimals;
    }
    return Math.round(v * 1e8) / 1e8;
  }

  function clearConvInputs() {
    convInputA.value = '';
    convInputB.value = '';
  }

  // ---------- EVENT LISTENERS ----------
  convInputA.addEventListener('input', () => {
    const val = parseUserNumber(convInputA.value);
    if (isNaN(val)) { convInputB.value = ''; return; }
    convInputB.value = roundConv(convert(val, convUnitA.value, convUnitB.value), convCategory);
  });

  convInputB.addEventListener('input', () => {
    const val = parseUserNumber(convInputB.value);
    if (isNaN(val)) { convInputA.value = ''; return; }
    convInputA.value = roundConv(convert(val, convUnitB.value, convUnitA.value), convCategory);
  });

  convUnitA.addEventListener('change', () => {
    updateConvLabels();
    if (convInputA.value) {
      const val = parseUserNumber(convInputA.value);
      if (!isNaN(val)) convInputB.value = roundConv(convert(val, convUnitA.value, convUnitB.value), convCategory);
    }
  });

  convUnitB.addEventListener('change', () => {
    updateConvLabels();
    if (convInputA.value) {
      const val = parseUserNumber(convInputA.value);
      if (!isNaN(val)) convInputB.value = roundConv(convert(val, convUnitA.value, convUnitB.value), convCategory);
    }
  });

  convCopyA.addEventListener('click', () => { if (convInputA.value) copyText(String(convInputA.value)); });
  convCopyB.addEventListener('click', () => { if (convInputB.value) copyText(String(convInputB.value)); });

  convSwapBtn.addEventListener('click', () => {
    const tmpUnit = convUnitA.value;
    const tmpVal = convInputA.value;
    convUnitA.value = convUnitB.value;
    convUnitB.value = tmpUnit;
    convInputA.value = convInputB.value;
    convInputB.value = tmpVal;
    updateConvLabels();
  });


  // @module 25-audio-and-pomodoro  (dev/popup-src/25-audio-and-pomodoro.js)
  // ── AudioContext (lazy) ──
  let audioCtx = null;
  function initAudioCtx() {
    if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function playAlarm() {
    initAudioCtx();
    if (!audioCtx) return;
    [0, 0.15, 0.30, 0.45].forEach(t => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime + t);
      g.gain.setValueAtTime(0.5, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.4);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + t); osc.stop(audioCtx.currentTime + t + 0.4);
    });
  }

  // ── Tab switch: Timer / Chrono ──
  const tmrTabTimer     = document.getElementById('tmrTabTimer');
  const tmrTabStopwatch = document.getElementById('tmrTabStopwatch');
  const tmrView         = document.getElementById('tmrView');
  const swView          = document.getElementById('swView');

  const tmrTabPomodoro = document.getElementById('tmrTabPomodoro');
  const pomoView = document.getElementById('pomoView');
  const tmrModes = [[tmrTabTimer, tmrView], [tmrTabStopwatch, swView], [tmrTabPomodoro, pomoView]];
  tmrModes.forEach(([tab, view]) => {
    if (!tab || !view) return;
    tab.addEventListener('click', () => {
      tmrModes.forEach(([t, v]) => { if (t) t.classList.toggle('active', t === tab); if (v) v.style.display = v === view ? '' : 'none'; });
      // keep focus off the tab so Space reaches the stopwatch hotkeys instead of re-clicking the tab
      tab.blur();
    });
  });

  // ── Pomodoro: a list of steps (name, duration, colour) played in order ──
  // The state lives in storage; the service worker moves to the next step when
  // the popup is closed (same rule as advance() below, see background.js).
  (function initPomodoro() {
    if (!pomoView) return;
    const el = (id) => document.getElementById(id);
    const timeEl = el('pomoTime'), phaseEl = el('pomoPhase'), dotsEl = el('pomoDots'), nextEl = el('pomoNext');
    const startBtn = el('pomoStartBtn'), resetBtn = el('pomoResetBtn'), skipBtn = el('pomoSkipBtn');
    const stepsEl = el('pomoSteps'), addBtn = el('pomoAddBtn'), classicBtn = el('pomoClassicBtn'), loopBox = el('pomoLoop');
    const orb = window.WBOrb ? WBOrb.create(el('pomoOrb'), { size: 140, seed: 23 }) : null;
    const COLORS = (window.WBOrb && WBOrb.colors) || ['violet', 'green'];
    const css = (c) => window.WBOrb ? WBOrb.css(c) : '#7c3aed';
    const MAX_STEPS = 12, MIN_SEC = 5, MAX_SEC = 180 * 60;
    let st = null, raf = null;

    const mk = (name, sec, color) => ({ name, sec, color });
    const basic = () => [mk('Focus', 1500, 'violet'), mk('Break', 300, 'green')];
    const classic = () => [1, 2, 3, 4].flatMap(i => [mk('Focus ' + i, 1500, 'violet'), i < 4 ? mk('Break', 300, 'green') : mk('Long break', 900, 'blue')]);
    const fresh = () => ({ running: false, idx: 0, endTime: 0, remaining: 0, loop: true, steps: basic() });
    // own writes come back through storage.onChanged: remember them so they are not mistaken for the worker's
    const ownWrites = [];
    // chrome.storage hands objects back with their keys sorted, so compare in a key-order-independent form
    const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, key) => { a[key] = v[key]; return a; }, {}) : v));
    let saveTimer = null;
    const save = () => {
      clearTimeout(saveTimer); saveTimer = null;
      ownWrites.push(canon(st)); if (ownWrites.length > 20) ownWrites.shift();
      chrome.storage.local.set({ pomoState: st });
    };
    // typing and colour dragging: one write once the user pauses
    const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
    window.addEventListener('pagehide', () => { if (saveTimer) save(); });
    const stepMs = (i) => Math.max(MIN_SEC, st.steps[i].sec) * 1000;
    const fmt = (sec) => tmrPad(Math.floor(sec / 60)) + ':' + tmrPad(sec % 60);
    const isActive = () => st.running || st.remaining > 0 || st.idx > 0;

    // returns false when the sequence is over (last step, loop off)
    function advance(s, now) {
      const late = now - s.endTime > 60000;
      let i = s.idx + 1;
      if (i >= s.steps.length) {
        if (!s.loop) { s.running = false; s.idx = 0; s.endTime = 0; s.remaining = 0; return false; }
        i = 0;
      }
      s.idx = i;
      s.endTime = (late || !s.endTime ? now : s.endTime) + Math.max(MIN_SEC, s.steps[i].sec) * 1000;
      return true;
    }

    function remaining() {
      if (st.running) return Math.max(0, st.endTime - Date.now());
      return st.remaining > 0 ? st.remaining : stepMs(st.idx);
    }

    function render() {
      const step = st.steps[st.idx], ms = remaining();
      timeEl.textContent = fmt(Math.ceil(ms / 1000));
      phaseEl.textContent = step.name || 'Step ' + (st.idx + 1);
      phaseEl.style.color = timeEl.style.color = step.color === 'violet' ? '' : (window.WBOrb ? WBOrb.text(step.color) : '');
      const active = isActive();
      pomoView.classList.toggle('is-active', active);
      if (orb) { orb.setColor(step.color); orb.setLit(ms / stepMs(st.idx)); orb.setRunning(st.running); }
      if (dotsEl.children.length !== st.steps.length) { dotsEl.textContent = ''; st.steps.forEach(() => dotsEl.appendChild(document.createElement('i'))); }
      [...dotsEl.children].forEach((d, i) => { d.style.background = d.style.color = css(st.steps[i].color); d.className = i < st.idx ? 'done' : (i === st.idx ? 'now' : ''); });
      startBtn.textContent = st.running ? '⏸ Pause' : (st.remaining > 0 ? '▶ Resume' : '▶ Start');
      startBtn.classList.toggle('running', st.running);
      resetBtn.disabled = !active;
      skipBtn.disabled = st.steps.length < 2;
      const ni = st.idx + 1 < st.steps.length ? st.idx + 1 : (st.loop ? 0 : -1);
      nextEl.textContent = ni < 0 ? 'Last step' : 'Next: ' + (st.steps[ni].name || 'Step ' + (ni + 1)) + ' · ' + fmt(Math.max(MIN_SEC, st.steps[ni].sec));
    }

    function tick() {
      if (!st.running) return;
      if (Date.now() >= st.endTime) {
        const goes = advance(st, Date.now()); save(); playAlarm(); if (orb) orb.pulse();
        if (!goes) { render(); return; }
      }
      render();
      raf = requestAnimationFrame(tick);
    }

    // ── colour wheel: hue around the circle, paler towards the centre ──
    const validColor = (c) => COLORS.includes(c) || /^#[0-9a-f]{6}$/i.test(c);
    const cleanSteps = (list, minSec) => (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object').slice(0, MAX_STEPS)
      .map(x => mk(String(x.name || '').slice(0, 18), Math.min(MAX_SEC, Math.max(minSec, parseInt(x.sec, 10) || 0)), validColor(x.color) ? x.color : 'violet'));
    let wheel = null;
    function buildWheel() {
      const pop = document.createElement('div'); pop.className = 'pomo-wheel-pop'; pop.hidden = true;
      const wrap = document.createElement('div'); wrap.className = 'pomo-wheel';
      const cv = document.createElement('canvas'); const SZ = 132, dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = SZ * dpr; cv.style.width = cv.style.height = SZ + 'px';
      const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height), R = cv.width / 2;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const dx = x + 0.5 - R, dy = y + 0.5 - R, r = Math.sqrt(dx * dx + dy * dy), o = (y * cv.width + x) * 4;
        if (r > R) continue;
        const rgb = hsvRgb((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1, Math.min(1, r / (R * 0.96)));
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2];
        img.data[o + 3] = Math.round(255 * Math.min(1, R - r)); // soft edge
      }
      g.putImageData(img, 0, 0);
      const mark = document.createElement('i'); mark.className = 'pomo-wheel-mark';
      wrap.append(cv, mark);
      const row = document.createElement('div'); row.className = 'pomo-wheel-presets';
      COLORS.forEach(c => { const b = document.createElement('button'); b.className = 'pomo-color'; b.style.background = css(c); b.title = c; b.addEventListener('click', () => { wheel.apply(c); mark.hidden = true; }); row.appendChild(b); });
      pop.append(wrap, row); pomoView.appendChild(pop);
      const pick = (e) => {
        const b = cv.getBoundingClientRect(), half = b.width / 2;
        let dx = e.clientX - b.left - half, dy = e.clientY - b.top - half; const r = Math.sqrt(dx * dx + dy * dy);
        if (r > half) { dx *= half / r; dy *= half / r; }
        const rgb = hsvRgb((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1, Math.min(1, Math.sqrt(dx * dx + dy * dy) / (half * 0.96)));
        mark.hidden = false; mark.style.left = (half + dx) + 'px'; mark.style.top = (half + dy) + 'px';
        wheel.apply('#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''));
      };
      let drag = false;
      cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); pick(e); });
      cv.addEventListener('pointermove', (e) => { if (drag) pick(e); });
      cv.addEventListener('pointerup', () => { drag = false; });
      pop.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', () => { pop.hidden = true; });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });
      return { pop, mark, apply() {} };
    }
    function hsvRgb(h, sat) {
      const i = Math.floor(h * 6), f = h * 6 - i, p = 1 - sat, q = 1 - f * sat, t = 1 - (1 - f) * sat;
      const c = [[1, t, p], [q, 1, p], [p, 1, t], [p, q, 1], [t, p, 1], [1, p, q]][i % 6];
      return c.map(v => Math.round(v * 255));
    }
    function openWheel(step, dot) {
      if (!wheel) wheel = buildWheel();
      wheel.apply = (c) => { step.color = c; dot.style.background = css(c); saveSoon(); render(); markCurrentPreset(); };
      wheel.mark.hidden = true;
      wheel.pop.hidden = false;
      // sit just above the step editor, never lower than the edited row and never outside the popup
      const pop = wheel.pop, host = pomoView.getBoundingClientRect(), h = pop.offsetHeight;
      const limit = Math.min(el('pomoEditor').getBoundingClientRect().top, dot.getBoundingClientRect().top) - 6;
      const top = Math.max(4, Math.min(limit, window.innerHeight - 4) - h);
      pop.style.bottom = 'auto';
      pop.style.top = (top - host.top) + 'px';
    }

    // ── step editor (only shown while nothing is running) ──
    function renderEditor() {
      stepsEl.textContent = '';
      st.steps.forEach((step, i) => {
        const row = document.createElement('div'); row.className = 'pomo-step';
        const dot = document.createElement('button'); dot.className = 'pomo-color'; dot.title = 'Change color'; dot.style.background = css(step.color);
        dot.addEventListener('click', (e) => { e.stopPropagation(); openWheel(step, dot); });
        const name = document.createElement('input'); name.className = 'pomo-name'; name.type = 'text'; name.maxLength = 18; name.value = step.name; name.placeholder = 'Step ' + (i + 1); name.setAttribute('aria-label', 'Step name');
        name.addEventListener('input', () => { step.name = name.value.trim(); saveSoon(); render(); markCurrentPreset(); });
        const num = (val, max, label) => { const n = document.createElement('input'); n.className = 'pomo-num'; n.type = 'number'; n.min = 0; n.max = max; n.value = val; n.setAttribute('aria-label', label); return n; };
        const mm = num(Math.floor(step.sec / 60), 180, 'Minutes'), ss = num(step.sec % 60, 59, 'Seconds');
        const readTime = () => { const m = Math.max(0, parseInt(mm.value, 10) || 0), s2 = Math.min(59, Math.max(0, parseInt(ss.value, 10) || 0)); step.sec = Math.min(MAX_SEC, m * 60 + s2); saveSoon(); render(); markCurrentPreset(); };
        mm.addEventListener('input', readTime); ss.addEventListener('input', readTime);
        // tidy the two boxes only once the user has left both of them
        const tidy = () => setTimeout(() => { if (document.activeElement === mm || document.activeElement === ss) return; step.sec = Math.max(MIN_SEC, step.sec); mm.value = Math.floor(step.sec / 60); ss.value = step.sec % 60; save(); render(); markCurrentPreset(); }, 0);
        mm.addEventListener('blur', tidy); ss.addEventListener('blur', tidy);
        const sep = document.createElement('b'); sep.textContent = ':';
        const del = document.createElement('button'); del.className = 'pomo-del'; del.textContent = '✕'; del.title = 'Remove this step'; del.disabled = st.steps.length <= 1;
        del.addEventListener('click', () => { st.steps.splice(i, 1); st.idx = 0; save(); renderEditor(); render(); });
        row.append(dot, name, mm, sep, ss, del); stepsEl.appendChild(row);
      });
      addBtn.disabled = st.steps.length >= MAX_STEPS;
      loopBox.checked = !!st.loop;
      renderPresets();
    }

    // ── saved sequences: name + steps + loop, kept in their own storage key ──
    const presetName = el('pomoPresetName'), saveBtn = el('pomoSaveBtn'), presetsEl = el('pomoPresets');
    const MAX_PRESETS = 8;
    let presets = [];
    const sameSteps = (a, b) => a.length === b.length && a.every((x, i) => x.name === b[i].name && x.sec === b[i].sec && x.color === b[i].color);
    function markCurrentPreset() {
      presets.forEach((pr, i) => {
        const chip = presetsEl.children[i];
        if (chip) chip.classList.toggle('current', sameSteps(pr.steps, st.steps) && !!pr.loop === !!st.loop);
      });
    }
    function renderPresets() {
      presetsEl.textContent = '';
      presets.forEach((pr, i) => {
        const chip = document.createElement('span');
        chip.className = 'pomo-preset';
        const use = document.createElement('button'); use.textContent = pr.name; use.title = 'Load "' + pr.name + '" (' + pr.steps.length + ' steps)';
        use.addEventListener('click', () => { st.steps = pr.steps.map(x => mk(x.name, x.sec, x.color)); st.loop = !!pr.loop; st.idx = 0; save(); renderEditor(); render(); showToast('Loaded: ' + pr.name); });
        const del = document.createElement('button'); del.className = 'pomo-preset-del'; del.textContent = '✕'; del.title = 'Delete this saved sequence';
        del.addEventListener('click', () => { presets.splice(i, 1); chrome.storage.local.set({ pomoPresets: presets }); renderPresets(); });
        chip.append(use, del); presetsEl.appendChild(chip);
      });
      markCurrentPreset();
    }
    function savePreset() {
      const name = presetName.value.trim().slice(0, 16);
      if (!name) { presetName.focus(); showToast('Give the sequence a name first'); return; }
      const entry = { name, loop: !!st.loop, steps: st.steps.map(x => mk(x.name, Math.max(MIN_SEC, x.sec), x.color)) };
      const at = presets.findIndex(pr => pr.name.toLowerCase() === name.toLowerCase());
      if (at >= 0) presets[at] = entry;
      else { if (presets.length >= MAX_PRESETS) { showToast('Limit reached: delete a saved sequence first'); return; } presets.push(entry); }
      chrome.storage.local.set({ pomoPresets: presets });
      presetName.value = ''; renderPresets(); showToast(at >= 0 ? 'Updated: ' + name : 'Saved: ' + name);
    }
    saveBtn.addEventListener('click', savePreset);
    presetName.addEventListener('keydown', (e) => { if (e.key === 'Enter') savePreset(); });
    chrome.storage.local.get('pomoPresets', (d) => {
      presets = (Array.isArray(d && d.pomoPresets) ? d.pomoPresets : [])
        .filter(pr => pr && typeof pr === 'object' && typeof pr.name === 'string' && pr.name.trim() && Array.isArray(pr.steps))
        .map(pr => ({ name: pr.name.trim().slice(0, 16), loop: !!pr.loop, steps: cleanSteps(pr.steps, MIN_SEC) }))
        .filter(pr => pr.steps.length).slice(0, MAX_PRESETS);
      if (st) renderPresets();
    });

    addBtn.addEventListener('click', () => {
      if (st.steps.length >= MAX_STEPS) return;
      const used = st.steps.map(x => x.color);
      st.steps.push(mk('', 300, COLORS.find(c => !used.includes(c)) || COLORS[st.steps.length % COLORS.length]));
      save(); renderEditor(); render();
      stepsEl.scrollTop = stepsEl.scrollHeight;
      const inputs = stepsEl.querySelectorAll('.pomo-name'); if (inputs.length) inputs[inputs.length - 1].focus();
    });
    classicBtn.addEventListener('click', () => { st.steps = classic(); st.idx = 0; st.loop = true; save(); renderEditor(); render(); });
    loopBox.addEventListener('change', () => { st.loop = loopBox.checked; save(); render(); renderPresets(); });

    startBtn.addEventListener('click', () => {
      cancelAnimationFrame(raf);
      if (st.running) { st.remaining = Math.max(0, st.endTime - Date.now()); st.running = false; }
      else {
        st.steps.forEach(x => { x.sec = Math.max(MIN_SEC, x.sec); });
        st.endTime = Date.now() + (st.remaining > 0 ? st.remaining : stepMs(st.idx));
        st.remaining = 0; st.running = true;
        raf = requestAnimationFrame(tick);
      }
      save(); render();
    });
    resetBtn.addEventListener('click', () => {
      cancelAnimationFrame(raf);
      st.running = false; st.idx = 0; st.endTime = 0; st.remaining = 0;
      save(); renderEditor(); render();
    });
    skipBtn.addEventListener('click', () => {
      const was = st.running; cancelAnimationFrame(raf);
      st.endTime = Date.now();
      const goes = advance(st, Date.now());
      if (!was || !goes) { st.running = false; st.remaining = 0; st.endTime = 0; }
      else raf = requestAnimationFrame(tick);
      save(); renderEditor(); render();
    });

    function load(saved) {
      const src = saved && typeof saved === 'object' ? saved : {};
      const steps = cleanSteps(src.steps, 0);
      st = fresh();
      // no usable step list (corrupted, or the old phase/cfg format): start again from the default
      if (steps.length) {
        st.steps = steps;
        st.loop = src.loop !== false;
        if (Number.isInteger(src.idx) && src.idx >= 0 && src.idx < steps.length) st.idx = src.idx;
        const fin = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
        st.endTime = fin(src.endTime);
        st.running = src.running === true && st.endTime > 0;
        st.remaining = st.running ? 0 : Math.min(fin(src.remaining), stepMs(st.idx));
        if (!st.running) st.endTime = 0;
      }
      cancelAnimationFrame(raf);
      const now = Date.now();
      // an end time further away than the step itself cannot be right
      if (st.running && st.endTime - now > stepMs(st.idx)) st.endTime = now + stepMs(st.idx);
      // catch up on every step that ended while the popup was closed
      let guard = 0;
      while (st.running && now >= st.endTime && guard < 200) { guard++; if (!advance(st, st.endTime + 1)) break; }
      // still behind after 200 steps: stop chasing and restart the current step from now
      if (st.running && now >= st.endTime) st.endTime = now + stepMs(st.idx);
      if (saved !== undefined && canon(st) !== canon(saved)) save();
      renderEditor(); render();
      if (st.running) raf = requestAnimationFrame(tick);
    }
    chrome.storage.local.get('pomoState', (d) => load(d && d.pomoState));
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local' || !ch.pomoState || !st) return;
      const nv = ch.pomoState.newValue;
      const own = ownWrites.indexOf(canon(nv));
      if (own >= 0) { ownWrites.splice(0, own + 1); return; }
      if (nv === undefined) return;
      const wasRunning = st.running, wasIdx = st.idx;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      load(nv);
      // the service worker moved to the next step while the popup was open
      if (wasRunning && st.idx !== wasIdx) { playAlarm(); if (orb) orb.pulse(); }
    });
  })();

  // @module 26-timer-and-stopwatch  (dev/popup-src/26-timer-and-stopwatch.js)
  // ────────────────────────────────────────────
  // COMPTEUR À ROULEAUX — partagé entre Minuteur et Chronomètre
  // Chaque chiffre est une petite fenêtre (overflow hidden) : l'ancienne
  // valeur glisse vers le haut pendant que la nouvelle prend sa place.
  // ────────────────────────────────────────────
  const ROLL_MS = 260;

  function rollDigit(span, newChar) {
    const oldChar = span.dataset.val !== undefined ? span.dataset.val : newChar;
    span.dataset.val = newChar;
    if (oldChar === newChar) return;
    clearTimeout(span._rollCleanup);
    span.innerHTML = `<span class="roll-digit-inner"><span class="roll-digit-old">${oldChar}</span><span class="roll-digit-new">${newChar}</span></span>`;
    const inner = span.firstElementChild;
    requestAnimationFrame(() => requestAnimationFrame(() => { inner.style.transform = 'translateY(-1em)'; }));
    span._rollCleanup = setTimeout(() => { span.textContent = newChar; }, ROLL_MS);
  }

  // Rend un groupe de type "05:00" : reconstruit les chiffres si leur nombre
  // change (ex: l'heure apparaît), sinon fait rouler seulement ceux qui ont changé.
  function renderRollGroup(groupEl, text) {
    if (!groupEl) return;
    const chars = text.split('');
    if (groupEl.dataset.len !== String(chars.length)) {
      Array.from(groupEl.children).forEach(span => clearTimeout(span._rollCleanup));
      groupEl.innerHTML = chars.map(c =>
        c === ':' ? `<span class="roll-sep">${c}</span>` : `<span class="roll-digit" data-val="${c}">${c}</span>`
      ).join('');
      groupEl.dataset.len = String(chars.length);
      groupEl.dataset.text = text;
      return;
    }
    if (groupEl.dataset.text === text) return;
    chars.forEach((c, i) => {
      const el = groupEl.children[i];
      if (el && el.classList.contains('roll-digit')) rollDigit(el, c);
    });
    groupEl.dataset.text = text;
  }

  // Reconstruit un groupe instantanément, sans animation (reset, restauration d'état).
  function setRollGroupInstant(groupEl, text) {
    if (!groupEl) return;
    Array.from(groupEl.children).forEach(span => clearTimeout(span._rollCleanup));
    groupEl.innerHTML = text.split('').map(c =>
      c === ':' ? `<span class="roll-sep">${c}</span>` : `<span class="roll-digit" data-val="${c}">${c}</span>`
    ).join('');
    groupEl.dataset.len = String(text.length);
    groupEl.dataset.text = text;
  }

  // ────────────────────────────────────────────
  // MINUTEUR
  // ────────────────────────────────────────────
  const tmrDisplay      = document.getElementById('tmrDisplay');
  const tmrMainGroup    = document.getElementById('tmrMainGroup');
  const tmrMsGroup      = document.getElementById('tmrMsGroup');
  const tmrHours        = document.getElementById('tmrHours');
  const tmrMinutes      = document.getElementById('tmrMinutes');
  const tmrSeconds      = document.getElementById('tmrSeconds');
  const tmrStartBtn     = document.getElementById('tmrStartBtn');
  const tmrResetBtn     = document.getElementById('tmrResetBtn');

  setRollGroupInstant(tmrMainGroup, '00:00');
  if (tmrMsGroup) tmrMsGroup.textContent = '00';

  let tmrTotalMs = 0, tmrRemaining = 0, tmrEndTime = 0;
  let tmrRunning = false, tmrRafId = null, tmrAlarmTimer = null;

  function tmrPad(n) { return String(n).padStart(2, '0'); }
  // Sépare le temps en "grand" (h:m:s) et "petit" (centièmes) pour l'affichage —
  // les centièmes donnent le niveau de détail demandé sans alourdir la lecture
  // du temps principal.
  function tmrFormatParts(ms) {
    if (ms < 0) ms = 0;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    const main = h > 0 ? `${tmrPad(h)}:${tmrPad(m)}:${tmrPad(s)}` : `${tmrPad(m)}:${tmrPad(s)}`;
    return { main, cs: tmrPad(cs) };
  }

  // Suit les mêmes couleurs que la barre de progression : vert quand il reste
  // du temps, ça vire au rouge à l'approche de zéro.
  const TMR_COLOR_STOPS = [
    [0,   [239, 68, 68]],
    [33,  [249, 115, 22]],
    [66,  [234, 179, 8]],
    [100, [34, 197, 94]]
  ];
  function tmrColorForPct(pct) {
    pct = Math.max(0, Math.min(100, pct));
    let lo = TMR_COLOR_STOPS[0], hi = TMR_COLOR_STOPS[TMR_COLOR_STOPS.length - 1];
    for (let i = 0; i < TMR_COLOR_STOPS.length - 1; i++) {
      if (pct >= TMR_COLOR_STOPS[i][0] && pct <= TMR_COLOR_STOPS[i + 1][0]) {
        lo = TMR_COLOR_STOPS[i]; hi = TMR_COLOR_STOPS[i + 1]; break;
      }
    }
    const range = hi[0] - lo[0] || 1;
    const t = (pct - lo[0]) / range;
    const rgb = lo[1].map((c, i) => Math.round(c + (hi[1][i] - c) * t));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  const tmrOrb = window.WBOrb ? WBOrb.create(document.getElementById('tmrOrb'), { size: 170, seed: 11 }) : null;

  function tmrRender() {
    const pct = tmrTotalMs > 0 ? Math.max(0, tmrRemaining / tmrTotalMs * 100) : 100;
    if (tmrOrb) { tmrOrb.setLit(pct / 100); tmrOrb.setRunning(!!tmrRunning); }
    const parts = tmrFormatParts(tmrRemaining);
    renderRollGroup(tmrMainGroup, parts.main);
    if (tmrMsGroup) tmrMsGroup.textContent = parts.cs;
    if (tmrDisplay) tmrDisplay.style.color = tmrColorForPct(pct);
    if (tmrView) tmrView.classList.toggle('is-running', !!tmrRunning);
  }

  // Partagée entre la fin naturelle (tmrTick) et la fin détectée au réveil du
  // popup (loadTimerState) — dans les deux cas l'utilisateur doit avoir un
  // retour visuel + sonore, pas juste un state discrètement nettoyé.
  function tmrFinish() {
    tmrRunning = false;
    cancelAnimationFrame(tmrRafId);
    tmrRemaining = 0;
    tmrRender();
    if (tmrStartBtn) tmrStartBtn.textContent = '▶ Start';
    if (tmrDisplay) { tmrDisplay.classList.add('flash'); tmrDisplay.classList.remove('tmr-running'); }
    playAlarm();
    clearInterval(tmrAlarmTimer);
    tmrAlarmTimer = setInterval(playAlarm, 4000);
    setTimeout(() => { clearInterval(tmrAlarmTimer); if (tmrDisplay) tmrDisplay.classList.remove('flash'); }, 16000);
    chrome.storage.local.remove('tmrState');
  }

  function tmrTick() {
    if (!tmrRunning) return;
    tmrRemaining = tmrEndTime - Date.now();
    if (tmrRemaining <= 0) { tmrFinish(); return; }
    tmrRender();
    tmrRafId = requestAnimationFrame(tmrTick);
  }

  function tmrGetMs() {
    const read = (el, max) => {
      if (!el) return 0;
      const n = Math.floor(Number(el.value));
      const v = Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
      el.value = v;
      return v;
    };
    const h = read(tmrHours, 99), m = read(tmrMinutes, 59), s = read(tmrSeconds, 59);
    return (h * 3600 + m * 60 + s) * 1000;
  }

  // Sauvegarde l'état pour survivre à la fermeture du popup. Le background.js
  // observe ce champ via chrome.storage.onChanged et programme lui-même
  // l'alarme de fin — plus fiable qu'un message direct si le service worker
  // était en train de s'endormir au moment de l'appel.
  function tmrSaveState() {
    chrome.storage.local.set({
      tmrState: { totalMs: tmrTotalMs, remaining: tmrRemaining, endTime: tmrEndTime, running: tmrRunning }
    });
  }

  function loadTimerState() {
    chrome.storage.local.get('tmrState', (data) => {
      const st = data.tmrState;
      if (!st || !st.totalMs) return;

      if (st.running && st.endTime) {
        const remaining = st.endTime - Date.now();
        tmrTotalMs = st.totalMs;
        if (remaining <= 0) {
          // Le temps s'est écoulé pendant que le popup était fermé. On ne se
          // contente pas de nettoyer le state en silence : ça annulerait
          // l'alarme de fond avant qu'elle ait pu sonner (course possible si
          // le popup rouvre pile autour de l'échéance), donc l'utilisateur
          // n'aurait jamais aucun retour. On affiche/joue la fin ici à la place.
          tmrFinish();
          return;
        }
        tmrRemaining = remaining;
        tmrEndTime = st.endTime;
        tmrRunning = true;
        if (tmrStartBtn) tmrStartBtn.textContent = '⏸ Pause';
        if (tmrDisplay) tmrDisplay.classList.add('tmr-running');
        tmrRender();
        tmrRafId = requestAnimationFrame(tmrTick);
      } else if (st.remaining > 0) {
        tmrTotalMs = st.totalMs;
        tmrRemaining = st.remaining;
        if (tmrStartBtn) tmrStartBtn.textContent = '▶ Resume';
        tmrRender();
      }
    });
  }

  if (tmrStartBtn) {
    tmrStartBtn.addEventListener('click', () => {
      clearInterval(tmrAlarmTimer);
      if (tmrDisplay) tmrDisplay.classList.remove('flash');
      if (tmrRunning) {
        // Pause
        tmrRunning = false;
        cancelAnimationFrame(tmrRafId);
        tmrRemaining = Math.max(0, tmrEndTime - Date.now());
        tmrStartBtn.textContent = '▶ Resume';
        if (tmrDisplay) tmrDisplay.classList.remove('tmr-running');
        tmrRender();
      } else {
        // Start / Resume
        if (tmrRemaining <= 0) {
          tmrTotalMs = tmrGetMs();
          tmrRemaining = tmrTotalMs;
        }
        if (tmrRemaining <= 0) { showToast('Set a duration'); return; }
        tmrEndTime = Date.now() + tmrRemaining;
        tmrRunning = true;
        tmrStartBtn.textContent = '⏸ Pause';
        if (tmrDisplay) tmrDisplay.classList.add('tmr-running');
        tmrRafId = requestAnimationFrame(tmrTick);
      }
      tmrSaveState();
    });
  }

  if (tmrResetBtn) {
    tmrResetBtn.addEventListener('click', () => {
      tmrRunning = false;
      cancelAnimationFrame(tmrRafId);
      clearInterval(tmrAlarmTimer);
      tmrRemaining = 0; tmrTotalMs = 0;
      if (tmrDisplay) { tmrDisplay.classList.remove('flash', 'tmr-running'); tmrDisplay.style.color = ''; }
      setRollGroupInstant(tmrMainGroup, '00:00');
      if (tmrMsGroup) tmrMsGroup.textContent = '00';
      if (tmrOrb) { tmrOrb.setLit(1); tmrOrb.setRunning(false); }
      if (tmrView) tmrView.classList.remove('is-running');
      if (tmrStartBtn) tmrStartBtn.textContent = '▶ Start';
      chrome.storage.local.remove('tmrState');
    });
  }

  // Preset buttons
  document.querySelectorAll('.tmr-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = parseInt(btn.dataset.h)||0, m = parseInt(btn.dataset.m)||0, s = parseInt(btn.dataset.s)||0;
      if (tmrHours)   tmrHours.value   = h;
      if (tmrMinutes) tmrMinutes.value = m;
      if (tmrSeconds) tmrSeconds.value = s;
      // Auto-start
      tmrRunning = false; cancelAnimationFrame(tmrRafId); clearInterval(tmrAlarmTimer);
      if (tmrDisplay) tmrDisplay.classList.remove('flash');
      tmrTotalMs = (h*3600+m*60+s)*1000; tmrRemaining = tmrTotalMs;
      tmrEndTime = Date.now() + tmrRemaining;
      tmrRunning = true;
      if (tmrStartBtn) tmrStartBtn.textContent = '⏸ Pause';
      if (tmrDisplay) tmrDisplay.classList.add('tmr-running');
      tmrRafId = requestAnimationFrame(tmrTick);
      tmrSaveState();
    });
  });

  loadTimerState();

  // ────────────────────────────────────────────
  // CHRONOMÈTRE
  // ────────────────────────────────────────────
  const swDisplay   = document.getElementById('swDisplay');
  const swMainGroup = document.getElementById('swMainGroup');
  const swMsGroup   = document.getElementById('swMsGroup');
  const swStartBtn  = document.getElementById('swStartBtn');
  const swResetBtn  = document.getElementById('swResetBtn');
  const swLapBtn    = document.getElementById('swLapBtn');
  const swLaps      = document.getElementById('swLaps');
  const swRing      = document.getElementById('swRing');

  setRollGroupInstant(swMainGroup, '00:00');
  if (swMsGroup) swMsGroup.textContent = '00';

  let swRunning = false, swStartTime = 0, swElapsed = 0, swRafId = null, swLapList = [];
  const SW_MAX_LAPS = 500;

  function swFormatParts(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return { main: (h > 0 ? h + ':' : '') + `${tmrPad(m)}:${tmrPad(s)}`, cs: tmrPad(cs) };
  }

  const swOrb = window.WBOrb ? WBOrb.create(document.getElementById('swOrb'), { size: 170, seed: 5 }) : null;
  let swShownLen = 5;

  function swRender() {
    const parts = swFormatParts(swElapsed);
    // a hand of light goes round the sphere once a minute and lights the points it passes
    if (swOrb) { swOrb.setLit(1); swOrb.setSweep(swElapsed > 0 ? (swElapsed % 60000) / 60000 : null); swOrb.setRunning(swRunning); }
    if (parts.main.length !== swShownLen) { setRollGroupInstant(swMainGroup, parts.main); swShownLen = parts.main.length; }
    else renderRollGroup(swMainGroup, parts.main);
    if (swMsGroup) swMsGroup.textContent = parts.cs;
  }

  function swTick() {
    if (!swRunning) return;
    swElapsed = Date.now() - swStartTime;
    swRender();
    swRafId = requestAnimationFrame(swTick);
  }

  // Saved so the stopwatch survives closing the popup, like the timer does
  function swSave() {
    chrome.storage.local.set({ swState: { running: swRunning, startTime: swStartTime, elapsed: swElapsed, laps: swLapList } });
  }

  function swApplyUi() {
    if (swStartBtn) {
      swStartBtn.textContent = swRunning ? '⏸ Pause' : (swElapsed > 0 ? '▶ Resume' : '▶ Start');
      swStartBtn.classList.toggle('running', swRunning);
    }
    if (swLapBtn) swLapBtn.disabled = !swRunning;
    if (swResetBtn) swResetBtn.disabled = !swRunning && swElapsed === 0;
    if (swRing) swRing.classList.toggle('running', swRunning);
    if (swOrb) swOrb.setRunning(swRunning);
    if (swDisplay) swDisplay.classList.toggle('tmr-running', swRunning);
  }

  function swRenderLaps() {
    if (swOrb) swOrb.setMarks(swLapList.map(t => (t % 60000) / 60000));
    if (!swLaps) return;
    swLaps.textContent = '';
    const splits = swLapList.map((t, i) => t - (i ? swLapList[i - 1] : 0));
    let best = Infinity, worst = -Infinity;
    for (const v of splits) { if (v < best) best = v; if (v > worst) worst = v; }
    const marked = splits.length > 1 && best !== worst;
    for (let i = swLapList.length - 1; i >= 0; i--) {
      const total = swFormatParts(swLapList[i]), split = swFormatParts(splits[i]);
      const el = document.createElement('div');
      el.className = 'sw-lap-item' + (marked && splits[i] === best ? ' best' : '') + (marked && splits[i] === worst ? ' worst' : '');
      const mk = (cls, txt) => { const sp = document.createElement('span'); sp.className = cls; sp.textContent = txt; el.appendChild(sp); };
      mk('sw-lap-num', 'Lap ' + (i + 1));
      mk('sw-lap-delta', split.main + '.' + split.cs);
      mk('sw-lap-time', total.main + '.' + total.cs);
      swLaps.appendChild(el);
    }
  }

  function swToggle() {
    if (swRunning) {
      swRunning = false; cancelAnimationFrame(swRafId);
      swElapsed = Date.now() - swStartTime;
    } else {
      swStartTime = Date.now() - swElapsed;
      swRunning = true;
      swRafId = requestAnimationFrame(swTick);
    }
    swApplyUi(); swRender(); swSave();
  }

  function swReset() {
    swRunning = false; cancelAnimationFrame(swRafId);
    swElapsed = 0; swLapList = []; swShownLen = 5;
    setRollGroupInstant(swMainGroup, '00:00');
    if (swMsGroup) swMsGroup.textContent = '00';
    swRenderLaps();
    if (swOrb) { swOrb.setLit(1); swOrb.setSweep(null); }
    swApplyUi(); swSave();
  }

  function swLap() {
    if (!swRunning) return;
    if (swLapList.length >= SW_MAX_LAPS) { showToast('Lap limit reached'); return; }
    swElapsed = Date.now() - swStartTime;
    swLapList.push(swElapsed);
    if (swOrb) swOrb.pulse();
    swRenderLaps(); swSave();
  }

  if (swStartBtn) swStartBtn.addEventListener('click', swToggle);
  if (swResetBtn) swResetBtn.addEventListener('click', swReset);
  if (swLapBtn) swLapBtn.addEventListener('click', swLap);

  chrome.storage.local.get('swState', (d) => {
    const st = d && d.swState;
    if (st && typeof st === 'object') {
      const now = Date.now();
      const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
      const start = num(st.startTime) <= now ? num(st.startTime) : 0;
      swRunning = st.running === true && start > 0;
      swStartTime = swRunning ? start : 0;
      swElapsed = swRunning ? now - start : num(st.elapsed);
      const laps = [];
      if (Array.isArray(st.laps)) {
        for (const t of st.laps) {
          if (laps.length >= SW_MAX_LAPS) break;
          if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > swElapsed) continue;
          if (laps.length && t < laps[laps.length - 1]) continue;
          laps.push(t);
        }
      }
      swLapList = laps;
      if (swRunning || swElapsed > 0) { swRenderLaps(); swRender(); }
      if (swRunning) swRafId = requestAnimationFrame(swTick);
    }
    swApplyUi();
  });

  // Space = start/pause, L = lap, R = reset, only while the stopwatch is on screen
  document.addEventListener('keydown', (e) => {
    const view = document.getElementById('swView'), panel = document.getElementById('panel-timer');
    if (!view || !panel || !panel.classList.contains('active') || view.style.display === 'none') return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (document.querySelector('#gridOverlay.open')) return;
    const t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (document.querySelector('.settings-modal-overlay.active')) return;
    if (e.code === 'Space') { if (tag === 'button') return; e.preventDefault(); swToggle(); }
    else if (e.key === 'l' || e.key === 'L') swLap();
    else if (e.key === 'r' || e.key === 'R') swReset();
  });

  // @module 27-music-player  (dev/popup-src/27-music-player.js)
  const localFileInput = document.getElementById('localFileInput');
  const localPlaylistEl = document.getElementById('localPlaylist');
  const localPlaylistCount = document.getElementById('localPlaylistCount');
  const localNowPlaying = document.getElementById('localNowPlaying');
  const localNowTitle = document.getElementById('localNowTitle');
  const localTimeCurrent = document.getElementById('localTimeCurrent');
  const localTimeTotal = document.getElementById('localTimeTotal');
  const localProgressBar = document.getElementById('localProgressBar');
  const localPlayBtn = document.getElementById('localPlayBtn');
  const localStopBtn = document.getElementById('localStopBtn');
  const localPrevBtn = document.getElementById('localPrevBtn');
  const localNextBtn = document.getElementById('localNextBtn');
  const localMuteBtn = document.getElementById('localMuteBtn');
  const localRepeatBtn = document.getElementById('localRepeatBtn');
  const localVolumeSlider = document.getElementById('localVolumeSlider');
  const localClearPlaylistBtn = document.getElementById('localClearPlaylistBtn');

  let localPlaylist = [];
  let localCurrentIndex = -1;
  let localRepeatMode = 'off';   // 'off' | 'all' (whole playlist again) | 'one' (same track again)
  let gAudioState = { currentTime: 0, duration: 0, paused: true, volume: 1 };

  function formatMusicTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  const musicLoading = { active: false, t0: 0 };   // a track is being fetched: the cloud shows it
  const newTrackId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

  function readAudioAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function setMusicBtnIcon(btn, iconFile, size) {
    if (!btn) return;
    btn.innerHTML = `<span class="music-svg-icon" style="width:${size}px;height:${size}px;background-color:currentColor;-webkit-mask-image:url('../icons/svg/audio/${iconFile}');mask-image:url('../icons/svg/audio/${iconFile}');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>`;
  }

  function updateAudioUI() {
    if (localTimeCurrent) localTimeCurrent.textContent = formatMusicTime(gAudioState.currentTime);
    if (localTimeTotal && gAudioState.duration) localTimeTotal.textContent = formatMusicTime(gAudioState.duration);
    if (localProgressBar && gAudioState.duration) localProgressBar.value = (gAudioState.currentTime / gAudioState.duration) * 100;
  }

  // Demander la création du Offscreen à l'ouverture du popup
  chrome.runtime.sendMessage({ action: 'CREATE_OFFSCREEN' }).catch(() => { });

  // Recevoir l'état du Offscreen en temps réel
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AUDIO_STATE_UPDATE') {
      gAudioState = msg;
      updateAudioUI();
      if (localPlayBtn && !gAudioState.paused) setMusicBtnIcon(localPlayBtn, 'pause.svg', 19);
    }
  });

  function renderLocalPlaylist() {
    if (localPlaylistCount) localPlaylistCount.textContent = localPlaylist.length;
    if (!localPlaylistEl) return;
    localPlaylistEl.innerHTML = '';
    if (localPlaylist.length === 0) {
      localPlaylistEl.innerHTML = '<div class="clip-empty" style="font-size:11px;">No files added</div>';
      if (localNowPlaying) localNowPlaying.style.display = 'none';
      return;
    }
    localPlaylist.forEach((track, idx) => {
      const row = document.createElement('div');
      row.className = 'local-playlist-row' + (idx === localCurrentIndex ? ' active' : '');

      const indicator = document.createElement('span');
      indicator.className = 'local-playlist-dot' + (idx === localCurrentIndex ? ' local-playlist-dot--active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'local-playlist-name';
      nameSpan.textContent = track.name.length > 35 ? track.name.substring(0, 35) + '…' : track.name;

      const delBtn = document.createElement('button');
      delBtn.className = 'local-playlist-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove from playlist';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gone = localPlaylist.splice(idx, 1)[0];
        if (gone && gone.id) MusicDB.del(gone.id).catch(() => { });
        if (localCurrentIndex === idx) {
          wantPlaying = false; chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
          localCurrentIndex = -1;
        } else if (localCurrentIndex > idx) {
          localCurrentIndex--;
        }
        renderLocalPlaylist();
        savePlaylistState(true);
      });

      row.addEventListener('click', () => {
        playTrack(idx);
      });

      row.appendChild(indicator);
      row.appendChild(nameSpan);
      row.appendChild(delBtn);
      localPlaylistEl.appendChild(row);
    });
  }

  let playSeq = 0;
  let volSaveTimer = 0;
  // true while the person expects sound: lets the watchdog tell a broken
  // player from a pause they asked for
  let wantPlaying = false;
  const reloads = [];   // times of the latest automatic reloads

  // Starts the current track again where it stopped. Limited to three times a
  // minute so a file that really cannot be played is skipped, not retried for ever.
  function reloadCurrentTrack(why) {
    if (localCurrentIndex < 0 || !localPlaylist[localCurrentIndex]) return;
    const now = Date.now();
    while (reloads.length && now - reloads[0] > 60000) reloads.shift();
    if (reloads.length >= 3) {
      reloads.length = 0;
      showToast('This track keeps failing, skipping it');
      if (localPlaylist.length > 1) playTrack((localCurrentIndex + 1) % localPlaylist.length);
      else { wantPlaying = false; if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19); }
      return;
    }
    reloads.push(now);
    showToast(why || 'Reloading the track…');
    playTrack(localCurrentIndex, 0, 0, gAudioState.currentTime || 0);
  }

  // the player reports a decoding or loading error
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AUDIO_ERROR' && wantPlaying) reloadCurrentTrack('Playback error, reloading…');
  });

  // Watchdog, while the popup is open: sound is expected but the player is
  // gone, stopped by itself or stuck at the same second.
  let stuckFor = 0, lastSeenTime = -1;
  setInterval(() => {
    if (!wantPlaying || localCurrentIndex < 0 || musicImport.active || musicReload.active) { stuckFor = 0; return; }
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'GET_STATE' }).then((s) => {
      if (s && s.success && s.paused) { stuckFor = 0; if (!s.ended) wantPlaying = false; lastSeenTime = -1; return; }
      const bad = !s || !s.success || Math.abs((s.currentTime || 0) - lastSeenTime) < 0.01;
      lastSeenTime = s ? (s.currentTime || 0) : -1;
      stuckFor = bad ? stuckFor + 1 : 0;
      if (stuckFor >= 2) { stuckFor = 0; reloadCurrentTrack(); }
    }).catch(() => {
      stuckFor++;
      if (stuckFor >= 2) { stuckFor = 0; reloadCurrentTrack(); }
    });
  }, 2500);
  // failed = how many tracks in a row could not be played (stops the skipping once all were tried)
  function playTrack(idx, failed = 0, attempt = 0, resumeAt = 0) {
    if (idx < 0 || idx >= localPlaylist.length) return;
    localCurrentIndex = idx;
    wantPlaying = true;
    const seq = ++playSeq;

    const onFail = () => {
      if (seq !== playSeq) return;
      // first reload the same track a couple of times: most failures are a
      // player that went to sleep, not a bad file
      if (attempt < 2) { setTimeout(() => { if (seq === playSeq) playTrack(idx, failed, attempt + 1, resumeAt); }, 450 * (attempt + 1)); return; }
      wantPlaying = false;
      showToast('Cannot play this file');
      if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
      const next = (idx + 1) % localPlaylist.length;
      if (failed + 1 < localPlaylist.length && next !== idx) { playTrack(next, failed + 1); return; }
      localCurrentIndex = -1;
      if (localNowPlaying) localNowPlaying.style.display = 'none';
      renderLocalPlaylist();
      savePlaylistState();
    };

    // Check if offscreen exists, if not create it
    chrome.runtime.sendMessage({ action: 'CREATE_OFFSCREEN' }).catch(() => { }).finally(() => {
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_LOOP', loop: localRepeatMode === 'one' }).catch(() => { });
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'PLAY',
        id: localPlaylist[idx] && localPlaylist[idx].id,
        dataUrl: localPlaylist[idx] && localPlaylist[idx].dataUrl
      }).then((resp) => {
        if (seq === playSeq) musicLoading.active = false;
        if (!resp || resp.success !== true) { onFail(); return; }
        if (seq === playSeq && resumeAt > 1) chrome.runtime.sendMessage({ target: 'offscreen', action: 'SEEK', time: resumeAt }).catch(() => { });
        if (seq === playSeq && localMuteBtn && localMuteBtn.dataset.muted === '1') {
          chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: 0 }).catch(() => { });
        }
      }).catch(() => { if (seq === playSeq) musicLoading.active = false; onFail(); });
    });
    musicLoading.active = true; musicLoading.t0 = performance.now();

    if (localNowPlaying) localNowPlaying.style.display = '';
    if (localNowTitle) localNowTitle.textContent = localPlaylist[idx].name;
    if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'pause.svg', 19);
    renderLocalPlaylist();
    savePlaylistState();
  }

  // The tracks are large (the files themselves): they are written only when
  // the list changes. Everything else is a few small values. Writing the
  // whole list at every track change or volume move is what made WorkBox,
  // and the pages listening to storage changes, freeze.
  // Button look + the player's own loop for "this track" (no gap, and it does
  // not depend on the background being awake when the track ends)
  function showRepeatState() {
    if (localRepeatBtn) {
      localRepeatBtn.style.opacity = localRepeatMode === 'off' ? '0.4' : '1';
      localRepeatBtn.title = localRepeatMode === 'one' ? 'Repeat: this track' : localRepeatMode === 'all' ? 'Repeat: whole playlist' : 'Repeat: off';
      localRepeatBtn.style.position = 'relative';
      let badge = localRepeatBtn.querySelector('.repeat-one-badge');
      if (!badge) { badge = document.createElement('span'); badge.className = 'repeat-one-badge'; badge.textContent = '1'; badge.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:7px;font-weight:800;line-height:1;pointer-events:none;'; localRepeatBtn.appendChild(badge); }
      badge.style.display = localRepeatMode === 'one' ? '' : 'none';
    }
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_LOOP', loop: localRepeatMode === 'one' }).catch(() => { });
  }

  function savePlaylistState(withTracks) {
    const st = {
      savedCurrentIndex: localCurrentIndex,
      savedRepeatMode: localRepeatMode,
      savedVolume: localVolumeSlider ? Number(localVolumeSlider.value) : 100,
      savedMuted: !!(localMuteBtn && localMuteBtn.dataset.muted === '1')
    };
    if (withTracks) st.savedPlaylist = localPlaylist;
    chrome.storage.local.set(st);
  }

  // Everything with sound in it is accepted: audio files, and video files
  // too, of which only the sound is ever played (the picture is ignored).
  const MUSIC_EXT = /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|weba|mp4|m4v|webm|mov|mkv)$/i;
  const isMusicFile = (f) => (f.type || '').startsWith('audio/') || (f.type || '').startsWith('video/') || MUSIC_EXT.test(f.name);
  const MUSIC_MAX_FILE = 200 * 1024 * 1024;     // one file
  const MUSIC_MAX_TOTAL = 2048 * 1024 * 1024;   // whole playlist
  const musicImport = { active: false, done: 0, total: 0 };   // read by the cloud animation
  const musicReload = { active: false, t0: 0 };                // same, for the "black hole" of the Reload button
  const MUSIC_RELOAD_MS = 4000;

  // Reload: a fresh player and a fresh copy of the playlist from storage.
  // Nothing is removed; the track that was playing resumes where it was.
  async function reloadMusic() {
    if (musicReload.active || musicImport.active) return;
    const wasPlaying = wantPlaying && !gAudioState.paused;
    const at = localCurrentIndex, time = gAudioState.currentTime || 0;
    musicReload.active = true; musicReload.t0 = performance.now();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      wantPlaying = false;   // the watchdog must not step in during the reload
      playSeq++;
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'PAUSE' }).catch(() => { });
      await wait(1700);      // the points are being drawn in
      await chrome.runtime.sendMessage({ type: 'RESET_OFFSCREEN' }).catch(() => { });
      const data = await chrome.storage.local.get(['savedPlaylist', 'savedVolume', 'savedMuted']);
      if (Array.isArray(data.savedPlaylist) && data.savedPlaylist.length) localPlaylist = data.savedPlaylist;
      localCurrentIndex = at >= 0 && localPlaylist[at] ? at : -1;
      gAudioState = { currentTime: 0, duration: 0, paused: true, volume: 1 };
      renderLocalPlaylist();
      const vol = (localMuteBtn && localMuteBtn.dataset.muted === '1') ? 0 : (localVolumeSlider ? Number(localVolumeSlider.value) / 100 : 1);
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: vol }).catch(() => { });
      await wait(Math.max(0, MUSIC_RELOAD_MS - 300 - (performance.now() - musicReload.t0)));
      if (localCurrentIndex >= 0) {
        if (wasPlaying) playTrack(localCurrentIndex, 0, 0, time);
        else if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
      }
      await wait(Math.max(0, MUSIC_RELOAD_MS - (performance.now() - musicReload.t0)));
      showToast('Music reloaded · ' + localPlaylist.length + (localPlaylist.length === 1 ? ' track' : ' tracks'));
    } finally {
      musicReload.active = false;
    }
  }
  const musicReloadBtn = document.getElementById('musicReloadBtn');
  if (musicReloadBtn) musicReloadBtn.addEventListener('click', reloadMusic);

  async function importMusicFiles(list) {
    if (musicImport.active) { showToast('An import is already running'); return; }
    const files = Array.from(list || []).filter(isMusicFile)
      .sort((x, y) => (x.webkitRelativePath || x.name).localeCompare(y.webkitRelativePath || y.name, undefined, { numeric: true }));
    if (!files.length) { showToast('No audio found'); return; }
    musicImport.active = true; musicImport.done = 0; musicImport.total = files.length;
    let used = localPlaylist.reduce((n, tr) => n + (tr.size || 0), 0);
    let firstNew = -1, tooBig = 0, full = 0, added = 0, failed = 0;
    try {
      for (const file of files) {
        if (file.size > MUSIC_MAX_FILE) tooBig++;
        else if (used + file.size > MUSIC_MAX_TOTAL) full++;
        else {
          const id = newTrackId();
          let stored = true;
          try { await MusicDB.put(id, file); } catch (e) { stored = false; }
          if (stored) {
            if (firstNew < 0) firstNew = localPlaylist.length;
            localPlaylist.push({ id, name: file.name.replace(/\.[a-z0-9]{2,5}$/i, ''), size: file.size });
            used += file.size; added++;
          } else failed++;
          // one frame between files keeps the animation smooth on a big folder
          await new Promise((r) => requestAnimationFrame(r));
        }
        musicImport.done++;
      }
    } finally {
      // let the animation finish its last turn before the ball settles
      setTimeout(() => { musicImport.active = false; }, 500);
    }
    // imported tracks are only added: music starts when the person asks for it
    if (added) {
      // with nothing selected yet, the first new track is shown, ready and paused
      if (localCurrentIndex < 0 || !localPlaylist[localCurrentIndex]) {
        localCurrentIndex = firstNew;
        if (localNowPlaying) localNowPlaying.style.display = '';
        if (localNowTitle) localNowTitle.textContent = localPlaylist[firstNew].name;
        if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
      }
      renderLocalPlaylist();
      savePlaylistState(true);
    }
    const notes = [];
    if (added) notes.push(added + (added === 1 ? ' track added' : ' tracks added'));
    if (tooBig) notes.push(tooBig + ' over 200 MB skipped');
    if (failed) notes.push(failed + ' could not be stored');
    if (full) notes.push(full + ' skipped, playlist is full');
    showToast(notes.join(' · ') || 'Nothing could be added');
  }

  // every file of a dropped folder, sub-folders included
  async function filesFromDrop(dt) {
    const entries = [];
    for (const it of Array.from(dt.items || [])) {
      const en = it.kind === 'file' && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
      if (en) entries.push(en);
    }
    if (!entries.length) return Array.from(dt.files || []);
    const out = [];
    const walk = async (en) => {
      if (out.length >= 500) return;
      if (en.isFile) {
        const f = await new Promise((res) => en.file(res, () => res(null)));
        if (f) out.push(f);
      } else if (en.isDirectory) {
        const reader = en.createReader();
        for (;;) {
          const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
          if (!batch.length) break;
          for (const child of batch) await walk(child);
        }
      }
    };
    for (const en of entries) await walk(en);
    return out;
  }

  if (localFileInput) {
    localFileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      e.target.value = '';
      if (files.length) await importMusicFiles(files);
    });
  }
  const localFolderInput = document.getElementById('localFolderInput');
  if (localFolderInput) {
    localFolderInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      e.target.value = '';
      if (files.length) await importMusicFiles(files);
    });
    const musicFolderBtn = document.getElementById('musicFolderBtn');
    if (musicFolderBtn) musicFolderBtn.addEventListener('click', () => localFolderInput.click());
  }

  const musicDropZone = document.getElementById('musicDropZone');
  if (musicDropZone) {
    // empty playlist: the cloud adds files; otherwise it plays and pauses
    const heroAct = () => {
      if (!localPlaylist.length) { if (localFileInput) localFileInput.click(); return; }
      if (localCurrentIndex < 0 || !localPlaylist[localCurrentIndex]) { playTrack(0); return; }
      if (localPlayBtn) localPlayBtn.click();
    };
    musicDropZone.addEventListener('click', heroAct);
    musicDropZone.addEventListener('keydown', (e) => {
      if (e.target === musicDropZone && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); heroAct(); }
    });
    const musicAddBtn = document.getElementById('musicAddBtn');
    if (musicAddBtn) musicAddBtn.addEventListener('click', () => localFileInput && localFileInput.click());
    musicDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      musicDropZone.classList.add('dragover');
    });
    musicDropZone.addEventListener('dragleave', () => {
      musicDropZone.classList.remove('dragover');
    });
    musicDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      musicDropZone.classList.remove('dragover');
      const files = await filesFromDrop(e.dataTransfer);   // entries must be read before any await
      await importMusicFiles(files);
    });
  }

  if (localPlayBtn) {
    localPlayBtn.addEventListener('click', () => {
      if (gAudioState.paused && !gAudioState.duration && localCurrentIndex >= 0 && localPlaylist[localCurrentIndex]) {
        playTrack(localCurrentIndex);   // the player holds no file (fresh player): load it
      }
      else if (gAudioState.paused) {
        wantPlaying = true;
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'PLAY' }).catch(() => { });
        setMusicBtnIcon(localPlayBtn, 'pause.svg', 19);
      }
      else {
        wantPlaying = false;
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'PAUSE' }).catch(() => { });
        setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
      }
    });
  }

  if (localStopBtn) {
    localStopBtn.addEventListener('click', () => {
      wantPlaying = false; chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
      if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
    });
  }

  if (localNextBtn) {
    localNextBtn.addEventListener('click', () => {
      let next = localCurrentIndex + 1;
      if (next >= localPlaylist.length) next = localRepeatMode !== 'off' ? 0 : localCurrentIndex;
      playTrack(next);
    });
  }

  if (localPrevBtn) {
    localPrevBtn.addEventListener('click', () => {
      let prev = localCurrentIndex - 1;
      if (prev < 0) prev = localRepeatMode !== 'off' ? localPlaylist.length - 1 : 0;
      playTrack(prev);
    });
  }

  if (localMuteBtn) {
    localMuteBtn.addEventListener('click', () => {
      const isMuted = localMuteBtn.dataset.muted === '1';
      localMuteBtn.dataset.muted = isMuted ? '0' : '1';
      setMusicBtnIcon(localMuteBtn, isMuted ? 'volume-high.svg' : 'mute.svg', 16);
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: isMuted ? (localVolumeSlider.value / 100) : 0 }).catch(() => { });
      savePlaylistState();
    });
  }

  if (localVolumeSlider) {
    localVolumeSlider.addEventListener('input', () => {
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: Number(localVolumeSlider.value) / 100 }).catch(() => { });
      if (localMuteBtn) { localMuteBtn.dataset.muted = '0'; setMusicBtnIcon(localMuteBtn, 'volume-high.svg', 16); }
      clearTimeout(volSaveTimer); volSaveTimer = setTimeout(() => savePlaylistState(), 350);
    });
  }

  if (localRepeatBtn) {
    localRepeatBtn.addEventListener('click', () => {
      localRepeatMode = localRepeatMode === 'off' ? 'all' : localRepeatMode === 'all' ? 'one' : 'off';
      showRepeatState();
      savePlaylistState();
      showToast(localRepeatMode === 'one' ? 'Repeat: this track' : localRepeatMode === 'all' ? 'Repeat: whole playlist' : 'Repeat off');
    });
  }

  if (localClearPlaylistBtn) {
    localClearPlaylistBtn.addEventListener('click', () => {
      localPlaylist = [];
      MusicDB.clear().catch(() => { });
      wantPlaying = false; chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
      localCurrentIndex = -1;
      if (localNowPlaying) localNowPlaying.style.display = 'none';
      renderLocalPlaylist();
      savePlaylistState(true);
    });
  }

  if (localProgressBar) {
    localProgressBar.addEventListener('input', () => {
      if (gAudioState.duration) {
        const time = (Number(localProgressBar.value) / 100) * gAudioState.duration;
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'SEEK', time }).catch(() => { });
      }
    });
  }

  // Playlists saved by earlier versions carried the audio itself inside the
  // extension's storage. Each file is moved once into the database, with the
  // import animation, and the stored list becomes names and ids only.
  async function migrateOldPlaylist() {
    const old = localPlaylist.filter((tr) => tr && tr.dataUrl && !tr.id);
    if (!old.length || musicImport.active) return;
    musicImport.active = true; musicImport.done = 0; musicImport.total = old.length;
    try {
      for (const tr of old) {
        try {
          const blob = await (await fetch(tr.dataUrl)).blob();
          const id = newTrackId();
          await MusicDB.put(id, blob);
          tr.id = id; tr.size = blob.size; delete tr.dataUrl;
        } catch (e) { /* left as it is: it still plays the old way */ }
        musicImport.done++;
        await new Promise((r) => requestAnimationFrame(r));
      }
      savePlaylistState(true);
    } finally {
      setTimeout(() => { musicImport.active = false; }, 400);
    }
  }

  // Restore state from storage
  chrome.storage.local.get(['savedPlaylist', 'savedCurrentIndex', 'savedRepeatMode', 'savedVolume', 'savedMuted'], (data) => {
    const muted = data.savedMuted === true;
    if (muted && localMuteBtn) { localMuteBtn.dataset.muted = '1'; setMusicBtnIcon(localMuteBtn, 'mute.svg', 16); }
    if (data.savedPlaylist && data.savedPlaylist.length > 0) {
      localPlaylist = data.savedPlaylist;
      localCurrentIndex = data.savedCurrentIndex !== undefined ? data.savedCurrentIndex : -1;
      // older versions saved true/false: true meant "the whole playlist"
      const sr = data.savedRepeatMode;
      localRepeatMode = sr === 'one' ? 'one' : (sr === true || sr === 'all') ? 'all' : 'off';
      showRepeatState();
      if (localCurrentIndex >= 0 && localPlaylist[localCurrentIndex]) {
        if (localNowPlaying) localNowPlaying.style.display = '';
        if (localNowTitle) localNowTitle.textContent = localPlaylist[localCurrentIndex].name;
      }
      renderLocalPlaylist();
      migrateOldPlaylist();
    }
    // Restaurer le volume
    if (data.savedVolume !== undefined && localVolumeSlider) {
      localVolumeSlider.value = data.savedVolume;
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: muted ? 0 : data.savedVolume / 100 }).catch(() => {});
    } else if (muted) {
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: 0 }).catch(() => {});
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.savedCurrentIndex) {
      localCurrentIndex = changes.savedCurrentIndex.newValue;
      if (localCurrentIndex >= 0 && localPlaylist[localCurrentIndex]) {
        if (localNowPlaying) localNowPlaying.style.display = '';
        if (localNowTitle) localNowTitle.textContent = localPlaylist[localCurrentIndex].name;
      } else {
        if (localNowPlaying) localNowPlaying.style.display = 'none';
        if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
      }
      renderLocalPlaylist();
    }
  });

  // Check state with offscreen right away
  chrome.runtime.sendMessage({ target: 'offscreen', action: 'GET_STATE' }, (resp) => {
    if (chrome.runtime.lastError) return; // no offscreen document yet: nothing is playing
    if (resp && resp.success) {
      gAudioState = resp;
      if (localPlayBtn && !resp.paused) { setMusicBtnIcon(localPlayBtn, 'pause.svg', 19); wantPlaying = true; }
      updateAudioUI();
    }
  });

  // @module 28-settings-and-quota  (dev/popup-src/28-settings-and-quota.js)
  // ===== Storage: how much room the clipboard history takes =====
  (function initQuota() {
    const openBtn = document.getElementById('openQuotaBtn');
    const overlay = document.getElementById('quotaOverlay');
    const closeBtn = document.getElementById('quotaCloseBtn');
    const grid = document.getElementById('quotaGrid');
    if (!openBtn || !overlay || !grid) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fmtN = (n) => Number(n).toLocaleString('en-US');
        // colour by how full: blue, green, yellow, orange, red, then black
    const RAMP = [[0, 215, 90, 60], [0.25, 135, 70, 50], [0.5, 52, 95, 55], [0.7, 28, 95, 55], [0.9, 2, 85, 50], [1, 0, 30, 6]];
    function ramp(v) {
      v = Math.max(0, Math.min(1, v));
      for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) {
        const a = RAMP[i - 1], b = RAMP[i], k = (v - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
      return RAMP[RAMP.length - 1].slice(1);
    }
    const rampCss = (v) => { const c = ramp(v); return 'hsl(' + c[0] + ',' + c[1] + '%,' + Math.max(c[2], 45) + '%)'; };
    const colourFor = (f) => f >= 1 ? '#f43f5e' : f >= 0.8 ? '#fbbf24' : '#a78bfa';
    const stateFor = (f) => f >= 1 ? 'Full' : f >= 0.8 ? 'Getting full' : f >= 0.5 ? 'Half full' : 'Plenty of room';

    // detailed size: bytes, then KB with decimals, then MB, then GB
    function fmtBytes(b) {
      if (b < 1024) return fmtN(b) + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
      return (b / 1073741824).toFixed(3) + ' GB';
    }
    // the storage as a sphere of points: it fills from the bottom up
    let sd = 777; const rnd01 = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const SPH_N = 420, SPH = [];
    for (let i = 0; i < SPH_N; i++) {
      const y = 1 - (i + 0.5) / SPH_N * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      const sa = rnd01() * 6.2832, sb = Math.acos(2 * rnd01() - 1), sr = 1.0 + rnd01() * 0.55;
      SPH.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, sx: Math.sin(sb) * Math.cos(sa) * sr, sy: Math.sin(sb) * Math.sin(sa) * sr, sz: Math.cos(sb) * sr, dl: rnd01() * 0.35 });
    }
    const spheres = [];
    let sphRaf = 0;
    function sphLoop(now) {
      sphRaf = 0;
      if (!overlay.classList.contains('active')) return;
      spheres.forEach((sp) => drawSphere(sp, now));
      sphRaf = requestAnimationFrame(sphLoop);
    }
    function drawSphere(sp, now) {
      const cv = sp.cv, ctx = cv.getContext('2d'), W = cv.width, R = W * 0.41, SC = W / 132;
      const k = reduce ? 1 : Math.min(1, (now - sp.t0) / 1300), e = 1 - Math.pow(1 - k, 3);
      const lit = sp.f * e;                       // share of the sphere that is filled
      const ang = reduce ? 0.6 : (now / 1000) * 0.5, ca = Math.cos(ang), sa = Math.sin(ang), tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
      const warn = sp.f >= 0.8, full = sp.f >= 1;
      const pulse = reduce ? 0 : (full ? 0.5 + 0.5 * Math.sin(now / 160) : warn ? 0.5 + 0.5 * Math.sin(now / 420) : 0);
      ctx.clearRect(0, 0, W * 2, W * 2);
      const out = [];
      for (let i = 0; i < SPH_N; i++) {
        const p = SPH[i];
        // while the sphere assembles, every point flies in from far away
        let m = 1;
        if (sp.asmT && !reduce) { const a = (now - sp.asmT) / 1500; m = a <= 0 ? 0 : Math.min(1, Math.max(0, (a - p.dl) / 0.65)); m = 1 - Math.pow(1 - m, 3); }
        const px = p.sx + (p.x - p.sx) * m, py = p.sy + (p.y - p.sy) * m, pz = p.sz + (p.z - p.sz) * m;
        let x = px * ca + pz * sa, z = -px * sa + pz * ca, y = py;
        const y2 = y * ct - z * st, z2 = y * st + z * ct;
        const on = (p.y + 1) / 2 < lit;     // bottom (y=-1) fills first
        out.push({ x, y: y2, z: z2, on, t: (p.y + 1) / 2, fly: false, img: ((i * 0.6180339) % 1) < sp.imgShare });
      }
      out.sort((m, n) => m.z - n.z);
      for (const q of out) {
        const d = (q.z + 1) / 2;                  // 0 far .. 1 near
        const kind = q.img ? 'images' : 'texts';
        const dim = q.on && sp.focus && sp.focus !== kind;
        const hot = q.on && sp.focus === kind;
        const sz = (q.on ? 1.2 + d * 1.5 : 0.8 + d * 0.8) * (q.on ? 1 + pulse * 0.35 : 1) * (hot ? 1.25 : 1) * SC * 0.8;
        ctx.globalAlpha = q.on ? (dim ? 0.1 : 0.45 + d * 0.55) : 0.12 + d * 0.2;
        const rc = q.on ? ramp(sp.f * (0.8 + 0.2 * q.t)) : null;
        ctx.fillStyle = q.on ? 'hsl(' + rc[0] + ',' + rc[1] + '%,' + rc[2] + '%)' : '#9ca3af';
        const cx = W / 2 + q.x * R, cy = W / 2 - q.y * R, dark = q.on && rc[2] < 22;
        if (dark) { ctx.strokeStyle = 'rgba(244,63,94,0.7)'; ctx.lineWidth = SC * 0.5; }
        ctx.beginPath();
        if (q.on && q.img) { const e = sz * 1.15; ctx.moveTo(cx, cy - e * 1.25); ctx.lineTo(cx + e * 1.25, cy); ctx.lineTo(cx, cy + e * 1.25); ctx.lineTo(cx - e * 1.25, cy); ctx.closePath(); }
        else ctx.arc(cx, cy, sz, 0, 6.2832);
        ctx.fill(); if (dark) ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // rolling counter: every digit is a little reel that rolls to its number
    function setOdo(el, str, delay) {
      if (!el.dataset.built || el.dataset.len !== String(str.length)) {
        el.innerHTML = str.split('').map((ch) => /\d/.test(ch)
          ? '<span class="odo-d"><span class="odo-col">' + [0,1,2,3,4,5,6,7,8,9].join('<br>') + '</span></span>'
          : '<span class="odo-s">' + ch + '</span>').join('');
        el.dataset.built = '1'; el.dataset.len = String(str.length);
      }
      const cols = el.querySelectorAll('.odo-col'); let n = 0;
      str.split('').forEach((ch) => {
        if (!/\d/.test(ch)) return;
        const col = cols[n++];
        col.style.transition = reduce ? 'none' : 'transform ' + (1.1 + n * 0.18) + 's cubic-bezier(.22,1,.36,1) ' + (delay || 0) + 'ms';
        col.style.transform = 'translateY(' + (-Number(ch)) + 'em)';
      });
      el.setAttribute('aria-label', str);
    }
    function cardHtml() {
      const rows = (id, label) => '<div class="quota-row" id="q-' + id + '"><div class="quota-rowname"><i class="qsym ' + (id === 'images' ? 'dia' : 'dot') + '"></i>' + label + ' <span class="q-rp"></span></div>'
        + '<div class="quota-line q-items"></div><div class="quota-line q-size"></div><div class="quota-line quota-exact q-exact"></div><div class="quota-pinned"></div></div>';
      return '<div class="quota-card quota-main" id="q-all"><div class="quota-label">Storage</div>'
        + '<canvas class="quota-sphere" width="560" height="560" aria-hidden="true"></canvas>'
        + '<div class="quota-pct"><span class="q-num odo"></span><small>%</small></div>'
        + '<div class="quota-state"></div>'
        + '<div class="quota-rows">' + rows('texts', 'Texts') + rows('images', 'Images') + '</div></div>';
    }

    function stats(id, count, maxCount, bytes, maxBytes, pinned) {
      const row = document.getElementById('q-' + id);
      const f = Math.min(1, Math.max(count / maxCount, bytes / maxBytes));
      row.querySelector('.q-items').innerHTML = '<b>' + fmtN(count) + '</b> of ' + fmtN(maxCount) + ' items <span class="q-pc">(' + (count / maxCount * 100).toFixed(1) + '%)</span>';
      row.querySelector('.q-size').innerHTML = '<b>' + fmtBytes(bytes) + '</b> of ' + WBBig.sizeLabel(maxBytes) + ' <span class="q-pc">(' + (bytes / maxBytes * 100).toFixed(1) + '%)</span>';
      row.querySelector('.q-exact').textContent = fmtN(bytes) + ' bytes';
      row.querySelector('.quota-pinned').textContent = pinned ? fmtN(pinned) + ' pinned' : '';
      row.querySelector('.quota-rowname').style.color = rampCss(f);
      row.querySelector('.q-rp').textContent = (f * 100).toFixed(1) + '%';
      return { f, byItems: count / maxCount >= bytes / maxBytes, name: id };
    }

    // one globe for everything: it shows whichever of texts or images is the fullest
    function fillAll(t, i) {
      const card = document.getElementById('q-all');
      const worst = t.f >= i.f ? t : i;
      const f = worst.f, col = rampCss(f);
      const st = card.querySelector('.quota-state');
      st.textContent = stateFor(f) + (f >= 0.5 ? ' · ' + worst.name + (worst.byItems ? ' (items)' : ' (room)') : ''); st.style.color = col;
      const num = card.querySelector('.q-num');
      spheres.push({ cv: card.querySelector('.quota-sphere'), f, col, t0: performance.now(), tf: t.f, imgShare: (t.f + i.f) > 0 ? i.f / (t.f + i.f) : 0, focus: null });
      setOdo(num, '0.0', 0);
      void num.offsetWidth;
      setTimeout(() => setOdo(num, (f * 100).toFixed(1), 250), 30);
      // touch or hover a column to see only its points on the globe
      const sp = spheres[spheres.length - 1];
      card.querySelectorAll('.quota-row').forEach((row) => {
        const kind = row.id === 'q-images' ? 'images' : 'texts';
        const on = () => { sp.focus = kind; row.classList.add('hot'); };
        const off = () => { sp.focus = null; row.classList.remove('hot'); };
        row.addEventListener('mouseenter', on); row.addEventListener('mouseleave', off);
        row.addEventListener('click', () => { if (sp.focus === kind) off(); else { card.querySelectorAll('.quota-row').forEach(x => x.classList.remove('hot')); on(); } });
      });
    }

    function render() {
      chrome.storage.local.get(['clipItems', 'clipboardImages'], (r) => {
        const texts = Array.isArray(r.clipItems) ? r.clipItems : [];
        const imgs = Array.isArray(r.clipboardImages) ? r.clipboardImages : [];
        spheres.length = 0;
        grid.innerHTML = cardHtml();
        const sT = stats('texts', texts.filter(i => !i.pinned).length, WBBig.MAX_TEXTS, WBBig.textBytes(texts), WBBig.QUOTA_TEXT, texts.filter(i => i.pinned).length);
        const sI = stats('images', imgs.filter(i => !i.pinned).length, WBBig.MAX_IMAGES, WBBig.imageBytes(imgs), WBBig.QUOTA_IMAGES, imgs.filter(i => i.pinned).length);
        fillAll(sT, sI);
        if (!sphRaf) sphRaf = requestAnimationFrame(sphLoop);
      });
    }
    openBtn.addEventListener('click', () => { overlay.classList.add('active'); render(); });
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
  })();

  // ----- Settings: tabs (Backup, Privacy, Storage, Tuto, About) -----
  (function initSettingsTabs() {
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay) return;
    const tabs = [...overlay.querySelectorAll('.st-tab')], panes = [...overlay.querySelectorAll('.st-pane')];
    function show(name) {
      tabs.forEach((t) => { const on = t.dataset.pane === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
      const modal = overlay.querySelector('.settings-modal'); if (modal) modal.scrollTop = 0;
      if (name === 'storage') { mini(); persistInfo(); }
    }
    tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.pane)));
    // is the browser told to keep the databases when the disk runs short?
    async function persistInfo() {
      const el = document.getElementById('stPersist'); if (!el) return;
      let ok = false;
      try { ok = !!(navigator.storage && ((await navigator.storage.persisted()) || (await navigator.storage.persist()))); } catch (e) { }
      el.hidden = false; el.classList.toggle('ok', ok);
      el.textContent = ok
        ? 'Protected: the browser will not clear your saved data on its own.'
        : 'WorkBox has the unlimited-storage permission, which Chrome says exempts it from automatic cleanup. The browser gave no extra confirmation, so keep a backup link for safety.';
      chrome.storage.local.set({ wbPersisted: ok });
    }
    // small fill bars of the Storage tab (the full view is behind the button)
    function mini() {
      chrome.storage.local.get(['clipItems', 'clipboardImages'], (r) => {
        const texts = Array.isArray(r.clipItems) ? r.clipItems : [], imgs = Array.isArray(r.clipboardImages) ? r.clipboardImages : [];
        const ft = Math.min(1, Math.max(texts.filter(i => !i.pinned).length / WBBig.MAX_TEXTS, WBBig.textBytes(texts) / WBBig.QUOTA_TEXT));
        const fi = Math.min(1, Math.max(imgs.filter(i => !i.pinned).length / WBBig.MAX_IMAGES, WBBig.imageBytes(imgs) / WBBig.QUOTA_IMAGES));
        [['T', ft], ['I', fi]].forEach(([k, f]) => {
          const bar = document.getElementById('stMini' + k), p = document.getElementById('stMini' + k + 'p');
          if (bar) { bar.style.width = (f * 100) + '%'; bar.style.background = f >= 1 ? '#f43f5e' : f >= 0.8 ? '#fbbf24' : '#a78bfa'; }
          if (p) p.textContent = (f * 100).toFixed(1) + '%';
        });
      });
    }
    // every time Settings opens, start on the first tab
    new MutationObserver(() => { if (overlay.classList.contains('active')) show('backup'); }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

    // The popup closes as soon as you click outside it. What was open (Settings, its tab,
    // the Storage view) is remembered for 10 minutes, so reopening WorkBox brings you back.
    const store = chrome.storage.session || chrome.storage.local, KEY = 'wbSettingsState', FRESH = 10 * 60 * 1000;
    const quota = document.getElementById('quotaOverlay');
    let restoring = true;
    const currentTab = () => (tabs.find((t) => t.classList.contains('active')) || tabs[0]).dataset.pane;
    function save() {
      if (restoring) return;
      const open = overlay.classList.contains('active');
      store.set({ [KEY]: { open, tab: currentTab(), quota: open && !!quota && quota.classList.contains('active'), t: Date.now() } });
    }
    new MutationObserver(save).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    if (quota) new MutationObserver(save).observe(quota, { attributes: true, attributeFilter: ['class'] });
    tabs.forEach((t) => t.addEventListener('click', () => setTimeout(save, 0)));
    store.get(KEY, (r) => {
      const st = r && r[KEY];
      if (st && st.open && Date.now() - st.t < FRESH) {
        document.getElementById('settingsOpenBtn').click();
        setTimeout(() => {
          show(st.tab || 'backup');
          if (st.quota) { const b = document.getElementById('openQuotaBtn'); if (b) b.click(); }
          setTimeout(() => { restoring = false; save(); }, 50);
        }, 0);
      } else restoring = false;
    });
  })();

  // ----- Settings: texts deleted in the last 5 hours -----
  // Removed: keeping a plaintext copy of every deleted text for five hours was
  // of no real use and worked against the point of protecting the clipboard.
  // The stored keys are cleared by the background on install and startup.

  // ----- private sites: nothing is saved from these sites -----
  (function initPrivateSites() {
    const input = document.getElementById('privSiteInput'), addBtn = document.getElementById('privSiteAddBtn');
    const thisBtn = document.getElementById('privSiteThisBtn'), listEl = document.getElementById('privSiteList');
    const status = document.getElementById('privSiteStatus');
    if (!input || !addBtn || !listEl) return;
    const MAX = 100;
    let list = [];
    const say = (m) => { status.textContent = m; if (m) setTimeout(() => { if (status.textContent === m) status.textContent = ''; }, 3500); };
    // "https://www.Example.com/page?x=1" -> "example.com"
    function clean(raw) {
      let v = String(raw || '').trim().toLowerCase();
      if (!v) return '';
      v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[\/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
      return /^(localhost|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,})$/.test(v) ? v : '';
    }
    function draw() {
      listEl.innerHTML = '';
      if (!list.length) { const e = document.createElement('div'); e.className = 'priv-empty'; e.textContent = 'No private site yet.'; listEl.appendChild(e); return; }
      list.forEach((d) => {
        const row = document.createElement('div'); row.className = 'priv-item';
        const name = document.createElement('span'); name.textContent = d;
        const rm = document.createElement('button'); rm.className = 'priv-rm'; rm.type = 'button'; rm.textContent = '✕'; rm.setAttribute('aria-label', 'Remove ' + d); rm.title = 'Remove';
        rm.addEventListener('click', () => save(list.filter((x) => x !== d)));
        row.appendChild(name); row.appendChild(rm); listEl.appendChild(row);
      });
    }
    function save(next) { list = next; chrome.storage.local.set({ clipBlacklist: list }, draw); draw(); }
    function add(raw) {
      const d = clean(raw);
      if (!d) { say('That does not look like a site address.'); return; }
      if (list.includes(d)) { say(d + ' is already in the list.'); return; }
      if (list.length >= MAX) { say('The list is full (' + MAX + ' sites).'); return; }
      save([d, ...list]); input.value = ''; say(d + ' added. Nothing copied there is saved.');
    }
    addBtn.addEventListener('click', () => add(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(input.value); });
    if (thisBtn) thisBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const host = tab && tab.url ? new URL(tab.url).hostname : '';
        if (!/^https?:/.test(tab && tab.url || '') || !host) { say('Open a website first, then try again.'); return; }
        add(host);
      } catch (e) { say('Open a website first, then try again.'); }
    });
    chrome.storage.local.get('clipBlacklist', (r) => { list = Array.isArray(r.clipBlacklist) ? r.clipBlacklist : []; draw(); });
  })();

  // @module 29-music-cloud  (dev/popup-src/29-music-cloud.js)
  // ----- music cloud: a ball of points that moves with the sound -----
  // The audio plays in the offscreen document; it sends three loudness values
  // (low, middle, high) a few dozen times a second while this popup listens.
  (function initMusicCloud() {
    const cv = document.getElementById('musicCloud');
    const hint = document.getElementById('musicHeroHint');
    if (!cv) return;

    // what the offscreen player measures: sixteen loudness values, low notes first
    const BANDS = 16;
    const raw = new Float32Array(BANDS), lv = new Float32Array(BANDS);
    let lastData = 0, port = null, retry = 0;
    function connect() {
      if (port) return;
      try {
        port = chrome.runtime.connect({ name: 'wb-audio-levels' });
        port.onMessage.addListener((msg) => {
          if (Array.isArray(msg.s)) for (let n = 0; n < BANDS; n++) raw[n] = msg.s[n] || 0;
          lastData = performance.now();
        });
        port.onDisconnect.addListener(() => { void chrome.runtime.lastError; port = null; });
      } catch (e) { port = null; }
    }

    // A vinyl record seen at an angle, drawn with points on its grooves.
    // Each groove listens to one part of the sound: low notes near the
    // centre, high notes at the rim. A groove rises when its notes are loud.
    const RINGS = 26, pts = [];
    let seed = 4242;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let ri = 0; ri < RINGS; ri++) {
      const r = 0.2 + (ri / (RINGS - 1)) * 0.8;
      const count = Math.round(18 + r * 74);
      const start = rnd() * 6.283;
      for (let n = 0; n < count; n++) {
        pts.push({ r, a: start + n / count * 6.283, ri, band: Math.min(BANDS - 1, Math.floor(ri / RINGS * BANDS)), ph: rnd() * 6.283, k: rnd() });
      }
    }
    for (let n = 0; n < 26; n++) pts.push({ r: 0.07, a: n / 26 * 6.283, ri: -1, band: 0, ph: rnd() * 6.283, k: rnd(), hub: true });   // the label ring
    const ringH = new Float32Array(RINGS);

    const ctx = cv.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, last = 0, t = 0, spin = 0, speed = 0, hover = 0, hoverTo = 0, imp = 0, shown = 0, prep = 0;
    let vol = 1, loud = 0, hot = 0, calmZone = 0, seenIndex = -2, dropAt = -1e9;
    const embers = [];   // points that leave the record and float up during loud passages
    // ---- black hole look: a dark core, a glowing violet disc around it, stars falling in ----
    const CORE = 0.25;                       // radius of the black core, as a share of the record radius
    const core = [];                         // dark cloud of points on a sphere (the "3D" of the core)
    for (let i = 0; i < 300; i++) {
      const y = 1 - (i / 299) * 2, rr = Math.sqrt(1 - y * y), ga = i * 2.399963;
      core.push({ x: Math.cos(ga) * rr, y, z: Math.sin(ga) * rr });
    }
    const stars = [];
    const newStar = (far) => ({ a: rnd() * 6.283, r: far ? 1.2 + rnd() * 1.1 : 0.4 + rnd() * 1.5, h: (rnd() - 0.5) * 0.35, k: rnd(), ph: rnd() * 6.283 });
    for (let i = 0; i < 170; i++) stars.push(newStar(false));
    const zone = document.getElementById('musicDropZone');
    if (zone) {
      zone.addEventListener('mouseenter', () => { hoverTo = 1; });
      zone.addEventListener('mouseleave', () => { hoverTo = 0; });
    }
    const hintIdle = '';   // no text over the record at rest: only progress messages (importing, reloading) appear
    const TILT = -0.62, cx = Math.cos(TILT), sx = Math.sin(TILT);

    function draw(now) {
      requestAnimationFrame(draw);
      const visible = cv.checkVisibility ? cv.checkVisibility({ visibilityProperty: true }) : cv.offsetParent !== null;
      const box = visible ? cv.getBoundingClientRect() : null;
      if (!box || !box.width) { last = now; return; }
      if (!port && now - retry > 2000) { retry = now; connect(); }
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W !== box.width || H !== box.height) { W = box.width; H = box.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      if (!calm) t += dt;

      const playing = !gAudioState.paused && localCurrentIndex >= 0;
      if (hint) {
        const busyLoad = musicLoading.active && now - musicLoading.t0 > 250;   // only said when it really takes a moment
        hint.hidden = !musicImport.active && !musicReload.active && !busyLoad;
        const txt = musicReload.active ? 'Reloading…' : busyLoad ? 'Preparing…' : musicImport.active ? 'Importing ' + Math.min(musicImport.total, musicImport.done + 1) + ' / ' + musicImport.total + '…' : hintIdle;
        if (hint.textContent !== txt) hint.textContent = txt;
      }
      hover += (hoverTo - hover) * Math.min(1, dt * 3.5);
      imp += ((musicImport.active ? 1 : 0) - imp) * Math.min(1, dt * 4);
      shown += ((musicImport.total ? musicImport.done / musicImport.total : 0) - shown) * Math.min(1, dt * 6);
      // Reload: for four seconds the record is swallowed by a black hole at
      // its centre, then thrown back out. 0 = normal, 1 = everything inside.
      let hole = 0;
      if (musicReload.active) {
        const s = Math.min(1, (now - musicReload.t0) / MUSIC_RELOAD_MS);
        const e = (v) => v * v * (3 - 2 * v);
        hole = calm ? 0 : s < 0.6 ? e(s / 0.6) : s < 0.72 ? 1 : 1 - e((s - 0.72) / 0.28);
      }

      // A track is being prepared: the points gather on one groove and a light
      // runs around it. Shown for at least half a second so it never flickers.
      const loadingNow = musicLoading.active || (musicLoading.t0 && now - musicLoading.t0 < 550);
      prep += ((loadingNow && !calm ? 1 : 0) - prep) * Math.min(1, dt * (loadingNow ? 7 : 4));

      // no measurement coming in while a track plays: slow made-up swells instead
      if (playing && now - lastData > 600) {
        for (let n = 0; n < BANDS; n++) raw[n] = 0.3 + 0.22 * Math.sin(t * (0.7 + n * 0.09) + n * 1.7);
      } else if (!playing) raw.fill(0);
      // smooth on purpose: the grooves rise and settle, they never twitch
      let energy = 0;
      for (let n = 0; n < BANDS; n++) { lv[n] += (raw[n] - lv[n]) * Math.min(1, dt * (raw[n] > lv[n] ? 7 : 2.6)); energy += lv[n]; }
      energy /= BANDS;
      // The listening volume sets how much the record moves: low volume, small
      // movements; muted, a flat record that only turns.
      const wantVol = (localMuteBtn && localMuteBtn.dataset.muted === '1') ? 0 : (localVolumeSlider ? Number(localVolumeSlider.value) / 100 : 1);
      vol += (wantVol - vol) * Math.min(1, dt * 5);
      const amp = vol <= 0.005 ? 0 : 0.18 + vol * 0.82;
      energy *= amp;

      // Loud and quiet passages are judged over a second or so, never beat by beat.
      loud += (energy - loud) * Math.min(1, dt * (energy > loud ? 1.6 : 0.8));
      hot += (Math.max(0, Math.min(1, (loud - 0.3) / 0.2)) - hot) * Math.min(1, dt * 2.5);
      calmZone += ((playing && loud < 0.12 && amp > 0 ? 1 : 0) - calmZone) * Math.min(1, dt * 1.2);

      // a new track: one slow wave leaves the centre, like the needle touching the record
      if (localCurrentIndex !== seenIndex) { if (seenIndex !== -2 && localCurrentIndex >= 0) dropAt = now; seenIndex = localCurrentIndex; }
      const dropAge = (now - dropAt) / 1600;   // 0..1 while the wave crosses

      for (let ri = 0; ri < RINGS; ri++) {
        // neighbouring grooves share a little, so the surface is a soft hill, not steps
        const f = ri / RINGS * BANDS, b0 = Math.min(BANDS - 1, Math.floor(f)), b1 = Math.min(BANDS - 1, b0 + 1);
        let hgt = (lv[b0] + (lv[b1] - lv[b0]) * (f - b0)) * amp;
        const rr = ri / (RINGS - 1);
        // quiet passage: a faint swell drifts outwards so the record never looks dead
        hgt += calmZone * 0.07 * (0.5 + 0.5 * Math.sin(rr * 9 - t * 1.4));
        // loud passage: the rim lifts a little, like a bowl
        hgt += hot * 0.12 * rr * rr;
        if (dropAge >= 0 && dropAge < 1) { const off = rr - dropAge * 1.15; hgt += 0.3 * Math.exp(-off * off * 60) * (1 - dropAge); }
        ringH[ri] = hgt;
      }

      // embers: during loud passages, points detach from the highest grooves and drift up
      if (!calm && hot > 0.05 && embers.length < 160) {
        let n = hot * 46 * dt + Math.random();
        while (n > 1 && embers.length < 160) {
          n--;
          const ri = Math.floor(Math.random() * RINGS);
          if (ringH[ri] < 0.22) continue;
          embers.push({ r: 0.2 + ri / (RINGS - 1) * 0.8, a: Math.random() * 6.283, h: ringH[ri] * 0.5, v: 0.22 + Math.random() * 0.3, life: 0, max: 1.1 + Math.random() * 0.9, w: (Math.random() - 0.5) * 0.5 });
        }
      }

      // the record turns while music plays and slows to a stop when it does not
      speed += ((playing ? 1 : localPlaylist.length ? 0.12 : 0.2) - speed) * Math.min(1, dt * 1.6);
      if (!calm) spin += dt * (speed * (0.75 + hot * 0.35) + imp * 2.4 + hole * 2.2);
      const R = Math.min(W * 0.42, H * 0.62);
      const idle = localPlaylist.length || imp > 0.05 ? 1 : 0.85;
      const cyc = H * 0.56;   // the whole record fits above the bottom edge
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // violet glow: strongest right around the black core, fading outwards
      if (hole < 0.5) {
        const g0 = ctx.createRadialGradient(W / 2, cyc, R * CORE * 0.9, W / 2, cyc, R * 1.2);
        g0.addColorStop(0, 'rgba(167,139,250,' + (0.5 + 0.2 * hot).toFixed(3) + ')');
        g0.addColorStop(0.18, 'rgba(124,58,237,' + (0.26 + 0.14 * hot).toFixed(3) + ')');
        g0.addColorStop(0.6, 'rgba(124,58,237,0.07)');
        g0.addColorStop(1, 'rgba(124,58,237,0)');
        ctx.globalAlpha = 1 - hole * 2; ctx.fillStyle = g0;
        ctx.save(); ctx.translate(W / 2, cyc); ctx.scale(1, Math.abs(sx) * 1.15); ctx.translate(-W / 2, -cyc);
        ctx.beginPath(); ctx.arc(W / 2, cyc, R * 1.2, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      // loud passage: a soft light spreads under the record
      if (hot > 0.03 && hole < 0.5) {
        const g = ctx.createRadialGradient(W / 2, cyc, 0, W / 2, cyc, R * 1.25);
        g.addColorStop(0, 'rgba(139,92,246,' + (0.2 * hot).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(139,92,246,0)');
        ctx.globalAlpha = 1 - hole;
        ctx.fillStyle = g;
        ctx.save(); ctx.translate(W / 2, cyc); ctx.scale(1, Math.abs(sx) * 1.15); ctx.translate(-W / 2, -cyc);
        ctx.beginPath(); ctx.arc(W / 2, cyc, R * 1.25, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      const drawPts = (front) => { for (const p of pts) {
        // importing: points arrive from far out and settle into their groove
        const fall = imp * 1.3 * (1 - ((t * 0.9 + p.k) % 1));
        // black hole: outer points leave first, each spirals in faster as it gets close
        const pull = hole <= 0 ? 0 : Math.min(1, Math.max(0, hole * (1.12 + p.k * 0.25) - (1 - p.r) * 0.3));
        const a = p.a + spin + pull * pull * 7;
        const base = p.hub ? CORE * 1.08 : CORE * 1.15 + p.r * (1 - CORE * 1.15);
        const r = (base + (0.56 + (p.k - 0.5) * 0.07 - base) * prep) * (1 + fall) * (1 - pull * 0.97);
        const h0 = (p.hub ? 0 : ringH[p.ri]) * (1 - pull) * (1 - prep);
        // a slow ripple around each groove keeps the surface alive without any jolt
        const h = h0 * (0.72 + 0.28 * Math.sin(p.a * 3 + t * 1.3 + p.ri * 0.5)) * 0.5
          + hover * (0.04 + p.k * 0.16 + Math.sin(t * 1.6 + p.ph) * 0.02);
        const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r, y0 = -h;
        if ((z0 >= 0) !== front || (p.hub && front)) continue;
        const Y = y0 * cx - z0 * sx, Z = y0 * sx + z0 * cx;
        const k = 1 / (1 - Z * 0.22);
        // the running light: brightest at its head, fading behind it
        const head = prep > 0.02 ? Math.pow(1 - ((((p.a - t * 5.5) % 6.2832) + 6.2832) % 6.2832) / 6.2832, 3) * prep : 0;
        const hi = Math.min(1, h0 * 1.25 + head);
        ctx.globalAlpha = Math.max(0.2, Math.min(1, (idle + energy * 0.3) * (0.55 + (Z + 1) * 0.3) + hi * 0.45 - fall * 0.2 + (p.hub ? 0.3 : 0) + pull * 0.35)) * (pull > 0.9 ? (1 - pull) * 10 : 1);
        ctx.fillStyle = hi > 0.72 ? '#f1eaff' : hi > 0.4 ? '#c9b8ff' : p.hub ? '#f1eaff' : p.r < 0.22 ? '#ddd0ff' : p.r < 0.6 ? '#a78bfa' : '#8b5cf6';
        ctx.beginPath(); ctx.arc(W / 2 + x0 * R * k, cyc + Y * R * k, (1.2 + hi * 0.7) * k, 0, 6.2832); ctx.fill();
      } };
      drawPts(false);
      // the black core: a dark sphere of points with a thin violet rim of light
      const coreR = R * CORE * (1 - hole * 0.4), coreY = cyc;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#020108';
      ctx.beginPath(); ctx.arc(W / 2, coreY, coreR, 0, 6.2832); ctx.fill();
      {
        const ca = Math.cos(t * 0.18), sa = Math.sin(t * 0.18);
        for (const c of core) {
          const x1 = c.x * ca + c.z * sa, z1 = -c.x * sa + c.z * ca;
          const y2 = c.y * 0.9 - z1 * 0.44, z2 = c.y * 0.44 + z1 * 0.9;
          const d = (z2 + 1) / 2;
          ctx.globalAlpha = 0.18 + 0.5 * d * d;
          ctx.fillStyle = d > 0.7 ? '#4a3a8a' : '#2a2050';
          ctx.beginPath(); ctx.arc(W / 2 + x1 * coreR * 0.97, coreY + y2 * coreR * 0.97, 0.7 + d * 0.8, 0, 6.2832); ctx.fill();
        }
      }
      ctx.save();
      ctx.globalAlpha = 0.85 + hot * 0.15;
      ctx.shadowColor = 'rgba(167,139,250,0.95)'; ctx.shadowBlur = 12 + hot * 10;
      ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(W / 2, coreY, coreR, 0, 6.2832); ctx.stroke();
      ctx.restore();
      drawPts(true);
      // stars fall in: they drift towards the core on a spiral, faster as they get close, and are swallowed
      const sp = (calm ? 0 : 1) * (0.75 + (playing ? 0.6 : 0) + hot * 1.4);
      for (const s of stars) {
        if (!calm) {
          const fallv = (0.035 + 0.16 / (s.r * s.r + 0.15)) * sp * dt;
          s.r -= fallv * (1 + hole * 3); s.a += dt * sp * 0.5 / Math.pow(Math.max(0.3, s.r), 1.5) * 0.35;
          if (s.r < CORE * 0.95) Object.assign(s, newStar(true));
        }
        const fadeIn = Math.max(0, Math.min(1, (1.3 - s.r) / 0.2)), fadeOut = Math.max(0, Math.min(1, (s.r - CORE) / 0.2));
        const tw = 0.7 + 0.3 * Math.sin(t * 2.2 + s.ph);
        for (let tr = 0; tr < 3; tr++) {
          if (tr && s.r > 0.9) break;
          const a2 = s.a - tr * 0.07 / Math.max(0.4, s.r);
          const x0 = Math.cos(a2) * s.r, z0 = Math.sin(a2) * s.r, y0 = -s.h * s.r;
          const Y = y0 * cx - z0 * sx, Z = y0 * sx + z0 * cx, k = 1 / (1 - Z * 0.22);
          ctx.globalAlpha = Math.min(1, fadeIn * fadeOut * tw * (tr ? 0.35 / tr : 0.95) * (0.55 + (Z + 1) * 0.3));
          ctx.fillStyle = s.k > 0.6 ? '#ffffff' : '#e0d4ff';
          ctx.beginPath(); ctx.arc(W / 2 + x0 * R * k, cyc + Y * R * k, (0.8 + s.k * 1.1) * k * (1 - tr * 0.25), 0, 6.2832); ctx.fill();
        }
      }
      for (let n = embers.length - 1; n >= 0; n--) {
        const e = embers[n];
        e.life += dt; e.h += e.v * dt; e.a += e.w * dt;
        if (e.life >= e.max || hole > 0.3) { embers.splice(n, 1); continue; }
        const a = e.a + spin, x0 = Math.cos(a) * e.r, z0 = Math.sin(a) * e.r, y0 = -e.h * 0.5;
        const Y = y0 * cx - z0 * sx, Z = y0 * sx + z0 * cx, k = 1 / (1 - Z * 0.22);
        const f = e.life / e.max;
        ctx.globalAlpha = Math.max(0, Math.min(1, (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85) * 0.85));
        ctx.fillStyle = '#e9e0ff';
        ctx.beginPath(); ctx.arc(W / 2 + x0 * R * k, cyc + Y * R * k, (1.1 - f * 0.6) * k, 0, 6.2832); ctx.fill();
      }
      // the hole itself: a dark disc with a thin bright rim, seen at the record's angle
      if (hole > 0.02) {
        const hr = R * (0.05 + hole * 0.13);
        ctx.globalAlpha = Math.min(1, hole * 1.4);
        ctx.fillStyle = '#05040b';
        ctx.beginPath(); ctx.ellipse(W / 2, cyc, hr, hr * Math.abs(sx) * 1.25, 0, 0, 6.2832); ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(167,139,250,0.95)'; ctx.shadowBlur = 14 * hole;
        ctx.strokeStyle = '#e9e0ff'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(W / 2, cyc, hr * 1.12, hr * 1.12 * Math.abs(sx) * 1.25, 0, 0, 6.2832); ctx.stroke();
        ctx.restore();
      }
      // import progress: a thin arc closing around the record
      if (imp > 0.02) {
        ctx.globalAlpha = imp * 0.9;
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        const ry = R * 1.12 * Math.abs(sx), rxl = R * 1.12;
        ctx.strokeStyle = 'rgba(167,139,250,0.22)';
        ctx.beginPath(); ctx.ellipse(W / 2, cyc, rxl, ry, 0, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = '#c4b5fd';
        ctx.beginPath(); ctx.ellipse(W / 2, cyc, rxl, ry, 0, -1.5708, -1.5708 + 6.2832 * Math.max(0.02, shown)); ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  })();

  // @module 30-text-expander  (dev/popup-src/30-text-expander.js)
  const expanderShortcut = document.getElementById('expanderShortcut');
  const expanderText = document.getElementById('expanderText');
  const expanderAddBtn = document.getElementById('expanderAddBtn');
  const expanderList = document.getElementById('expanderList');
  const expanderCount = document.getElementById('expanderCount');

  let textExpanderRules = [];

  function loadExpanderRules() {
    chrome.storage.local.get('textExpanderRules', (data) => {
      textExpanderRules = data.textExpanderRules || [];
      renderExpanderRules();
    });
  }

  function saveExpanderRules() {
    chrome.storage.local.set({ textExpanderRules });
  }

  const expanderSearch = document.getElementById('expanderSearch');
  const expanderModal = document.getElementById('expanderModal');
  const expEditShortcut = document.getElementById('expEditShortcut');
  const expEditText = document.getElementById('expEditText');
  let expEditing = null; // the rule being edited in the window

  function renderExpanderRules() {
    if (expanderCount) expanderCount.textContent = textExpanderRules.length;
    if (!expanderList) return;
    if (expanderSearch) {
      expanderSearch.hidden = textExpanderRules.length < 5;
      if (expanderSearch.hidden) expanderSearch.value = '';
    }

    if (textExpanderRules.length === 0) {
      expanderList.innerHTML = '<div class="clip-empty">No shortcuts yet. Add your first one above.</div>';
      return;
    }

    const q = expanderSearch ? expanderSearch.value.trim().toLowerCase() : '';
    expanderList.innerHTML = '';
    let shown = 0;
    textExpanderRules.forEach((rule) => {
      const sc = String(rule.shortcut || ''), body = String(rule.text || '');
      if (q && !sc.toLowerCase().includes(q) && !body.toLowerCase().includes(q)) return;
      shown++;
      const el = document.createElement('div');
      el.className = 'exp-item';
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.title = 'Edit';

      const main = document.createElement('div');
      main.className = 'exp-item-main';
      const key = document.createElement('span');
      key.className = 'exp-key';
      key.textContent = sc;
      const txt = document.createElement('span');
      txt.className = 'exp-text';
      txt.textContent = body;
      main.appendChild(key);
      main.appendChild(txt);

      const delBtn = document.createElement('button');
      delBtn.className = 'exp-del';
      delBtn.innerHTML = '<span class="trash-svg-icon" style="width:13px;height:13px;"></span>';
      delBtn.title = 'Delete';
      delBtn.setAttribute('aria-label', 'Delete ' + sc);
      delBtn.onclick = (e) => {
        e.stopPropagation();
        const at = textExpanderRules.indexOf(rule);
        if (at < 0) return;
        textExpanderRules.splice(at, 1);
        saveExpanderRules();
        renderExpanderRules();
        showToast('Shortcut deleted');
      };

      el.addEventListener('click', () => openExpanderEdit(rule));
      el.addEventListener('keydown', (e) => {
        if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openExpanderEdit(rule); }
      });

      el.appendChild(main);
      el.appendChild(delBtn);
      expanderList.appendChild(el);
    });
    if (!shown) expanderList.innerHTML = '<div class="clip-empty">No shortcut matches</div>';
  }
  if (expanderSearch) expanderSearch.addEventListener('input', renderExpanderRules);

  // Editing happens in its own window: whatever is being typed in the
  // "new shortcut" form stays as it is.
  let expLastFocus = null;
  function openExpanderEdit(rule) {
    if (!expanderModal) return;
    expEditing = rule;
    expLastFocus = document.activeElement;
    expEditShortcut.value = rule.shortcut || '';
    expEditText.value = rule.text || '';
    expanderModal.hidden = false;
    expEditText.focus();
    expEditText.setSelectionRange(expEditText.value.length, expEditText.value.length);
  }
  function closeExpanderEdit() {
    if (!expanderModal || expanderModal.hidden) return;
    expanderModal.hidden = true;
    expEditing = null;
    if (expLastFocus && expLastFocus.isConnected) expLastFocus.focus();
  }
  function saveExpanderEdit() {
    if (!expEditing) return;
    const sc = expEditShortcut.value.trim();
    const txt = expEditText.value;
    if (!sc || !txt) { showToast('Fill in both fields'); return; }
    if (textExpanderRules.some(r => r !== expEditing && r.shortcut === sc)) { showToast('Another shortcut already uses this name'); return; }
    if (!textExpanderRules.includes(expEditing)) { closeExpanderEdit(); return; }
    expEditing.shortcut = sc;
    expEditing.text = txt;
    saveExpanderRules();
    renderExpanderRules();
    closeExpanderEdit();
    showToast('Shortcut saved');
  }
  if (expanderModal) {
    document.getElementById('expEditCancel').addEventListener('click', closeExpanderEdit);
    document.getElementById('expEditSave').addEventListener('click', saveExpanderEdit);
    expanderModal.addEventListener('mousedown', (e) => { if (e.target === expanderModal) closeExpanderEdit(); });
    expanderModal.addEventListener('keydown', (e) => {
      e.stopPropagation(); // tool hotkeys must not fire behind the window
      if (e.key === 'Escape') { e.preventDefault(); closeExpanderEdit(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveExpanderEdit(); }
      else if (e.key === 'Enter' && e.target === expEditShortcut) { e.preventDefault(); expEditText.focus(); }
      else if (e.key === 'Tab') { // keep the focus inside the window
        const f = [expEditShortcut, expEditText, document.getElementById('expEditCancel'), document.getElementById('expEditSave')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  if (expanderAddBtn) {
    const addRule = () => {
      const sc = expanderShortcut.value.trim();
      const txt = expanderText.value;
      if (!sc || !txt) {
        showToast('Fill in both fields');
        (sc ? expanderText : expanderShortcut).focus();
        return;
      }
      // Check if shortcut exists
      const existing = textExpanderRules.findIndex(r => r.shortcut === sc);
      if (existing >= 0) {
        textExpanderRules[existing].text = txt;
      } else {
        textExpanderRules.push({ shortcut: sc, text: txt });
      }
      saveExpanderRules();
      renderExpanderRules();
      expanderShortcut.value = '';
      expanderText.value = '';
      expanderShortcut.focus();
      showToast(existing >= 0 ? 'Shortcut updated' : 'Shortcut added');
    };
    expanderAddBtn.addEventListener('click', addRule);
    expanderShortcut.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); expanderText.focus(); } });
    expanderText.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addRule(); } });
  }

  loadExpanderRules();

  // @module 31-backup-and-links  (dev/popup-src/31-backup-and-links.js)
  const EXPORT_LINK_PREFIX = 'workbox-data://';
  // Doit rester aligné avec TEXT_LIMIT dans background.js — c'est là que la
  // vraie limite de capture est appliquée, ceci ne fait que l'appliquer aussi
  // après un import pour éviter de retomber sur un vieux plafond de 100.
  const IMPORT_TEXT_LIMIT = 5000;

  // Compression gzip native (CompressionStream) + base64 : réduit la taille du
  // lien d'environ 90% par rapport au JSON brut, pour rester copiable/collable
  // facilement (Discord, SMS, etc. ont des limites de longueur de message).
  function bytesToB64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }
  async function gzipBytes(str) {
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function gunzipText(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function encodeExportPayload(payload) {
    return EXPORT_LINK_PREFIX + bytesToB64(await gzipBytes(JSON.stringify(payload)));
  }

  async function decodeExportLink(raw) {
    const trimmed = String(raw || '').trim();
    // Cherche le préfixe où qu'il soit dans le texte collé, et prend le base64 qui suit
    const prefixMatch = trimmed.match(/workbox-data:\/\/([A-Za-z0-9+/=]+)/i);
    const b64 = prefixMatch ? prefixMatch[1] : trimmed.replace(/[^A-Za-z0-9+/=]/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return validateImportPayload(JSON.parse(await gunzipText(bytes)));
  }

  function validateImportPayload(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.notes) || !Array.isArray(payload.clipItems)) {
      throw new Error('Invalid format');
    }
    // entries are rebuilt field by field: a null entry or a wrong type must never reach the merge
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    const str = (x) => (typeof x === 'string' ? x : (typeof x === 'number' ? String(x) : ''));
    const time = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
    const list = (x) => (Array.isArray(x) ? x : []);
    return {
      notes: payload.notes.filter(isObj).map(n => ({ title: str(n.title), content: str(n.content), color: typeof n.color === 'string' ? n.color : null, createdAt: time(n.createdAt) })),
      clipItems: payload.clipItems.filter(isObj).map(c => ({ text: str(c.text), category: list(c.category).filter(t => typeof t === 'string' && t), timestamp: time(c.timestamp) })),
      todoItems: list(payload.todoItems).filter(isObj).map(t => ({ text: str(t.text), done: t.done === true, priority: ['high', 'medium', 'normal', 'low'].includes(t.priority) ? t.priority : 'normal', createdAt: time(t.createdAt) })),
      colors: list(payload.colors).filter(c => typeof c === 'string')
    };
  }

  // Long texts live compressed apart: they are read back in full for a backup.
  // A link has to stay copyable, so it only takes long texts up to a small
  // budget (compressed size); the .json file always takes everything.
  const LINK_BIG_BUDGET = 1500000;
  async function buildExportPayload({ forLink = false } = {}) {
    // Les éléments 🔒 Privé / 🔑 Mot de passe ne sont jamais exportés
    const safeClips = clipItems.filter(item => {
      const cats = item.category || [];
      return !cats.includes('🔒 Private') && !cats.includes('🔑 Password')
        && !String(item.text || '').trim().startsWith('workbox-data://'); // never embed a backup link inside a backup
    });
    let budget = LINK_BIG_BUDGET, omittedBig = 0;
    const clips = [];
    for (const c of safeClips) {
      let text = c.text;
      if (c.big) {
        if (forLink && c.big.bytes > budget) { omittedBig++; continue; }
        try { text = await WBBig.load(c); } catch (e) { continue; }
        if (forLink) budget -= c.big.bytes;
      }
      clips.push({ text, category: c.category || [], timestamp: c.timestamp || Date.now() });
    }
    const payload = {
      v: 2,
      app: 'WorkBox',
      exportedAt: Date.now(),
      notes: notes.map(n => ({ title: n.title || 'Note', content: n.content || '', color: n.color || null, createdAt: n.createdAt || null })),
      clipItems: clips,
      todoItems: todoItems.map(t => ({ text: t.text, done: !!t.done, priority: t.priority || 'normal', createdAt: t.createdAt || Date.now() })),
      colors: colorHistList.filter(c => c.pinned).map(c => c.hex)
    };
    Object.defineProperty(payload, 'omittedBig', { value: omittedBig, enumerable: false });
    return payload;
  }

  // Fusionne un payload importé (venant d'un lien ou d'un fichier .json) dans les données actuelles.
  // Rien n'est jamais écrasé : tout s'ajoute, les doublons exacts sont ignorés.
  async function mergeImportedPayload(payload, replace) {
    try { payload = validateImportPayload(payload); }
    catch (e) { showToast('❌ Invalid or corrupted backup.'); return { addedNotes: 0, addedClips: 0, addedTodos: 0, addedColors: 0 }; }
    // "Replace" mode: what is on this device goes first, then the backup is added.
    // Private and Password items are never in a backup, so they are kept either way.
    if (replace) {
      notes.length = 0;
      clipItems = clipItems.filter(i => { const c = i.category || []; return c.includes('🔒 Private') || c.includes('🔑 Password'); });
      todoItems.length = 0;
      for (let i = colorHistList.length - 1; i >= 0; i--) if (colorHistList[i].pinned) colorHistList.splice(i, 1);
    }
    let addedNotes = 0;
    (payload.notes || []).forEach(n => {
      const isDupe = notes.some(existing => existing.title === n.title && existing.content === n.content);
      if (isDupe) return;
      notes.push({
        id: generateNoteId(),
        title: n.title || 'Note imported',
        content: n.content || '',
        pinned: false,
        color: n.color || null,
        createdAt: n.createdAt || Date.now()
      });
      addedNotes++;
    });

    let addedClips = 0;
    for (const c of (payload.clipItems || [])) {
      const normalized = String(c.text || '').replace(/\r/g, '');
      if (!normalized || normalized.length > WBBig.MAX_CHARS) continue;
      const long = WBBig.isBig(normalized);
      const fp = long ? WBBig.fingerprint(normalized) : '';
      const exists = clipItems.some(e => long
        ? !!(e.big && e.big.fp === fp)
        : (!e.big && String(e.text).replace(/\r/g, '') === normalized));
      if (exists) continue;
      let entry = { text: normalized };
      if (long) { try { entry = await WBBig.make(normalized); } catch (e) { continue; } }
      clipItems.unshift({
        ...entry,
        category: c.category.length ? c.category : ['📝 Text'],
        timestamp: c.timestamp || Date.now(),
        pinned: false
      });
      addedClips++;
    }

    // On respecte la même limite qu'à la capture (voir TEXT_LIMIT côté background.js)
    const pinnedItems = clipItems.filter(i => i.pinned);
    const unpinnedItems = clipItems.filter(i => !i.pinned).slice(0, IMPORT_TEXT_LIMIT);
    clipItems = [...pinnedItems, ...unpinnedItems].sort((a, b) => b.timestamp - a.timestamp);

    let addedTodos = 0;
    (payload.todoItems || []).forEach(t => {
      const text = String(t.text || '').trim();
      if (!text) return;
      const exists = todoItems.some(existing => existing.text === text);
      if (exists) return;
      todoItems.push({
        id: genTodoId(),
        text,
        done: !!t.done,
        priority: t.priority || 'normal',
        createdAt: t.createdAt || Date.now()
      });
      addedTodos++;
    });

    // Importées comme épinglées, sinon loadColorHistory() les effacerait à la
    // prochaine ouverture (seules les couleurs épinglées survivent au rechargement).
    let addedColors = 0;
    (payload.colors || []).forEach(hex => {
      const normalized = String(hex || '').trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(normalized)) return;
      const exists = colorHistList.some(c => c.hex.toUpperCase() === normalized);
      if (exists) return;
      colorHistList.push({ hex: normalized, pinned: true });
      addedColors++;
    });

    if (!notes.length) notes.push({ id: generateNoteId(), title: 'Note 1', content: '', pinned: false, color: null, createdAt: Date.now() });
    saveNotes(true);
    saveClipboard(true);
    saveTodos();
    saveColorHistory();
    renderNoteTabs();
    if (notes.length) { activeNoteId = notes[notes.length - 1].id; showNote(activeNoteId); chrome.storage.local.set({ notes, activeNoteId }); }
    renderClipCategories();
    renderClipList();
    renderColorHistory();

    return { addedNotes, addedClips, addedTodos, addedColors };
  }

  const copySecretKeyBtn = document.getElementById('copySecretKeyBtn');

  // One button handles the link: create (and copy) it, or import a link pasted in the field.
  // Once created, the link keeps itself up to date while data changes, and a status
  // line says when it was last updated and what triggered it.
  const linkField = document.getElementById('linkField');
  const linkStatus = document.getElementById('linkStatus');
  let ownLink = '';
  let linkActive = false;
  let linkTimer = null;
  let linkInfo = null;                 // { ts, by: 'button' | 'auto', what, sig }
  const pendingKeys = new Set();       // storage keys that changed since the last refresh
  const LINK_KEYS = { notes: 'your notes', clipItems: 'your clipboard', todoItems: 'your tasks', colorHistory: 'your colors' };

  function hash32(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }
  function dataSignature(payload) {
    // Short fingerprint per section, ignoring the export timestamp
    return {
      notes: hash32(JSON.stringify(payload.notes.map(n => [n.title, n.content, n.color]))),
      clipItems: hash32(JSON.stringify(payload.clipItems.map(c => [c.text, c.category]))),
      todoItems: hash32(JSON.stringify(payload.todoItems.map(t => [t.text, t.done, t.priority]))),
      colorHistory: hash32(JSON.stringify(payload.colors))
    };
  }
  function formatWhen(ts) {
    const d = new Date(ts), n = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOf(n) - startOf(d)) / 86400000);
    if (diffDays === 0) return `today at ${time}`;
    if (diffDays === 1) return `yesterday at ${time}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ` at ${time}`;
  }
  function renderLinkStatus() {
    if (!linkStatus) return;
    if (!linkActive || !linkInfo) { linkStatus.textContent = 'Not created yet.'; return; }
    const by = linkInfo.by === 'button' ? 'by you, with the button'
      : `automatically, after a change in ${linkInfo.what || 'your data'}`;
    linkStatus.textContent = `Last updated ${formatWhen(linkInfo.ts)} · ${by}`;
  }
  function saveLinkInfo() { chrome.storage.local.set({ wbLinkInfo: linkInfo }); }

  // Import mode: keep what is on this device (default) or replace it with the backup.
  const importModeBox = document.getElementById('importMode');
  const importReplaces = () => !!(importModeBox && importModeBox.querySelector('[data-mode="replace"][aria-checked="true"]'));
  let replaceArmed = null;
  function resetImportMode() {
    replaceArmed = null;
    if (importModeBox) importModeBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === 'keep' ? 'true' : 'false'));
  }
  // Replacing deletes data: the first click only warns, the second one does it.
  function confirmReplace(btn) {
    if (!importReplaces() || replaceArmed === btn) return true;
    replaceArmed = btn;
    showToast('⚠️ This deletes your current notes, clipboard, tasks and pinned colors. Click again to confirm.');
    setTimeout(() => { if (replaceArmed === btn) replaceArmed = null; }, 6000);
    return false;
  }
  if (importModeBox) importModeBox.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    replaceArmed = null;
    importModeBox.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
  });

  // The backup field only ever shows this device's own link; importing has its own field.
  function isForeignLink() { return false; }
  function updateLinkBtnLabel() {
    if (copySecretKeyBtn) copySecretKeyBtn.textContent = linkActive ? 'Copy link' : 'Create link';
  }
  async function refreshOwnLink(reason) {
    if (!linkActive || !linkField || isForeignLink()) return;
    try {
      const payload = await buildExportPayload({ forLink: true });
      const sig = dataSignature(payload);
      const old = (linkInfo && linkInfo.sig) || {};
      const diff = Object.keys(LINK_KEYS).filter(k => old[k] !== sig[k]);
      if (!diff.length && ownLink) return;                   // nothing new: keep the link as is
      ownLink = await encodeExportPayload(payload);
      linkField.value = ownLink;
      if (diff.length) {
        linkInfo = { ts: Date.now(), by: 'auto', what: diff.map(k => LINK_KEYS[k]).join(', '), sig };
        saveLinkInfo();
      }
      pendingKeys.clear();
      renderLinkStatus();
      updateLinkBtnLabel();
    } catch (_) { }
  }
  function scheduleLinkRefresh() {
    if (!linkActive) return;
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => refreshOwnLink('change'), 1200);
  }

  // Creates the backup link, copies it, and switches on the self-updating behaviour.
  async function createBackupLink() {
    try {
      if (copySecretKeyBtn) copySecretKeyBtn.disabled = true;
      const payload = await buildExportPayload({ forLink: true });
      const link = await encodeExportPayload(payload);
      ownLink = link;
      linkField.value = link;
      linkField.scrollLeft = 0;
      linkActive = true;
      linkInfo = { ts: Date.now(), by: 'button', what: null, sig: dataSignature(payload) };
      pendingKeys.clear();
      chrome.storage.local.set({ wbLinkActive: true, wbLinkInfo: linkInfo });
      renderLinkStatus();
      await navigator.clipboard.writeText(link);
      showToast(payload.omittedBig
        ? '🔗 Link copied · ' + payload.omittedBig + ' very long text(s) left out, the file export keeps them.'
        : '🔗 Link copied · it will keep itself up to date.');
      noteBackupDone();
      return true;
    } catch (e) {
      showToast('Error generating the link.');
      return false;
    } finally {
      if (copySecretKeyBtn) copySecretKeyBtn.disabled = false;
      updateLinkBtnLabel();
    }
  }

  if (copySecretKeyBtn && linkField) {
    renderLinkStatus();
    chrome.storage.local.get(['wbLinkActive', 'wbLinkInfo'], (r) => {
      linkActive = r.wbLinkActive === true;
      linkInfo = r.wbLinkInfo || null;
      renderLinkStatus();
      updateLinkBtnLabel();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const hit = Object.keys(changes).filter(k => LINK_KEYS[k]);
      if (!hit.length) return;
      hit.forEach(k => pendingKeys.add(k));
      scheduleLinkRefresh();
    });
    settingsOpenBtn.addEventListener('click', () => { renderLinkStatus(); refreshOwnLink('open'); });
    copySecretKeyBtn.addEventListener('click', () => createBackupLink());

    // ---- Restore: its own field, so a pasted link never mixes with this device's link ----
    const importLinkField = document.getElementById('importLinkField');
    const importLinkBtn = document.getElementById('importLinkBtn');
    const pasteLinkBtn = document.getElementById('pasteLinkBtn');
    if (importLinkField && importLinkBtn) {
      const syncImportBtn = () => { importLinkBtn.disabled = !importLinkField.value.trim(); replaceArmed = null; };
      importLinkField.addEventListener('input', syncImportBtn);
      if (pasteLinkBtn) pasteLinkBtn.addEventListener('click', async () => {
        let txt = '';
        try { txt = (await navigator.clipboard.readText()).trim(); } catch (_) { }
        if (/^workbox-data:\/\//i.test(txt)) {
          importLinkField.value = txt;
          importLinkField.scrollLeft = 0;
          syncImportBtn();
          showToast('Link pasted');
        } else {
          importLinkField.focus();
          showToast('Copy a backup link first, or paste it in the field');
        }
      });
      importLinkBtn.addEventListener('click', async () => {
        let payload;
        try { payload = await decodeExportLink(importLinkField.value); }
        catch (e) { showToast('❌ Invalid or corrupted link.'); return; }
        if (!confirmReplace(importLinkBtn)) return;
        const replacing = importReplaces();
        const { addedNotes, addedClips, addedTodos, addedColors } = await mergeImportedPayload(payload, replacing);
        showToast(`✅ ${replacing ? 'Restored' : 'Added'}: ${addedNotes} notes · ${addedClips} texts · ${addedTodos} tasks · ${addedColors} colors`);
        resetImportMode();
        importLinkField.value = '';
        syncImportBtn();
      });
    }
  }

  const exportJsonFileBtn = document.getElementById('exportJsonFileBtn');
  const importJsonFileBtn = document.getElementById('importJsonFileBtn');
  const importJsonFileInput = document.getElementById('importJsonFileInput');

  if (exportJsonFileBtn) {
    exportJsonFileBtn.addEventListener('click', async () => {
      exportJsonFileBtn.disabled = true;
      try {
        const payload = await buildExportPayload();
        const json = JSON.stringify(payload, null, 2);
        // a big backup is written compressed (.json.gz); the import reads both
        const packed = json.length > 2000000;
        const blob = packed ? new Blob([await gzipBytes(json)], { type: 'application/gzip' }) : new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workbox-backup-${dateStr}.json${packed ? '.gz' : ''}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showToast(`💾 File exported (${payload.notes.length} note(s), ${payload.clipItems.length} text(s), ${payload.todoItems.length} task(s), ${payload.colors.length} color(s)).`);
        noteBackupDone();
      } catch (e) {
        showToast('❌ Could not create the file.');
      } finally {
        exportJsonFileBtn.disabled = false;
      }
    });
  }

  if (importJsonFileBtn && importJsonFileInput) {
    importJsonFileBtn.addEventListener('click', () => { if (!confirmReplace(importJsonFileBtn)) return; importJsonFileInput.click(); });

    importJsonFileInput.addEventListener('change', async () => {
      const file = importJsonFileInput.files && importJsonFileInput.files[0];
      importJsonFileInput.value = '';
      if (!file) return;

      let payload;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const gz = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
        const text = gz ? await gunzipText(bytes) : new TextDecoder().decode(bytes);
        payload = validateImportPayload(JSON.parse(text));
      } catch (e) {
        showToast('❌ Invalid or corrupted file.');
        return;
      }

      const replacing = importReplaces();
      const { addedNotes, addedClips, addedTodos, addedColors } = await mergeImportedPayload(payload, replacing);
      showToast(`✅ ${replacing ? 'Restored' : 'Added'}: ${addedNotes} notes · ${addedClips} texts · ${addedTodos} tasks · ${addedColors} colors`);
      resetImportMode();
    });
  }

  // @module 32-import-other-clipboard  (dev/popup-src/32-import-other-clipboard.js)
  // ===== Import from another clipboard extension =====
  // An extension can never read another extension's data, so this works from
  // the file the other extension exports. Formats differ from one to the next
  // and change over time: instead of one parser per product, the content is
  // read by shape (JSON, CSV or plain text) and every piece of copied text
  // found in it is kept.
  (function initForeignClipImport() {
    const modal = document.getElementById('clipForeignModal');
    const openBtn = document.getElementById('clipForeignBtn');
    if (!modal || !openBtn) return;
    const fileInput = document.getElementById('clipForeignFile');
    const pasteBox = document.getElementById('clipForeignText');
    const preview = document.getElementById('clipForeignPreview');
    const goBtn = document.getElementById('clipForeignGo');
    const MAX_ITEM = 100000;          // one text
    const MAX_FILE = 30 * 1024 * 1024;
    let found = [];

    const TEXT_KEYS = ['text', 'content', 'value', 'clip', 'data', 'body', 'copy', 'copied', 'string', 'snippet', 'plain', 'plaintext', 'item', 'note', 'url', 'link', 'title'];
    const TIME_KEYS = ['timestamp', 'time', 'date', 'created', 'createdat', 'created_at', 'addedat', 'added', 'ts', 'lastused', 'updatedat', 'copiedat'];
    const PIN_KEYS = ['pinned', 'favorite', 'favourite', 'starred', 'isfavorite', 'fav', 'ispinned', 'star'];

    function toTime(v) {
      if (typeof v === 'number' && isFinite(v) && v > 0) return v < 1e11 ? v * 1000 : v;   // seconds or milliseconds
      if (typeof v === 'string' && v.trim()) {
        if (/^\d{9,13}$/.test(v.trim())) return toTime(Number(v));
        const d = Date.parse(v);
        if (!isNaN(d)) return d;
      }
      return 0;
    }
    function fromJson(root) {
      const out = [];
      const add = (text, ts, pinned) => {
        if (typeof text !== 'string') return;
        const t = text.replace(/\r/g, '');
        if (!t.trim() || t.length > MAX_ITEM || /^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(t)) return;   // images are not text history
        out.push({ text: t, timestamp: ts || 0, pinned: !!pinned });
      };
      const walk = (node, depth) => {
        if (depth > 8 || out.length > 20000) return;
        if (typeof node === 'string') { add(node); return; }
        if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
        if (!node || typeof node !== 'object') return;
        const keys = Object.keys(node), low = keys.map((k) => k.toLowerCase());
        // an entry: an object that carries its text under a usual name
        let textKey = null;
        for (const want of TEXT_KEYS) { const at = low.indexOf(want); if (at >= 0 && typeof node[keys[at]] === 'string' && node[keys[at]].trim()) { textKey = keys[at]; break; } }
        if (textKey) {
          let ts = 0, pinned = false;
          low.forEach((k, at) => {
            if (!ts && TIME_KEYS.includes(k)) ts = toTime(node[keys[at]]);
            if (PIN_KEYS.includes(k) && (node[keys[at]] === true || node[keys[at]] === 1 || node[keys[at]] === 'true')) pinned = true;
          });
          add(node[textKey], ts, pinned);
          return;
        }
        // otherwise a container: look inside lists and objects, not at loose settings
        keys.forEach((k) => { const v = node[k]; if (v && typeof v === 'object') walk(v, depth + 1); });
        // a plain map of id -> text
        if (keys.length >= 2 && keys.every((k) => typeof node[k] === 'string') && keys.every((k) => /^[\w-]{6,}$|^\d+$/.test(k))) keys.forEach((k) => add(node[k], toTime(k)));
      };
      walk(root, 0);
      return out;
    }
    function parseCsv(text, sep) {
      const rows = []; let row = [], cur = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === sep) { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (ch !== '\r') cur += ch;
      }
      if (cur || row.length) { row.push(cur); rows.push(row); }
      return rows.filter((r) => r.some((v) => v.trim()));
    }
    function fromCsv(text) {
      const first = text.slice(0, 2000).split('\n')[0] || '';
      const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
      const rows = parseCsv(text, sep);
      if (rows.length < 2 || rows[0].length < 2) return [];
      const head = rows[0].map((v) => v.trim().toLowerCase());
      const hasHead = head.some((v) => TEXT_KEYS.includes(v) || TIME_KEYS.includes(v) || PIN_KEYS.includes(v));
      const body = hasHead ? rows.slice(1) : rows;
      let col = hasHead ? head.findIndex((v) => TEXT_KEYS.includes(v)) : -1;
      if (col < 0) {   // no usable title: the column with the longest texts
        let best = -1;
        for (let n = 0; n < rows[0].length; n++) {
          const len = body.reduce((s, r) => s + (toTime(r[n] || '') ? 0 : (r[n] || '').length), 0);
          if (len > best) { best = len; col = n; }
        }
      }
      const tcol = hasHead ? head.findIndex((v) => TIME_KEYS.includes(v)) : -1;
      const pcol = hasHead ? head.findIndex((v) => PIN_KEYS.includes(v)) : -1;
      return body.map((r) => ({ text: (r[col] || '').replace(/\r/g, ''), timestamp: tcol >= 0 ? toTime(r[tcol]) : 0, pinned: pcol >= 0 && /^(true|1|yes)$/i.test((r[pcol] || '').trim()) }))
        .filter((x) => x.text.trim() && x.text.length <= MAX_ITEM);
    }
    function fromText(text) {
      const t = text.replace(/\r/g, '');
      // items separated by blank lines or by lines of dashes; otherwise one per line
      let parts = t.split(/\n\s*(?:-{3,}|={3,}|\*{3,})\s*\n|\n{2,}/);
      if (parts.length < 2) parts = t.split('\n');
      return parts.map((p) => p.trim()).filter((p) => p && p.length <= MAX_ITEM).map((p) => ({ text: p, timestamp: 0, pinned: false }));
    }
    function parseForeign(raw, name) {
      const text = String(raw || '').replace(/^﻿/, '');
      if (!text.trim()) return [];
      const head = text.trimStart()[0];
      if (head === '{' || head === '[') {
        try { const got = fromJson(JSON.parse(text)); if (got.length) return got; } catch (e) { /* not JSON after all */ }
      }
      if (/\.(csv|tsv)$/i.test(name || '')) { const got = fromCsv(text); if (got.length) return got; }
      const csv = fromCsv(text);
      // a real table has the same number of columns on most lines
      if (csv.length >= 3 && !/\.txt$/i.test(name || '')) {
        const lines = text.split('\n').filter((l) => l.trim());
        if (csv.length >= lines.length * 0.6) return csv;
      }
      return fromText(text);
    }

    function show(list, label) {
      // newest first, no doubles, nothing already in the history
      const seen = new Set(clipItems.map((c) => String(c.text).replace(/\r/g, '')));
      const fresh = [];
      list.forEach((it) => { if (!seen.has(it.text)) { seen.add(it.text); fresh.push(it); } });
      found = fresh;
      preview.hidden = false;
      preview.textContent = '';
      const line = document.createElement('div');
      line.className = 'cf-count';
      const already = list.length - fresh.length;
      line.textContent = !list.length ? 'No copied text found in ' + label + '.'
        : fresh.length + (fresh.length === 1 ? ' new text found' : ' new texts found') + (already ? ' · ' + already + ' already here or repeated' : '');
      preview.appendChild(line);
      fresh.slice(0, 3).forEach((it) => {
        const ex = document.createElement('div');
        ex.className = 'cf-sample';
        ex.textContent = it.text.replace(/\s+/g, ' ').slice(0, 90);
        preview.appendChild(ex);
      });
      if (fresh.length > IMPORT_TEXT_LIMIT) {
        const note = document.createElement('div');
        note.className = 'cf-note';
        note.textContent = 'The history keeps the ' + IMPORT_TEXT_LIMIT + ' most recent texts (pinned ones are always kept).';
        preview.appendChild(note);
      }
      goBtn.disabled = !fresh.length;
    }

    function open() {
      found = []; pasteBox.value = ''; preview.hidden = true; goBtn.disabled = true; fileInput.value = '';
      modal.hidden = false;
      document.getElementById('clipForeignPick').focus();
    }
    function close() { modal.hidden = true; found = []; openBtn.focus(); }

    openBtn.addEventListener('click', open);
    document.getElementById('clipForeignCancel').addEventListener('click', close);
    document.getElementById('clipForeignPick').addEventListener('click', () => fileInput.click());
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    modal.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > MAX_FILE) { show([], 'this file (it is over 30 MB)'); return; }
      let text = '';
      try { text = await f.text(); } catch (e) { show([], 'this file'); return; }
      pasteBox.value = '';
      show(parseForeign(text, f.name), f.name);
    });
    let pasteTimer = 0;
    pasteBox.addEventListener('input', () => {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => {
        if (!pasteBox.value.trim()) { preview.hidden = true; goBtn.disabled = true; found = []; return; }
        show(parseForeign(pasteBox.value, ''), 'the pasted content');
      }, 250);
    });

    goBtn.addEventListener('click', async () => {
      if (!found.length) return;
      goBtn.disabled = true;
      const list = found;
      // undated items keep the order of the file, just before "now"
      const base = Date.now();
      list.forEach((it, n) => { if (!it.timestamp || it.timestamp > base) it.timestamp = base - n; });
      let types = null;
      try { const r = await chrome.runtime.sendMessage({ type: 'CLIP_DETECT_TYPES', texts: list.map((it) => it.text.slice(0, 4000)) }); types = r && r.types; } catch (e) { }
      const have = new Set(clipItems.map((c) => String(c.text).replace(/\r/g, '')));
      let added = 0;
      list.forEach((it, n) => {
        if (have.has(it.text)) return;
        have.add(it.text);
        clipItems.unshift({ text: it.text, category: (types && Array.isArray(types[n]) && types[n].length) ? types[n] : ['📝 Text'], timestamp: it.timestamp, pinned: it.pinned === true });
        added++;
      });
      const pinnedItems = clipItems.filter((c) => c.pinned);
      const others = clipItems.filter((c) => !c.pinned).sort((a, z) => z.timestamp - a.timestamp).slice(0, IMPORT_TEXT_LIMIT);
      clipItems = [...pinnedItems, ...others].sort((a, z) => z.timestamp - a.timestamp);
      saveClipboard(true);
      if (typeof renderClipCategories === 'function') renderClipCategories();
      if (typeof renderClipList === 'function') renderClipList();
      if (typeof updateClipCounts === 'function') updateClipCounts();
      close();
      showToast(added + (added === 1 ? ' text imported' : ' texts imported'));
    });
  })();

  // @module 33-menu-actions-and-qr-scanner  (dev/popup-src/33-menu-actions-and-qr-scanner.js)
  // ===== Compresseur d'images =====
  // ── Right-click menu actions that finish here (see openPopupWith in background.js) ──
  chrome.storage.local.get('wbPending', (d) => {
    const p = d && d.wbPending;
    if (!p) return;
    chrome.storage.local.remove('wbPending');
    if (typeof p !== 'object' || Date.now() - (p.ts || 0) > 60000) return;
    const text = typeof p.text === 'string' ? p.text : '';
    const fetchImage = async () => {
      if (typeof p.url !== 'string' || !/^(https?:|data:image\/)/i.test(p.url)) throw new Error('bad url');
      const blob = await (await fetch(p.url)).blob();
      if (!/^image\//.test(blob.type)) throw new Error('not an image');
      return blob;
    };
    setTimeout(() => {
      if (p.tool === 'qr') switchToPanel('qr');
      else if (p.tool === 'qrgen') {
        switchToPanel('qr');
        const tab = document.querySelector('[data-qrtab="qrgen"]'); if (tab) tab.click();
        setTimeout(() => {
          // always into "Link / Text", whatever type was used last
          const pane = document.querySelector('.qg-tab[data-qgtab="content"]'); if (pane) pane.click();
          const grp = document.querySelector('.qg-group[data-group="web"]'); if (grp) grp.click();
          const link = document.querySelector('#qgTypes [data-type="url"]'); if (link && !link.classList.contains('active')) link.click();
          const field = document.querySelector('#qgFields input, #qgFields textarea');
          if (field) { field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); }
        }, 150);
      } else if (p.tool === 'expander') {
        switchToPanel('expander');
        const t = document.getElementById('expanderText'), sc = document.getElementById('expanderShortcut');
        if (t) t.value = text;
        if (sc) sc.focus();
      } else if (p.tool === 'calc') {
        switchToPanel('calculator');
        const f = document.getElementById('calcInputField');
        // typed-style maths from a web page: × ÷ − and a decimal comma
        const expr = text.replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/(\d),(\d)/g, '$1.$2').replace(/[^0-9+\-*/().%^ ]/g, '').replace(/^[^0-9(\-]+/, '').replace(/[^0-9)%]+$/, '').trim();
        if (f) { f.value = expr; f.dispatchEvent(new Event('input', { bubbles: true })); f.focus(); }
        if (!expr) showToast('No calculation found in the selection');
      } else if (p.tool === 'compress') {
        switchToPanel('compress');
        fetchImage().then((blob) => {
          const input = document.getElementById('compressFileInput');
          let name = 'image'; try { name = decodeURIComponent(new URL(p.url).pathname.split('/').pop() || 'image'); } catch (e) { }
          if (!/\.\w{2,5}$/.test(name)) name += '.' + (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const dt = new DataTransfer(); dt.items.add(new File([blob], name.slice(-80), { type: blob.type }));
          input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => showToast('❌ Could not load this image'));
      } else if (p.tool === 'clipboard') {
        switchToPanel('clipboard');
        const tb = document.querySelector('.clip-tab-btn[data-cliptab="text"]'); if (tb && !tb.classList.contains('active')) tb.click();
        const s = document.getElementById('clipSearch'); if (s) s.focus();
      } else if (p.tool === 'clipimage') {
        switchToPanel('clipboard');
        fetchImage().then((blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }))
          .then((dataUrl) => {
            chrome.runtime.sendMessage({ type: 'clipboard_image', dataUrl }, () => { void chrome.runtime.lastError; });
            showToast('✅ Image saved to your clipboard history');
            const imgTab = document.querySelector('.clip-tab-btn[data-cliptab="image"]'); if (imgTab) setTimeout(() => imgTab.click(), 400);
          }).catch(() => showToast('❌ Could not load this image'));
      }
    }, 350);
  });

  (function initQrScanner() {
    const panel = document.getElementById('panel-qr');
    const fileInput = document.getElementById('qrFileInput');
    const uploadLink = document.getElementById('qrUploadLink');
    const pasteBtn = document.getElementById('qrPasteBtn');
    const areaSelectBtn = document.getElementById('qrAreaSelectBtn');
    const resultCard = document.getElementById('qrResultCard');
    const resultText = document.getElementById('qrResultText');
    const copyBtn = document.getElementById('qrCopyBtn');
    const openBtn = document.getElementById('qrOpenBtn');
    const emptyEl = document.getElementById('qrEmpty');
    if (!panel || !fileInput) return;

    // jsQR (lib/jsQR.js) plutôt que BarcodeDetector : ce dernier dépend d'un
    // modèle ML téléchargé en tâche de fond par Chrome, pas toujours présent,
    // et échoue silencieusement (0 résultat, jamais d'erreur) quand il
    // manque — jsQR décode directement les pixels, sans dépendance externe.
    const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i;

    const kindEl = document.getElementById('qrKind');
    const verdictEl = document.getElementById('qrVerdict');

    function classifyQr(text) {
      const t = text.trim();
      if (URL_RE.test(t)) return { label: '🔗 Web link', isUrl: true };
      if (/^wifi:/i.test(t)) {
        // fields are separated by ';', and '\' escapes the next character (so a value may hold ';' or ':')
        const fields = {};
        let key = null, cur = '';
        const body = t.slice(5);
        for (let i = 0; i <= body.length; i++) {
          const ch = body[i];
          if (ch === '\\' && i + 1 < body.length) { cur += body[++i]; continue; }
          if (ch === ':' && key === null) { key = cur.toUpperCase(); cur = ''; continue; }
          if (ch === ';' || ch === undefined) {
            if (key && !(key in fields)) fields[key] = cur;
            key = null; cur = ''; continue;
          }
          cur += ch;
        }
        const name = (fields.S || '').replace(/^"(.*)"$/, '$1'), sec = fields.T || '';
        const open = /^nopass$/i.test(sec) || (!sec && !fields.P);
        const pass = open ? '' : (fields.P || '').replace(/^"(.*)"$/, '$1');
        return { label: '📶 Wi-Fi network', wifiPass: pass,
          detail: 'Network: ' + (name || '?') + '\nSecurity: ' + (open ? 'open' : (sec || 'unknown')) + (pass ? '\nPassword: ' + pass : '') };
      }
      if (/^BEGIN:VCARD/i.test(t) || /^MECARD:/i.test(t)) return { label: '👤 Contact card' };
      if (/^BEGIN:VEVENT/i.test(t) || /^BEGIN:VCALENDAR/i.test(t)) return { label: '📅 Calendar event' };
      if (/^mailto:/i.test(t) || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t)) return { label: '✉️ Email' };
      if (/^tel:/i.test(t) || /^(\+|0)[0-9\s().-]{8,18}$/.test(t)) return { label: '📞 Phone number' };
      if (/^(smsto|sms):/i.test(t)) return { label: '💬 Text message' };
      if (/^geo:/i.test(t)) return { label: '📍 Location' };
      // http(s) text that is not one clean address (spaces, extra lines) is plain text, not an app link
      if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(t) && !/^https?:/i.test(t)) return { label: '🧩 App link', detail: 'Opens another app. Only use it if you trust the source.', warn: true };
      return { label: '📝 Text' };
    }

    // Same engine as the Protection tool, run on the scanned address before
    // the user decides to open it.
    function checkQrUrl(text) {
      if (!window.WBProtection) return null;
      const t = text.trim();
      try { return WBProtection.evaluate(/^www\./i.test(t) ? 'https://' + t : t); } catch (e) { return null; }
    }

    function showResult(text) {
      const kind = classifyQr(text);
      resultText.textContent = text;
      resultCard.style.display = 'block';
      emptyEl.style.display = 'none';
      if (kindEl) kindEl.textContent = kind.label;
      let passBtn = document.getElementById('qrWifiPassBtn');
      if (kind.wifiPass) {
        if (!passBtn) {
          passBtn = document.createElement('button');
          passBtn.id = 'qrWifiPassBtn'; passBtn.className = 'btn btn-primary btn-sm';
          openBtn.parentElement.appendChild(passBtn);
        }
        passBtn.textContent = '🔑 Copy password';
        passBtn.onclick = () => navigator.clipboard.writeText(kind.wifiPass).then(() => showToast('✅ Wi-Fi password copied'));
        passBtn.style.display = 'inline-flex';
      } else if (passBtn) passBtn.style.display = 'none';
      openBtn.style.display = kind.isUrl ? 'inline-flex' : 'none';
      openBtn.textContent = '🔗 Open link';
      openBtn.classList.remove('qr-open-risky');
      resultCard.classList.remove('qr-danger', 'qr-caution');
      if (!verdictEl) return;
      verdictEl.hidden = true; verdictEl.className = 'qr-verdict';
      const say = (cls, msg) => { verdictEl.textContent = msg; verdictEl.classList.add(cls); verdictEl.hidden = false; };
      if (kind.isUrl) {
        const v = checkQrUrl(text);
        if (v && v.type === 'danger') {
          say('bad', '⚠️ This link looks dangerous. ' + (v.reason || '') + ' Do not open it unless you are sure of the source.');
          resultCard.classList.add('qr-danger');
          openBtn.textContent = 'Open anyway'; openBtn.classList.add('qr-open-risky');
        } else if (v && v.type === 'adult') {
          say('warn', '🔞 This link points to an adult website.');
          resultCard.classList.add('qr-caution');
          openBtn.textContent = 'Open anyway'; openBtn.classList.add('qr-open-risky');
        } else if (/^http:\/\//i.test(text.trim())) {
          say('warn', 'This link is not encrypted (http). Avoid typing passwords on it.');
        } else if (window.WBProtection && WBProtection.isRickroll(text)) {
          say('info', WBProtection.RICKROLL_MSG);
          if (kindEl) kindEl.textContent = '🎵 Rickroll';
        } else {
          say('ok', '✓ No warning sign found in this address.');
        }
      } else if (kind.detail) {
        say(kind.warn ? 'warn' : 'info', kind.detail);
      }
      // the card sits below the scan area: bring the verdict and buttons into view
      requestAnimationFrame(() => resultCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }

    // jsQR analyse l'image par blocs fixes de 8x8 pixels pour calculer le
    // seuil noir/blanc — sur une capture haute résolution d'un QR stylisé en
    // points, un bloc peut chevaucher un point ET l'espace blanc autour, ce
    // qui fausse la lecture. Redimensionner vers le bas moyenne cette
    // texture en un niveau de gris par module et résout souvent le cas
    // (vérifié sur un vrai QR code à points avec logo).
    function decodeAtScales(source) {
      const nativeLongSide = Math.max(source.width, source.height);
      const scaleTargets = [nativeLongSide, 220, 160, 110].filter((t, i) => i === 0 || t < nativeLongSide);
      for (const targetLongSide of scaleTargets) {
        const scale = targetLongSide / nativeLongSide;
        const w = Math.max(1, Math.round(source.width * scale));
        const h = Math.max(1, Math.round(source.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // transparent pixels would be read as black: put the picture on white first
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(source, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) return code.data;
      }
      return null;
    }

    async function decodeImage(source) {
      if (typeof jsQR !== 'function') {
        showToast('⚠️ QR decoding library not found.');
        return;
      }
      try {
        const text = decodeAtScales(source);

        if (!text) {
          // jsQR.locateOnly also fires on plain text and noise, so no "damaged code" guess here
          showToast('❌ No QR code detected in this image.');
          return;
        }
        showResult(text);
      } catch (e) {
        showToast('❌ Failed to read the QR code.');
      }
    }

    async function decodeFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        showToast('⚠️ This file is not an image.');
        return;
      }
      try {
        const bitmap = await createImageBitmap(file);
        await decodeImage(bitmap);
      } catch (e) {
        showToast('❌ Unable to read this image.');
      }
    }

    if (uploadLink) uploadLink.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) decodeFile(fileInput.files[0]);
      fileInput.value = '';
    });

    // Le glisser-déposer reste utilisable sur tout le panneau, sans zone
    // visuelle dédiée — un bouton unique suffit, pas besoin d'un gros
    // encart en plus pour ça.
    panel.addEventListener('dragover', (e) => e.preventDefault());
    panel.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) decodeFile(file);
    });

    if (pasteBtn) {
      pasteBtn.addEventListener('click', async () => {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imgType = item.types.find(t => t.startsWith('image/'));
            if (imgType) {
              const blob = await item.getType(imgType);
              const bitmap = await createImageBitmap(blob);
              await decodeImage(bitmap);
              return;
            }
          }
          showToast('⚠️ No image in clipboard.');
        } catch (e) {
          showToast('❌ Unable to read clipboard (permission denied?).');
        }
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(resultText.textContent);
          showToast('📄 Copied!');
        } catch (e) {
          showToast('❌ Copy failed.');
        }
      });
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const value = resultText.textContent.trim();
        const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        chrome.tabs.create({ url });
      });
    }

    if (areaSelectBtn) {
      areaSelectBtn.addEventListener('click', async () => {
        try {
          // Comme les autres extensions de scan QR : on injecte un script de
          // sélection directement sur la page (crosshair + glisser-déposer),
          // la capture et le décodage se font ensuite via background.js sans
          // jamais quitter l'onglet actif. Injection à la demande à chaque
          // clic — pas de content script statique qui pourrait être périmé
          // sur un onglet déjà ouvert.
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.id) { showToast('❌ Unable to find the active tab.'); return; }
          if (/^(chrome|chrome-extension|edge|about|devtools):/i.test(tab.url || '')) {
            showToast('❌ Not available on this page (chrome://, Web Store...).');
            return;
          }

          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/protection.js', 'content/qroverlay.js'] });
          window.close();
        } catch (e) {
          showToast('❌ Unable to start selection — reload the page and try again.');
        }
      });
    }

    // Le résultat d'une sélection de zone arrive après la fermeture du popup
    // (voir qroverlay.js + background.js) — on le réaffiche ici à la réouverture.
    chrome.storage.local.get('lastQrResult', (data) => {
      if (data.lastQrResult && data.lastQrResult.text) showResult(data.lastQrResult.text);
    });
  })();

  // @module 34-image-compressor  (dev/popup-src/34-image-compressor.js)
  (function initImageCompressor() {
    const dropZone = document.getElementById('compressDropZone');
    const fileInput = document.getElementById('compressFileInput');
    const folderInput = document.getElementById('compressFolderInput');
    const folderBtn = document.getElementById('compressFolderBtn');
    const resultsList = document.getElementById('compressResultsList');
    const emptyEl = document.getElementById('compressEmpty');
    const countEl = document.getElementById('compressCount');
    const zipBtn = document.getElementById('compressZipBtn');
    const clearBtn = document.getElementById('compressClearBtn');
    const summaryEl = document.getElementById('compressSummary');
    const progressWrap = document.getElementById('compressProgressWrap');
    const progressFill = document.getElementById('compressProgressFill');
    const progressLabel = document.getElementById('compressProgressLabel');
    const convertToggle = document.getElementById('compressConvertToggle');
    if (!dropZone || !fileInput || !resultsList) return;

    // Réglage persisté : conversion de format désactivée par défaut (on
    // recompresse chaque image dans son format d'origine sauf choix contraire).
    if (convertToggle) {
      chrome.storage.local.get('compressAllowConvert', (data) => {
        convertToggle.checked = !!data.compressAllowConvert;
      });
      convertToggle.addEventListener('change', () => {
        chrome.storage.local.set({ compressAllowConvert: convertToggle.checked });
      });
    }

    let results = []; // { name, dataUrl, originalSize, compressedSize, sourceType, folderName }
    let isProcessingBatch = false; // évite que deux imports lancés en même temps ne dépassent MAX_IMAGES ensemble
    const MAX_IMAGES = 100; // largement suffisant pour un usage normal, évite de bloquer le popup sur un import massif
    const IMAGE_NAME_RE = /\.(svg|png|jpe?g|webp|gif|bmp|ppm|pgm|pbm|pnm|tga|pcx)$/i;
    const RAW_FORMAT_RE = /\.(ppm|pgm|pbm|pnm|tga|pcx)$/i;

    // Persisté pour que les résultats survivent à la fermeture du popup et
    // soient toujours là (avec les boutons de téléchargement) à la réouverture.
    function saveResults() {
      chrome.storage.local.set({ compressResults: results });
    }

    function stripExt(name) {
      const i = name.lastIndexOf('.');
      return i > 0 ? name.slice(0, i) : name;
    }

    function isImageFile(file) {
      return file.type.startsWith('image/') || IMAGE_NAME_RE.test(file.name);
    }

    function isRawFormat(file) {
      return RAW_FORMAT_RE.test(file.name);
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Unable to read the file'));
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    // Détecte le format d'origine pour l'affichage (SVG/PNG/JPEG/JPG/WEBP/...),
    // à partir du type MIME puis, en secours, de l'extension du fichier.
    function detectSourceType(file) {
      const ext = (file.name.split('.').pop() || '').toUpperCase();
      const mimeMap = {
        'image/svg+xml': 'SVG',
        'image/png': 'PNG',
        'image/jpeg': 'JPEG',
        'image/webp': 'WEBP',
        'image/gif': 'GIF',
        'image/bmp': 'BMP',
      };
      return mimeMap[file.type] || ext || 'IMG';
    }

    // Choisit une qualité JPEG adaptée au poids d'origine, sans réglage manuel :
    // plus le fichier de départ est lourd, plus on compresse fort.
    function autoQualityFor(size) {
      if (!size) return 0.82;
      if (size > 4 * 1024 * 1024) return 0.6;
      if (size > 1.5 * 1024 * 1024) return 0.7;
      if (size > 500 * 1024) return 0.78;
      if (size > 150 * 1024) return 0.85;
      return 0.92;
    }

    // Détecte si l'image a des pixels transparents en lisant le canal alpha
    // brut, avant tout aplatissement sur fond blanc.
    function canvasHasTransparency(ctx, width, height) {
      try {
        const { data } = ctx.getImageData(0, 0, width, height);
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) return true;
        }
        return false;
      } catch (e) {
        return false; // canvas "tainted" ou erreur de lecture : par sécurité on ne bloque pas la conversion
      }
    }

    // --- Décodeurs maison pour les formats que le navigateur ne sait pas lire ---
    // Pas de dépendance externe : chacun lit les octets bruts et reconstruit une
    // ImageData standard, réutilisable ensuite par le pipeline de compression.

    // PPM/PGM/PBM (Netpbm) : en-tête texte (magic + largeur + hauteur + éventuel
    // maxval) suivi des données en binaire ou en ASCII selon le magic number.
    function parsePNM(buffer) {
      const bytes = new Uint8Array(buffer);
      let pos = 2;
      if (bytes[0] !== 0x50) throw new Error('invalid PNM header');
      const magic = String.fromCharCode(bytes[0], bytes[1]);

      function isWhitespace(b) { return b === 0x20 || b === 0x09 || b === 0x0A || b === 0x0D; }
      function readToken() {
        while (pos < bytes.length) {
          if (isWhitespace(bytes[pos])) { pos++; continue; }
          if (bytes[pos] === 0x23) { while (pos < bytes.length && bytes[pos] !== 0x0A) pos++; continue; }
          break;
        }
        const start = pos;
        while (pos < bytes.length && !isWhitespace(bytes[pos]) && bytes[pos] !== 0x23) pos++;
        return String.fromCharCode.apply(null, bytes.subarray(start, pos));
      }

      const width = parseInt(readToken(), 10);
      const height = parseInt(readToken(), 10);
      const isBinary = magic === 'P4' || magic === 'P5' || magic === 'P6';
      const hasMaxval = magic !== 'P1' && magic !== 'P4';
      const maxval = hasMaxval ? parseInt(readToken(), 10) : 1;
      if (isBinary) pos++; // un seul caractère d'espace sépare l'en-tête des données binaires

      if (!width || !height) throw new Error('invalid PNM dimensions');
      const out = new Uint8ClampedArray(width * height * 4);
      // maxval > 255 : échantillons sur 2 octets (big-endian). On ne garde que
      // l'octet de poids fort (pos avance quand même de sampleBytes) : légère perte
      // de précision sur les PNM 16 bits/canal, invisible à l'affichage 8 bits classique.
      const sampleBytes = maxval > 255 ? 2 : 1;

      if (magic === 'P6') {
        for (let i = 0; i < width * height; i++) {
          const o = i * 4;
          out[o] = bytes[pos]; pos += sampleBytes;
          out[o + 1] = bytes[pos]; pos += sampleBytes;
          out[o + 2] = bytes[pos]; pos += sampleBytes;
          out[o + 3] = 255;
        }
      } else if (magic === 'P5') {
        for (let i = 0; i < width * height; i++) {
          const o = i * 4;
          const v = bytes[pos]; pos += sampleBytes;
          out[o] = out[o + 1] = out[o + 2] = v;
          out[o + 3] = 255;
        }
      } else if (magic === 'P4') {
        const rowBytes = Math.ceil(width / 8);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const bit = (bytes[pos + y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
            const v = bit ? 0 : 255; // convention PBM : 1 = noir
            const o = (y * width + x) * 4;
            out[o] = out[o + 1] = out[o + 2] = v;
            out[o + 3] = 255;
          }
        }
      } else if (magic === 'P3' || magic === 'P2' || magic === 'P1') {
        for (let i = 0; i < width * height; i++) {
          const o = i * 4;
          if (magic === 'P3') {
            out[o] = parseInt(readToken(), 10);
            out[o + 1] = parseInt(readToken(), 10);
            out[o + 2] = parseInt(readToken(), 10);
          } else if (magic === 'P2') {
            const v = parseInt(readToken(), 10);
            out[o] = out[o + 1] = out[o + 2] = v;
          } else {
            const v = parseInt(readToken(), 10) ? 0 : 255;
            out[o] = out[o + 1] = out[o + 2] = v;
          }
          out[o + 3] = 255;
        }
      } else {
        throw new Error('unrecognized PNM variant (' + magic + ')');
      }

      return { width, height, imageData: new ImageData(out, width, height) };
    }

    // TGA (Truevision) : en-tête fixe de 18 octets, image non compressée ou en
    // RLE, stockée en BGR(A) et parfois de bas en haut (à retourner si besoin).
    function parseTGA(buffer) {
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);
      const idLength = bytes[0];
      const colorMapType = bytes[1];
      const imageType = bytes[2];
      const width = view.getUint16(12, true);
      const height = view.getUint16(14, true);
      const bpp = bytes[16];
      const flipY = !(bytes[17] & 0x20);
      if (colorMapType !== 0) throw new Error('palette-based TGA not supported');
      if (!width || !height) throw new Error('invalid TGA dimensions');

      let pos = 18 + idLength;
      const bpx = bpp / 8;
      const pixelCount = width * height;
      const out = new Uint8ClampedArray(pixelCount * 4);

      function writePixel(o, b0, b1, b2, b3) {
        if (bpx >= 2) {
          out[o] = b2; out[o + 1] = b1; out[o + 2] = b0; out[o + 3] = bpx === 4 ? b3 : 255;
        } else {
          out[o] = out[o + 1] = out[o + 2] = b0; out[o + 3] = 255;
        }
      }
      function readOnePixel() {
        if (bpx === 1) { const v = [bytes[pos]]; pos += 1; return v; }
        if (bpx === 2) {
          // 16 bits/pixel : format RGB555 (1 bit attribut + 5+5+5 bits couleur), little-endian.
          const px = bytes[pos] | (bytes[pos + 1] << 8);
          pos += 2;
          const scale5to8 = (v) => (v << 3) | (v >> 2);
          const r = scale5to8((px >> 10) & 0x1F);
          const g = scale5to8((px >> 5) & 0x1F);
          const b = scale5to8(px & 0x1F);
          return [b, g, r, 255];
        }
        if (bpx === 3) { const v = [bytes[pos], bytes[pos + 1], bytes[pos + 2]]; pos += 3; return v; }
        const v = [bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]]; pos += 4; return v;
      }

      const isRLE = imageType === 9 || imageType === 10 || imageType === 11;
      if (!isRLE) {
        for (let i = 0; i < pixelCount; i++) {
          const v = readOnePixel();
          writePixel(i * 4, v[0], v[1], v[2], v[3]);
        }
      } else {
        let i = 0;
        while (i < pixelCount && pos < bytes.length) {
          const packet = bytes[pos++];
          const count = (packet & 0x7F) + 1;
          if (packet & 0x80) {
            const v = readOnePixel();
            for (let k = 0; k < count && i < pixelCount; k++, i++) writePixel(i * 4, v[0], v[1], v[2], v[3]);
          } else {
            for (let k = 0; k < count && i < pixelCount; k++, i++) {
              const v = readOnePixel();
              writePixel(i * 4, v[0], v[1], v[2], v[3]);
            }
          }
        }
      }

      let finalData = out;
      if (flipY) {
        finalData = new Uint8ClampedArray(out.length);
        const rowLen = width * 4;
        for (let y = 0; y < height; y++) {
          finalData.set(out.subarray((height - 1 - y) * rowLen, (height - y) * rowLen), y * rowLen);
        }
      }
      return { width, height, imageData: new ImageData(finalData, width, height) };
    }

    // PCX (ZSoft Paintbrush) : en-tête fixe de 128 octets puis données en RLE
    // (compteur + valeur), en 24-bit (3 plans) ou 8-bit indexé (palette VGA en fin de fichier).
    function parsePCX(buffer) {
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);
      if (bytes[0] !== 0x0A) throw new Error('invalid PCX header');
      const bitsPerPixel = bytes[3];
      const xmin = view.getUint16(4, true);
      const ymin = view.getUint16(6, true);
      const xmax = view.getUint16(8, true);
      const ymax = view.getUint16(10, true);
      const nPlanes = bytes[65];
      const bytesPerLine = view.getUint16(66, true);
      const width = xmax - xmin + 1;
      const height = ymax - ymin + 1;
      if (!width || !height) throw new Error('invalid PCX dimensions');

      let pos = 128;
      const rowTotalBytes = bytesPerLine * nPlanes;
      const rawRows = [];
      for (let y = 0; y < height; y++) {
        const row = new Uint8Array(rowTotalBytes);
        let x = 0;
        while (x < rowTotalBytes && pos < bytes.length) {
          const b = bytes[pos++];
          if ((b & 0xC0) === 0xC0) {
            const count = b & 0x3F;
            const value = bytes[pos++];
            for (let k = 0; k < count && x < rowTotalBytes; k++) row[x++] = value;
          } else {
            row[x++] = b;
          }
        }
        rawRows.push(row);
      }

      const out = new Uint8ClampedArray(width * height * 4);
      if (nPlanes === 3 && bitsPerPixel === 8) {
        for (let y = 0; y < height; y++) {
          const row = rawRows[y];
          for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            out[o] = row[x];
            out[o + 1] = row[bytesPerLine + x];
            out[o + 2] = row[bytesPerLine * 2 + x];
            out[o + 3] = 255;
          }
        }
      } else if (nPlanes === 1 && bitsPerPixel === 8) {
        // Palette VGA 256 couleurs, marquée par un octet 0x0C juste avant les 768 octets RGB finaux.
        const palette = bytes[bytes.length - 769] === 0x0C ? bytes.subarray(bytes.length - 768) : null;
        for (let y = 0; y < height; y++) {
          const row = rawRows[y];
          for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const idx = row[x];
            if (palette) {
              out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
            } else {
              out[o] = out[o + 1] = out[o + 2] = idx;
            }
            out[o + 3] = 255;
          }
        }
      } else {
        throw new Error(`unsupported PCX variant (${nPlanes} plane(s), ${bitsPerPixel} bits)`);
      }

      return { width, height, imageData: new ImageData(out, width, height) };
    }

    // --- Compression PNG "à la TinyPNG" : réduction de palette (quantification) ---
    // Un simple ré-encodage canvas.toDataURL('image/png') ne gagne presque jamais
    // de poids (le navigateur écrit toujours du RGBA 32 bits complet). La vraie
    // technique utilisée par les outils type TinyPNG est de réduire le nombre de
    // couleurs à une palette de 256 maximum (indexée), ce qui divise le poids par
    // 2 à 4 en général sans perte visible — le format reste du PNG, jamais du JPEG,
    // et la transparence est conservée via la palette.

    // Regroupe les pixels par boîtes de couleur (median cut) puis moyenne chaque
    // boîte pour obtenir la palette finale — méthode classique de quantification.
    function quantizeColors(pixels, maxColors) {
      const map = new Map();
      for (let i = 0; i < pixels.length; i += 4) {
        const key = ((pixels[i] << 24) | (pixels[i + 1] << 16) | (pixels[i + 2] << 8) | pixels[i + 3]) >>> 0;
        map.set(key, (map.get(key) || 0) + 1);
      }
      const toColor = (key) => ({ r: (key >>> 24) & 255, g: (key >>> 16) & 255, b: (key >>> 8) & 255, a: key & 255 });
      let uniqueColors = [];
      map.forEach((count, key) => { const c = toColor(key); c.count = count; uniqueColors.push(c); });

      // Palette exacte possible : aucune perte, juste un poids d'index bien plus
      // petit qu'un pixel RGBA complet (cas fréquent pour logos, icônes, captures d'UI).
      if (uniqueColors.length <= maxColors) {
        const colorToIndex = new Map();
        uniqueColors.forEach((c, i) => {
          const key = ((c.r << 24) | (c.g << 16) | (c.b << 8) | c.a) >>> 0;
          colorToIndex.set(key, i);
        });
        return { palette: uniqueColors, colorToIndex, exact: true };
      }

      let boxes = [uniqueColors];
      while (boxes.length < maxColors) {
        let boxIdx = -1, boxScore = -1;
        boxes.forEach((box, i) => {
          if (box.length < 2) return;
          const score = box.reduce((s, c) => s + c.count, 0);
          if (score > boxScore) { boxScore = score; boxIdx = i; }
        });
        if (boxIdx === -1) break; // plus aucune boîte à diviser

        const box = boxes[boxIdx];
        const channels = ['r', 'g', 'b', 'a'];
        const ranges = channels.map(ch => {
          let lo = 255, hi = 0;
          for (const c of box) { if (c[ch] < lo) lo = c[ch]; if (c[ch] > hi) hi = c[ch]; }
          return hi - lo;
        });
        const ch = channels[ranges.indexOf(Math.max(...ranges))];
        box.sort((a, b) => a[ch] - b[ch]);

        const total = box.reduce((s, c) => s + c.count, 0);
        let acc = 0, splitAt = 1;
        for (let i = 0; i < box.length; i++) {
          acc += box[i].count;
          if (acc >= total / 2) { splitAt = Math.max(1, i + 1); break; }
        }
        if (splitAt >= box.length) splitAt = box.length - 1;
        boxes.splice(boxIdx, 1, box.slice(0, splitAt), box.slice(splitAt));
      }

      const palette = boxes.map(box => {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (const c of box) { r += c.r * c.count; g += c.g * c.count; b += c.b * c.count; a += c.a * c.count; count += c.count; }
        return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count), a: Math.round(a / count) };
      });

      const colorToIndex = new Map();
      boxes.forEach((box, idx) => {
        for (const c of box) {
          const key = ((c.r << 24) | (c.g << 16) | (c.b << 8) | c.a) >>> 0;
          colorToIndex.set(key, idx);
        }
      });

      return { palette, colorToIndex, exact: false };
    }

    // Table CRC32 standard (nécessaire pour chaque chunk PNG).
    const CRC32_TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();
    function crc32(bytes) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function u32be(n) {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, n, false);
      return b;
    }
    function pngChunk(type, data) {
      const typeBytes = new TextEncoder().encode(type);
      const body = new Uint8Array(typeBytes.length + data.length);
      body.set(typeBytes, 0);
      body.set(data, typeBytes.length);
      const chunk = new Uint8Array(4 + body.length + 4);
      chunk.set(u32be(data.length), 0);
      chunk.set(body, 4);
      chunk.set(u32be(crc32(body)), 4 + body.length);
      return chunk;
    }

    // Écrit un PNG indexé (couleur type 3, 8 bits/pixel) à la main : le navigateur
    // n'expose aucune API pour produire ce format, seulement le RGBA 32 bits complet.
    // La compression des données brutes utilise l'API native CompressionStream en
    // mode "deflate" (format zlib, celui attendu par le chunk IDAT du PNG) — pas
    // besoin de ré-implémenter un algorithme de compression maison.
    async function encodeIndexedPng(width, height, indices, palette, hasAlpha) {
      const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      const ihdrData = new Uint8Array(13);
      new DataView(ihdrData.buffer).setUint32(0, width, false);
      new DataView(ihdrData.buffer).setUint32(4, height, false);
      ihdrData[8] = 8;  // profondeur : 8 bits par index
      ihdrData[9] = 3;  // type couleur 3 = palette indexée
      ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
      const ihdr = pngChunk('IHDR', ihdrData);

      const plteData = new Uint8Array(palette.length * 3);
      palette.forEach((c, i) => { plteData[i * 3] = c.r; plteData[i * 3 + 1] = c.g; plteData[i * 3 + 2] = c.b; });
      const plte = pngChunk('PLTE', plteData);

      let trns = null;
      if (hasAlpha) {
        let lastNon255 = -1;
        palette.forEach((c, i) => { if (c.a < 255) lastNon255 = i; });
        if (lastNon255 >= 0) {
          const trnsData = new Uint8Array(lastNon255 + 1);
          for (let i = 0; i <= lastNon255; i++) trnsData[i] = palette[i].a;
          trns = pngChunk('tRNS', trnsData);
        }
      }

      const rowBytes = width + 1;
      const raw = new Uint8Array(rowBytes * height);
      for (let y = 0; y < height; y++) {
        raw[y * rowBytes] = 0; // filtre "None"
        raw.set(indices.subarray(y * width, (y + 1) * width), y * rowBytes + 1);
      }

      const cs = new CompressionStream('deflate');
      const writer = cs.writable.getWriter();
      writer.write(raw);
      writer.close();
      const compressedBuf = await new Response(cs.readable).arrayBuffer();
      const idat = pngChunk('IDAT', new Uint8Array(compressedBuf));
      const iend = pngChunk('IEND', new Uint8Array(0));

      const parts = [sig, ihdr, plte];
      if (trns) parts.push(trns);
      parts.push(idat, iend);
      const total = parts.reduce((s, p) => s + p.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      parts.forEach(p => { out.set(p, offset); offset += p.length; });
      return out;
    }

    // Encode une chaîne binaire en base64 par blocs (évite les soucis de taille
    // maximale d'arguments avec String.fromCharCode.apply sur une grosse image).
    function bytesToBase64(bytes) {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    // Pipeline complet : pixels du canvas → palette quantifiée → PNG indexé.
    async function compressToIndexedPng(ctx, width, height) {
      const { data } = ctx.getImageData(0, 0, width, height);
      const hasAlpha = canvasHasTransparency(ctx, width, height);
      const { palette, colorToIndex } = quantizeColors(data, 256);

      const indices = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const key = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
        indices[p] = colorToIndex.get(key);
      }

      const pngBytes = await encodeIndexedPng(width, height, indices, palette, hasAlpha);
      const dataUrl = `data:image/png;base64,${bytesToBase64(pngBytes)}`;
      return { dataUrl, size: pngBytes.length };
    }

    // Termine la compression une fois qu'on a une image décodée sur un canvas
    // (utilisé pour les formats bruts PPM/TGA/PCX, qui n'ont pas d'équivalent
    // "même format" côté navigateur) : compression indexée, jamais de JPEG.
    async function finishFromCanvas(canvas, ctx, file) {
      const width = canvas.width, height = canvas.height;
      const { dataUrl, size } = await compressToIndexedPng(ctx, width, height);
      if (size >= file.size) {
        return { dataUrl: canvas.toDataURL('image/png'), originalSize: file.size, compressedSize: file.size, converted: false };
      }
      return { dataUrl, originalSize: file.size, compressedSize: size, converted: true, outputExt: 'png' };
    }

    // Optimise un SVG "à la main" : le navigateur n'a pas d'encodeur SVG, donc on
    // retire nous-mêmes la déclaration XML, le DOCTYPE, les commentaires, les
    // métadonnées d'éditeur (Inkscape/Sodipodi) et les espaces superflus entre
    // balises. Le résultat reste du texte vectoriel, jamais rasterisé.
    function minifySvg(text) {
      let out = text;
      out = out.replace(/<\?xml[^>]*\?>\s*/i, '');
      out = out.replace(/<!DOCTYPE[^>]*>\s*/i, '');
      out = out.replace(/<!--[\s\S]*?-->/g, '');
      out = out.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
      out = out.replace(/\s+(inkscape|sodipodi):[a-zA-Z-]+="[^"]*"/g, '');
      out = out.replace(/\s+xmlns:(inkscape|sodipodi)="[^"]*"/g, '');
      out = out.replace(/>\s+</g, '><');
      out = out.replace(/[ \t]{2,}/g, ' ');
      return out.trim();
    }

    function svgToDataUrl(text) {
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
    }

    // Recompresse un fichier image côté client, via un <canvas> classique (le popup
    // a accès au DOM, pas besoin d'OffscreenCanvas comme dans le service worker).
    // allowConvert : quand false (réglage par défaut), une image PNG/JPEG/WEBP est
    // recompressée dans SON format d'origine plutôt que convertie automatiquement
    // en JPEG — la conversion de format devient une option explicite côté UI.
    async function compressFile(file, allowConvert) {
      const sourceType = detectSourceType(file);

      if (sourceType === 'SVG') {
        const originalText = await file.text();
        try {
          const minified = minifySvg(originalText);
          const compressedSize = new TextEncoder().encode(minified).length;
          if (compressedSize < file.size) {
            return { dataUrl: svgToDataUrl(minified), originalSize: file.size, compressedSize, converted: true, outputExt: 'svg' };
          }
        } catch (e) {
          // SVG malformé ou cas non géré par le minifieur maison : on retombe
          // sur le fichier d'origine plutôt que de faire échouer tout l'import.
        }
        const dataUrl = await fileToDataUrl(file);
        return { dataUrl, originalSize: file.size, compressedSize: file.size, converted: false, skippedReason: 'svg' };
      }

      if (isRawFormat(file)) {
        const buffer = await file.arrayBuffer();
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        let decoded;
        if (ext === 'tga') decoded = parseTGA(buffer);
        else if (ext === 'pcx') decoded = parsePCX(buffer);
        else decoded = parsePNM(buffer); // ppm / pgm / pbm / pnm

        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(decoded.imageData, 0, 0);
        return finishFromCanvas(canvas, ctx, file);
      }

      // Formats nativement lisibles par le navigateur (PNG/JPEG/WEBP/GIF/BMP/...)
      const originalDataUrl = await fileToDataUrl(file);
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onerror = () => reject(new Error('Invalid image'));
        image.onload = () => resolve(image);
        image.src = originalDataUrl;
      });

      const width = img.naturalWidth || img.width || 800;
      const height = img.naturalHeight || img.height || 600;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const hasAlpha = canvasHasTransparency(ctx, width, height);
      const quality = autoQualityFor(file.size);

      if (allowConvert) {
        // Option "Convert to JPEG" activée explicitement : comportement d'origine
        // (conversion systématique en JPEG), sauf transparence — le JPEG ne
        // supporte pas l'alpha, forcer un fond blanc casserait logos/captures détourées.
        if (hasAlpha) {
          return { dataUrl: originalDataUrl, originalSize: file.size, compressedSize: file.size, converted: false, skippedReason: 'transparency' };
        }
        const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
        const jpegSize = dataUrlToBytes(jpegDataUrl).length;
        // Les petites images/icônes à peu de couleurs sont parfois déjà mieux
        // compressées en PNG (poids fixe de départ du JPEG dû à ses tables de
        // quantification) : dans ce cas on garde le fichier d'origine.
        if (jpegSize >= file.size) {
          return { dataUrl: originalDataUrl, originalSize: file.size, compressedSize: file.size, converted: false };
        }
        return { dataUrl: jpegDataUrl, originalSize: file.size, compressedSize: jpegSize, converted: true, outputExt: 'jpg' };
      }

      // Par défaut : on compresse toujours, sans jamais convertir en JPEG.
      // JPEG et WEBP savent déjà se recompresser fidèlement dans leur propre
      // format avec un vrai réglage de qualité côté navigateur.
      if (sourceType === 'JPEG' || sourceType === 'WEBP') {
        const mime = sourceType === 'JPEG' ? 'image/jpeg' : 'image/webp';
        const outputExt = sourceType === 'JPEG' ? 'jpg' : 'webp';
        const outDataUrl = canvas.toDataURL(mime, quality);
        const outSize = dataUrlToBytes(outDataUrl).length;
        if (outSize >= file.size) {
          return { dataUrl: originalDataUrl, originalSize: file.size, compressedSize: file.size, converted: false };
        }
        return { dataUrl: outDataUrl, originalSize: file.size, compressedSize: outSize, converted: true, outputExt };
      }

      // PNG, GIF, BMP et tout autre format lisible par le navigateur : un simple
      // canvas.toDataURL('image/png') ne gagne presque jamais de poids (toujours
      // du RGBA 32 bits complet), donc plutôt que de renoncer, on compresse
      // vraiment via une réduction de palette façon TinyPNG (voir
      // compressToIndexedPng) — ça reste du PNG, jamais du JPEG, et la
      // transparence est toujours préservée.
      const { dataUrl: pngDataUrl, size: pngSize } = await compressToIndexedPng(ctx, width, height);
      if (pngSize >= file.size) {
        return { dataUrl: originalDataUrl, originalSize: file.size, compressedSize: file.size, converted: false };
      }
      return { dataUrl: pngDataUrl, originalSize: file.size, compressedSize: pngSize, converted: true, outputExt: 'png' };
    }

    function buildRow(r, idx) {
      let sizeLabel;
      if (r.converted === false) {
        let reason = 'already optimal, original file kept';
        if (r.skippedReason === 'svg') reason = 'SVG already minimal, kept as-is (vector)';
        else if (r.skippedReason === 'transparency') reason = 'transparent background detected, original file kept';
        sizeLabel = `${formatBytes(r.originalSize)} · ${reason}`;
      } else {
        const pct = (r.originalSize && r.compressedSize)
          ? Math.round((1 - r.compressedSize / r.originalSize) * 100)
          : null;
        sizeLabel = `${formatBytes(r.originalSize)} → ${formatBytes(r.compressedSize)}${pct !== null ? ` (-${pct}%)` : ''}`;
      }
      const row = document.createElement('div');
      row.className = 'compress-row';
      row.innerHTML = `
        <img src="${r.dataUrl}" class="compress-thumb" alt="">
        <div class="compress-info">
          <div class="compress-name-row">
            <span class="compress-type-badge">${escapeHtml(r.sourceType)}</span>
            <span class="compress-name">${escapeHtml(r.name)}</span>
          </div>
          <div class="compress-size">${sizeLabel}</div>
        </div>
        <div class="compress-row-actions">
          <button class="compress-dl-btn" data-idx="${idx}" title="Download">⬇️</button>
          <button class="compress-remove-btn" data-idx="${idx}" title="Remove from list">✕</button>
        </div>
      `;
      return row;
    }

    // Zip minimal réutilisé par le bouton "Download all" par dossier —
    // contrairement au ZIP global, pas besoin de préfixer les noms puisqu'on
    // télécharge un seul dossier à la fois.
    function downloadZip(items, zipFileName) {
      if (!items || items.length === 0) return;
      try {
        const usedNames = new Set();
        const files = items.map(r => {
          const dotIdx = r.name.lastIndexOf('.');
          const ext = dotIdx > 0 ? r.name.slice(dotIdx) : '';
          let name = r.name;
          let i = 2;
          while (usedNames.has(name)) { name = `${stripExt(r.name)}-${i}${ext}`; i++; }
          usedNames.add(name);
          return { name, data: dataUrlToBytes(r.dataUrl) };
        });
        const zipBytes = buildZip(files);
        const blob = new Blob([zipBytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast(`📦 ZIP downloaded (${files.length} image(s))!`);
      } catch (e) {
        showToast('Error creating the ZIP.');
      }
    }

    function buildFolderHeader(key, indices) {
      const header = document.createElement('div');
      header.className = 'compress-folder-header';
      const label = key ? `📁 ${key} (${indices.length})` : `📄 Standalone files (${indices.length})`;
      header.innerHTML = `
        <span class="compress-folder-header-label">${escapeHtml(label)}</span>
        <span class="compress-folder-header-actions">
          <button class="compress-folder-action-btn" data-action="download" title="Download this group as ZIP">⬇️</button>
          <button class="compress-folder-action-btn" data-action="remove" title="Remove this group">✕</button>
        </span>
      `;
      header.querySelector('[data-action="download"]').addEventListener('click', () => {
        const items = indices.map(i => results[i]).filter(Boolean);
        const zipName = key ? `${key}-${new Date().toISOString().slice(0, 10)}.zip` : `workbox-images-${new Date().toISOString().slice(0, 10)}.zip`;
        downloadZip(items, zipName);
      });
      header.querySelector('[data-action="remove"]').addEventListener('click', () => {
        const indexSet = new Set(indices);
        results = results.filter((r, i) => !indexSet.has(i));
        render();
        saveResults();
        showToast(key ? `🗑️ Folder "${key}" removed.` : '🗑️ Files removed.');
      });
      return header;
    }

    function buildSummary() {
      if (!summaryEl) return;
      if (results.length === 0) { summaryEl.style.display = 'none'; return; }
      let totalOriginal = 0, totalCompressed = 0;
      results.forEach(r => {
        totalOriginal += r.originalSize || 0;
        totalCompressed += r.compressedSize || 0;
      });
      const pct = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <span>📉 Total: ${formatBytes(totalOriginal)} → ${formatBytes(totalCompressed)}</span>
        <b>${pct > 0 ? '-' : ''}${pct}%</b>
      `;
    }

    function render() {
      resultsList.innerHTML = '';
      const hasResults = results.length > 0;
      if (emptyEl) emptyEl.style.display = hasResults ? 'none' : '';
      if (zipBtn) zipBtn.disabled = !hasResults;
      if (countEl) countEl.textContent = String(results.length);
      buildSummary();
      if (!hasResults) return;

      const fragment = document.createDocumentFragment();
      const folderNames = new Set(results.map(r => r.folderName).filter(Boolean));

      if (folderNames.size >= 1) {
        // Au moins un dossier importé : on regroupe l'affichage par dossier d'origine,
        // avec une action "download"/"retirer" par groupe.
        const orderedKeys = [];
        results.forEach(r => {
          const key = r.folderName || '';
          if (!orderedKeys.includes(key)) orderedKeys.push(key);
        });
        orderedKeys.forEach(key => {
          const indices = [];
          results.forEach((r, i) => { if ((r.folderName || '') === key) indices.push(i); });
          fragment.appendChild(buildFolderHeader(key, indices));
          indices.forEach(i => fragment.appendChild(buildRow(results[i], i)));
        });
      } else {
        results.forEach((r, idx) => fragment.appendChild(buildRow(r, idx)));
      }

      resultsList.appendChild(fragment);

      resultsList.querySelectorAll('.compress-dl-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = results[parseInt(btn.dataset.idx, 10)];
          if (!r) return;
          const a = document.createElement('a');
          a.href = r.dataUrl;
          a.download = r.name;
          a.click();
        });
      });

      resultsList.querySelectorAll('.compress-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          if (Number.isNaN(idx) || !results[idx]) return;
          results.splice(idx, 1);
          render();
          saveResults();
        });
      });
    }

    // handleFiles prend une liste d'entrées { file, folderName } — folderName est
    // le nom du dossier d'origine (pour le regroupement), ou null pour un fichier
    // importé directement (hors dossier).
    async function handleFiles(entries) {
      if (isProcessingBatch) {
        showToast('⏳ An import is already in progress, please wait a moment.');
        return;
      }

      let list = (entries || []).filter(e => e && e.file && isImageFile(e.file));
      if (list.length === 0) return;

      const remainingSlots = MAX_IMAGES - results.length;
      if (remainingSlots <= 0) {
        showToast(`⚠️ Limit of ${MAX_IMAGES} images reached. Clear results to add more.`);
        return;
      }
      if (list.length > remainingSlots) {
        showToast(`⚠️ Max ${MAX_IMAGES} images at a time: only the first ${remainingSlots} will be processed.`);
        list = list.slice(0, remainingSlots);
      }

      isProcessingBatch = true;
      dropZone.classList.add('processing');
      if (folderBtn) folderBtn.disabled = true;
      if (progressWrap) progressWrap.style.display = 'block';

      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        const { file, folderName } = list[i];
        if (progressLabel) progressLabel.textContent = `Compressing ${i + 1}/${list.length} · ${file.name}`;
        if (progressFill) progressFill.style.width = `${Math.round((i / list.length) * 100)}%`;
        try {
          const { dataUrl, originalSize, compressedSize, converted, skippedReason, outputExt } = await compressFile(file, !!(convertToggle && convertToggle.checked));
          const name = converted ? `${stripExt(file.name)}.${outputExt || 'jpg'}` : file.name;
          results.unshift({ name, dataUrl, originalSize, compressedSize, sourceType: detectSourceType(file), converted, skippedReason, folderName: folderName || null });
          render(); // retour visuel en direct, image par image, plutôt qu'un seul gros bloc à la fin
          // Sauvegardé à chaque image plutôt qu'une seule fois à la fin : si le popup
          // se ferme en plein import (gros dossier), rien de ce qui est déjà
          // compressé n'est perdu.
          saveResults();
        } catch (e) {
          failed++;
          showToast(`❌ Compression failed: ${file.name}`);
        }
      }

      isProcessingBatch = false;
      if (progressFill) progressFill.style.width = '100%';
      if (progressWrap) setTimeout(() => { progressWrap.style.display = 'none'; }, 300);
      dropZone.classList.remove('processing');
      if (folderBtn) folderBtn.disabled = false;

      const successCount = list.length - failed;
      const folderCount = new Set(list.map(e => e.folderName).filter(Boolean)).size;
      if (successCount > 0) {
        showToast(folderCount > 1
          ? `🗜️ ${successCount} image(s) compressed from ${folderCount} folders!`
          : `🗜️ ${successCount} image(s) compressed!`);
      }
    }

    function entriesFromFileList(fileList, folderNameFn) {
      return Array.from(fileList || []).map(file => ({ file, folderName: folderNameFn ? folderNameFn(file) : null }));
    }

    // Lit récursivement un dossier déposé (drag & drop) via l'API File System
    // Entries, pour retrouver toutes les images qu'il contient (sous-dossiers inclus).
    async function readDroppedEntry(entry, rootName) {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        return [{ file, folderName: rootName }];
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const children = [];
        // readEntries() ne renvoie qu'un lot à la fois, il faut l'appeler en boucle jusqu'à ce qu'il soit vide.
        while (true) {
          const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (batch.length === 0) break;
          children.push(...batch);
        }
        const nested = await Promise.all(children.map(child => readDroppedEntry(child, rootName)));
        return nested.flat();
      }
      return [];
    }

    async function entriesFromDataTransfer(dataTransfer) {
      const items = dataTransfer.items;
      if (!items || !items.length || !items[0].webkitGetAsEntry) {
        return entriesFromFileList(dataTransfer.files, null);
      }
      const topLevelEntries = Array.from(items).map(item => item.webkitGetAsEntry()).filter(Boolean);
      const nestedEntries = await Promise.all(topLevelEntries.map(entry => readDroppedEntry(entry, entry.isDirectory ? entry.name : null)));
      return nestedEntries.flat();
    }

    // La zone gère les clics "simples" (choix de fichiers), sauf sur le bouton
    // info qui a sa propre action. Le choix de dossier a son propre bouton
    // séparé juste en dessous : un <input> ne peut proposer qu'un seul mode
    // à la fois (fichiers OU dossier), jamais les deux dans la même boîte native.
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#compressInfoBtn')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      handleFiles(entriesFromFileList(e.target.files, null));
      fileInput.value = '';
    });

    if (folderBtn && folderInput) {
      folderBtn.addEventListener('click', () => folderInput.click());
      folderInput.addEventListener('change', (e) => {
        handleFiles(entriesFromFileList(e.target.files, file => (file.webkitRelativePath || '').split('/')[0] || null));
        folderInput.value = '';
      });
    }

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      try {
        const entries = await entriesFromDataTransfer(e.dataTransfer);
        handleFiles(entries);
      } catch (err) {
        handleFiles(entriesFromFileList(e.dataTransfer.files, null));
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (results.length === 0) return;
        results = [];
        render();
        saveResults();
        showToast('🗑️ Results cleared.');
      });
    }

    if (zipBtn) {
      zipBtn.addEventListener('click', () => {
        if (results.length === 0) return;
        const originalLabel = zipBtn.textContent;
        try {
          zipBtn.disabled = true;
          zipBtn.textContent = 'Preparing…';
          const usedNames = new Set();
          const files = results.map(r => {
            const dotIdx = r.name.lastIndexOf('.');
            const ext = dotIdx > 0 ? r.name.slice(dotIdx) : '';
            // Si plusieurs dossiers ont été importés, on garde cette organisation dans le ZIP.
            const prefix = r.folderName ? `${r.folderName}/` : '';
            let name = `${prefix}${r.name}`;
            let i = 2;
            while (usedNames.has(name)) { name = `${prefix}${stripExt(r.name)}-${i}${ext}`; i++; }
            usedNames.add(name);
            return { name, data: dataUrlToBytes(r.dataUrl) };
          });
          const zipBytes = buildZip(files);
          const blob = new Blob([zipBytes], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `workbox-compressed-images-${new Date().toISOString().slice(0, 10)}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          showToast(`📦 ZIP downloaded (${files.length} image(s))!`);
        } catch (e) {
          showToast('Error creating the ZIP.');
        } finally {
          zipBtn.disabled = false;
          zipBtn.textContent = originalLabel;
        }
      });
    }

    const infoBtn = document.getElementById('compressInfoBtn');
    const infoModal = document.getElementById('compressInfoModal');
    const infoOkBtn = document.getElementById('compressInfoOkBtn');
    if (infoBtn && infoModal && infoOkBtn) {
      infoBtn.addEventListener('click', () => {
        infoModal.style.display = 'flex';
        infoModal.style.opacity = '0';
        setTimeout(() => infoModal.style.opacity = '1', 10);
        infoModal.style.transition = 'opacity 0.2s ease-out';
      });
      const closeInfoModal = () => {
        infoModal.style.opacity = '0';
        setTimeout(() => infoModal.style.display = 'none', 200);
      };
      infoOkBtn.addEventListener('click', closeInfoModal);
      infoModal.addEventListener('click', (e) => {
        if (e.target === infoModal) closeInfoModal();
      });
    }

    chrome.storage.local.get('compressResults', (data) => {
      results = data.compressResults || [];
      render();
    });
  })();

  // @module 35-web-protection  (dev/popup-src/35-web-protection.js)
  // ---- WEB PROTECTION (settings + address tester; the blocking itself lives in protection-bg.js) ----
  (function initProtection() {
    const KEY = 'protectionSettings';
    const DEFAULTS = { enabled: true, danger: true, adult: true, probe: true, content: true };
    const enabledEl = document.getElementById('protEnabled');
    const dangerEl = document.getElementById('protDanger');
    const adultEl = document.getElementById('protAdult');
    const probeEl = document.getElementById('protProbe');
    const contentEl = document.getElementById('protContent');
    const statsEl = document.getElementById('protStats');
    const testInput = document.getElementById('protTestInput');
    const testBtn = document.getElementById('protTestBtn');
    const testResult = document.getElementById('protTestResult');
    if (!enabledEl) return;
    const orb = document.getElementById('protOrb');
    const cloud = document.getElementById('protCloud');
    const stateEl = document.getElementById('protState');
    let statsText = '', target = 1, mix = 1, first = true;

    let settings = { ...DEFAULTS };

    function reflect() {
      enabledEl.checked = settings.enabled;
      dangerEl.checked = settings.danger;
      adultEl.checked = settings.adult;
      probeEl.checked = settings.probe;
      contentEl.checked = settings.content;
      dangerEl.disabled = adultEl.disabled = probeEl.disabled = contentEl.disabled = !settings.enabled;
      if (orb) {
        orb.setAttribute('aria-checked', settings.enabled ? 'true' : 'false');
        stateEl.textContent = settings.enabled ? 'Protection on' : 'Protection off';
        statsEl.textContent = settings.enabled ? statsText : 'Click the shield to turn it back on.';
        target = settings.enabled ? 1 : 0;
      }
    }
    function save() { chrome.storage.local.set({ [KEY]: settings }); }

    function showStats(stats) {
      const s = stats && typeof stats === 'object' ? stats : {};
      const danger = Number(s.danger) || 0, adult = Number(s.adult) || 0;
      statsText = danger + adult
        ? 'Stopped so far: ' + danger + ' dangerous, ' + adult + ' adult.'
        : 'Every page you open is checked. Nothing stopped yet.';
      if (settings.enabled || !orb) statsEl.textContent = statsText;
    }
    chrome.storage.local.get([KEY, 'protectionStats'], (data) => {
      settings = { ...DEFAULTS, ...(data[KEY] || {}) };
      showStats(data.protectionStats);
      reflect();
      if (first) { mix = target; first = false; }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.protectionStats) showStats(changes.protectionStats.newValue);
    });

    enabledEl.addEventListener('change', () => { settings.enabled = enabledEl.checked; reflect(); save(); });
    dangerEl.addEventListener('change', () => { settings.danger = dangerEl.checked; save(); });
    adultEl.addEventListener('change', () => { settings.adult = adultEl.checked; save(); });
    contentEl.addEventListener('change', () => { settings.content = contentEl.checked; save(); });
    probeEl.addEventListener('change', () => { settings.probe = probeEl.checked; save(); });

    function probeText(r) {
      if (!r) return '';
      if (r.state === 'online') {
        return ' · Site exists (HTTP ' + r.status + (r.redirected && r.finalHost ? ', redirects to ' + r.finalHost : '') + ')';
      }
      if (r.state === 'unreachable') return ' · Site does not respond (may not exist or is down)';
      if (r.state === 'timeout') return ' · Site gave no answer in 7 seconds';
      if (r.state === 'invalid' || r.state === 'private' || r.state === 'local') return ' · Local address: not checked';
      return '';
    }

    // returns the address to test, or null when the text is not a plausible web address
    function testAddress(text) {
      if (!text || /\s/.test(text)) return null;
      const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text);
      if (scheme && !/^https?$/i.test(scheme[1])) return null;
      if (!scheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return null; // mailto:, javascript:, ...
      let u;
      try { u = new URL(scheme ? text : 'https://' + text); } catch (e) { return null; }
      const host = u.hostname;
      if (!host || (!host.includes('.') && !host.includes(':') && host !== 'localhost')) return null;
      return u.href;
    }

    let testSeq = 0;
    async function runTest() {
      const typed = testInput.value.trim();
      if (!typed) return;
      const seq = ++testSeq;
      const raw = testAddress(typed);
      if (!raw) {
        testResult.hidden = false;
        testResult.className = 'prot-result warn';
        testResult.textContent = 'Enter a web address, for example example.com';
        return;
      }
      let v = WBProtection.evaluate(raw);
      let trustedNote = '';
      try {
        const tl = (await chrome.storage.local.get('protectionTrusted')).protectionTrusted || [];
        let hh = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
        for (;;) { if (tl.includes(hh)) { trustedNote = v ? 'Trusted site: WorkBox lets it through (it would otherwise be flagged: ' + v.reason + ')' : 'Trusted site.'; v = null; break; } const dot = hh.indexOf('.'); if (dot < 0) break; hh = hh.slice(dot + 1); if (!hh.includes('.')) break; }
      } catch (e) { }
      if (seq !== testSeq) return;
      testResult.hidden = false;
      testResult.className = 'prot-result ' + (!v ? 'ok' : v.type === 'danger' ? 'bad' : 'warn');
      const verdict = trustedNote ? trustedNote : !v ? (WBProtection.isRickroll(raw) ? WBProtection.RICKROLL_MSG : 'No warning sign found.')
        : (v.type === 'danger' ? 'Dangerous: ' : 'Adult content: ') + v.reason;
      testResult.textContent = verdict + ' · Checking if the site exists…';
      let r = null;
      try { r = await chrome.runtime.sendMessage({ type: 'PROTECTION_PROBE', url: raw, manual: true }); } catch (e) { }
      if (seq !== testSeq) return; // a newer check has been started since
      testResult.textContent = verdict + (probeText(r) || '');
    }
    testBtn.addEventListener('click', runTest);
    testInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runTest(); });

    // ----- trusted sites -----
    (function initTrusted() {
      const TKEY = 'protectionTrusted';
      const listEl = document.getElementById('protTrustList');
      if (!listEl) return;
      const input = document.getElementById('protTrustInput');
      const countEl = document.getElementById('protTrustCount');
      const searchEl = document.getElementById('protTrustSearch');
      const clearBtn = document.getElementById('protTrustClear');
      const bmBtn = document.getElementById('protTrustBookmarks');
      let trusted = [];
      const SHOW = 60;

      // "https://www.Example.com/page" -> "example.com"; null when it is not a site name
      function hostFrom(text) {
        const t = String(text || '').trim();
        if (!t || /\s/.test(t)) return null;
        let u;
        try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t); } catch (e) { return null; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        const hst = u.hostname.toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
        return hst && (hst.includes('.') || hst === 'localhost') ? hst : null;
      }
      const save = () => chrome.storage.local.set({ [TKEY]: trusted });

      function draw() {
        countEl.textContent = trusted.length ? '(' + trusted.length + ')' : '';
        clearBtn.hidden = !trusted.length;
        searchEl.hidden = trusted.length < 8;
        const q = searchEl.hidden ? '' : searchEl.value.trim().toLowerCase();
        const shown = q ? trusted.filter((s) => s.includes(q)) : trusted;
        listEl.textContent = '';
        if (!trusted.length) { const e = document.createElement('div'); e.className = 'prot-trust-empty'; e.textContent = 'No trusted site yet.'; listEl.appendChild(e); fades(); return; }
        shown.slice(0, SHOW).forEach((site) => {
          const row = document.createElement('div');
          row.className = 'prot-trust-row';
          const name = document.createElement('span'); name.textContent = site;
          const del = document.createElement('button');
          del.className = 'exp-del'; del.textContent = '✕'; del.title = 'Remove'; del.setAttribute('aria-label', 'Remove ' + site);
          del.addEventListener('click', () => { trusted = trusted.filter((s) => s !== site); save(); draw(); });
          row.append(name, del);
          listEl.appendChild(row);
        });
        if (shown.length > SHOW) { const more = document.createElement('div'); more.className = 'prot-trust-empty'; more.textContent = (shown.length - SHOW) + ' more: use the search to find one.'; listEl.appendChild(more); }
        if (q && !shown.length) { const e = document.createElement('div'); e.className = 'prot-trust-empty'; e.textContent = 'No trusted site matches.'; listEl.appendChild(e); }        requestAnimationFrame(fades);
      }
      // soft fade at the top and bottom of the list, only on the side that continues
      function fades() {
        const max = listEl.scrollHeight - listEl.clientHeight;
        listEl.classList.toggle('fade-top', listEl.scrollTop > 2);
        listEl.classList.toggle('fade-bottom', max > 2 && listEl.scrollTop < max - 2);
      }
      listEl.addEventListener('scroll', fades, { passive: true });
      document.getElementById('protTrustFold').addEventListener('toggle', fades);

      function add() {
        const hst = hostFrom(input.value);
        if (!hst) { showToast('Enter a site name, for example example.com'); input.focus(); return; }
        if (trusted.includes(hst)) { showToast('Already trusted'); return; }
        trusted = trusted.concat(hst).sort();
        save(); draw();
        input.value = '';
        showToast(hst + ' is now trusted');
      }
      document.getElementById('protTrustAdd').addEventListener('click', add);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      searchEl.addEventListener('input', draw);

      let clearArmed = 0;
      clearBtn.addEventListener('click', () => {
        if (!clearArmed) { clearBtn.textContent = 'Click again to remove all'; clearArmed = setTimeout(() => { clearArmed = 0; clearBtn.textContent = 'Remove all'; }, 3000); return; }
        clearTimeout(clearArmed); clearArmed = 0; clearBtn.textContent = 'Remove all';
        trusted = []; save(); draw();
      });

      function bookmarkResult(r) {
        if (!r) return;
        showToast(r.found ? r.added + ' of ' + r.found + ' bookmarked sites added' + (r.added < r.found ? ' (the others were already trusted)' : '') : 'No website found in your bookmarks');
      }
      bmBtn.addEventListener('click', () => {
        if (!chrome.permissions || !chrome.permissions.request) { showToast('Not available in this browser'); return; }
        // Chrome only shows its permission window when it is asked for directly
        // in the click: nothing may be awaited before this call.
        chrome.storage.local.set({ protectionBookmarksPending: Date.now() });
        let asking;
        try { asking = chrome.permissions.request({ permissions: ['bookmarks'] }); }
        catch (e) { chrome.storage.local.remove('protectionBookmarksPending'); showToast('Could not ask for the bookmarks permission'); return; }
        bmBtn.disabled = true;
        Promise.resolve(asking).then(async (ok) => {
          if (!ok) { await chrome.storage.local.remove('protectionBookmarksPending'); showToast('Bookmarks were not read'); return; }
          // the background reads them (it also does so by itself if this window closed meanwhile)
          const r = await chrome.runtime.sendMessage({ type: 'PROTECTION_IMPORT_BOOKMARKS' });
          if (r && r.ok === false) showToast('Could not read the bookmarks');
        }).catch((e) => {
          chrome.storage.local.remove('protectionBookmarksPending');
          showToast('Could not read the bookmarks' + (e && e.message ? ': ' + String(e.message).slice(0, 80) : ''));
        }).finally(() => { bmBtn.disabled = false; });
      });

      chrome.storage.local.get([TKEY, 'protectionBookmarksResult'], (d) => {
        trusted = Array.isArray(d[TKEY]) ? d[TKEY].slice() : [];
        draw();
        // an import finished while this window was closed
        const r = d.protectionBookmarksResult;
        if (r && Date.now() - r.ts < 60000) { bookmarkResult(r); chrome.storage.local.remove('protectionBookmarksResult'); document.getElementById('protTrustFold').open = true; }
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[TKEY]) { trusted = Array.isArray(changes[TKEY].newValue) ? changes[TKEY].newValue.slice() : []; draw(); }
        if (changes.protectionBookmarksResult && changes.protectionBookmarksResult.newValue) { bookmarkResult(changes.protectionBookmarksResult.newValue); chrome.storage.local.remove('protectionBookmarksResult'); }
      });
    })();

    // ----- the shield: a cloud of points, click to switch the protection -----
    if (!orb || !cloud) return;
    orb.addEventListener('click', () => {
      enabledEl.checked = !enabledEl.checked;
      enabledEl.dispatchEvent(new Event('change'));
      showToast(enabledEl.checked ? 'Protection on' : 'Protection off');
    });

    let seed = 31337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // half-width of the shield at height y (-1 top, 1.12 tip)
    const halfW = (y) => y < -1 || y > 1.12 ? 0 : y < 0.05 ? 0.88 : 0.88 * (1 - Math.pow((y - 0.05) / 1.07, 1.7));
    const body = [], mark = [], dust = [];
    const mk = (x, y, edge) => ({ x, y, z: (rnd() - 0.5) * (edge ? 0.08 : 0.26), ph: rnd() * 6.283, a: rnd() * 6.283, far: 1.5 + rnd() * 1.6, lift: 0.25 + rnd(), edge });
    for (let i = 0; i < 420; i++) {                 // outline, drawn twice as dense
      const y = -1 + rnd() * 2.12, s = rnd() < 0.5 ? -1 : 1;
      if (rnd() < 0.22) body.push(mk((rnd() * 2 - 1) * 0.88, -1 + (rnd() - 0.5) * 0.03, true));
      else body.push(mk(s * halfW(y) + (rnd() - 0.5) * 0.03, y, true));
    }
    while (body.length < 900) {                     // loose fill
      const x = rnd() * 2 - 1, y = -1 + rnd() * 2.12;
      if (Math.abs(x) < halfW(y) - 0.05) body.push(mk(x, y, false));
    }
    const seg = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) { const k = i / (n - 1); mark.push(mk(x0 + (x1 - x0) * k + (rnd() - 0.5) * 0.05, y0 + (y1 - y0) * k + (rnd() - 0.5) * 0.05, true)); } };
    seg(-0.38, 0.0, -0.1, 0.3, 60); seg(-0.1, 0.3, 0.42, -0.34, 110);   // check mark
    for (let i = 0; i < 110; i++) dust.push({ x: (rnd() * 2 - 1) * 2.3, y: (rnd() * 2 - 1) * 1.5, z: (rnd() * 2 - 1) * 0.9, ph: rnd() * 6.283, v: 0.02 + rnd() * 0.05 });

    const ctx = cloud.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, last = 0, t = 0, hover = 0, hoverTo = 0;
    orb.addEventListener('mouseenter', () => { hoverTo = 1; });
    orb.addEventListener('mouseleave', () => { hoverTo = 0; });
    orb.addEventListener('focus', () => { if (orb.matches(':focus-visible')) hoverTo = 1; });
    orb.addEventListener('blur', () => { hoverTo = 0; });
    const ease = (v) => v * v * (3 - 2 * v);

    function draw(now) {
      requestAnimationFrame(draw);
      const visible = cloud.checkVisibility ? cloud.checkVisibility({ visibilityProperty: true }) : cloud.offsetParent !== null;
      const box = visible ? cloud.getBoundingClientRect() : null;
      if (!box || !box.width) { last = now; return; }
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W !== box.width || H !== box.height) { W = box.width; H = box.height; cloud.width = Math.round(W * dpr); cloud.height = Math.round(H * dpr); }
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      if (!calm) t += dt;
      mix += (target - mix) * (calm ? 1 : Math.min(1, dt * 3.2));
      hover += (hoverTo - hover) * Math.min(1, dt * 3.5);
      const m = ease(Math.max(0, Math.min(1, mix)));   // 1 = protection on

      const ry = Math.sin(t * 0.5) * 0.55, rx = Math.sin(t * 0.37) * 0.12;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const R = Math.min(W, H) * 0.36;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const put = (x, y, z, r, a, color) => {
        const X = x * cy + z * sy, Z0 = -x * sy + z * cy;
        const Y = y * cx - Z0 * sx, Z = y * sx + Z0 * cx;
        const k = 1 / (1 - Z * 0.3);
        ctx.globalAlpha = Math.max(0, Math.min(1, a * (0.7 + Z * 0.3)));
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(W / 2 + X * R * k, H / 2 + (Y - 0.05) * R * k, Math.max(0.3, r * k), 0, 6.2832); ctx.fill();
      };
      const up = (p) => hover * (0.04 + p.lift * 0.16 + Math.sin(t * 1.6 + p.ph) * 0.03);

      for (const d of dust) {
        if (!calm) { d.y -= d.v * (1 + hover * 3) * dt; if (d.y < -1.6) d.y = 1.6; }
        put(d.x + Math.sin(t * 0.4 + d.ph) * 0.05, d.y, d.z, 0.7, 0.2, '#a78bfa');
      }
      // shield: solid when on; when off its points drift apart and fade
      for (const p of body) {
        const loose = (1 - m) * 0.16;
        const x = p.x + Math.cos(p.a + t * 0.25) * loose, y = p.y + Math.sin(p.a + t * 0.25) * loose - up(p);
        const tw = 0.8 + 0.2 * Math.sin(t * 2 + p.ph);
        put(x, y, p.z + Math.sin(t * 0.9 + p.ph) * 0.04 + hover * p.lift * 0.18, p.edge ? 1.25 : 0.85,
          m * (p.edge ? 0.95 : 0.5) * tw + (1 - m) * 0.22, m > 0.5 ? (p.edge ? '#c4b5fd' : '#a78bfa') : '#8f86b5');
      }
      // check mark: only there when the protection is on
      for (const p of mark) {
        const far = 1 + (1 - m) * (p.far - 1);
        put(p.x * far, p.y * far - up(p), 0.16 * m + hover * p.lift * 0.18, 1.5, m * (0.85 + 0.15 * Math.sin(t * 3 + p.ph)), '#ffffff');
      }
    }
    requestAnimationFrame(draw);
  })();

  // @module 36-qr-clouds  (dev/popup-src/36-qr-clouds.js)
  // ---- QR GENERATOR (styling engine lives in qrgen.js; this is the panel wiring) ----
  // Scanner hero: a QR code drawn as a cloud of points floating in 3D, crossed
  // by a band of light. Clicking it scans the page, like the button below.
  (function initQrCloud() {
    const hero = document.getElementById('qrHero');
    const cv = document.getElementById('qrCloud');
    const scanBtn = document.getElementById('qrAreaSelectBtn');
    const manualBtn = document.getElementById('qrManualBtn');
    if (!hero || !cv || !scanBtn) return;

    hero.addEventListener('click', () => scanBtn.click());
    hero.addEventListener('keydown', (e) => {
      if (e.target === hero && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); scanBtn.click(); }
    });

    if (manualBtn) {
      manualBtn.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.id) { showToast('Unable to find the active tab.'); return; }
          if (/^(chrome|chrome-extension|edge|about|devtools):/i.test(tab.url || '')) {
            showToast('Not available on this page (chrome://, Web Store...).');
            return;
          }
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__workboxQrMode = 'manual'; } });
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/protection.js', 'content/qroverlay.js'] });
          window.close();
        } catch (e) {
          showToast('Unable to start selection — reload the page and try again.');
        }
      });
    }

    // A made-up 21x21 code: three real finder patterns, the rest drawn from a
    // fixed seed so the picture is the same every time.
    const N = 21, cells = [];
    let seed = 20261003;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const finder = (x, y, ox, oy) => {
      const a = x - ox, b = y - oy;
      if (a < 0 || b < 0 || a > 6 || b > 6) return null;
      return a === 0 || b === 0 || a === 6 || b === 6 || (a >= 2 && a <= 4 && b >= 2 && b <= 4);
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let on = null, strong = false;
        for (const [ox, oy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
          const f = finder(x, y, ox, oy);
          if (f !== null) { on = f; strong = true; }
        }
        const nearFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
        if (on === null) on = nearFinder ? false : rnd() < 0.48;
        if (on) cells.push({ x: (x - (N - 1) / 2) / (N / 2), y: (y - (N - 1) / 2) / (N / 2), strong, ph: rnd() * 6.283, f: 0.5 + rnd() });
      }
    }
    const dust = [];
    for (let i = 0; i < 46; i++) dust.push({ x: (rnd() * 2 - 1) * 1.7, y: (rnd() * 2 - 1) * 1.3, z: (rnd() * 2 - 1) * 0.9, ph: rnd() * 6.283, v: 0.03 + rnd() * 0.06 });

    const ctx = cv.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, hover = 0, target = 0, last = 0, t = 0;
    hero.addEventListener('mouseenter', () => { target = 1; });
    hero.addEventListener('mouseleave', () => { target = 0; });
    hero.addEventListener('focus', () => { target = 1; });
    hero.addEventListener('blur', () => { target = 0; });

    function size() {
      const r = cv.getBoundingClientRect();
      if (!r.width) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W !== r.width || H !== r.height) {
        W = r.width; H = r.height;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      }
      return true;
    }

    function draw(now) {
      requestAnimationFrame(draw);
      const visible = cv.checkVisibility ? cv.checkVisibility({ visibilityProperty: true }) : cv.offsetParent !== null;
      if (!visible || !size()) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      if (!calm) t += dt * (1 + hover * 0.6);
      hover += (target - hover) * Math.min(1, dt * 6);

      // on hover the code turns to face the viewer and its points settle
      const ry = Math.sin(t * 0.45) * 0.62 * (1 - hover * 0.75);
      const rx = 0.42 * (1 - hover * 0.8) + Math.sin(t * 0.31) * 0.1 * (1 - hover);
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      // scan line: sweeps down then back up, like a reader passing over the code
      const sweep = Math.sin(t * 1.15);
      const band = sweep * 1.12, dir = Math.cos(t * 1.15) >= 0 ? 1 : -1;
      const R = Math.min(W, H) * 0.34;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const proj = (x, y, z) => {
        const X = x * cy + z * sy, Z0 = -x * sy + z * cy;
        const Y = y * cx - Z0 * sx, Z = y * sx + Z0 * cx;
        const k = 1 / (1 - Z * 0.28);
        return [W / 2 + X * R * k, H / 2 + Y * R * k, k, Z];
      };
      const put = (x, y, z, r, a, bright) => {
        const q = proj(x, y, z);
        ctx.globalAlpha = Math.max(0, Math.min(1, a * (0.55 + (q[3] + 1) * 0.3)));
        ctx.fillStyle = bright ? '#f3ecff' : '#a78bfa';
        ctx.beginPath();
        ctx.arc(q[0], q[1], Math.max(0.3, r * q[2]), 0, 6.2832);
        ctx.fill();
      };
      const line = (x0, y0, x1, y1) => { const p0 = proj(x0, y0, 0), p1 = proj(x1, y1, 0); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); };

      for (const d of dust) {
        if (!calm) { d.y -= d.v * dt; if (d.y < -1.3) d.y = 1.3; }
        put(d.x + Math.sin(t * 0.4 + d.ph) * 0.05, d.y, d.z, 0.7, 0.24, false);
      }

      // viewfinder corners around the code
      const c0 = 1.2, len = 0.3;
      ctx.globalAlpha = 0.55 + hover * 0.4;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [sxn, syn] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        line(sxn * c0, syn * c0, sxn * (c0 - len), syn * c0);
        line(sxn * c0, syn * c0, sxn * c0, syn * (c0 - len));
      }
      ctx.stroke();

      // points: small, brighter where the line is and just behind it
      for (const p of cells) {
        const gap = (band - p.y) * dir;           // > 0: the line has just passed this point
        const lit = gap >= 0 ? Math.max(0, 1 - gap / 0.55) : Math.max(0, 1 + gap / 0.07);
        const float = Math.sin(t * p.f + p.ph) * 0.1 * (1 - hover * 0.85);
        put(p.x, p.y, float + lit * 0.12, (p.strong ? 1.55 : 1.2) + lit * 0.7, (p.strong ? 0.9 : 0.62) + lit * 0.5, lit > 0.4);
      }

      // the scan line itself, with a soft glow and a fading trail
      const l0 = proj(-c0, band, 0), l1 = proj(c0, band, 0);
      const g = ctx.createLinearGradient(l0[0], 0, l1[0], 0);
      g.addColorStop(0, 'rgba(196,181,253,0)'); g.addColorStop(0.15, 'rgba(233,224,255,0.95)');
      g.addColorStop(0.85, 'rgba(233,224,255,0.95)'); g.addColorStop(1, 'rgba(196,181,253,0)');
      const t0y = proj(0, band - dir * 0.34, 0)[1];
      const trail = ctx.createLinearGradient(0, l0[1], 0, t0y);
      trail.addColorStop(0, 'rgba(167,139,250,0.26)'); trail.addColorStop(1, 'rgba(167,139,250,0)');
      const b0 = proj(-c0, band - dir * 0.34, 0), b1 = proj(c0, band - dir * 0.34, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = trail;
      ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(167,139,250,0.9)'; ctx.shadowBlur = 10;
      ctx.strokeStyle = g; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(l0[0], l0[1]); ctx.lineTo(l1[0], l1[1]); ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(draw);

    // the row of QR types scrolls sideways with the mouse wheel
    const types = document.getElementById('qgTypes');
    if (types) types.addEventListener('wheel', (e) => {
      if (types.scrollWidth <= types.clientWidth) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      types.scrollLeft += d;
    }, { passive: false });
  })();

  // Generator, before anything is typed: a swarm of points in 3D that gathers
  // into a QR code, holds, then scatters again.
  (function initQgCloud() {
    const cv = document.getElementById('qgCloud');
    if (!cv) return;
    const N = 21, pts = [];
    let seed = 7421;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const inFinder = (x, y, ox, oy) => {
      const a = x - ox, b = y - oy;
      if (a < 0 || b < 0 || a > 6 || b > 6) return null;
      return a === 0 || b === 0 || a === 6 || b === 6 || (a >= 2 && a <= 4 && b >= 2 && b <= 4);
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let on = null;
        for (const [ox, oy] of [[0, 0], [N - 7, 0], [0, N - 7]]) { const f = inFinder(x, y, ox, oy); if (f !== null) on = f; }
        const near = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
        if (on === null) on = near ? false : rnd() < 0.46;
        if (!on) continue;
        // resting place in the swarm: somewhere inside a ball
        const u = rnd() * 2 - 1, a = rnd() * 6.283, r = 0.55 + rnd() * 0.75, s = Math.sqrt(1 - u * u);
        pts.push({
          gx: (x - (N - 1) / 2) / (N / 2), gy: (y - (N - 1) / 2) / (N / 2),
          sx: Math.cos(a) * s * r * 1.5, sy: u * r, sz: Math.sin(a) * s * r,
          ph: rnd() * 6.283, d: rnd() * 0.35
        });
      }
    }
    const ctx = cv.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, last = 0, t = calm ? 5.2 : 0;
    const ease = (v) => v * v * (3 - 2 * v);

    function draw(now) {
      requestAnimationFrame(draw);
      const visible = cv.checkVisibility ? cv.checkVisibility({ visibilityProperty: true }) : cv.offsetParent !== null;
      const r = visible ? cv.getBoundingClientRect() : null;
      if (!r || !r.width) { last = now; return; }
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W !== r.width || H !== r.height) { W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      if (!calm) t += dt;

      // 9 s cycle: swarm, gather, hold as a code, scatter
      const c = t % 9;
      const gather = c < 2.2 ? 0 : c < 4.4 ? (c - 2.2) / 2.2 : c < 7 ? 1 : 1 - (c - 7) / 2;
      const ry = t * 0.35, R = Math.min(W * 0.3, H * 0.36);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        const m = ease(Math.max(0, Math.min(1, gather * (1 + p.d) - p.d * 0.5 * (1 - gather))));
        // swarm position turns around the vertical axis and breathes
        const a = ry + p.ph * 0.05;
        const wx = p.sx * Math.cos(a) + p.sz * Math.sin(a), wz = -p.sx * Math.sin(a) + p.sz * Math.cos(a);
        const wy = p.sy + Math.sin(t * 0.8 + p.ph) * 0.06;
        const x = wx + (p.gx - wx) * m, y = wy + (p.gy - wy) * m, z = wz * (1 - m);
        const k = 1 / (1 - z * 0.3);
        ctx.globalAlpha = Math.max(0.12, Math.min(1, 0.42 + z * 0.3 + m * 0.5));
        ctx.fillStyle = m > 0.9 ? '#e9e0ff' : '#a78bfa';
        ctx.beginPath();
        ctx.arc(W / 2 + x * R * k, H * 0.44 + y * R * k, (1.1 + m * 1.1) * k, 0, 6.2832);
        ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  })();

  // @module 37-qr-generator  (dev/popup-src/37-qr-generator.js)
  (function initQrGenerator() {
    const Q = window.WBQr;
    const canvas = document.getElementById('qgCanvas');
    if (!Q || !canvas || typeof qrcode === 'undefined') return;
    const $ = (id) => document.getElementById(id);
    const SKEY = 'qrgenSettings';

    const state = {
      type: 'url', values: {}, ec: 'auto', size: 1024, format: 'png', autosave: true, currentId: null, history: [], shown: 20,
      opts: Object.assign({}, Q.DEFAULTS, { eyeColor: null }),
      logo: { img: null, dataUrl: null, w: 0, h: 0, scale: 0.22, shape: 'circle', tint: false, plate: false }
    };

    // ---- content fields
    const typesEl = $('qgTypes'), fieldsEl = $('qgFields'), groupsEl = $('qgGroups');
    const groupOf = (type) => (Q.GROUPS.find((g) => g.types.includes(type)) || Q.GROUPS[0]).id;
    let shownGroup = null;
    function setType(k) { state.type = k; state.values = {}; state.currentId = null; buildFields(); render(); persist(); }
    Q.GROUPS.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'qg-group'; b.dataset.group = g.id; b.textContent = g.label;
      // choosing a family shows its types; the first one is selected so the fields below always match
      b.addEventListener('click', () => { if (groupOf(state.type) !== g.id) setType(g.types[0]); });
      groupsEl.appendChild(b);
    });
    function buildTypes() {
      const gid = groupOf(state.type);
      groupsEl.querySelectorAll('.qg-group').forEach((b) => b.classList.toggle('active', b.dataset.group === gid));
      if (shownGroup === gid) return;
      shownGroup = gid;
      typesEl.textContent = '';
      Q.GROUPS.find((g) => g.id === gid).types.forEach((k) => {
        const b = document.createElement('button');
        b.className = 'cat-tag'; b.dataset.type = k; b.textContent = Q.TYPES[k].label;
        b.addEventListener('click', () => setType(k));
        typesEl.appendChild(b);
      });
    }

    function buildFields() {
      buildTypes();
      typesEl.querySelectorAll('.cat-tag').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
      fieldsEl.textContent = '';
      Q.TYPES[state.type].fields.forEach((f) => {
        const wrap = document.createElement('div');
        wrap.className = 'qg-field';
        let input;
        if (f.kind === 'check') {
          const lab = document.createElement('label');
          lab.className = 'qg-check';
          input = document.createElement('input'); input.type = 'checkbox';
          lab.append(input, ' ' + f.label);
          wrap.appendChild(lab);
        } else {
          const lab = document.createElement('label');
          lab.className = 'qg-flabel'; lab.textContent = f.label;
          wrap.appendChild(lab);
          if (f.kind === 'textarea') input = document.createElement('textarea');
          else if (f.kind === 'select') {
            input = document.createElement('select');
            f.options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; input.appendChild(o); });
            if (state.values[f.k] == null) state.values[f.k] = input.value;
          } else { input = document.createElement('input'); input.type = f.kind === 'datetime' ? 'datetime-local' : 'text'; }
          if (f.ph) input.placeholder = f.ph;
          input.spellcheck = false;
          wrap.appendChild(input);
        }
        if (f.kind === 'check') input.checked = !!state.values[f.k];
        else if (state.values[f.k] != null) input.value = state.values[f.k];
        const ev = (f.kind === 'check' || f.kind === 'select') ? 'change' : 'input';
        input.addEventListener(ev, () => { state.values[f.k] = f.kind === 'check' ? input.checked : input.value; render(); });
        fieldsEl.appendChild(wrap);
      });
    }

    // ---- settings by category: one pane at a time under the preview
    function showPane(name) {
      document.querySelectorAll('#qgTabs .qg-tab').forEach((b) => { const on = b.dataset.qgtab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      document.querySelectorAll('#panel-qrgen .qg-pane').forEach((p) => { p.hidden = p.dataset.qgpane !== name; });
    }
    document.querySelectorAll('#qgTabs .qg-tab').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.qgtab)));

    // ---- style controls
    function reflectStyle() {
      const o = state.opts;
      document.querySelectorAll('#qgModules .cat-tag').forEach((b) => b.classList.toggle('active', b.dataset.ms === o.moduleStyle));
      document.querySelectorAll('#qgShape .cat-tag').forEach((b) => b.classList.toggle('active', b.dataset.shape === (o.shape || 'square')));
      $('qgFormat').value = state.format;
      $('qgEyeFrame').value = o.eyeFrame; $('qgEyeBall').value = o.eyeBall;
      $('qgFg1').value = o.fg1; $('qgFg2').value = o.fg2;
      $('qgGradient').checked = o.gradient; $('qgFg2').hidden = $('qgDirection').hidden = !o.gradient;
      $('qgDirection').value = o.direction;
      $('qgEyeCustom').checked = !!o.eyeColor; $('qgEyeColor').hidden = !o.eyeColor;
      if (o.eyeColor) $('qgEyeColor').value = o.eyeColor;
      $('qgBg').value = o.bg; $('qgTransparent').checked = o.transparent; $('qgBg').disabled = o.transparent;
      $('qgMargin').value = o.margin; $('qgMarginVal').textContent = o.margin;
      $('qgEc').value = state.ec; $('qgSize').value = String(state.size);
    }
    function onStyle(fn) { return (e) => { fn(e); reflectStyle(); render(); persist(); }; }

    document.querySelectorAll('#qgModules .cat-tag').forEach((b) => b.addEventListener('click', onStyle(() => { state.opts.moduleStyle = b.dataset.ms; })));
    document.querySelectorAll('#qgShape .cat-tag').forEach((b) => b.addEventListener('click', onStyle(() => { state.opts.shape = b.dataset.shape; })));
    $('qgFormat').addEventListener('change', onStyle(() => { state.format = $('qgFormat').value; }));
    document.querySelectorAll('#qgPresets .cat-tag').forEach((b) => b.addEventListener('click', onStyle(() => {
      state.opts = Object.assign({}, Q.DEFAULTS, { direction: 'diagonal', shape: state.opts.shape || 'square', margin: state.opts.margin }, Q.PRESETS[b.dataset.preset]);
    })));
    $('qgEyeFrame').addEventListener('change', onStyle(() => { state.opts.eyeFrame = $('qgEyeFrame').value; }));
    $('qgEyeBall').addEventListener('change', onStyle(() => { state.opts.eyeBall = $('qgEyeBall').value; }));
    $('qgFg1').addEventListener('input', onStyle(() => { state.opts.fg1 = $('qgFg1').value; if (!state.opts.gradient) state.opts.fg2 = state.opts.fg1; }));
    $('qgFg2').addEventListener('input', onStyle(() => { state.opts.fg2 = $('qgFg2').value; }));
    $('qgGradient').addEventListener('change', onStyle(() => { state.opts.gradient = $('qgGradient').checked; }));
    $('qgDirection').addEventListener('change', onStyle(() => { state.opts.direction = $('qgDirection').value; }));
    $('qgEyeCustom').addEventListener('change', onStyle(() => { state.opts.eyeColor = $('qgEyeCustom').checked ? $('qgEyeColor').value : null; }));
    $('qgEyeColor').addEventListener('input', onStyle(() => { state.opts.eyeColor = $('qgEyeColor').value; }));
    $('qgBg').addEventListener('input', onStyle(() => { state.opts.bg = $('qgBg').value; }));
    $('qgTransparent').addEventListener('change', onStyle(() => { state.opts.transparent = $('qgTransparent').checked; }));
    $('qgMargin').addEventListener('input', onStyle(() => { state.opts.margin = Number($('qgMargin').value); }));
    $('qgEc').addEventListener('change', onStyle(() => { state.ec = $('qgEc').value; }));
    $('qgSize').addEventListener('change', onStyle(() => { state.size = Number($('qgSize').value); }));

    // ---- logo
    function reflectLogo() {
      const has = !!state.logo.img;
      $('qgLogoRemove').hidden = !has; $('qgLogoThumb').hidden = !has; $('qgLogoOpts').hidden = !has;
      $('qgLogoBtn').textContent = has ? 'Change image' : 'Choose an image';
      $('qgLogoScale').value = Math.round(state.logo.scale * 100);
      $('qgLogoScaleVal').textContent = Math.round(state.logo.scale * 100) + '%';
      $('qgLogoShape').value = state.logo.shape;
      $('qgLogoTint').checked = !!state.logo.tint;
      $('qgLogoPlate').checked = !!state.logo.plate;
    }
    $('qgLogoBtn').addEventListener('click', () => $('qgLogoFile').click());
    // ---- logo loading: compress heavy images, refuse only what cannot fit in 2 MB
    const LOGO_LIMIT = 2 * 1024 * 1024;
    const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    function blobToDataUrl(blob) {
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('READ')); r.readAsDataURL(blob); });
    }
    function loadImg(src) {
      return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('READ')); im.src = src; });
    }
    function canvasBlob(cv, type, q) { return new Promise((res) => cv.toBlob(res, type, q)); }

    async function prepareLogo(file) {
      const src = await blobToDataUrl(file);
      const img = await loadImg(src);
      const iw = img.naturalWidth || 512, ih = img.naturalHeight || 512;
      if (file.size <= LOGO_LIMIT && Math.max(iw, ih) <= 1600) return { dataUrl: src, img, w: iw, h: ih, note: null };
      // Too heavy or too large: shrink step by step until it fits under 2 MB.
      const attempts = [
        { side: 800, type: 'image/png' }, { side: 512, type: 'image/png' },
        { side: 512, type: 'image/jpeg', q: 0.85 }, { side: 400, type: 'image/jpeg', q: 0.7 }, { side: 256, type: 'image/jpeg', q: 0.6 }
      ];
      for (const at of attempts) {
        const k = Math.min(1, at.side / Math.max(iw, ih));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(iw * k)); cv.height = Math.max(1, Math.round(ih * k));
        const ctx = cv.getContext('2d');
        if (at.type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const blob = await canvasBlob(cv, at.type, at.q);
        if (blob && blob.size <= LOGO_LIMIT) {
          const dataUrl = await blobToDataUrl(blob);
          const im2 = await loadImg(dataUrl);
          return { dataUrl, img: im2, w: im2.naturalWidth, h: im2.naturalHeight, note: 'Image compressed (' + kb(file.size) + ' → ' + kb(blob.size) + ').' };
        }
      }
      throw new Error('TOO_HEAVY');
    }
    // Lighter copy for the saved list, so many saved codes stay small on disk.
    async function lightCopy(dataUrl, img) {
      if (dataUrl.length <= 400000) return dataUrl;
      const k = Math.min(1, 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((img.naturalWidth || 512) * k)); cv.height = Math.max(1, Math.round((img.naturalHeight || 512) * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let out = cv.toDataURL('image/png');
      if (out.length > 400000) out = cv.toDataURL('image/jpeg', 0.8);
      return out;
    }
    function logoMsg(cls, text) {
      const el = $('qgLogoMsg');
      el.hidden = !text; el.className = 'qg-note qg-logo-msg ' + cls; el.textContent = text || '';
    }

    $('qgLogoFile').addEventListener('change', async () => {
      const file = $('qgLogoFile').files[0];
      $('qgLogoFile').value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { logoMsg('bad', 'This file is not an image. Please choose a PNG, JPG, SVG or WebP image.'); return; }
      logoMsg('', 'Preparing the image…');
      try {
        const p = await prepareLogo(file);
        const stored = await lightCopy(p.dataUrl, p.img);
        Object.assign(state.logo, { img: p.img, dataUrl: stored, w: p.w || 100, h: p.h || 100 });
        $('qgLogoThumb').src = stored;
        reflectLogo(); render();
        logoMsg(p.note ? 'ok' : '', p.note || '');
      } catch (e) {
        if (e && e.message === 'TOO_HEAVY') logoMsg('bad', 'This image is too heavy (' + kb(file.size) + ') and is still over 2 MB after compression. Please choose another image.');
        else logoMsg('bad', 'Could not read this image. Please choose another one.');
      }
    });
    // ---- logo from the website in the QR content ----
    // Contacts that website only, when the button is pressed: reads its page to find the
    // icon it declares, then falls back to the usual icon addresses.
    function qrSiteUrl() {
      let txt = '';
      try { txt = String(Q.TYPES[state.type].build(state.values) || ''); } catch (_) { }
      const m = txt.match(/https?:\/\/[^\s"'<>]+/i);
      if (!m) return null;
      try { return new URL(m[0]); } catch (_) { return null; }
    }
    function timedFetch(url, ms, cred) {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
      return fetch(url, { signal: c.signal, credentials: cred || 'omit', redirect: 'follow' }).finally(() => clearTimeout(t));
    }
    async function siteIconCandidates(u, cred) {
      const out = [];
      try {
        const r = await timedFetch(u.origin + '/', 7000, cred);
        if (r.ok) {
          const doc = new DOMParser().parseFromString((await r.text()).slice(0, 400000), 'text/html');
          const base = r.url || u.origin + '/';
          doc.querySelectorAll('link[rel]').forEach((l) => {
            const rel = (l.getAttribute('rel') || '').toLowerCase(), href = l.getAttribute('href');
            if (!href || !/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed|shortcut icon)(\s|$)/.test(rel) && !rel.includes('icon')) return;
            if (rel.includes('mask-icon')) return;
            let size = 0;
            const s = (l.getAttribute('sizes') || '').match(/(\d+)x(\d+)/);
            if (s) size = Number(s[1]);
            else if (rel.includes('apple-touch')) size = 180;
            else if (/\.svg(\?|$)/i.test(href)) size = 512;
            try { out.push({ url: new URL(href, base).href, size }); } catch (_) { }
          });
        }
      } catch (_) { /* the page may refuse us: the fallbacks below still run */ }
      out.sort((a, b) => b.size - a.size);
      out.push({ url: u.origin + '/apple-touch-icon.png', size: 0 }, { url: u.origin + '/favicon.ico', size: 0 });
      return out.filter((c, i, arr) => /^https?:/i.test(c.url) && arr.findIndex(x => x.url === c.url) === i).slice(0, 8);
    }
    async function tryIconList(list, cred) {
      let best = null;
      for (const c of list) {
        try {
          const r = await timedFetch(c.url, 7000, cred);
          if (!r.ok) continue;
          const blob = await r.blob();
          if (!blob.size || blob.size > 8 * 1024 * 1024 || /text\/html/i.test(blob.type)) continue;
          const img = await loadImg(await blobToDataUrl(blob));
          const side = Math.max(img.naturalWidth || 0, img.naturalHeight || 0) || (/svg/i.test(blob.type) ? 512 : 0);
          if (!side) continue;
          if (!best || side > best.side) best = { blob, side };
          if (side >= 96) break;                       // sharp enough: stop asking
        } catch (_) { }
      }
      return best;
    }
    // The icon the browser already keeps for a site you have visited. An unknown site
    // gets a generic globe: compared with a made-up address so it is never used as a logo.
    async function browserIcon(u) {
      try {
        const get = async (page) => {
          const r = await fetch(chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(page) + '&size=64');
          return r.ok ? await r.blob() : null;
        };
        const [mine, none] = await Promise.all([get(u.origin + '/'), get('https://no-such-site-' + Date.now() + '.invalid/')]);
        if (!mine || !mine.size) return null;
        if (none && (await blobToDataUrl(mine)) === (await blobToDataUrl(none))) return null;
        return { blob: mine, side: 64 };
      } catch (_) { return null; }
    }
    async function fetchSiteLogo(u) {
      // 1) the site itself, anonymously
      let best = await tryIconList(await siteIconCandidates(u));
      if (best && best.side >= 64) return best;
      // 2) its main domain (chat.example.com -> example.com), where the brand icon usually lives
      const parts = u.hostname.split('.');
      if (parts.length > 2) {
        try {
          const root = new URL(u.protocol + '//' + parts.slice(-2).join('.') + '/');
          const b2 = await tryIconList(await siteIconCandidates(root));
          if (b2 && (!best || b2.side > best.side)) best = b2;
          if (best && best.side >= 64) return best;
        } catch (_) { }
      }
      // 3) sites that turn away anonymous requests: ask again the way your browser does
      const b3 = await tryIconList(await siteIconCandidates(u, 'include'), 'include');
      if (b3 && (!best || b3.side > best.side)) best = b3;
      if (best) return best;
      // 4) the icon your browser already has for it
      return browserIcon(u);
    }
    function reflectSiteBtn() { const b = $('qgLogoSite'); if (b) b.disabled = !qrSiteUrl(); }
    $('qgLogoSite').addEventListener('click', async () => {
      const u = qrSiteUrl();
      if (!u) { logoMsg('bad', 'Put a web link in the Content tab first.'); return; }
      const btn = $('qgLogoSite'); btn.disabled = true;
      logoMsg('', 'Looking for the logo of ' + u.hostname + '…');
      try {
        const found = await fetchSiteLogo(u);
        if (!found) { logoMsg('bad', 'No logo found on ' + u.hostname + '. You can choose an image instead.'); return; }
        const p = await prepareLogo(found.blob);
        const stored = await lightCopy(p.dataUrl, p.img);
        Object.assign(state.logo, { img: p.img, dataUrl: stored, w: p.w || 100, h: p.h || 100, plate: true, tint: false });
        $('qgLogoThumb').src = stored;
        reflectLogo(); render();
        logoMsg('ok', found.side < 64 ? 'Logo of ' + u.hostname + ' added. It is small (' + found.side + ' px), so it may look blurry when printed large.' : 'Logo of ' + u.hostname + ' added.');
      } catch (_) {
        logoMsg('bad', 'Could not load the logo of ' + u.hostname + '. You can choose an image instead.');
      } finally { reflectSiteBtn(); }
    });
    document.getElementById('panel-qrgen').addEventListener('input', reflectSiteBtn);
    document.getElementById('panel-qrgen').addEventListener('click', () => setTimeout(reflectSiteBtn, 0));
    setTimeout(reflectSiteBtn, 300);

    $('qgLogoRemove').addEventListener('click', () => { state.logo.img = null; state.logo.dataUrl = null; logoMsg('', ''); reflectLogo(); render(); });
    $('qgLogoScale').addEventListener('input', () => { state.logo.scale = Number($('qgLogoScale').value) / 100; reflectLogo(); render(); persist(); });
    $('qgLogoShape').addEventListener('change', () => { state.logo.shape = $('qgLogoShape').value; render(); persist(); });
    $('qgLogoTint').addEventListener('change', () => { state.logo.tint = $('qgLogoTint').checked; render(); persist(); });
    $('qgLogoPlate').addEventListener('change', () => { state.logo.plate = $('qgLogoPlate').checked; render(); persist(); });

    // The logo redrawn in the colour (or gradient) of the code. A logo with a
    // transparent background keeps its outline; one with a plain background
    // keeps what stands out from that background.
    const tintCache = new Map();
    function tintedLogo(img, o) {
      if (!img) return null;
      const key = (img.src || '').length + '|' + (img.src || '').slice(-40) + '|' + o.fg1 + '|' + (o.gradient ? o.fg2 + o.direction : '');
      if (tintCache.has(key)) return tintCache.get(key);
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const k = Math.min(1, 512 / Math.max(iw, ih));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(iw * k)); cv.height = Math.max(1, Math.round(ih * k));
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      let d;
      try { d = ctx.getImageData(0, 0, cv.width, cv.height); } catch (e) { return img; }
      const px = d.data;
      let clear = 0;
      for (let n = 3; n < px.length; n += 4) if (px[n] < 200) clear++;
      if (clear < px.length / 4 * 0.02) {
        // no transparency: what differs from the corner colour becomes the drawing
        const br = px[0], bg = px[1], bb = px[2];
        for (let n = 0; n < px.length; n += 4) {
          const dist = Math.abs(px[n] - br) + Math.abs(px[n + 1] - bg) + Math.abs(px[n + 2] - bb);
          px[n + 3] = Math.max(0, Math.min(255, (dist - 40) * 2.2));
        }
        ctx.putImageData(d, 0, 0);
      }
      // White parts of the logo (the play triangle of a video logo, a white letter…) stay
      // white; every other color takes the QR code color. A logo that is white all over
      // is the drawing itself, so it is recolored whole.
      const white = new Uint8Array(px.length / 4);
      let solid = 0, whites = 0;
      for (let n = 0, q = 0; n < px.length; n += 4, q++) {
        if (px[n + 3] < 24) continue;
        solid++;
        const mn = Math.min(px[n], px[n + 1], px[n + 2]), mx = Math.max(px[n], px[n + 1], px[n + 2]);
        const w = Math.max(0, Math.min(1, (mn - 185) / 45)) * Math.max(0, Math.min(1, 1 - (mx - mn) / 60));
        white[q] = Math.round(w * 255);
        if (w > 0.5) whites++;
      }
      const keepWhite = whites > 0 && whites < solid * 0.85;
      ctx.globalCompositeOperation = 'source-in';
      let fill = o.fg1;
      if (o.gradient) {
        const g = o.direction === 'horizontal' ? ctx.createLinearGradient(0, 0, cv.width, 0)
          : o.direction === 'vertical' ? ctx.createLinearGradient(0, 0, 0, cv.height) : ctx.createLinearGradient(0, 0, cv.width, cv.height);
        g.addColorStop(0, o.fg1); g.addColorStop(1, o.fg2);
        fill = g;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, cv.width, cv.height);
      if (keepWhite) {
        const t = ctx.getImageData(0, 0, cv.width, cv.height), tp = t.data;
        for (let n = 0, q = 0; n < tp.length; n += 4, q++) {
          const w = white[q] / 255;
          if (!w) continue;
          tp[n] += (255 - tp[n]) * w; tp[n + 1] += (255 - tp[n + 1]) * w; tp[n + 2] += (255 - tp[n + 2]) * w;
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.putImageData(t, 0, 0);
      }
      if (tintCache.size > 12) tintCache.clear();
      tintCache.set(key, cv);
      return cv;
    }
    // what is actually painted in the middle of the code
    const logoToDraw = () => (state.logo.img && state.logo.tint) ? tintedLogo(state.logo.img, state.opts) : state.logo.img;
    const entryLogo = (img, e) => (img && e.logo && e.logo.tint) ? tintedLogo(img, Object.assign({}, Q.DEFAULTS, e.opts)) : img;

    // ---- rendering
    let matrix = null, scanTimer = null;
    const status = $('qgStatus');
    function setStatus(cls, text) { status.className = 'qg-status ' + cls; status.textContent = text; }

    function currentOpts() {
      return Object.assign({}, state.opts, { logo: state.logo.img ? { scale: state.logo.scale, shape: state.logo.shape, plate: !!state.logo.plate } : null });
    }
    function currentEc() {
      if (state.ec !== 'auto') return state.ec;
      return state.logo.img ? 'H' : 'M';
    }

    function render() {
      clearTimeout(scanTimer);
      $('qgTestResult').hidden = true; $('qgTestLabel').textContent = 'Test this QR code';
      const payload = Q.TYPES[state.type].build(state.values);
      if (!payload) {
        matrix = null; canvas.hidden = true; $('qgEmpty').hidden = false; setStatus('', '');
        state.currentId = null;
        return;
      }
      try { matrix = Q.makeMatrix(payload, currentEc()); }
      catch (e) {
        matrix = null; canvas.hidden = true; $('qgEmpty').hidden = false;
        setStatus('bad', 'Too much content for a QR code' + (state.logo.img ? ' with this error correction. Shorten it or lower the correction level.' : '. Please shorten it.'));
        return;
      }
      $('qgEmpty').hidden = true; canvas.hidden = false;
      Q.draw(canvas, matrix, currentOpts(), 720, logoToDraw());
      $('qgPreview').classList.toggle('checker', !!state.opts.transparent);
      setStatus('', 'Checking…');
      scanTimer = setTimeout(() => scanCheck(payload), 200);
      scheduleSave();
    }

    // Decode like the scanner tab: full size first, then smaller copies, which
    // average out the texture of dotted styles. source: canvas or ImageBitmap.
    function decodeMulti(source) {
      if (typeof jsQR !== 'function') return null;
      const W = source.width, H = source.height, long = Math.max(W, H);
      for (const target of [long, 220, 160, 110].filter((t, i) => i === 0 || t < long)) {
        const k = target / long;
        const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
        const t = document.createElement('canvas');
        t.width = w; t.height = h;
        const c = t.getContext('2d', { willReadFrequently: true });
        c.imageSmoothingQuality = 'high';
        c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.drawImage(source, 0, 0, w, h);
        const d = c.getImageData(0, 0, w, h);
        const r = jsQR(d.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) return r.data;
      }
      return null;
    }

    function scanCheck(payload) {
      if (typeof jsQR === 'undefined') { setStatus('', ''); return; }
      try {
        if (decodeMulti(canvas) === payload) setStatus('ok', '✓ Reads correctly');
        else setStatus('warn', '⚠ Hard to read here. Press "Test this QR code" for details.');
      } catch (e) { setStatus('', ''); }
    }

    // ---- explicit test: saves the code as a PNG, reads it back at several sizes, checks contrast
    function lum(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return 1;
      const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

    async function runTest() {
      const btn = $('qgTest'), label = $('qgTestLabel'), box = $('qgTestResult');
      const payload = Q.TYPES[state.type].build(state.values);
      if (!matrix || !payload) { showToast('Create a QR code first.'); return; }
      if (typeof jsQR !== 'function') { showToast('Scanner library missing.'); return; }
      btn.disabled = true; label.textContent = 'Testing…';
      const rows = [];
      const add = (cls, text) => rows.push({ cls, text });
      try {
        const o = currentOpts();
        // 1) Exact file the person would download, read back from the PNG.
        const big = document.createElement('canvas');
        Q.draw(big, matrix, o, state.size, logoToDraw());
        const blob = await new Promise((res) => big.toBlob(res, 'image/png'));
        const bmp = await createImageBitmap(blob);
        const got = decodeMulti(bmp);
        if (got === payload) add('ok', 'The downloaded PNG is read correctly, with the right content.');
        else if (got) add('bad', 'It is read, but the content is wrong. Please report this.');
        else add('bad', 'The downloaded PNG cannot be read.');

        // 2) Small prints / low-resolution screens.
        for (const [px, name] of [[200, 'about 2 cm printed or a small screen'], [110, 'a very small print']]) {
          const c = document.createElement('canvas');
          Q.draw(c, matrix, o, px, logoToDraw());
          // Re-draw at the exact pixel size so the test reflects real low resolution.
          const flat = document.createElement('canvas');
          flat.width = flat.height = px;
          const fc = flat.getContext('2d');
          fc.fillStyle = '#fff'; fc.fillRect(0, 0, px, px); fc.drawImage(c, 0, 0, px, px);
          const g = decodeMulti(flat);
          add(g === payload ? 'ok' : (px === 110 ? 'warn' : 'bad'),
            g === payload ? 'Still readable at ' + px + ' px (' + name + ').' : 'Not readable at ' + px + ' px (' + name + ').' + (px === 110 ? ' Fine unless you print it that small.' : ''));
        }

        // 3) Contrast between the code and its background.
        const bg = o.transparent ? '#ffffff' : o.bg;
        const colors = o.gradient ? [o.fg1, o.fg2] : [o.fg1];
        const worst = Math.min(...colors.map((c) => contrast(c, bg)));
        const darkCode = Math.max(...colors.map(lum)) < lum(bg);
        if (worst < 2) add('bad', 'Contrast is too low (' + worst.toFixed(1) + ':1). Use a darker code or a lighter background.');
        else if (worst < 3) add('warn', 'Contrast is a bit low (' + worst.toFixed(1) + ':1). A stronger contrast scans more reliably.');
        else add('ok', 'Good contrast (' + worst.toFixed(1) + ':1).');
        if (!darkCode) add('warn', 'The code is lighter than its background. Some phone cameras cannot read inverted codes.');
        if (o.transparent) add('warn', 'Transparent background: it is tested on white. On a dark surface the code may not scan.');

        // 4) Logo coverage and error correction.
        if (state.logo.img) {
          const wide = Math.round(state.logo.scale * 100);
          if (state.logo.scale > 0.26) add('warn', 'The logo is ' + wide + '% of the code width. 22% or less is safest.');
          else add('ok', 'Logo size (' + wide + '% of the width) is within the safe range.');
          if (state.ec === 'L' || state.ec === 'M') add('warn', 'Error correction is set to ' + (state.ec === 'L' ? 'Low' : 'Medium') + ' with a logo. Use Auto or High.');
        }
        // 5) Quiet zone.
        if (o.margin < 2) add('warn', 'The margin is very small. Keep at least 2 for reliable scanning.');
      } catch (e) {
        add('bad', 'The test could not run: ' + (e && e.message ? e.message : 'unknown error'));
      }

      const bad = rows.filter((r) => r.cls === 'bad').length, warn = rows.filter((r) => r.cls === 'warn').length;
      const sumCls = bad ? 'bad' : warn ? 'warn' : 'ok';
      const sumTxt = bad ? '✗ This QR code may not work.' : warn ? '⚠ It works, with points to watch.' : '✓ This QR code works well.';
      box.textContent = '';
      const sum = document.createElement('div'); sum.className = 'qg-test-sum ' + sumCls; sum.textContent = sumTxt;
      const ul = document.createElement('ul'); ul.className = 'qg-test-list';
      rows.forEach((r) => { const li = document.createElement('li'); li.className = r.cls; li.textContent = r.text; ul.appendChild(li); });
      const tip = document.createElement('p'); tip.className = 'qg-test-tip';
      tip.textContent = 'This test uses a software reader. For anything you will print, also scan it once with your phone.';
      box.append(sum, ul, tip);
      box.hidden = false;
      btn.disabled = false; label.textContent = 'Test again';
    }
    $('qgTest').addEventListener('click', runTest);

    // ---- export
    function stamp() { return new Date().toISOString().slice(0, 10); }
    function download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    function exportCanvas() {
      const c = document.createElement('canvas');
      Q.draw(c, matrix, currentOpts(), state.size, logoToDraw());
      return c;
    }
    $('qgPng').addEventListener('click', () => {
      if (!matrix) { showToast('Nothing to export yet.'); return; }
      saveNow();
      const name = 'qr-code-' + stamp();
      if (state.format === 'svg') {
        const lg = logoToDraw();
        const logoUrl = !lg ? null : lg === state.logo.img ? state.logo.dataUrl : lg.toDataURL('image/png');
        const svg = Q.toSVG(matrix, currentOpts(), logoUrl, { w: state.logo.w, h: state.logo.h }, state.size);
        download(new Blob([svg], { type: 'image/svg+xml' }), name + '.svg');
        showToast('SVG saved');
        return;
      }
      let cv = exportCanvas();
      if (state.format === 'jpg') {
        // JPG has no transparency: the code is laid on white
        const flat = document.createElement('canvas');
        flat.width = cv.width; flat.height = cv.height;
        const fx = flat.getContext('2d');
        fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, flat.width, flat.height);
        fx.drawImage(cv, 0, 0);
        cv = flat;
      }
      const jpg = state.format === 'jpg';
      cv.toBlob((bl) => { if (bl) { download(bl, name + (jpg ? '.jpg' : '.png')); showToast((jpg ? 'JPG' : 'PNG') + ' saved'); } }, jpg ? 'image/jpeg' : 'image/png', 0.92);
    });
    $('qgCopy').addEventListener('click', () => {
      if (!matrix) { showToast('Nothing to copy yet.'); return; }
      saveNow();
      exportCanvas().toBlob(async (b) => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); showToast('Image copied'); }
        catch (e) { showToast('Could not copy the image.'); }
      }, 'image/png');
    });


    // ---- saved QR codes (automatic history)
    const HKEY = 'qrgenHistory';
    const HIST_MAX = 100;
    const imgCache = new Map();
    let saveTimer = null;
    let draftId = null; // entry created by what is being typed now (not one opened from the list)

    function loadImage(src) {
      return new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = src;
      });
    }
    function titleFor(e) {
      const fields = Q.TYPES[e.type] ? Q.TYPES[e.type].fields : [];
      const parts = [];
      for (const f of fields) {
        if (f.kind === 'check' || f.kind === 'select' || f.k === 'pass') continue; // never show a password in the list
        const v = e.values && e.values[f.k];
        if (v && String(v).trim()) parts.push(String(v).trim());
        if (parts.length >= 2) break;
      }
      const t = (parts.join(' ') || e.payload || '').replace(/\s+/g, ' ');
      return t.length > 42 ? t.slice(0, 41) + '…' : t;
    }
    function whenFor(ts) {
      try { return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
      catch (e) { return ''; }
    }
    function sameDesign(a, b) {
      const norm = (o) => JSON.stringify(Object.assign({}, Q.DEFAULTS, o));
      return a.payload === b.payload && a.ec === b.ec && norm(a.opts) === norm(b.opts) &&
        ((a.logo && a.logo.dataUrl) || null) === ((b.logo && b.logo.dataUrl) || null) &&
        (!a.logo || (a.logo.scale === b.logo.scale && a.logo.shape === b.logo.shape && !!a.logo.tint === !!b.logo.tint && !!a.logo.plate === !!b.logo.plate));
    }
    function writeHistory() {
      chrome.storage.local.set({ [HKEY]: state.history }).catch(() => { });
    }

    function saveNow() {
      clearTimeout(saveTimer);
      if (!state.autosave || !matrix) return;
      const payload = Q.TYPES[state.type].build(state.values);
      if (!payload) return;
      const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const cur = state.currentId ? state.history.find((h) => h.id === state.currentId) : null;
      const entry = {
        id: cur ? cur.id : newId(),
        t: Date.now(), type: state.type, payload,
        values: Object.assign({}, state.values), ec: state.ec, opts: Object.assign({}, state.opts),
        logo: state.logo.img ? { dataUrl: state.logo.dataUrl, scale: state.logo.scale, shape: state.logo.shape, tint: !!state.logo.tint, plate: !!state.logo.plate, w: state.logo.w, h: state.logo.h } : null
      };
      // a saved code that was only opened keeps its date and its place
      if (cur && sameDesign(cur, entry)) return;
      // Other content is another code: keep the previous one. Only the code being typed
      // right now (same text, a few characters more or less) is updated in place.
      if (cur && cur.payload !== payload) {
        const typing = draftId === cur.id && (payload.startsWith(cur.payload) || cur.payload.startsWith(payload));
        if (!typing) entry.id = newId();
      }
      if (!cur || entry.id !== cur.id) draftId = entry.id;
      const dup = state.history.find((h) => h.id !== entry.id && sameDesign(h, entry));
      if (dup) {
        // Same code already saved: just bring it back to the top.
        state.history = state.history.filter((h) => h.id !== entry.id && h.id !== dup.id);
        dup.t = entry.t;
        state.history.unshift(dup);
        state.currentId = dup.id;
      } else {
        state.history = state.history.filter((h) => h.id !== entry.id);
        state.history.unshift(entry);
        state.currentId = entry.id;
        imgCache.delete(entry.id);
      }
      if (state.history.length > HIST_MAX) state.history.length = HIST_MAX;
      writeHistory();
      renderHistory();
    }
    function scheduleSave() {
      clearTimeout(saveTimer);
      if (state.autosave) saveTimer = setTimeout(saveNow, 700);
    }
    // The popup closes as soon as it loses focus: flush a pending save first.
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

    async function drawThumb(cv, e) {
      try {
        let logoImg = null;
        if (e.logo && e.logo.dataUrl) {
          if (!imgCache.has(e.id)) imgCache.set(e.id, await loadImage(e.logo.dataUrl));
          logoImg = imgCache.get(e.id);
        }
        const ec = e.ec === 'auto' ? (logoImg ? 'H' : 'M') : e.ec;
        const o = Object.assign({}, e.opts, { logo: logoImg ? { scale: e.logo.scale, shape: e.logo.shape, plate: !!e.logo.plate } : null });
        Q.draw(cv, Q.makeMatrix(e.payload, ec), o, 112, entryLogo(logoImg, e));
      } catch (err) { /* thumbnail is optional */ }
    }

    async function openEntry(e) {
      state.type = Q.TYPES[e.type] ? e.type : 'url';
      state.values = Object.assign({}, e.values);
      state.ec = e.ec; state.opts = Object.assign({}, Q.DEFAULTS, e.opts);
      state.currentId = e.id; draftId = null;
      if (e.logo && e.logo.dataUrl) {
        const im = await loadImage(e.logo.dataUrl);
        if (im) {
          Object.assign(state.logo, { img: im, dataUrl: e.logo.dataUrl, w: e.logo.w, h: e.logo.h, scale: e.logo.scale, shape: e.logo.shape, tint: !!e.logo.tint, plate: !!e.logo.plate });
          $('qgLogoThumb').src = e.logo.dataUrl;
        }
      } else { state.logo.img = null; state.logo.dataUrl = null; }
      buildFields(); reflectStyle(); reflectLogo(); render(); renderHistory();
      persist();
      showPane('content');
      const top = $('qgPreview');
      if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function renderHistory() {
      const list = $('qgHistList');
      list.textContent = '';
      const n = state.history.length;
      $('qgHistCount').textContent = n ? '(' + n + ')' : '';
      $('qgHistEmpty').hidden = n > 0;
      $('qgHistClear').hidden = n === 0;
      $('qgHistMore').hidden = n <= state.shown;
      state.history.slice(0, state.shown).forEach((e) => {
        const row = document.createElement('div');
        row.className = 'qg-hist-row' + (e.id === state.currentId ? ' current' : '');
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.title = 'Open in the editor';
        const cv = document.createElement('canvas');
        cv.className = 'qg-hist-thumb';
        drawThumb(cv, e);
        const info = document.createElement('div');
        info.className = 'qg-hist-info';
        const t = document.createElement('div'); t.className = 'qg-hist-title'; t.textContent = titleFor(e);
        const m = document.createElement('div'); m.className = 'qg-hist-meta';
        m.textContent = (Q.TYPES[e.type] ? Q.TYPES[e.type].label : '') + ' · ' + whenFor(e.t);
        info.append(t, m);
        const png = document.createElement('button');
        png.className = 'qg-hist-btn'; png.textContent = '⬇'; png.title = 'Download PNG'; png.setAttribute('aria-label', 'Download PNG');
        png.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const c = document.createElement('canvas');
          let logoImg = null;
          if (e.logo && e.logo.dataUrl) { if (!imgCache.has(e.id)) imgCache.set(e.id, await loadImage(e.logo.dataUrl)); logoImg = imgCache.get(e.id); }
          const ec = e.ec === 'auto' ? (logoImg ? 'H' : 'M') : e.ec;
          const o = Object.assign({}, e.opts, { logo: logoImg ? { scale: e.logo.scale, shape: e.logo.shape, plate: !!e.logo.plate } : null });
          Q.draw(c, Q.makeMatrix(e.payload, ec), o, state.size, entryLogo(logoImg, e));
          c.toBlob((b) => { if (b) { download(b, 'qr-code-' + new Date(e.t).toISOString().slice(0, 10) + '.png'); showToast('PNG saved'); } }, 'image/png');
        });
        const del = document.createElement('button');
        del.className = 'qg-hist-btn del'; del.textContent = '✕'; del.title = 'Delete'; del.setAttribute('aria-label', 'Delete');
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          state.history = state.history.filter((h) => h.id !== e.id);
          imgCache.delete(e.id);
          if (state.currentId === e.id) state.currentId = null;
          writeHistory(); renderHistory();
        });
        row.append(cv, info, png, del);
        row.addEventListener('click', () => openEntry(e));
        row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(e); } });
        list.appendChild(row);
      });
    }

    $('qgAutoSave').addEventListener('change', () => {
      state.autosave = $('qgAutoSave').checked;
      persist();
      if (state.autosave) scheduleSave();
      showToast(state.autosave ? 'Auto-save on' : 'Auto-save off');
    });
    $('qgHistMore').addEventListener('click', () => { state.shown += 20; renderHistory(); });
    let clearArmed = null;
    $('qgHistClear').addEventListener('click', () => {
      const btn = $('qgHistClear');
      if (!clearArmed) {
        btn.textContent = 'Click again to confirm';
        clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = 'Clear all'; }, 3000);
        return;
      }
      clearTimeout(clearArmed); clearArmed = null; btn.textContent = 'Clear all';
      state.history = []; state.currentId = null; imgCache.clear();
      writeHistory(); renderHistory();
    });

    // ---- persistence of the editor style (the content itself goes to the saved list below)
    function persist() {
      chrome.storage.local.set({ [SKEY]: { type: state.type, ec: state.ec, size: state.size, opts: state.opts, logoScale: state.logo.scale, logoShape: state.logo.shape, logoPlate: !!state.logo.plate, logoTint: !!state.logo.tint, format: state.format, autosave: state.autosave } });
    }

    chrome.storage.local.get([SKEY, HKEY], (data) => {
      const s = data && data[SKEY];
      if (Array.isArray(data && data[HKEY])) state.history = data[HKEY];
      if (s) {
        if (typeof s.autosave === 'boolean') state.autosave = s.autosave;
        if (Q.TYPES[s.type]) state.type = s.type;
        if (['auto', 'L', 'M', 'Q', 'H'].includes(s.ec)) state.ec = s.ec;
        if ([512, 1024, 2048].includes(s.size)) state.size = s.size;
        if (s.opts && typeof s.opts === 'object') state.opts = Object.assign({}, Q.DEFAULTS, s.opts);
        if (typeof s.logoScale === 'number') state.logo.scale = Math.min(0.3, Math.max(0.1, s.logoScale));
        if (s.logoShape === 'square' || s.logoShape === 'circle') state.logo.shape = s.logoShape;
        state.logo.tint = s.logoTint === true;
        state.logo.plate = s.logoPlate === true;
        if (['png', 'jpg', 'svg'].includes(s.format)) state.format = s.format;
      }
      $('qgAutoSave').checked = state.autosave;
      buildFields(); reflectStyle(); reflectLogo(); render(); renderHistory();
    });
  })();

});
