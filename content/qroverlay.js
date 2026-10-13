// Injecté à la demande via chrome.scripting.executeScript (pas un content
// script statique) — chaque clic sur le bouton réinjecte une copie fraîche,
// donc pas de risque de script périmé sur un onglet déjà ouvert avant un
// rechargement de l'extension.
//
// Flow: WorkBox first looks for every QR code in the visible part of the
// page and frames them; the user clicks the one they want. A single code is
// opened straight away. Manual area selection stays as the fallback.
(function () {
  // Lancé à nouveau alors que les cadres sont affichés : on ferme et on rescanne.
  if (window.__workboxQrOverlayActive) {
    if (typeof window.__workboxQrClose !== 'function') return;
    window.__workboxQrClose();
  }
  window.__workboxQrOverlayActive = true;
  if (typeof window.__workboxQrDismissCard === 'function') window.__workboxQrDismissCard();

  // Alt+S asks for the manual selection directly.
  const forceManual = window.__workboxQrMode === 'manual';
  window.__workboxQrMode = null;

  const Z = 2147483647;
  const FONT = "-apple-system, 'Segoe UI', sans-serif";
  const MANUAL_HINT = 'Drag around the QR code — Esc to cancel';
  let overlay = null, hint = null, box = null;
  let extras = [];
  let cancelled = false;

  function makeHint(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      all: initial; position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: #16162a; color: #f0f0ff; font: 600 13px ${FONT};
      padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);
      z-index: ${Z}; pointer-events: none; box-shadow: 0 4px 14px rgba(0,0,0,0.3);
      max-width: calc(100vw - 32px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    `;
    return el;
  }

  function clearUi() {
    [overlay, hint, box].concat(extras).forEach((el) => { if (el) el.remove(); });
    overlay = hint = box = null;
    extras = [];
    picks = [];
    window.removeEventListener('resize', onScroll);
  }

  function cleanup() {
    cancelled = true;
    window.__workboxQrOverlayActive = false;
    window.__workboxQrClose = null;
    chrome.runtime.onMessage.removeListener(onScanning);
    clearUi();
    document.removeEventListener('keydown', onKeydown);
    // Sans ça, chaque nouvelle sélection (le bouton peut être recliqué
    // plusieurs fois sur la même page) empilait un listener QR_RESULT
    // supplémentaire qui ne serait jamais retiré — une vraie fuite mémoire
    // sur une page laissée ouverte longtemps.
    chrome.runtime.onMessage.removeListener(onQrResult);
  }

  let picks = []; // [{ code, frame }] while the frames are shown
  function onKeydown(e) {
    if (e.key === 'Escape') { cleanup(); return; }
    // 1-9 opens the code with that number, unless the user is typing somewhere.
    if (!e.isTrusted || e.ctrlKey || e.altKey || e.metaKey || !/^[1-9]$/.test(e.key)) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
    const p = picks[Number(e.key) - 1];
    if (p) { e.preventDefault(); pick(p.code, p.frame); }
  }
  function onScroll() { cleanup(); } // window resized: the frames would no longer match the page
  document.addEventListener('keydown', onKeydown);
  window.__workboxQrClose = cleanup;

  // ---------- automatic detection ----------

  // Visible pictures are scanned one by one (a small code inside a large
  // page is much easier to read that way); the background then also scans
  // the whole view for codes drawn any other way.
  function candidates() {
    const out = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    let nodes = [];
    try { nodes = document.querySelectorAll('img, canvas, svg, video, picture'); } catch (e) { }
    for (let i = 0; i < nodes.length && i < 1500 && out.length < 40; i++) {
      const r = nodes[i].getBoundingClientRect();
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      const w = Math.min(vw, r.right) - x, h = Math.min(vh, r.bottom) - y;
      if (w < 30 || h < 30) continue;
      if (w * h > vw * vh * 0.9) continue;
      out.push({ x, y, width: w, height: h });
    }
    return out;
  }

  // What the code is and whether its link looks risky, known before any click.
  function describe(text) {
    const type = detectType(text);
    let tone = 'ok';
    if (type.isUrl && typeof WBProtection !== 'undefined') {
      const t = text.trim();
      let v = null;
      try { v = WBProtection.evaluate(/^www\./i.test(t) ? 'https://' + t : t); } catch (e) { }
      if (v && v.type === 'danger') tone = 'bad';
      else if (v && v.type === 'adult') tone = 'warn';
    }
    const rick = tone === 'ok' && type.isUrl && typeof WBProtection !== 'undefined' && WBProtection.isRickroll && WBProtection.isRickroll(text);
    const label = tone === 'bad' ? '⚠️ Risky link' : tone === 'warn' ? '🔞 Adult site' : rick ? '🎵 Rickroll' : type.label;
    return { label, tone };
  }
  const TONES = {
    ok: { line: '#a78bfa', glow: '124,58,237', chip: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
    warn: { line: '#f59e0b', glow: '245,158,11', chip: 'linear-gradient(135deg, #fbbf24, #d97706)' },
    bad: { line: '#ef4444', glow: '239,68,68', chip: 'linear-gradient(135deg, #f87171, #dc2626)' }
  };

  // The frames stay after a choice, so another code can be opened next.
  function pick(code, frame) {
    chrome.runtime.sendMessage({ type: 'QR_PICKED', text: code.text }).catch(() => {});
    picks.forEach((p) => p.frame.__wbSelect(p.frame === frame));
    const r = frame.getBoundingClientRect();
    showResultCard({ x: r.left, y: r.top, width: r.width, height: r.height }, true, code.text);
  }

  // Placed in page coordinates: a frame follows its code when the page scrolls.
  function frameFor(code, index) {
    const pad = 6;
    const info = describe(code.text);
    const c = TONES[info.tone];
    const rest = `0 0 0 2px rgba(255,255,255,0.9), 0 0 20px rgba(${c.glow},0.75)`;
    const strong = `0 0 0 3px #fff, 0 0 0 7px rgba(${c.glow},0.55), 0 0 34px rgba(${c.glow},1)`;
    const f = document.createElement('div');
    f.style.cssText = `
      all: initial; position: absolute; box-sizing: border-box; z-index: ${Z - 1};
      left: ${Math.max(2, code.x - pad + window.scrollX)}px; top: ${Math.max(2, code.y - pad + window.scrollY)}px;
      width: ${code.width + pad * 2}px; height: ${code.height + pad * 2}px;
      border: 3px solid ${c.line}; border-radius: 12px;
      background: rgba(${c.glow}, 0.10); box-shadow: ${rest};
      cursor: pointer; transition: background 0.15s ease, box-shadow 0.2s ease;
    `;
    f.setAttribute('role', 'button');
    f.setAttribute('tabindex', '0');
    f.setAttribute('aria-label', 'QR code ' + (index + 1) + ', ' + info.label.replace(/^[^A-Za-z]+/, ''));
    const n = document.createElement('div');
    n.textContent = (index + 1) + ' · ' + info.label;
    n.style.cssText = `
      all: initial; position: absolute; top: -13px; left: -8px; height: 22px; padding: 0 9px;
      border-radius: 999px; background: ${c.chip}; color: #fff; white-space: nowrap;
      font: 700 11px/22px ${FONT}; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      pointer-events: none;
    `;
    f.appendChild(n);
    let selected = false;
    f.__wbSelect = (on) => { selected = on; f.style.boxShadow = on ? strong : rest; };
    f.addEventListener('mouseenter', () => { f.style.background = `rgba(${c.glow}, 0.26)`; });
    f.addEventListener('mouseleave', () => { f.style.background = `rgba(${c.glow}, 0.10)`; });
    // Synthetic clicks are ignored: the page must not choose for the user.
    f.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (e.isTrusted) pick(code, f); });
    f.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    f.addEventListener('keydown', (e) => { if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); pick(code, f); } });
    try {
      f.animate([{ opacity: 0, transform: 'scale(1.22)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 300, delay: index * 70, fill: 'backwards', easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.25)' });
    } catch (e) { }
    return f;
  }

  // Small bar at the bottom: count, scan again (after scrolling to other
  // codes), manual selection, close.
  function makeBar(count) {
    const bar = document.createElement('div');
    bar.id = 'workbox-qr-bar';
    bar.style.cssText = `
      all: initial; position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
      z-index: ${Z}; display: flex; align-items: center; gap: 6px;
      background: #16162a; color: #f0f0ff; font: 600 13px ${FONT};
      padding: 6px 6px 6px 14px; border-radius: 999px; border: 1px solid rgba(167,139,250,0.55);
      box-shadow: 0 6px 18px rgba(0,0,0,0.4); white-space: nowrap;
    `;
    const label = document.createElement('span');
    label.textContent = count + (count === 1 ? ' QR code' : ' QR codes');
    label.style.cssText = `all: initial; color: #c4b5fd; font: 700 13px ${FONT}; margin-right: 6px;`;
    bar.appendChild(label);
    const btn = (text, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = `
        all: initial; font: 600 12.5px ${FONT}; color: #f0f0ff; cursor: pointer;
        padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,0.08);
      `;
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255,255,255,0.18)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'rgba(255,255,255,0.08)'; });
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); if (e.isTrusted) fn(); });
      bar.appendChild(b);
    };
    btn('Scan again', () => { dismissCard(); clearUi(); start(); });
    btn('Select an area', () => { dismissCard(); clearUi(); startManual(MANUAL_HINT); });
    btn('Close (Esc)', () => { dismissCard(); cleanup(); });
    try { bar.animate([{ opacity: 0, transform: 'translate(-50%, 14px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 240, easing: 'ease-out' }); } catch (e) { }
    return bar;
  }

  function dismissCard() {
    if (typeof window.__workboxQrDismissCard === 'function') window.__workboxQrDismissCard();
  }

  function showPicker(codes) {
    codes.forEach((c, i) => {
      const f = frameFor(c, i);
      extras.push(f);
      picks.push({ code: c, frame: f });
      document.documentElement.appendChild(f);
    });
    const bar = makeBar(codes.length);
    extras.push(bar);
    document.documentElement.appendChild(bar);
    window.addEventListener('resize', onScroll);
    if (codes.length === 1) {
      // One code only: open it right away, the frame stays.
      pick(codes[0], picks[0].frame);
    } else {
      hint = makeHint(codes.length + ' QR codes found — click one, or press its number');
      document.documentElement.appendChild(hint);
      const h = hint;
      setTimeout(() => { if (hint === h) { h.remove(); hint = null; } }, 3500);
    }
  }

  // Shown only once the background has taken its screenshot, so the message
  // never hides a code.
  function onScanning(msg) {
    if (!msg || msg.type !== 'QR_SCANNING' || cancelled || hint) return;
    hint = makeLoader();
    document.documentElement.appendChild(hint);
    loaderAt = Date.now();
  }

  // Whole-page cloud of small points in depth, slowly rising, crossed by a
  // soft band of light that climbs the page — shown while it is analysed.
  let loaderAt = 0;
  function makeLoader() {
    const wrap = document.createElement('div');
    wrap.id = 'workbox-qr-loader';
    wrap.style.cssText = `
      all: initial; position: fixed; inset: 0; z-index: ${Z}; pointer-events: none;
      background: rgba(12, 10, 28, 0.42);
    `;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.cssText = `all: initial; position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px;`;
    const label = document.createElement('div');
    label.textContent = 'Looking for QR codes…';
    label.style.cssText = `
      all: initial; position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
      background: rgba(22, 22, 42, 0.92); color: #e9e6ff; font: 600 13px ${FONT};
      padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(167,139,250,0.4);
      box-shadow: 0 6px 18px rgba(0,0,0,0.35); white-space: nowrap;
    `;
    wrap.appendChild(cv); wrap.appendChild(label);
    try { wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' }); } catch (e) { }

    // z: 0 = far (small, slow, faint) … 1 = near
    const N = Math.max(120, Math.min(520, Math.round(W * H / 2600)));
    const pts = [];
    for (let i = 0; i < N; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random(), ph: Math.random() * 6.28 });
    const ctx = cv.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let prev = performance.now();
    const t0 = prev;
    function draw(now) {
      if (!wrap.isConnected) return;
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const t = (now - t0) / 1000;
      const bandY = H * 1.15 - ((t * 0.16) % 1) * H * 1.3; // climbs the page in about six seconds
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        if (!calm) {
          p.y -= (7 + p.z * 22) * dt; // points lift, the near ones faster
          if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
        }
        const x = p.x + Math.sin(t * 0.5 + p.ph) * (3 + p.z * 7);
        const lit = Math.max(0, 1 - Math.abs(p.y - bandY) / 90);
        const tw = 0.75 + 0.25 * Math.sin(t * 1.3 + p.ph * 3);
        ctx.globalAlpha = Math.min(0.95, (0.30 + p.z * 0.50) * tw + lit * 0.5);
        ctx.fillStyle = lit > 0.5 ? '#ffffff' : '#c4b5fd';
        ctx.beginPath(); ctx.arc(x, p.y, 0.6 + p.z * 1.0 + lit * 0.5, 0, 6.2832); ctx.fill();
      }
      if (!calm) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    return wrap;
  }

  function findAll() {
    chrome.runtime.sendMessage({
      type: 'QR_FIND_ALL',
      vw: window.innerWidth,
      vh: window.innerHeight,
      rects: candidates()
    }).then((res) => {
      chrome.runtime.onMessage.removeListener(onScanning);
      if (cancelled) return;
      // A very fast answer would make the animation flash: leave it a moment.
      const wait = loaderAt ? Math.max(0, 1300 - (Date.now() - loaderAt)) : 0;
      loaderAt = 0;
      setTimeout(() => {
        if (cancelled) return;
        clearUi();
        // No answer at all: the extension was updated but not reloaded, or the
        // screenshot was refused. Say so instead of pretending nothing was found.
        if (!res || !res.ok) { startManual('Automatic detection unavailable (reload WorkBox) — drag around the QR code'); return; }
        const codes = Array.isArray(res.codes) ? res.codes : [];
        if (codes.length === 0) startManual('No QR code found automatically — drag around it (Esc to cancel)');
        else showPicker(codes);
      }, wait);
    }).catch(() => {
      chrome.runtime.onMessage.removeListener(onScanning);
      if (!cancelled) { clearUi(); startManual(MANUAL_HINT); }
    });
  }
  // Two frames so that a result card or old frames just removed are no
  // longer on screen when the background photographs the tab.
  function start() {
    cancelled = false;
    chrome.runtime.onMessage.addListener(onScanning);
    requestAnimationFrame(() => requestAnimationFrame(findAll));
  }
  if (forceManual) startManual(MANUAL_HINT); else start();

  // ---------- manual area selection (fallback) ----------

  function startManual(hintText) {
  overlay = document.createElement('div');
  overlay.id = 'workbox-qr-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(10, 10, 20, 0.35); cursor: crosshair;
  `;

  hint = makeHint(hintText);

  box = document.createElement('div');
  box.style.cssText = `
    position: fixed; display: none; border: 2px solid #7c3aed;
    background: rgba(124, 58, 237, 0.15); z-index: 2147483647; pointer-events: none;
  `;

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(hint);
  document.documentElement.appendChild(box);

  let startX = 0, startY = 0, dragging = false;

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

    hint.textContent = 'Analyzing…';
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
  } // startManual

  // Petit badge qui dit ce qu'est le contenu détecté (lien, email, etc.) —
  // remplace l'ancien libellé générique "Contenu détecté" qui ne disait rien
  // sur ce que les boutons allaient faire. Same rules and labels as classifyQr
  // in the popup scanner.
  function detectType(text) {
    const t = text.trim();
    if (/^(https?:\/\/|www\.)[^\s]+$/i.test(t)) return { label: '🔗 Web link', isUrl: true };
    if (/^wifi:/i.test(t)) return { label: '📶 Wi-Fi network', wifi: parseWifi(t) };
    if (/^BEGIN:VCARD/i.test(t) || /^MECARD:/i.test(t)) return { label: '👤 Contact card' };
    if (/^BEGIN:VEVENT/i.test(t) || /^BEGIN:VCALENDAR/i.test(t)) return { label: '📅 Calendar event' };
    if (/^mailto:/i.test(t) || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t)) return { label: '✉️ Email' };
    if (/^tel:/i.test(t) || /^(\+|0)[0-9\s().-]{8,18}$/.test(t)) return { label: '📞 Phone number' };
    if (/^(smsto|sms):/i.test(t)) return { label: '💬 Text message' };
    if (/^geo:/i.test(t)) return { label: '📍 Location' };
    if (/^(?!https?:)[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(t)) return { label: '🧩 App link', warn: 'Opens another app. Only use it if you trust the source.' };
    return { label: '📝 Text' };
  }

  // WIFI:T:WPA;S:name;P:pass;; — fields are separated by ";" and a backslash
  // escapes the next character, so a ";" or ":" inside a value is not a separator.
  function parseWifi(t) {
    const fields = {};
    let cur = '';
    const push = () => {
      const m = cur.match(/^([A-Za-z]):/);
      if (m && !(m[1].toUpperCase() in fields)) {
        let out = '';
        const raw = cur.slice(2);
        for (let i = 0; i < raw.length; i++) out += raw[i] === '\\' && i + 1 < raw.length ? raw[++i] : raw[i];
        fields[m[1].toUpperCase()] = out;
      }
      cur = '';
    };
    const src = t.replace(/^wifi:/i, '');
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '\\' && i + 1 < src.length) { cur += src[i] + src[++i]; continue; }
      if (src[i] === ';') push(); else cur += src[i];
    }
    push();
    const sec = fields.T || '';
    const open = !sec || /^nopass$/i.test(sec);
    let pass = open ? '' : (fields.P || '');
    if (pass.length >= 2 && pass.startsWith('"') && pass.endsWith('"')) pass = pass.slice(1, -1);
    return { name: fields.S || '', sec: open ? '' : sec, pass };
  }

  function showResultCard(rect, success, text) {
    if (typeof window.__workboxQrDismissCard === 'function') window.__workboxQrDismissCard();
    const existing = document.getElementById('workbox-qr-result-card');
    if (existing) existing.remove();

    // The card lives in a closed shadow root: the page cannot read the decoded
    // text or the Wi-Fi password, nor rewrite the safety verdict.
    const host = document.createElement('div');
    host.id = 'workbox-qr-result-card';
    const top = Math.min(window.innerHeight - 180, rect.y + rect.height + 12);
    host.style.cssText = `
      all: initial; position: fixed; top: ${Math.max(12, top)}px; left: ${Math.max(12, rect.x)}px;
      z-index: 2147483647; display: block;
    `;
    const shadow = host.attachShadow({ mode: 'closed' });

    const card = document.createElement('div');
    card.style.cssText = `
      position: relative; box-sizing: border-box;
      width: 338px; max-width: calc(100vw - 24px); background: rgba(20, 20, 38, 0.94); backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px); color: #f0f0ff;
      font: 13px -apple-system, 'Segoe UI', sans-serif; border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1); padding: 16px;
      box-shadow: 0 20px 45px rgba(0,0,0,0.45);
    `;
    shadow.appendChild(card);

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

    // Safety verdict for links (same engine as the Protection tool) and
    // readable details for Wi-Fi codes, shown before any button.
    let risky = false;
    const wifi = success ? type.wifi : null;
    const note = (msg, tone) => {
      const el = document.createElement('div');
      el.textContent = msg;
      const tones = {
        bad: 'color:#fecaca; background:rgba(239,68,68,0.16); border:1px solid rgba(239,68,68,0.45); font-weight:600;',
        warn: 'color:#fcd34d; background:rgba(245,158,11,0.12);',
        ok: 'color:#86efac; background:rgba(34,197,94,0.10);',
        info: 'color:#c9c9e6; background:rgba(255,255,255,0.05);'
      };
      el.style.cssText = 'font-size:12px; line-height:1.45; border-radius:10px; padding:8px 10px; margin-bottom:12px; white-space:pre-wrap; word-break:break-word;' + tones[tone];
      card.appendChild(el);
    };
    if (success && type.isUrl) {
      const t = text.trim();
      let v = null;
      if (typeof WBProtection !== 'undefined') {
        try { v = WBProtection.evaluate(/^www\./i.test(t) ? 'https://' + t : t); } catch (e) { }
      }
      if (v && v.type === 'danger') {
        risky = true;
        note('⚠️ This link looks dangerous. ' + (v.reason || '') + ' Do not open it unless you are sure of the source.', 'bad');
        card.style.borderColor = 'rgba(239,68,68,0.6)';
      } else if (v && v.type === 'adult') {
        risky = true;
        note('🔞 This link points to an adult website.', 'warn');
        card.style.borderColor = 'rgba(245,158,11,0.6)';
      } else if (/^http:\/\//i.test(t)) {
        note('This link is not encrypted (http). Avoid typing passwords on it.', 'warn');
      } else if (typeof WBProtection !== 'undefined' && WBProtection.isRickroll && WBProtection.isRickroll(t)) {
        note(WBProtection.RICKROLL_MSG, 'info');
        badge.textContent = '🎵 Rickroll';
      } else if (typeof WBProtection !== 'undefined') {
        note('✓ No warning sign found in this address.', 'ok');
      }
    } else if (wifi) {
      note('Network: ' + (wifi.name || '?') + '\nSecurity: ' + (wifi.sec || 'open') + (wifi.pass ? '\nPassword: ' + wifi.pass : ''), 'info');
    } else if (success && type.warn) {
      note(type.warn, 'warn');
    }

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

      // Every action below ignores synthetic clicks: a page script must not be
      // able to copy the content or open the link by itself.
      // navigator.clipboard does not exist on plain-http pages: fall back to a hidden field
      const copyText = (t) => {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
        return new Promise((resolve, reject) => {
          const ta = document.createElement('textarea');
          ta.value = t; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed; top:0; left:0; opacity:0; pointer-events:none;';
          document.documentElement.appendChild(ta); ta.select();
          let ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
          ta.remove(); ok ? resolve() : reject(new Error('copy failed'));
        });
      };
      const copyBtn = mkBtn('📄 Copy', (!type.isUrl && !(wifi && wifi.pass)) || risky);
      copyBtn.addEventListener('click', (e) => {
        if (!e.isTrusted) return;
        copyText(text).then(() => { copyBtn.textContent = '✅ Copied'; }).catch(() => {});
      });
      actions.appendChild(copyBtn);

      if (wifi && wifi.pass) {
        copyBtn.textContent = '📄 Copy all';
        const passBtn = mkBtn('🔑 Copy password', true);
        passBtn.addEventListener('click', (e) => {
          if (!e.isTrusted) return;
          copyText(wifi.pass).then(() => { passBtn.textContent = '✅ Copied'; }).catch(() => {});
        });
        actions.appendChild(passBtn);
      }

      if (type.isUrl) {
        const openBtn = mkBtn(risky ? 'Open anyway' : '🔗 Open', !risky);
        openBtn.addEventListener('click', (e) => {
          if (!e.isTrusted) return;
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
    closeBtn.addEventListener('click', (e) => { if (e.isTrusted) dismiss(); });
    card.appendChild(closeBtn);

    document.documentElement.appendChild(host);

    // Placed with its real size (verdict, Wi-Fi details and narrow windows
    // change it) so it never leaves the window on the right or at the bottom.
    const size = host.getBoundingClientRect();
    if (size.width) host.style.left = Math.max(12, Math.min(window.innerWidth - size.width - 12, rect.x)) + 'px';
    if (size.height && size.bottom > window.innerHeight - 12) host.style.top = Math.max(12, window.innerHeight - size.height - 12) + 'px';

    // Un clic n'importe où en dehors de la carte la ferme aussi — pas
    // besoin de viser précisément le petit bouton rond.
    function onOutsideClick(e) {
      if (e.target !== host && !host.contains(e.target)) dismiss();
    }
    function onCardKeydown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
    }
    function dismiss() {
      host.remove();
      document.removeEventListener('mousedown', onOutsideClick, true);
      document.removeEventListener('keydown', onCardKeydown, true);
      clearTimeout(autoTimer);
      if (window.__workboxQrDismissCard === dismiss) window.__workboxQrDismissCard = null;
    }
    window.__workboxQrDismissCard = dismiss;
    document.addEventListener('keydown', onCardKeydown, true);
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
