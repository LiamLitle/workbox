document.addEventListener('DOMContentLoaded', () => {

  // App lock : hash local du mot de passe, vérifié au démarrage du popup
  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function askSecureConfirm(title, desc, callback) {
    chrome.storage.local.get('appLockHash', (data) => {
      const hasPassword = !!data.appLockHash;
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
      const cleanup = () => {
        overlay.classList.remove('active');
        btnCancel.onclick = null;
        btnOk.onclick = null;
        input.onkeydown = null;
      };

      const submit = () => {
        if (hasPassword && !input.value.trim()) {
          error.textContent = 'Please enter a password';
          error.style.opacity = '1';
          input.focus();
          return;
        }
        cleanup();
        callback(true, hasPassword ? input.value.trim() : null);
      };

      btnCancel.onclick = () => { cleanup(); callback(false); };
      btnOk.onclick = submit;
      input.onkeydown = (e) => {
        error.style.opacity = '0';
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') btnCancel.click();
      };
    });
  }

  function initAppLock() {
    const overlay = document.getElementById('appLockOverlay');
    const unlockBtn = document.getElementById('appLockUnlockBtn');
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

    const BANNER_ACTIVE = '<div style="margin-bottom:10px;padding-left:8px;border-left:2px solid rgba(34,197,94,0.5);font-size:10px;color:#22c55e;">✅ Lock <strong>enabled</strong></div>';
    const BANNER_NONE   = '<div style="margin-bottom:10px;padding-left:8px;border-left:2px solid rgba(255,193,7,0.5);font-size:10px;color:#ffc107;">⚠️ No password configured. Data <strong>not protected</strong>.</div>';

    function showLock() { overlay.classList.add('active'); setTimeout(() => lockInput && lockInput.focus(), 120); }
    function hideLock() { overlay.classList.remove('active'); }

    chrome.storage.local.get(['appLockHash'], (data) => {
      document.body.classList.remove('app-loading');
      if (data.appLockHash) {
        showLock();
        lockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlockBtn.click(); });
        unlockBtn.addEventListener('click', async () => {
          const hash = await hashPassword(lockInput.value);
          if (hash === data.appLockHash) {
            hideLock();
            lockInput.value = '';
            lockError.style.opacity = '0';
          } else {
            lockError.style.opacity = '1';
            lockInput.value = '';
            lockInput.focus();
            setTimeout(() => { lockError.style.opacity = '0'; }, 2500);
          }
        });

        // Toggle panneau "Mot de passe oublié"
        if (forgotBtn && forgotPanel) {
          let forgotOpen = false;
          forgotBtn.addEventListener('click', () => {
            forgotOpen = !forgotOpen;
            forgotPanel.style.display = forgotOpen ? 'block' : 'none';
          });
        }

        // Récupération via le Code de Récupération
        if (recoveryBtn) {
          recoveryBtn.addEventListener('click', () => {
            const inputCode = recoveryInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

            chrome.storage.local.get('appRecoveryCode', (rc) => {
              const storedCode = (rc.appRecoveryCode || '').replace(/[^A-Z0-9]/g, '');
              if (!storedCode) {
                recoveryError.textContent = 'No recovery code configured.';
                return;
              }
              if (inputCode !== storedCode) {
                recoveryError.textContent = 'Incorrect code. Check and try again.';
                return;
              }
              // Code correct → supprimer le mot de passe et déverrouiller
              chrome.storage.local.remove(['appLockHash', 'appRecoveryCode'], () => {
                hideLock();
                if (removeBtn) removeBtn.style.display = 'none';
                if (statusBanner) { statusBanner.innerHTML = BANNER_NONE; statusBanner.style.display = 'block'; }
                setTimeout(() => showToast('🔓 Password reset.'), 300);
              });
            });
          });
        }

        // Bannière statut & bouton désactiver
        if (statusBanner) { statusBanner.innerHTML = BANNER_ACTIVE; statusBanner.style.display = 'block'; }
        if (removeBtn) removeBtn.style.display = 'block';

      } else {
        overlay.classList.remove('active');
        if (statusBanner) { statusBanner.innerHTML = BANNER_NONE; statusBanner.style.display = 'block'; }
      }
    });

    // Sauvegarder un nouveau mot de passe depuis les paramètres
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const pwd = settingsInput ? settingsInput.value.trim() : '';
        if (!pwd) { showToast('Enter a password.'); return; }
        if (pwd.length < 4) { showToast('Minimum 4 characters.'); return; }
        const hash = await hashPassword(pwd);

        // Générer un code de récupération unique
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const seg = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => chars[b % chars.length]).join('');
        const recoveryCode = `${seg(4)}-${seg(4)}-${seg(4)}`;

        chrome.storage.local.set({ appLockHash: hash, appRecoveryCode: recoveryCode }, () => {
          settingsInput.value = '';
          if (removeBtn) removeBtn.style.display = 'block';
          if (statusBanner) { statusBanner.innerHTML = BANNER_ACTIVE; }

          // Afficher le modal custom
          const rcOverlay = document.getElementById('recoveryCodeOverlay');
          const rcDisplay = document.getElementById('recoveryCodeDisplay');
          const rcCopyBtn = document.getElementById('recoveryCodeCopyBtn');
          const rcCloseBtn = document.getElementById('recoveryCodeCloseBtn');

          if (rcOverlay && rcDisplay) {
            rcDisplay.textContent = recoveryCode;
            rcOverlay.classList.add('active');

            rcCopyBtn.onclick = () => {
              navigator.clipboard.writeText(recoveryCode).then(() => {
                rcCopyBtn.textContent = '✅ Copied!';
                setTimeout(() => { rcCopyBtn.textContent = '📋 Copy code'; }, 2000);
              });
            };

            rcCloseBtn.onclick = () => {
              rcOverlay.classList.remove('active');
              showToast('🔒 Password enabled!');
            };
          }
        });
      });
    }

    // Supprimer le mot de passe (nécessite de saisir le mot de passe actuel)
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        askSecureConfirm('Disable password', 'Are you sure you want to disable protection for your data?', async (confirmed, pwd) => {
          if (!confirmed) return;
          
          chrome.storage.local.get('appLockHash', async (data) => {
            if (data.appLockHash && pwd) {
              const enteredHash = await hashPassword(pwd);
              if (enteredHash !== data.appLockHash) {
                showToast('❌ Incorrect password.');
                return;
              }
            }
            
            // Mot de passe correct → désactiver
            chrome.storage.local.remove(['appLockHash', 'appRecoveryCode'], () => {
              removeBtn.style.display = 'none';
              if (statusBanner) { statusBanner.innerHTML = BANNER_NONE; }
              showToast('🔓 Password disabled.');
            });
          });
        });
      });
    }
  }

  initAppLock();

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

  // ---- AI-FREE SEARCH TOOL PANEL ----
  // Only one search engine can be active at a time (it's the one the person
  // actually uses by default) — the switches behave like a radio group.
  const AI_ENGINE_KEYS = ['blockAiGoogle', 'blockAiBing', 'blockAiBrave', 'blockAiDuckDuckGo', 'blockAiQwant'];
  const AI_ENGINE_DEFAULT_KEY = 'blockAiGoogle';
  const AI_ENGINE_LABELS = {
    blockAiGoogle: 'Google',
    blockAiBing: 'Bing',
    blockAiBrave: 'Brave Search',
    blockAiDuckDuckGo: 'DuckDuckGo',
    blockAiQwant: 'Qwant'
  };
  const aiEngineIdOf = (key) => 'setting' + key[0].toUpperCase() + key.slice(1);

  chrome.storage.local.get(AI_ENGINE_KEYS, (res) => {
    // First run: nothing in storage yet, pick the default engine and persist it
    // explicitly so every key has a real value (no more "absent = on" for all 5).
    const noneSet = AI_ENGINE_KEYS.every((key) => res[key] === undefined);
    const activeKey = noneSet
      ? AI_ENGINE_DEFAULT_KEY
      : AI_ENGINE_KEYS.find((key) => res[key] === true) || null;

    AI_ENGINE_KEYS.forEach((key) => {
      const el = document.getElementById(aiEngineIdOf(key));
      if (el) el.checked = key === activeKey;
    });

    if (noneSet) {
      const initial = {};
      AI_ENGINE_KEYS.forEach((key) => { initial[key] = key === activeKey; });
      chrome.storage.local.set(initial);
    }
  });

  AI_ENGINE_KEYS.forEach((key) => {
    document.getElementById(aiEngineIdOf(key))?.addEventListener('change', (e) => {
      const turningOn = e.target.checked;
      const update = {};
      AI_ENGINE_KEYS.forEach((k) => { update[k] = turningOn && k === key; });
      chrome.storage.local.set(update);

      // Reflect the exclusivity in the UI immediately (uncheck the others).
      AI_ENGINE_KEYS.forEach((k) => {
        if (k === key) return;
        const el = document.getElementById(aiEngineIdOf(k));
        if (el) el.checked = false;
      });

      // Visual + toast confirmation, so it's obvious the toggle really took effect.
      const row = document.getElementById(aiEngineIdOf(key))?.closest('.ai-engine-row');
      if (row) {
        row.classList.remove('ai-engine-confirm');
        void row.offsetWidth; // restart the animation if clicked twice in a row
        row.classList.add('ai-engine-confirm');
      }
      showToast(turningOn
        ? `Protection active on ${AI_ENGINE_LABELS[key]}`
        : `Protection off on ${AI_ENGINE_LABELS[key]}`);
    });
  });

  // ---- Auto-detect the browser (pre-selects the right tag below) ----
  async function detectBrowserId() {
    try {
      if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
        if (await navigator.brave.isBrave()) return 'brave';
      }
    } catch (_) { /* ignore, fall through to UA sniffing */ }
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'edge';
    return 'chrome';
  }
  const BROWSER_LABELS = { chrome: 'Chrome', brave: 'Brave', edge: 'Edge' };
  detectBrowserId().then((id) => {
    document.querySelector(`.browser-tag[data-browser="${id}"]`)?.click();

    // Brave (and possibly others) don't expose chrome.search.query — grey the
    // detect button out up front instead of letting people click into a dead end.
    const detectBtn = document.getElementById('detectEngineBtn');
    if (detectBtn && !chrome.search?.query) {
      detectBtn.disabled = true;
      detectBtn.textContent = `Not available on ${BROWSER_LABELS[id] || 'this browser'} — pick your engine below`;
    }
  });

  // ---- Auto-detect the default search engine ----
  // chrome.search.query({..., disposition:'NEW_TAB'}) opens a new foreground
  // tab, which steals window focus from the popup — and an extension action
  // popup closes the instant it loses focus. Running the whole
  // open-tab/watch-URL/write-to-storage flow from here meant it got killed
  // mid-flight the moment the tab opened, before the result could ever be
  // applied (this was a real, previously-undiscovered bug: the button
  // looked like it did nothing). The actual detection now runs in
  // background.js instead, which survives the popup closing; the popup just
  // kicks it off and the result comes back as a system notification. Next
  // time the popup is opened, the correct toggle is already checked, since
  // it reads chrome.storage.local fresh on every load.
  document.getElementById('detectEngineBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('detectEngineBtn');
    if (!chrome.search?.query) {
      showToast('Automatic detection not available on this browser');
      return;
    }
    showToast('Detecting… check the notification in a moment');
    chrome.runtime.sendMessage({ type: 'DETECT_SEARCH_ENGINE' }).catch(() => { });
  });

  const BROWSER_SEARCH_SETTINGS_URLS = {
    chrome: 'chrome://settings/searchEngines',
    brave: 'brave://settings/searchEngines',
    edge: 'edge://settings/searchEngines'
  };
  const browserSettingsUrlInput = document.getElementById('browserSettingsUrl');
  document.querySelectorAll('.browser-tag').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.browser-tag').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (browserSettingsUrlInput) browserSettingsUrlInput.value = BROWSER_SEARCH_SETTINGS_URLS[btn.dataset.browser] || '';
    });
  });
  document.getElementById('copyBrowserSettingsBtn')?.addEventListener('click', () => {
    if (browserSettingsUrlInput?.value) copyText(browserSettingsUrlInput.value);
  });

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
    const gridMatch = document.querySelector('.grid-item[data-tab="' + tabName + '"]');
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
    const lockVisible = document.getElementById('appLockOverlay')?.style.display === 'flex';
    if (lockVisible) return;

    if (e.key === '.') {
      e.preventDefault();
      switchToPanel('calculator');
      // Focus le champ de saisie pour pouvoir taper immédiatement
      const calcField = document.getElementById('calcInputField');
      if (calcField) calcField.focus();
    }
  });

  // Bottom nav bar clicks
  bottomNavItems.forEach(btn => {
    btn.addEventListener('click', () => {
      switchToPanel(btn.dataset.tab);
    });
  });

  // Grid item clicks
  gridItems.forEach(btn => {
    btn.addEventListener('click', () => {
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

  // ---- TOAST (Precision Physical Feedback) ----
  const toast = document.getElementById('toast');
  let toastTimeout;
  function showToast(msg = 'COPIED') {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hide');
    toast.classList.add('show');
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.classList.add('inversion-flash');
      setTimeout(() => {
        try { document.activeElement?.classList.remove('inversion-flash'); } catch(e) {}
      }, 100);
    }
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.classList.remove('hide'), 180);
    }, 1200);
  }


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

  const clipList = document.getElementById('clipList');
  const clipCatsEl = document.getElementById('clipCategories');
  const clipSearch = document.getElementById('clipSearch');
  const clipClearBtn = document.getElementById('clipClearBtn');

  let clipItems = [];   // { text, pinned, category, timestamp }
  let clipFilter = 'all';
  let clipSearchQuery = '';
  let clipDateMode = 'all';
  let clipDateCustomVal = 0;

  function loadClipboard() {
    chrome.storage.local.get(['clipItems'], data => {
      if (data.clipItems) {
        // Nettoyage automatique des liens blob/fichiers qui auraient pu passer
        clipItems = data.clipItems.filter(item => {
          const t = item.text || '';
          return !t.startsWith('blob:') && !t.match(/^[a-zA-Z]:\\/) && !t.startsWith('/') && !t.startsWith('file:');
        });
        if (clipItems.length !== data.clipItems.length) {
          saveClipboard(true);
        }
      } else {
        clipItems = [];
      }

      renderClipCategories();
      renderClipList();
      // Load images count too
      chrome.storage.local.get('clipboardImages', d => {
        clipboardImages = d.clipboardImages || [];
        updateClipCounts();
      });
    });
  }

  let ignoreStorageChanges = false;
  let _ignoreStorageTimer = null;
  function saveClipboard(silent = false) {
    if (silent) {
      ignoreStorageChanges = true;
      clearTimeout(_ignoreStorageTimer);
      _ignoreStorageTimer = setTimeout(() => { ignoreStorageChanges = false; }, 300);
    }
    chrome.storage.local.set({ clipItems });
  }

  const clipTabs = document.querySelectorAll('.clip-tab-btn');
  const clipImageListEl = document.getElementById('clipImageList');
  const clipImageContainer = document.getElementById('clipImageContainer');
  let clipboardImages = [];

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
        const realImgIdx = clipboardImages.indexOf(imgObj);
        const itemDiv = document.createElement('div');
        itemDiv.className = 'clip-image-item';
        itemDiv.innerHTML = `
          <div class="clip-image-thumbnail">
            <img src="${imgObj.dataUrl}" alt="Pinned image">
          </div>
          <div class="clip-image-info">
            <div class="clip-image-time">${formatTime(imgObj.timestamp)}</div>
            <div class="clip-image-footer">
              ${imgObj.originalSize ? `<button title="View size before/after compression" data-action="size" style="font-size:13px;">📊</button>` : ''}
              <button title="Download (compressed file, without going through clipboard)" data-action="download" style="font-size:13px;">⬇️</button>
              <button title="Copy" data-action="copy">
                <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/copier.svg'); mask-image: url('icons/svg/presse%20papier/copier.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
              </button>
              <button title="Unpin" data-action="unpin" style="color:#f59e0b;">📌</button>
              <button title="Delete" data-action="del" class="btn-delete">
                <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/delete.svg'); mask-image: url('icons/svg/presse%20papier/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
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
          clipboardImages[realImgIdx].pinned = false;
          chrome.storage.local.set({ clipboardImages });
          renderPinnedView();
        });
        itemDiv.querySelector('[data-action="del"]').addEventListener('click', (e) => {
          e.stopPropagation();
          clipboardImages.splice(realImgIdx, 1);
          chrome.storage.local.set({ clipboardImages });
          renderPinnedView();
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
        const realIdx = clipItems.indexOf(item);
        let cats = item.category || ['📝 Text'];
        if (typeof cats === 'string') cats = [cats];
        let badgesHtml = '';
        cats.forEach(c => {
          const conf = catConfig[c] || { name: c, key: c, svg: null };
          badgesHtml += `<span class="clip-cat-badge" style="margin-right:4px;display:inline-flex;align-items:center;"><span>${escapeHtml(conf.name)}</span></span>`;
        });
        const isPassword = cats.includes('🔑 Password');
        const trimmedText = item.text.trim();
        let safeText = isPassword ? '••••••••' : escapeHtml(censorText(trimmedText));
        const el = document.createElement('div');
        el.className = 'clip-item pinned';
        el.innerHTML = `
          <div class="clip-header-info">
            <div style="display:flex;flex-wrap:wrap;">${badgesHtml}</div>
            <span class="clip-time">${formatTime(item.timestamp)}</span>
          </div>
          <div class="clip-text-content">
            <div class="clip-text-preview clamp" title="Click to copy" ${isPassword ? 'style="font-family:monospace;letter-spacing:2px;color:#a78bfa;"' : ''}>${safeText}</div>
          </div>
          <div class="clip-footer">
            <button title="Copy" data-action="copy">
              <span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask-image:url('icons/svg/presse%20papier/copier.svg');mask-image:url('icons/svg/presse%20papier/copier.svg');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>
            </button>
            ${isPassword ? `<button title="View" data-action="reveal" style="font-size:14px;">👁️</button>` : ''}
            <button title="Unpin" data-action="unpin" class="is-pinned">
              <span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask-image:url('icons/svg/presse%20papier/pin.svg');mask-image:url('icons/svg/presse%20papier/pin.svg');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>
            </button>
            <button title="Delete" data-action="del" class="btn-delete">
              <span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask-image:url('icons/svg/presse%20papier/delete.svg');mask-image:url('icons/svg/presse%20papier/delete.svg');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>
            </button>
          </div>
        `;
        el.querySelector('[data-action="copy"]').addEventListener('click', e => { e.stopPropagation(); copyText(item.text); });
        el.querySelector('.clip-text-preview').addEventListener('click', e => { e.stopPropagation(); copyText(item.text); });
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
          clipItems[realIdx].pinned = false;
          saveClipboard(true);
          renderPinnedView();
        });
        el.querySelector('[data-action="del"]').addEventListener('click', e => {
          e.stopPropagation();
          clipItems.splice(realIdx, 1);
          saveClipboard(true);
          renderPinnedView();
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
          renderClipList();
          clipList.style.opacity = '0';
          requestAnimationFrame(() => { clipList.style.opacity = '1'; });
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

  function renderClipImages() {
    clipImageListEl.innerHTML = '';
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

    const CHUNK_SIZE_IMG = 10;
    function renderChunkImg(startIndex) {
      const chunk = filteredImages.slice(startIndex, startIndex + CHUNK_SIZE_IMG);
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
            ${imgObj.originalSize ? `<button title="View size before/after compression" data-action="size" style="font-size:13px;">\ud83d\udcca</button>` : ''}
            <button title="Download (compressed file, without going through clipboard)" data-action="download" style="font-size:13px;">\u2b07\ufe0f</button>
            <button title="Copy" data-action="copy">
              <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/copier.svg'); mask-image: url('icons/svg/presse%20papier/copier.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
            </button>
            <button title="${imgObj.pinned ? 'Unpin' : 'Pin'}" data-action="pin" style="font-size:14px; ${imgObj.pinned ? 'color:#f59e0b;' : 'opacity:0.5;'}">\ud83d\udccc</button>
            <button title="Delete" data-action="del" class="btn-delete">
              <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/delete.svg'); mask-image: url('icons/svg/presse%20papier/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
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
        const btn = e.currentTarget;
        btn.title = imgObj.pinned ? 'Unpin' : 'Pin';
        btn.style.color = imgObj.pinned ? '#f59e0b' : '';
        btn.style.opacity = imgObj.pinned ? '1' : '0.5';
        showToast(imgObj.pinned ? '📌 Pinned!' : 'Unpinned');
      });

      itemDiv.querySelector('[data-action="del"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const realIdx = clipboardImages.indexOf(imgObj);
        if (realIdx > -1) {
          clipboardImages.splice(realIdx, 1);
          
          ignoreStorageChanges = true;
          clearTimeout(_ignoreStorageTimer);
          _ignoreStorageTimer = setTimeout(() => { ignoreStorageChanges = false; }, 300);
          
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
      fragment.appendChild(itemDiv);
    });
    
    clipImageListEl.appendChild(fragment);

    if (startIndex + CHUNK_SIZE_IMG < filteredImages.length) {
      requestAnimationFrame(() => renderChunkImg(startIndex + CHUNK_SIZE_IMG));
    }
  }

  renderChunkImg(0);
}

  chrome.storage.local.get('clipboardImages', data => {
    clipboardImages = data.clipboardImages || [];
  });

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
      const originalLabel = exportImagesZipBtn.textContent;
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
        exportImagesZipBtn.textContent = originalLabel;
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
    if (now.getDate() - date.getDate() === 1) {
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

  const CAT_ICONS = 'icons/svg/presse papier/categorie/';
  const catConfig = {
    '📝 Text': { name: '📝 Text', key: 'Text', svg: CAT_ICONS + 'texte.svg' },
    '🔗 Link': { name: '🔗 Link', key: '🔗 Link', svg: CAT_ICONS + 'lien.svg' },
    '🎥 Video': { name: '🎥 Video', key: '🎥 Video', svg: CAT_ICONS + 'video.svg' },
    '🖼️ Image': { name: '🖼️ Image', key: '🖼️ Image', svg: CAT_ICONS + 'image.svg' },
    '🎨 Color': { name: '🎨 Color', key: '🎨 Color', svg: CAT_ICONS + 'couleur.svg' },
    '🔒 Private': { name: '🔒 Private', key: '🔒 Private', svg: CAT_ICONS + 'prive.svg' },
    '🔑 Password': { name: '🔑 Password', key: '🔑 Password', svg: CAT_ICONS + 'mot-de-passe.svg' },
    '✉️ Email': { name: '✉️ Email', key: '✉️ Email', svg: CAT_ICONS + 'email.svg' },
    '📞 Phone': { name: '📞 Phone', key: '📞 Phone', svg: CAT_ICONS + 'telephone.svg' },
    '💻 Code': { name: '💻 Code', key: '💻 Code', svg: CAT_ICONS + 'code.svg' },
    '🔢 Number': { name: '🔢 Number', key: '🔢 Number', svg: CAT_ICONS + 'nombre.svg' },
    '📅 Date': { name: '📅 Date', key: '📅 Date', svg: CAT_ICONS + 'date.svg' },
    '💰 Price': { name: '💰 Price', key: '💰 Price', svg: CAT_ICONS + 'prix.svg' },
    '📍 Address': { name: '📍 Address', key: '📍 Address', svg: CAT_ICONS + 'adresse.svg' },
    '🔐 API Key': { name: '🔐 API Key', key: '🔐 API Key', svg: CAT_ICONS + 'cle-api.svg' },
    '🐙 GitHub': { name: '🐙 GitHub', key: '🐙 GitHub', svg: CAT_ICONS + 'github.svg' },
    '🎵 Spotify': { name: '🎵 Spotify', key: '🎵 Spotify', svg: CAT_ICONS + 'spotify.svg' },
    '🐦 Twitter / X': { name: '🐦 Twitter / X', key: '🐦 Twitter / X', svg: CAT_ICONS + 'twitter.svg' },
    '📘 Facebook': { name: '📘 Facebook', key: '📘 Facebook' },
    '📸 Instagram': { name: '📸 Instagram', key: '📸 Instagram', svg: CAT_ICONS + 'instagram.svg' },
    '🎬 TikTok': { name: '🎬 TikTok', key: '🎬 TikTok' },
    '📺 YouTube': { name: '📺 YouTube', key: '📺 YouTube' },
    '💼 LinkedIn': { name: '💼 LinkedIn', key: '💼 LinkedIn', svg: CAT_ICONS + 'linkedin.svg' },
    '🗣️ Reddit': { name: '🗣️ Reddit', key: '🗣️ Reddit', svg: CAT_ICONS + 'reddit.svg' },
    '📌 Pinterest': { name: '📌 Pinterest', key: '📌 Pinterest' },
    '👻 Snapchat': { name: '👻 Snapchat', key: '👻 Snapchat' },
    '💬 WhatsApp': { name: '💬 WhatsApp', key: '💬 WhatsApp' },
    '✈️ Telegram': { name: '✈️ Telegram', key: '✈️ Telegram' },
    '🧵 Threads': { name: '🧵 Threads', key: '🧵 Threads' },
    '🎮 Discord': { name: '🎮 Discord', key: '🎮 Discord', svg: CAT_ICONS + 'discord.svg' },
    '🎮 Twitch': { name: '🎮 Twitch', key: '🎮 Twitch', svg: CAT_ICONS + 'twitch.svg' },
    '🎨 Figma': { name: '🎨 Figma', key: '🎨 Figma', svg: CAT_ICONS + 'figma.svg' },
    '📄 Google Drive': { name: '📄 Google Drive', key: '📄 Google Drive', svg: CAT_ICONS + 'google-drive.svg' },
    '📄 Document': { name: '📄 Document', key: '📄 Document', svg: CAT_ICONS + 'document.svg' }
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
      chip.innerHTML = `<span>${label} (${count})</span>`;

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
  }

  function renderClipList() {
    const q = clipSearchQuery.trim().toLowerCase();
    const now = Date.now();
    const filtered = clipItems
      .filter(item => {
        let cats = item.category || ['📝 Text'];
        if (typeof cats === 'string') cats = [cats];
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
      clipList.innerHTML = `<div class="clip-empty" style="text-align: center; padding: 20px; color: var(--text-muted);">${emptyMsg}</div>`;
      return;
    }

    clipList.innerHTML = '';
    
    // Chunked rendering to prevent blocking UI for large lists
    const CHUNK_SIZE = 15;
    function renderChunk(startIndex) {
      const chunk = filtered.slice(startIndex, startIndex + CHUNK_SIZE);
      if (chunk.length === 0) return;
      
      const fragment = document.createDocumentFragment();
      chunk.forEach((item) => {
      if (!item || !item.text) return; // Skip les items corrompus
      const realIdx = clipItems.indexOf(item);

      let cats = item.category || ['📝 Text'];
      if (typeof cats === 'string') cats = [cats];

      let badgesHtml = '';
      cats.forEach(c => {
        const conf = catConfig[c] || { name: c, key: c };
        // Pas d'icône : l'emoji est déjà dans conf.name, un logo ferait doublon.
        let bHtml = `<span>${escapeHtml(conf.name)}</span>`;

        if (cats.length > 1 || c !== '📝 Text') {
          bHtml += `<span class="cat-remove-btn" data-remove="${escapeHtml(c)}" style="margin-left:6px; opacity:0.6; padding:2px; font-size:10px; cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'" title="Remove tag">✕</span>`;
        }

        badgesHtml += `<span class="clip-cat-badge" data-cat="${escapeHtml(conf.key)}" style="margin-right:4px; display:inline-flex; align-items:center;">${bHtml}</span>`;
      });

      // If it's a color, add a little swatch indicator
      if (cats.includes('🎨 Color')) {
        badgesHtml += `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${escapeHtml(item.text)}; border:1px solid #fff; margin-left:4px; vertical-align:middle;"></span>`;
      }

      const trimmedText = item.text.trim();
      const isNew = (Date.now() - item.timestamp) < 600;
      const isPassword = cats.includes('🔑 Password');
      const isNumericTabular = /^[\d\s.,+-]+$/.test(trimmedText);

      let safeText;
      if (isPassword) {
        safeText = '••••••••';
      } else {
        safeText = escapeHtml(censorText(trimmedText));
        safeText = safeText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="clip-text-link" onclick="event.stopPropagation()">$1</a>');
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
          <div class="clip-text-preview clamp ${isNumericTabular ? 'tabular-nums' : ''}" title="Click to copy" ${isPassword ? 'style="font-family:monospace; letter-spacing:2px; color:#a78bfa;"' : ''}>${safeText}</div>
        </div>
        <div class="clip-footer">
          <button title="Copy" data-action="copy">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/copier.svg'); mask-image: url('icons/svg/presse%20papier/copier.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
          ${isPassword ? `<button title="View" data-action="reveal" style="font-size:14px;">👁️</button>` : ''}
          <button title="${isPassword ? 'Remove password marking' : 'Mark as password'}" data-action="toggle-password">
            ${isPassword ? '🔓' : '🔐'}
          </button>
          <button title="${item.pinned ? 'Unpin' : 'Pin'}" data-action="pin" class="${item.pinned ? 'is-pinned' : ''}">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/pin.svg'); mask-image: url('icons/svg/presse%20papier/pin.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
          <button title="Add a tag" data-action="addtag">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/add-tags.svg'); mask-image: url('icons/svg/presse%20papier/add-tags.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
          <button title="Delete" data-action="del" class="btn-delete">
            <span style="display:inline-block; width:14px; height:14px; background-color:currentColor; -webkit-mask-image: url('icons/svg/presse%20papier/delete.svg'); mask-image: url('icons/svg/presse%20papier/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>
          </button>
        </div>
      `;

      el.querySelectorAll('.cat-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tagToRemove = btn.getAttribute('data-remove');
          let newCats = clipItems[realIdx].category.filter(c => c !== tagToRemove);
          if (newCats.length === 0) newCats = ['📝 Text'];
          clipItems[realIdx].category = newCats;
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
        copyText(item.text);
      });

      el.querySelector('[data-action="copy"]')?.addEventListener('click', e => {
        e.stopPropagation();
        copyText(item.text);
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
        clipItems[realIdx].pinned = !clipItems[realIdx].pinned;
        saveClipboard(true);
        const btn = e.currentTarget;
        btn.classList.toggle('is-pinned', clipItems[realIdx].pinned);
        btn.title = clipItems[realIdx].pinned ? 'Unpin' : 'Pin';
      });

      el.querySelector('[data-action="toggle-password"]')?.addEventListener('click', e => {
        e.stopPropagation();
        let itemCats = clipItems[realIdx].category || ['📝 Text'];
        if (typeof itemCats === 'string') itemCats = [itemCats];
        const pwTag = '🔑 Password';
        const isPassword = itemCats.includes(pwTag);

        if (isPassword) {
          itemCats = itemCats.filter(c => c !== pwTag);
          if (itemCats.length === 0) itemCats = ['📝 Text'];
        } else {
          itemCats.push(pwTag);
        }
        clipItems[realIdx].category = itemCats;
        saveClipboard(true);

        const btn = e.currentTarget;
        btn.innerHTML = !isPassword ? '🔓' : '🔐';
        btn.title = !isPassword ? 'Remove password marking' : 'Mark as password';

        const previewEl = el.querySelector('.clip-text-preview');
        if (previewEl) {
          if (!isPassword) {
            previewEl.textContent = '••••••••••••';
            previewEl.style.fontFamily = 'monospace';
            previewEl.style.letterSpacing = '2px';
            previewEl.style.color = '#a78bfa';
          } else {
            previewEl.textContent = clipItems[realIdx].text.substring(0, 100);
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
            const item = clipItems[realIdx];

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
                    badgeHtml += `<span class="cat-remove-btn" data-remove="${escapeHtml(c)}" style="margin-left:6px; opacity:0.6; padding:2px; font-size:10px; cursor:pointer;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'" title="Remove tag">✕</span>`;
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
        const deletedText = clipItems[realIdx].text;

        chrome.storage.local.get(['deletedClipItems'], (res) => {
          const deleted = res.deletedClipItems || [];
          deleted.push({ text: deletedText, timestamp: Date.now() });
          const fiveHours = 5 * 3600 * 1000;
          const cleaned = deleted.filter(i => (Date.now() - i.timestamp) < fiveHours);
          chrome.storage.local.set({ deletedClipItems: cleaned });
        });

        clipItems.splice(realIdx, 1);
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

      fragment.appendChild(el);
    });

    clipList.appendChild(fragment);

    // Schedule next chunk to keep UI smooth
    if (startIndex + CHUNK_SIZE < filtered.length) {
      requestAnimationFrame(() => {
        renderChunk(startIndex + CHUNK_SIZE);
      });
    }
  }

  // Start rendering the first chunk
  renderChunk(0);
}

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
        showToast('🗑️ Text history cleared');
      });
    });
  }

  // Restore session state after initial load
  setTimeout(restoreSessionState, 60);


  // ---- MANUAL PASTE BUTTON ----
  const clipPasteBtn = document.getElementById('clipPasteBtn');

  // detectTypePopup supprimé — la catégorisation est gérée par background.js (source unique de vérité)

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showToast('❌ Clipboard is empty');
        return;
      }
      const trimmed = text.trim();

      // Vérification du cooldown (5 heures)
      const res = await chrome.storage.local.get(['deletedClipItems']);
      const deleted = res.deletedClipItems || [];
      const fiveHours = 5 * 3600 * 1000;
      const recentDelete = deleted.find(i => i.text === trimmed && (Date.now() - i.timestamp) < fiveHours);
      if (recentDelete) return;

      // Déléguer catégorisation + stockage au background.js (source unique de vérité)
      chrome.runtime.sendMessage({ type: 'clipboard_capture', text: trimmed, inputType: '' }, () => {
        if (chrome.runtime.lastError) {
          showToast('❌ Capture error');
          return;
        }
        showToast('✅ Pasted from clipboard!');
      });
    } catch (err) {
      showToast('❌ Clipboard access denied');
    }
  }

  clipPasteBtn.addEventListener('click', handlePaste);

  // Polling 200ms supprimé — content.js capture déjà les copy/cut en temps réel.
  // L'UI se met à jour via chrome.storage.onChanged (ligne ~1382).

  // ---- LIVE UPDATE: refresh when content scripts add new items ----
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.clipItems) {
      if (!ignoreStorageChanges) {
        clipItems = changes.clipItems.newValue || [];
        renderClipCategories();
        renderClipList();
        updateClipCounts();
      }
    }
    if (area === 'local' && changes.clipboardImages) {
      if (!ignoreStorageChanges) {
        clipboardImages = changes.clipboardImages.newValue || [];
        const activeTab = document.querySelector('.clip-tab-btn.active')?.dataset.cliptab;
        if (activeTab === 'image') renderClipImages();
        updateClipCounts();
      }
    }
  });

  // Live-reload quand le background ajoute un élément

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

    function parseExpr() {
      let left = parseTerm();
      while (idx < str.length) {
        if (str[idx] === '+') { idx++; left += parseTerm(); }
        else if (str[idx] === '-') { idx++; left -= parseTerm(); }
        else break;
      }
      return left;
    }

    function parseTerm() {
      let left = parsePower();
      while (idx < str.length) {
        if (str[idx] === '*') { idx++; left *= parsePower(); }
        else if (str[idx] === '/') { idx++; left /= parsePower(); }
        else break;
      }
      return left;
    }

    function parsePower() {
      let left = parseFactor();
      while (idx < str.length && str[idx] === '^') {
        idx++;
        left = Math.pow(left, parseFactor());
      }
      return left;
    }

    function parseFactor() {
      let sign = 1;
      while (idx < str.length && (str[idx] === '-' || str[idx] === '+')) {
        if (str[idx] === '-') sign *= -1;
        idx++;
      }

      let val;
      if (str[idx] === '√') {
        idx++;
        val = Math.sqrt(parseFactor());
      } else if (str[idx] === 'P') {
        idx++;
        val = Math.PI;
      } else if (str[idx] === '(') {
        idx++;
        val = parseExpr();
        if (str[idx] === ')') idx++;
      } else {
        let start = idx;
        while (idx < str.length && /[0-9.]/.test(str[idx])) idx++;
        if (start === idx) return NaN;
        val = parseFloat(str.substring(start, idx));
      }

      while (idx < str.length && str[idx] === '%') {
        val /= 100;
        idx++;
      }
      return sign * val;
    }

    return parseExpr();
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
        <span class="calc-history-val">= ${h.result}</span>
      `;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'calc-history-del';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = `<span style="display:inline-block; width:12px; height:12px; background-color:currentColor; -webkit-mask-image: url('icons/svg/calcul/delete.svg'); mask-image: url('icons/svg/calcul/delete.svg'); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;"></span>`;

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
        calcResult.textContent = '0';
      });

      itemEl.appendChild(contentEl);
      itemEl.appendChild(deleteBtn);
      calcHist.appendChild(itemEl);
    });
  }

  const calcInputField = document.getElementById('calcInputField');
  const calcGrid = document.getElementById('calcGrid');

  function calcRefreshPreview() {
    const expr = calcInputField.value.trim();
    calcExpr.textContent = expr;
    if (!expr) {
      calcResult.textContent = '0';
      return;
    }
    try {
      const r = mathEval(expr);
      calcResult.textContent = isFinite(r) ? (Math.round(r * 1e10) / 1e10) : 'Error';
    } catch (e) {
      calcResult.textContent = 'Error';
    }
  }

  function calcClear() {
    calcInputField.value = '';
    calcExpr.textContent = '';
    calcResult.textContent = '0';
  }

  function calcSubmit() {
    const expr = calcInputField.value.trim();
    if (!expr) return;
    try {
      const result = mathEval(expr);
      if (!isFinite(result)) { calcResult.textContent = 'Error'; return; }
      const rounded = Math.round(result * 1e10) / 1e10;
      calcResult.textContent = rounded;
      calcHistory.unshift({ expr: expr, result: rounded });
      if (calcHistory.length > 20) calcHistory.pop();
      saveCalcHistory();
      renderCalcHistory();
      // Prêt pour l'opération suivante, en repartant du résultat
      calcInputField.value = String(rounded);
      calcExpr.textContent = String(rounded);
    } catch (e) {
      calcResult.textContent = 'Error';
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
        calcResult.textContent = '0';
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

    // Code blocks ```...```
    html = html.replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3);border-radius:6px;padding:10px;font-family:monospace;font-size:12px;overflow-x:auto;margin:6px 0;"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code style="background:rgba(0,0,0,0.35);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');

    const lines = html.split('\n');
    const result = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push('<hr style="border:0;border-top:1px solid rgba(255,255,255,0.12);margin:10px 0;">');
        continue;
      }
      // H1
      if (/^# (.+)/.test(line)) {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push('<h1 style="font-size:20px;font-weight:800;color:#c4b5fd;margin:10px 0 4px;line-height:1.2;">' + applyInline(line.replace(/^# /, '')) + '</h1>');
        continue;
      }
      // H2
      if (/^## (.+)/.test(line)) {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push('<h2 style="font-size:16px;font-weight:700;color:#a78bfa;margin:8px 0 3px;line-height:1.2;">' + applyInline(line.replace(/^## /, '')) + '</h2>');
        continue;
      }
      // H3
      if (/^### (.+)/.test(line)) {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push('<h3 style="font-size:14px;font-weight:600;color:#8b5cf6;margin:6px 0 2px;">' + applyInline(line.replace(/^### /, '')) + '</h3>');
        continue;
      }
      // Blockquote
      if (/^&gt; (.+)/.test(line)) {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push('<blockquote style="border-left:3px solid #7c3aed;padding-left:10px;color:rgba(255,255,255,0.55);font-style:italic;margin:4px 0;">' + applyInline(line.replace(/^&gt; /, '')) + '</blockquote>');
        continue;
      }
      // Unordered list
      if (/^[-*] (.+)/.test(line)) {
        if (!inList) { result.push('<ul style="padding-left:18px;margin:4px 0;">'); inList = true; }
        result.push('<li style="margin:2px 0;">' + applyInline(line.replace(/^[-*] /, '')) + '</li>');
        continue;
      }
      // Ordered list
      if (/^\d+\. (.+)/.test(line)) {
        if (!inList) { result.push('<ol style="padding-left:18px;margin:4px 0;">'); inList = true; }
        result.push('<li style="margin:2px 0;">' + applyInline(line.replace(/^\d+\. /, '')) + '</li>');
        continue;
      }
      // Close list
      if (inList && line.trim() === '') {
        result.push('</ul>'); inList = false;
      }
      // Empty line
      if (line.trim() === '') {
        result.push('<div style="height:6px;"></div>');
        continue;
      }
      // Normal paragraph
      result.push('<p style="margin:3px 0;line-height:1.55;">' + applyInline(line) + '</p>');
    }
    if (inList) result.push('</ul>');
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
    // Bold **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic *text* or _text_
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
    // Strikethrough ~~text~~
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Links [text](url) — URL validée et échappée pour éviter l'injection HTML/JS
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) =>
      `<a href="${sanitizeMdUrl(url)}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;">${label}</a>`
    );
    return text;
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
    if (activeNoteId && noteArea) {
      const note = notes.find(n => n.id === activeNoteId);
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
        renderNoteTabs();
      });

      tab.addEventListener('dblclick', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = note.title || `Note ${i + 1}`;
        input.style.cssText = 'width:80px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:inherit;font:inherit;outline:none;padding:1px 4px;';
        titleSpan.replaceWith(input);
        input.focus(); input.select();
        const save = () => {
          note.title = input.value.trim() || `Note ${i + 1}`;
          saveNotes(); renderNoteTabs();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') renderNoteTabs(); });
      });

      tab.addEventListener('contextmenu', e => {
        e.preventDefault();
        currentCtxNoteId = note.id;
        if (noteCtxPin) noteCtxPin.textContent = note.pinned ? '📌 Unpin' : '📌 Pin';
        noteContextMenu.style.left = `${Math.min(e.clientX, 280)}px`;
        noteContextMenu.style.top = `${e.clientY}px`;
        noteContextMenu.classList.add('show');
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
  }

  function showNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note || !noteArea) return;
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
  function insertMd(before, after = '', placeholder = 'texte') {
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

  if (noteBoldBtn) noteBoldBtn.addEventListener('click', () => insertMd('**', '**', 'gras'));
  if (noteItalicBtn) noteItalicBtn.addEventListener('click', () => insertMd('*', '*', 'italique'));
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
        saveNotes();
        if (noteStatus) { noteStatus.textContent = '✓ Saved'; noteStatus.className = 'note-status saved'; }
      }, 400);
    });

    // Keyboard shortcuts
    noteArea.addEventListener('keydown', e => {
      // Tab → insert 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        noteArea.setRangeText('  ', noteArea.selectionStart, noteArea.selectionEnd, 'end');
        noteArea.dispatchEvent(new Event('input'));
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); insertMd('**', '**', 'gras'); }
        if (e.key === 'i') { e.preventDefault(); insertMd('*', '*', 'italique'); }
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

  let todoItems = []; // [{ id, text, done, priority, createdAt }]
  let todoFilter = 'all';
  let todoSearchQuery = '';
  let todoSortByPriority = false;

  const todoInput          = document.getElementById('todoInput');
  const todoSearch         = document.getElementById('todoSearch');
  const todoPrioritySelect = document.getElementById('todoPrioritySelect');
  const todoListWrap       = document.getElementById('todoListWrap');
  const todoCountEl        = document.getElementById('todoCount');
  const todoStatsEl        = document.getElementById('todoStats');
  const todoClearCompBtn   = document.getElementById('todoClearCompletedBtn');
  const todoClearAllBtn    = document.getElementById('todoClearAllBtn');
  const todoSortBtn        = document.getElementById('todoSortBtn');

  const PRIORITY_ORDER = { high: 0, medium: 1, normal: 2, low: 3 };
  const PRIORITY_EMOJI = { high: '🔴', medium: '🟡', low: '🟢', normal: '' };

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

    // Apply filter
    const q = todoSearchQuery.trim().toLowerCase();
    let visible = todoItems.filter(t => {
      if (q && !t.text.toLowerCase().includes(q)) return false;
      if (todoFilter === 'pending') return !t.done;
      if (todoFilter === 'done')    return t.done;
      if (todoFilter === 'high')    return t.priority === 'high' && !t.done;
      return true;
    });

    // Sort: pinned first, then by priority if enabled, then by date
    if (todoSortByPriority) {
      visible.sort((a, b) => (PRIORITY_ORDER[a.priority||'normal'] - PRIORITY_ORDER[b.priority||'normal']));
    }

    // Stats
    const total = todoItems.length;
    const done  = todoItems.filter(t => t.done).length;
    const pending = total - done;
    if (todoCountEl) todoCountEl.textContent = `${pending} task${pending !== 1 ? 's' : ''} remaining`;
    if (todoStatsEl) todoStatsEl.textContent = `${done}/${total} completed`;

    todoListWrap.innerHTML = '';

    if (visible.length === 0) {
      todoListWrap.innerHTML = `<div class="todo-empty">${
        q ? '🔍 No matching task' :
        todoFilter === 'done' ? '✅ No completed tasks' :
        todoFilter === 'high' ? '🎉 No urgent tasks!' :
        '📋 Add your first task!'
      }</div>`;
      return;
    }

    visible.forEach(task => {
      const el = document.createElement('div');
      el.className = 'todo-item' + (task.done ? ' done' : '') + (task.priority === 'high' ? ' priority-high' : task.priority === 'medium' ? ' priority-medium' : task.priority === 'low' ? ' priority-low' : '');
      el.dataset.id = task.id;

      const prio = PRIORITY_EMOJI[task.priority || 'normal'];

      el.innerHTML = `
        <button class="todo-check" title="${task.done ? 'Reopen' : 'Complete'}">
          ${task.done ? '✅' : '<span class="todo-check-circle"></span>'}
        </button>
        <span class="todo-text">${escHtml(task.text)}</span>
        ${prio ? `<span class="todo-prio-badge">${prio}</span>` : ''}
        <div class="todo-item-actions">
          <button class="todo-btn-edit" title="Edit">✏️</button>
          <button class="todo-btn-del" title="Delete">✕</button>
        </div>
      `;

      // Check toggle
      el.querySelector('.todo-check').addEventListener('click', () => {
        const t = todoItems.find(x => x.id === task.id);
        if (t) { t.done = !t.done; saveTodos(); }
      });

      // Edit inline
      el.querySelector('.todo-btn-edit').addEventListener('click', () => {
        const textEl = el.querySelector('.todo-text');
        const oldText = task.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldText;
        input.className = 'todo-inline-edit';
        textEl.replaceWith(input);
        input.focus();
        input.select();
        const save = () => {
          const t = todoItems.find(x => x.id === task.id);
          if (t && input.value.trim()) t.text = input.value.trim();
          saveTodos();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') saveTodos();
        });
      });

      // Delete
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
    const priority = todoPrioritySelect ? todoPrioritySelect.value : 'normal';
    todoItems.unshift({ id: genTodoId(), text, done: false, priority, createdAt: Date.now() });
    todoInput.value = '';
    if (todoPrioritySelect) todoPrioritySelect.value = 'normal';
    saveTodos();
    todoInput.focus();
  }

  if (todoInput) {
    todoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
  }

  if (todoSearch) {
    todoSearch.addEventListener('input', e => {
      todoSearchQuery = e.target.value;
      renderTodos();
    });
  }

  // Filter buttons
  document.querySelectorAll('.todo-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.todo-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      todoFilter = btn.dataset.filter;
      renderTodos();
    });
  });

  // Sort toggle
  if (todoSortBtn) {
    todoSortBtn.addEventListener('click', () => {
      todoSortByPriority = !todoSortByPriority;
      todoSortBtn.classList.toggle('active', todoSortByPriority);
      renderTodos();
    });
  }

  // Clear done
  if (todoClearCompBtn) {
    todoClearCompBtn.addEventListener('click', () => {
      todoItems = todoItems.filter(t => !t.done);
      saveTodos();
      showToast('🗑️ Completed tasks deleted');
    });
  }

  // Clear all
  if (todoClearAllBtn) {
    todoClearAllBtn.addEventListener('click', () => {
      if (todoItems.length === 0) return;
      askSecureConfirm('Clear tasks', 'Do you want to delete all your tasks?', (confirmed) => {
        if (confirmed) {
          todoItems = [];
          saveTodos();
          renderTodos();
          showToast('🗑️ List cleared');
        }
      });
    });
  }

  loadTodos();


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
    chrome.storage.local.get('colorHistory', data => {
      let history = data.colorHistory || [];
      // KEEP ONLY PINNED ITEMS on load. Clear all standard recent history.
      colorHistList = history
        .map(item => typeof item === 'string' ? { hex: item, pinned: false } : item)
        .filter(item => item.pinned);

      saveColorHistory(); // Save the cleared version immediately
      renderColorHistory();
    });
  }

  function saveColorHistory() {
    chrome.storage.local.set({ colorHistory: colorHistList });
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
    while (unpinnedCount > 20) {
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
  loadColorHistory();
  renderPalette('material');

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
      visBtn.textContent = '👁️';
      visBtn.title = 'Show/Hide';
      visBtn.onclick = () => {
        isVisible = !isVisible;
        pwdSpan.textContent = isVisible ? item.password : '••••••••••';
      };

      const copyBtn = document.createElement('button');
      copyBtn.className = 'pw-hist-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = 'Copy';
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
    passwords.forEach(pw => {
      const row = document.createElement('div');
      row.className = 'pw-output-row';
      const span = document.createElement('span');
      span.className = 'pw-output';
      span.textContent = pw;
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-icon pw-copy-btn';
      btn.textContent = '📋';
      btn.title = 'Copy';
      btn.onclick = () => copyText(pw);

      row.appendChild(span);
      row.appendChild(btn);
      pwOutputsList.appendChild(row);
    });

    updateStrength(passwords[0], fullCharset.length);
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
      label = 'Super fort'; color = '#8b5cf6'; pct = 100;
    } else if (entropy > 80) {
      label = 'Very strong'; color = '#22d3ee'; pct = 100;
    } else if (entropy > 60) {
      label = 'Fort'; color = '#34d399'; pct = 85;
    } else if (entropy > 45) {
      label = 'Bon'; color = '#a3e635'; pct = 70;
    } else if (entropy > 30) {
      label = 'Moyen'; color = '#fbbf24'; pct = 50;
    } else if (entropy > 20) {
      label = 'Faible'; color = '#fb923c'; pct = 30;
    }

    pwStrengthFill.style.width = pct + '%';
    pwStrengthFill.style.backgroundColor = color;
    pwStrengthLabel.textContent = `${label} (~${Math.round(entropy)} bits)`;
    pwStrengthLabel.style.color = color;
  }

  pwGenerateBtn.addEventListener('click', generatePassword);

  loadPwHistory();

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
    if (!str) return NaN;
    const cleaned = String(str).trim().replace(/\s/g, '').replace(',', '.');
    return parseFloat(cleaned);
  }

  // ---------- CURRENCY DATA ----------
  let currencyRates = {}; // unités par 1 USD (voir background.js)
  let ratesLastUpdated = null;
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
    ARS: 880, CLP: 950, COP: 3900, NOK: 10.5, SEK: 10.5, DKK: 6.9, PLN: 3.9,
    CZK: 23.5, HUF: 360, RON: 4.6
  };

  function fetchCurrencyRates() {
    chrome.storage.local.get(['exchangeRates', 'lastExchangeFetch', 'exchangeRatesOk'], (data) => {
      ratesAreLive = data.exchangeRatesOk !== false;
      ratesLastUpdated = data.lastExchangeFetch || null;

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
    convRateInfo.textContent = `1 ${uA} = ${rounded} ${uB}`;
  }

  // ---------- CURRENCY TABLE ----------
  function toggleCurrencyTable() {
    if (convCategory === 'Currency') {
      convCurrencyTable.style.display = 'block';
      renderCountryTable();
    } else {
      convCurrencyTable.style.display = 'none';
    }
  }

  function renderCountryTable(filter = '') {
    const query = filter.toLowerCase();
    let html = '<div class="conv-country-grid">';

    currencyMeta.forEach(cm => {
      const rate = currencyRates[cm.code] || fallbackRates[cm.code] || '—';
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

  if (tmrTabTimer && tmrTabStopwatch) {
    tmrTabTimer.addEventListener('click', () => {
      tmrTabTimer.classList.add('active'); tmrTabStopwatch.classList.remove('active');
      tmrView.style.display = ''; swView.style.display = 'none';
    });
    tmrTabStopwatch.addEventListener('click', () => {
      tmrTabStopwatch.classList.add('active'); tmrTabTimer.classList.remove('active');
      swView.style.display = ''; tmrView.style.display = 'none';
    });
  }

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
  const tmrProgressFill = document.getElementById('tmrProgressFill');
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

  function tmrRender() {
    const pct = tmrTotalMs > 0 ? Math.max(0, tmrRemaining / tmrTotalMs * 100) : 100;
    const parts = tmrFormatParts(tmrRemaining);
    renderRollGroup(tmrMainGroup, parts.main);
    if (tmrMsGroup) tmrMsGroup.textContent = parts.cs;
    if (tmrDisplay) tmrDisplay.style.color = tmrColorForPct(pct);
    if (tmrProgressFill && tmrTotalMs > 0) {
      tmrProgressFill.style.width = pct + '%';
    }
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
    const h = parseInt(tmrHours?.value) || 0;
    const m = parseInt(tmrMinutes?.value) || 0;
    const s = parseInt(tmrSeconds?.value) || 0;
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
      if (tmrProgressFill) tmrProgressFill.style.width = '0%';
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
  const swRingSweep = document.getElementById('swRingSweep');

  setRollGroupInstant(swMainGroup, '00:00');
  if (swMsGroup) swMsGroup.textContent = '00';

  let swRunning = false, swStartTime = 0, swElapsed = 0, swRafId = null, swLapList = [];

  // Reprend l'animation CSS pile où elle devrait être : un délai négatif fait
  // sauter le moteur d'animation directement à ce point de la boucle de 60s.
  function swSyncRing() {
    if (!swRingSweep) return;
    swRingSweep.style.animationDelay = `-${(swElapsed % 60000) / 1000}s`;
  }

  function swFormatParts(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return { main: `${tmrPad(m)}:${tmrPad(s)}`, cs: tmrPad(cs) };
  }

  function swRender() {
    const parts = swFormatParts(swElapsed);
    renderRollGroup(swMainGroup, parts.main);
    if (swMsGroup) swMsGroup.textContent = parts.cs;
  }

  function swTick() {
    if (!swRunning) return;
    swElapsed = Date.now() - swStartTime;
    swRender();
    swRafId = requestAnimationFrame(swTick);
  }

  if (swStartBtn) {
    swStartBtn.addEventListener('click', () => {
      if (swRunning) {
        swRunning = false; cancelAnimationFrame(swRafId);
        swElapsed = Date.now() - swStartTime;
        swStartBtn.textContent = '▶ Resume';
        if (swRing) swRing.classList.remove('running');
        if (swDisplay) swDisplay.classList.remove('tmr-running');
      } else {
        swStartTime = Date.now() - swElapsed;
        swRunning = true;
        swStartBtn.textContent = '⏸ Pause';
        swSyncRing();
        if (swRing) swRing.classList.add('running');
        if (swDisplay) swDisplay.classList.add('tmr-running');
        swRafId = requestAnimationFrame(swTick);
      }
    });
  }

  if (swResetBtn) {
    swResetBtn.addEventListener('click', () => {
      swRunning = false; cancelAnimationFrame(swRafId);
      swElapsed = 0; swLapList = [];
      setRollGroupInstant(swMainGroup, '00:00');
      if (swMsGroup) swMsGroup.textContent = '00';
      if (swLaps) swLaps.innerHTML = '';
      if (swStartBtn) swStartBtn.textContent = '▶ Start';
      if (swRing) swRing.classList.remove('running');
      if (swDisplay) swDisplay.classList.remove('tmr-running');
      swSyncRing();
    });
  }

  if (swLapBtn) {
    swLapBtn.addEventListener('click', () => {
      if (!swRunning && swElapsed === 0) return;
      const prevElapsed = swLapList.length ? swLapList[swLapList.length - 1] : 0;
      const split = swElapsed - prevElapsed;
      swLapList.push(swElapsed);
      if (swLaps) {
        const totalParts = swFormatParts(swElapsed);
        const splitParts = swFormatParts(split);
        const el = document.createElement('div');
        el.className = 'sw-lap-item';
        el.innerHTML = `
          <span class="sw-lap-num">#${swLapList.length}</span>
          <span class="sw-lap-delta">+${splitParts.main}.${splitParts.cs}</span>
          <span class="sw-lap-time">${totalParts.main}.${totalParts.cs}</span>
        `;
        swLaps.prepend(el);
      }
    });
  }

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
  let localRepeatMode = false;
  let gAudioState = { currentTime: 0, duration: 0, paused: true, volume: 1 };

  function formatMusicTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

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
    btn.innerHTML = `<span class="music-svg-icon" style="width:${size}px;height:${size}px;background-color:currentColor;-webkit-mask-image:url('icons/svg/audio/${iconFile}');mask-image:url('icons/svg/audio/${iconFile}');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></span>`;
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
      delBtn.title = 'Retirer de la playlist';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        localPlaylist.splice(idx, 1);
        if (localCurrentIndex === idx) {
          chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
          localCurrentIndex = -1;
        } else if (localCurrentIndex > idx) {
          localCurrentIndex--;
        }
        renderLocalPlaylist();
        savePlaylistState();
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

  function playTrack(idx) {
    if (idx < 0 || idx >= localPlaylist.length) return;
    localCurrentIndex = idx;

    // Check if offscreen exists, if not create it
    chrome.runtime.sendMessage({ action: 'CREATE_OFFSCREEN' }).finally(() => {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'PLAY',
        dataUrl: localPlaylist[idx].dataUrl
      }).catch(() => { });
    });

    if (localNowPlaying) localNowPlaying.style.display = '';
    if (localNowTitle) localNowTitle.textContent = localPlaylist[idx].name;
    if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'pause.svg', 19);
    renderLocalPlaylist();
    savePlaylistState();
  }

  function savePlaylistState() {
    chrome.storage.local.set({
      savedPlaylist: localPlaylist,
      savedCurrentIndex: localCurrentIndex,
      savedRepeatMode: localRepeatMode,
      savedVolume: localVolumeSlider ? Number(localVolumeSlider.value) : 100
    });
  }

  if (localFileInput) {
    localFileInput.addEventListener('change', async (e) => {
      e.target.parentElement.style.opacity = '0.5'; // Visual feedback since base64 can take a sec
      const files = Array.from(e.target.files);
      if (!files.length) {
        e.target.parentElement.style.opacity = '1';
        return;
      }
      let added = false;
      for (const file of files) {
        if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|mp4)$/i.test(file.name)) continue;

        // Limite de 50 Mo
        if (file.size > 50 * 1024 * 1024) {
          showToast(`File too large (> 50 MB)`);
          continue;
        }

        const dataUrl = await readAudioAsDataURL(file);
        if (dataUrl) {
          localPlaylist.push({ name: file.name, dataUrl });
          added = true;
        }
      }

      if (added) {
        // Auto-joue la nouvelle piste immédiatement
        playTrack(localPlaylist.length - 1);
      }
      e.target.parentElement.style.opacity = '1';
    });
  }

  const musicDropZone = document.getElementById('musicDropZone');
  if (musicDropZone) {
    musicDropZone.addEventListener('click', () => localFileInput && localFileInput.click());
    musicDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      musicDropZone.style.borderColor = 'rgba(139,92,246,1)';
    });
    musicDropZone.addEventListener('dragleave', () => {
      musicDropZone.style.borderColor = '';
    });
    musicDropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      musicDropZone.style.borderColor = '';
      musicDropZone.style.opacity = '0.5';
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|mp4)$/i.test(f.name));
      if (!files.length) {
        musicDropZone.style.opacity = '1';
        return;
      }
      let added = false;
      for (const file of files) {
        // Limite de 50 Mo
        if (file.size > 50 * 1024 * 1024) {
          showToast(`File too large (> 50 MB)`);
          continue;
        }

        const dataUrl = await readAudioAsDataURL(file);
        if (dataUrl) {
          localPlaylist.push({ name: file.name, dataUrl });
          added = true;
        }
      }

      if (added) {
        // Auto-joue la nouvelle piste immédiatement
        playTrack(localPlaylist.length - 1);
      }
      musicDropZone.style.opacity = '1';
    });
  }

  if (localPlayBtn) {
    localPlayBtn.addEventListener('click', () => {
      if (gAudioState.paused) {
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'PLAY' }).catch(() => { });
        setMusicBtnIcon(localPlayBtn, 'pause.svg', 19);
      }
      else {
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'PAUSE' }).catch(() => { });
        setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
      }
    });
  }

  if (localStopBtn) {
    localStopBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
      if (localPlayBtn) setMusicBtnIcon(localPlayBtn, 'play.svg', 19);
    });
  }

  if (localNextBtn) {
    localNextBtn.addEventListener('click', () => {
      let next = localCurrentIndex + 1;
      if (next >= localPlaylist.length) next = localRepeatMode ? 0 : localCurrentIndex;
      playTrack(next);
    });
  }

  if (localPrevBtn) {
    localPrevBtn.addEventListener('click', () => {
      let prev = localCurrentIndex - 1;
      if (prev < 0) prev = localRepeatMode ? localPlaylist.length - 1 : 0;
      playTrack(prev);
    });
  }

  if (localMuteBtn) {
    localMuteBtn.addEventListener('click', () => {
      const isMuted = localMuteBtn.dataset.muted === '1';
      localMuteBtn.dataset.muted = isMuted ? '0' : '1';
      setMusicBtnIcon(localMuteBtn, isMuted ? 'volume-high.svg' : 'mute.svg', 16);
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: isMuted ? (localVolumeSlider.value / 100) : 0 }).catch(() => { });
    });
  }

  if (localVolumeSlider) {
    localVolumeSlider.addEventListener('input', () => {
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: Number(localVolumeSlider.value) / 100 }).catch(() => { });
      if (localMuteBtn) { localMuteBtn.dataset.muted = '0'; setMusicBtnIcon(localMuteBtn, 'volume-high.svg', 16); }
      savePlaylistState(); // Sauvegarde le volume
    });
  }

  if (localRepeatBtn) {
    localRepeatBtn.addEventListener('click', () => {
      localRepeatMode = !localRepeatMode;
      localRepeatBtn.style.opacity = localRepeatMode ? '1' : '0.4';
      savePlaylistState();
    });
  }

  if (localClearPlaylistBtn) {
    localClearPlaylistBtn.addEventListener('click', () => {
      localPlaylist = [];
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'STOP' }).catch(() => { });
      localCurrentIndex = -1;
      if (localNowPlaying) localNowPlaying.style.display = 'none';
      renderLocalPlaylist();
      savePlaylistState();
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

  // Restore state from storage
  chrome.storage.local.get(['savedPlaylist', 'savedCurrentIndex', 'savedRepeatMode', 'savedVolume'], (data) => {
    if (data.savedPlaylist && data.savedPlaylist.length > 0) {
      localPlaylist = data.savedPlaylist;
      localCurrentIndex = data.savedCurrentIndex !== undefined ? data.savedCurrentIndex : -1;
      localRepeatMode = !!data.savedRepeatMode;
      if (localRepeatBtn) localRepeatBtn.style.opacity = localRepeatMode ? '1' : '0.4';
      if (localCurrentIndex >= 0 && localPlaylist[localCurrentIndex]) {
        if (localNowPlaying) localNowPlaying.style.display = '';
        if (localNowTitle) localNowTitle.textContent = localPlaylist[localCurrentIndex].name;
      }
      renderLocalPlaylist();
    }
    // Restaurer le volume
    if (data.savedVolume !== undefined && localVolumeSlider) {
      localVolumeSlider.value = data.savedVolume;
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'SET_VOLUME', volume: data.savedVolume / 100 }).catch(() => {});
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
    if (resp && resp.success) {
      gAudioState = resp;
      if (localPlayBtn && !resp.paused) setMusicBtnIcon(localPlayBtn, 'pause.svg', 19);
      updateAudioUI();
    }
  });

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

  function renderExpanderRules() {
    if (expanderCount) expanderCount.textContent = textExpanderRules.length;
    if (!expanderList) return;

    if (textExpanderRules.length === 0) {
      expanderList.innerHTML = '<div class="clip-empty">No shortcuts defined</div>';
      return;
    }

    expanderList.innerHTML = '';
    textExpanderRules.forEach((rule, idx) => {
      const el = document.createElement('div');
      el.className = 'pw-history-item'; // Reuse styling
      
      const contentSpan = document.createElement('span');
      contentSpan.className = 'pw-history-pw';
      contentSpan.style.display = 'flex';
      contentSpan.style.flexDirection = 'column';
      contentSpan.style.gap = '4px';
      
      const strong = document.createElement('strong');
      strong.textContent = rule.shortcut;
      strong.style.color = '#34d399';
      
      const txt = document.createElement('span');
      txt.textContent = rule.text.length > 50 ? rule.text.substring(0, 50) + '...' : rule.text;
      txt.style.fontSize = '11px';
      txt.style.color = 'var(--text-muted)';
      
      contentSpan.appendChild(strong);
      contentSpan.appendChild(txt);
      
      const actions = document.createElement('div');
      actions.className = 'pw-history-actions';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'pw-hist-btn';
      editBtn.textContent = '✏️';
      editBtn.title = 'Edit';
      editBtn.onclick = () => {
        if (expanderShortcut) expanderShortcut.value = rule.shortcut;
        if (expanderText) {
          expanderText.value = rule.text;
          expanderText.focus();
        }
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'pw-hist-btn';
      delBtn.innerHTML = '<span class="trash-svg-icon" style="width:13px;height:13px;"></span>';
      delBtn.title = 'Delete';
      delBtn.onclick = () => {
        textExpanderRules.splice(idx, 1);
        saveExpanderRules();
        renderExpanderRules();
      };
      
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      
      el.appendChild(contentSpan);
      el.appendChild(actions);
      expanderList.appendChild(el);
    });
  }

  if (expanderAddBtn) {
    expanderAddBtn.addEventListener('click', () => {
      const sc = expanderShortcut.value.trim();
      const txt = expanderText.value;
      if (!sc || !txt) {
        showToast('Remplissez les deux champs');
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
      showToast(existing >= 0 ? 'Shortcut updated!' : 'Shortcut added!');
    });
  }

  loadExpanderRules();

  const EXPORT_LINK_PREFIX = 'workbox-data://';
  // Doit rester aligné avec TEXT_LIMIT dans background.js — c'est là que la
  // vraie limite de capture est appliquée, ceci ne fait que l'appliquer aussi
  // après un import pour éviter de retomber sur un vieux plafond de 100.
  const IMPORT_TEXT_LIMIT = 1000;

  // Compression gzip native (CompressionStream) + base64 : réduit la taille du
  // lien d'environ 90% par rapport au JSON brut, pour rester copiable/collable
  // facilement (Discord, SMS, etc. ont des limites de longueur de message).
  async function encodeExportPayload(payload) {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const compressedBuffer = await new Response(cs.readable).arrayBuffer();
    const compressedBytes = new Uint8Array(compressedBuffer);
    let binary = '';
    compressedBytes.forEach(b => { binary += String.fromCharCode(b); });
    return EXPORT_LINK_PREFIX + btoa(binary);
  }

  async function decodeExportLink(raw) {
    const trimmed = String(raw || '').trim();
    // Cherche le préfixe où qu'il soit dans le texte collé, et prend le base64 qui suit
    const prefixMatch = trimmed.match(/workbox-data:\/\/([A-Za-z0-9+/=]+)/i);
    const b64 = prefixMatch ? prefixMatch[1] : trimmed.replace(/[^A-Za-z0-9+/=]/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
    const json = new TextDecoder().decode(new Uint8Array(decompressedBuffer));
    return validateImportPayload(JSON.parse(json));
  }

  function validateImportPayload(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.notes) || !Array.isArray(payload.clipItems)) {
      throw new Error('Invalid format');
    }
    if (!Array.isArray(payload.todoItems)) payload.todoItems = [];
    if (!Array.isArray(payload.colors)) payload.colors = [];
    return payload;
  }

  function buildExportPayload() {
    // Les éléments 🔒 Privé / 🔑 Mot de passe ne sont jamais exportés
    const safeClips = clipItems.filter(item => {
      const cats = item.category || [];
      return !cats.includes('🔒 Private') && !cats.includes('🔑 Password');
    });
    return {
      v: 2,
      app: 'WorkBox',
      exportedAt: Date.now(),
      notes: notes.map(n => ({ title: n.title || 'Note', content: n.content || '', color: n.color || null, createdAt: n.createdAt || null })),
      clipItems: safeClips.map(c => ({ text: c.text, category: c.category || [], timestamp: c.timestamp || Date.now() })),
      todoItems: todoItems.map(t => ({ text: t.text, done: !!t.done, priority: t.priority || 'normal', createdAt: t.createdAt || Date.now() })),
      colors: colorHistList.filter(c => c.pinned).map(c => c.hex)
    };
  }

  // Fusionne un payload importé (venant d'un lien ou d'un fichier .json) dans les données actuelles.
  // Rien n'est jamais écrasé : tout s'ajoute, les doublons exacts sont ignorés.
  function mergeImportedPayload(payload) {
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
    (payload.clipItems || []).forEach(c => {
      const normalized = String(c.text || '').replace(/\r/g, '');
      if (!normalized) return;
      const exists = clipItems.some(existing => existing.text.replace(/\r/g, '') === normalized);
      if (exists) return;
      clipItems.unshift({
        text: normalized,
        category: Array.isArray(c.category) ? c.category : ['📝 Text'],
        timestamp: c.timestamp || Date.now(),
        pinned: false
      });
      addedClips++;
    });

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

    saveNotes(true);
    saveClipboard(true);
    saveTodos();
    saveColorHistory();
    renderNoteTabs();
    if (notes.length) showNote(notes[notes.length - 1].id);
    renderClipCategories();
    renderClipList();
    renderColorHistory();

    return { addedNotes, addedClips, addedTodos, addedColors };
  }

  const copySecretKeyBtn = document.getElementById('copySecretKeyBtn');
  const importSecretKeyBtn = document.getElementById('importSecretKeyBtn');

  if (copySecretKeyBtn) {
    copySecretKeyBtn.addEventListener('click', async () => {
      const originalLabel = copySecretKeyBtn.textContent;
      try {
        copySecretKeyBtn.disabled = true;
        copySecretKeyBtn.textContent = '⏳ Generating...';
        const payload = buildExportPayload();
        const link = await encodeExportPayload(payload);
        await navigator.clipboard.writeText(link);
        showToast(`🔗 Link copied! (${payload.notes.length} note(s), ${payload.clipItems.length} text(s), ${payload.todoItems.length} task(s), ${payload.colors.length} color(s), ${link.length} chars.)`);
      } catch (e) {
        showToast('Error generating the link.');
      } finally {
        copySecretKeyBtn.disabled = false;
        copySecretKeyBtn.textContent = originalLabel;
      }
    });
  }

  if (importSecretKeyBtn) {
    importSecretKeyBtn.addEventListener('click', async () => {
      const raw = prompt("Paste your WorkBox export link:\nNotes, texts, and tasks will be added to your current data (nothing is erased).");
      if (!raw || !raw.trim()) return;

      let payload;
      try {
        payload = await decodeExportLink(raw);
      } catch (e) {
        showToast('❌ Invalid or corrupted link.');
        return;
      }

      const { addedNotes, addedClips, addedTodos, addedColors } = mergeImportedPayload(payload);
      showToast(`✅ Import complete: ${addedNotes} note(s), ${addedClips} text(s), ${addedTodos} task(s), ${addedColors} color(s) added.`);
    });
  }

  const exportJsonFileBtn = document.getElementById('exportJsonFileBtn');
  const importJsonFileBtn = document.getElementById('importJsonFileBtn');
  const importJsonFileInput = document.getElementById('importJsonFileInput');

  if (exportJsonFileBtn) {
    exportJsonFileBtn.addEventListener('click', () => {
      const payload = buildExportPayload();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workbox-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`💾 File exported (${payload.notes.length} note(s), ${payload.clipItems.length} text(s), ${payload.todoItems.length} task(s), ${payload.colors.length} color(s)).`);
    });
  }

  if (importJsonFileBtn && importJsonFileInput) {
    importJsonFileBtn.addEventListener('click', () => importJsonFileInput.click());

    importJsonFileInput.addEventListener('change', async () => {
      const file = importJsonFileInput.files && importJsonFileInput.files[0];
      importJsonFileInput.value = '';
      if (!file) return;

      let payload;
      try {
        const text = await file.text();
        payload = validateImportPayload(JSON.parse(text));
      } catch (e) {
        showToast('❌ Invalid or corrupted file.');
        return;
      }

      const { addedNotes, addedClips, addedTodos, addedColors } = mergeImportedPayload(payload);
      showToast(`✅ Import complete: ${addedNotes} note(s), ${addedClips} text(s), ${addedTodos} task(s), ${addedColors} color(s) added.`);
    });
  }

  // ===== Compresseur d'images =====
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

    function showResult(text) {
      resultText.textContent = text;
      resultCard.style.display = 'block';
      emptyEl.style.display = 'none';
      openBtn.style.display = URL_RE.test(text.trim()) ? 'inline-flex' : 'none';
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
      let foundPattern = false;

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
        ctx.drawImage(source, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) return { text: code.data, foundPattern: true };

        if (!foundPattern && typeof jsQR.locateOnly === 'function') {
          foundPattern = jsQR.locateOnly(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        }
      }
      return { text: null, foundPattern };
    }

    async function decodeImage(source) {
      if (typeof jsQR !== 'function') {
        showToast('⚠️ QR decoding library not found.');
        return;
      }
      try {
        const { text, foundPattern } = decodeAtScales(source);

        if (!text) {
          // jsQR.locateOnly (patch WorkBox) dit si les 3 carrés de repérage
          // d'un QR code sont présents, même sans décodage réussi — permet
          // de dire "il y en a un mais il est invalide" plutôt qu'un message
          // générique qui laisserait croire que l'image ne contient rien.
          showToast(foundPattern
            ? "⚠️ A QR code seems to be present but it is invalid or damaged."
            : '❌ No QR code detected in this image.');
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

          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['qroverlay.js'] });
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
        if (progressLabel) progressLabel.textContent = `⏳ Compression... ${i + 1}/${list.length} · ${file.name}`;
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
          zipBtn.textContent = '⏳ Generating...';
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
          a.download = `workbox-images-compressees-${new Date().toISOString().slice(0, 10)}.zip`;
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

});
