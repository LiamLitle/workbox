// Injecté à la demande via chrome.scripting.executeScript (pas un content
// script statique) — chaque clic sur le bouton réinjecte une copie fraîche,
// donc pas de risque de script périmé sur un onglet déjà ouvert avant un
// rechargement de l'extension.
(function () {
  if (window.__workboxQrOverlayActive) return; // déjà une sélection en cours
  window.__workboxQrOverlayActive = true;

  const overlay = document.createElement('div');
  overlay.id = 'workbox-qr-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(10, 10, 20, 0.35); cursor: crosshair;
  `;

  const hint = document.createElement('div');
  hint.textContent = '🔳 Drag around the QR code — Esc to cancel';
  hint.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: #16162a; color: #f0f0ff; font: 600 13px -apple-system, 'Segoe UI', sans-serif;
    padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);
    z-index: 2147483647; pointer-events: none; box-shadow: 0 4px 14px rgba(0,0,0,0.3);
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    position: fixed; display: none; border: 2px solid #7c3aed;
    background: rgba(124, 58, 237, 0.15); z-index: 2147483647; pointer-events: none;
  `;

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(hint);
  document.documentElement.appendChild(box);

  let startX = 0, startY = 0, dragging = false;

  function cleanup() {
    window.__workboxQrOverlayActive = false;
    overlay.remove();
    hint.remove();
    box.remove();
    document.removeEventListener('keydown', onKeydown);
    // Sans ça, chaque nouvelle sélection (le bouton peut être recliqué
    // plusieurs fois sur la même page) empilait un listener QR_RESULT
    // supplémentaire qui ne serait jamais retiré — une vraie fuite mémoire
    // sur une page laissée ouverte longtemps.
    chrome.runtime.onMessage.removeListener(onQrResult);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') cleanup();
  }
  document.addEventListener('keydown', onKeydown);

  overlay.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    box.style.display = 'block';
    box.style.left = startX + 'px';
    box.style.top = startY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = Math.abs(e.clientX - startX) + 'px';
    box.style.height = Math.abs(e.clientY - startY) + 'px';
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;

    const rect = {
      x: Math.min(startX, e.clientX),
      y: Math.min(startY, e.clientY),
      width: Math.abs(e.clientX - startX),
      height: Math.abs(e.clientY - startY)
    };

    if (rect.width < 10 || rect.height < 10) { cleanup(); return; } // clic accidentel

    hint.textContent = '⏳ Analyzing…';
    box.style.borderStyle = 'dashed';

    // On masque l'overlay le temps de la capture : captureVisibleTab
    // photographierait sinon notre propre rectangle de sélection.
    overlay.style.background = 'transparent';
    box.style.display = 'none';

    // Deux requestAnimationFrame de suite : le premier planifie juste avant
    // le prochain rendu, le second garantit que ce rendu (overlay devenu
    // transparent) a bien été peint avant que captureVisibleTab ne lise
    // l'écran côté background — sinon on risque de capturer notre propre
    // rectangle de sélection encore visible.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({
          type: 'QR_AREA_SELECTED',
          rect,
          dpr: window.devicePixelRatio || 1
        }).catch(() => {
          // Sans cleanup() ici, __workboxQrOverlayActive restait bloqué à
          // true pour toujours en cas d'échec (extension rechargée pendant
          // la sélection, etc.) — plus aucune nouvelle sélection n'était
          // possible sur cette page tant qu'elle n'était pas rechargée.
          showResultCard(rect, false, 'Unable to reach the extension. Try again after reloading the page.');
          cleanup();
        });
      });
    });
  });

  // Petit badge qui dit ce qu'est le contenu détecté (lien, email, etc.) —
  // remplace l'ancien libellé générique "Contenu détecté" qui ne disait rien
  // sur ce que les boutons allaient faire.
  function detectType(text) {
    const t = text.trim();
    if (/^(https?:\/\/|www\.)[^\s]+$/i.test(t)) return { label: '🔗 Web link', isUrl: true };
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t)) return { label: '✉️ Email address', isUrl: false };
    if (/^(\+|0)[0-9\s().-]{8,18}$/.test(t)) return { label: '📞 Phone number', isUrl: false };
    if (/^wifi:/i.test(t)) return { label: '📶 Wi-Fi network', isUrl: false };
    return { label: '📝 Text', isUrl: false };
  }

  function showResultCard(rect, success, text) {
    const existing = document.getElementById('workbox-qr-result-card');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = 'workbox-qr-result-card';
    const top = Math.min(window.innerHeight - 180, rect.y + rect.height + 12);
    const left = Math.min(window.innerWidth - 328, rect.x);
    card.style.cssText = `
      position: fixed; top: ${Math.max(12, top)}px; left: ${Math.max(12, left)}px;
      width: 304px; background: rgba(20, 20, 38, 0.94); backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px); color: #f0f0ff;
      font: 13px -apple-system, 'Segoe UI', sans-serif; border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1); padding: 16px;
      z-index: 2147483647; box-shadow: 0 20px 45px rgba(0,0,0,0.45);
    `;

    const type = success ? detectType(text) : null;

    const badge = document.createElement('div');
    badge.textContent = success ? type.label : '⚠️ Result';
    badge.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; color: #c4b5fd;
      background: rgba(124, 58, 237, 0.16); padding: 5px 11px; border-radius: 999px;
      margin: 0 30px 12px 0;
    `;
    card.appendChild(badge);

    const body = document.createElement('div');
    body.textContent = text;
    body.style.cssText = success
      ? 'word-break: break-word; white-space: pre-wrap; background: rgba(0,0,0,0.22); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; max-height: 120px; overflow-y: auto; font-size: 13px; line-height: 1.45;'
      : 'word-break: break-word; color: #b8b8d0; line-height: 1.5; margin-bottom: 4px; font-size: 12.5px;';
    card.appendChild(body);

    if (success) {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:8px;';

      const mkBtn = (label, primary) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = `
          flex: 1; border: none; border-radius: 10px; padding: 9px 10px;
          font: 700 12px inherit; cursor: pointer; transition: filter 0.15s ease;
          ${primary
            ? 'background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff; box-shadow: 0 4px 14px rgba(124,58,237,0.4);'
            : 'background: rgba(255,255,255,0.08); color: #f0f0ff;'}
        `;
        b.addEventListener('mouseenter', () => { b.style.filter = 'brightness(1.12)'; });
        b.addEventListener('mouseleave', () => { b.style.filter = 'none'; });
        return b;
      };

      const copyBtn = mkBtn('📄 Copy', !type.isUrl);
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = '✅ Copied'; });
      });
      actions.appendChild(copyBtn);

      if (type.isUrl) {
        const openBtn = mkBtn('🔗 Open', true);
        openBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'QR_OPEN_LINK', url: text }).catch(() => {});
        });
        actions.appendChild(openBtn);
      }

      card.appendChild(actions);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = `
      position: absolute; top: 10px; right: 10px; width: 26px; height: 26px;
      border: none; border-radius: 50%; background: rgba(255,255,255,0.07);
      color: #a3a3c2; cursor: pointer; font-size: 12px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    `;
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(255,255,255,0.16)'; closeBtn.style.color = '#fff'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(255,255,255,0.07)'; closeBtn.style.color = '#a3a3c2'; });
    closeBtn.addEventListener('click', () => dismiss());
    card.appendChild(closeBtn);

    document.documentElement.appendChild(card);

    // Un clic n'importe où en dehors de la carte la ferme aussi — pas
    // besoin de viser précisément le petit bouton rond.
    function onOutsideClick(e) {
      if (!card.contains(e.target)) dismiss();
    }
    function dismiss() {
      card.remove();
      document.removeEventListener('mousedown', onOutsideClick, true);
      clearTimeout(autoTimer);
    }
    // Ajouté au tick suivant pour ne pas capter le mouseup qui vient tout
    // juste de faire apparaître la carte.
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
    const autoTimer = setTimeout(dismiss, 15000);
  }

  function onQrResult(msg) {
    if (msg.type !== 'QR_RESULT') return;
    const rect = msg.rect || { x: 20, y: 20, width: 0, height: 0 };
    showResultCard(rect, msg.success, msg.success ? msg.text : (msg.error || 'No QR code detected.'));
    cleanup();
  }
  chrome.runtime.onMessage.addListener(onQrResult);
})();
