// QR code styling engine. Turns a module matrix (from lib/qrcode.js) into vector
// shapes, then paints them on a canvas or serialises them as SVG.
(function (root) {
  const f = (n) => Math.round(n * 1000) / 1000;

  function makeMatrix(text, ec) {
    const qr = root.qrcode(0, ec);
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const rows = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return rows;
  }

  // ---- path helpers (module units, SVG path syntax so canvas Path2D can reuse them)
  function rrect(x, y, w, h, r) {
    const [a, b, c, d] = r;
    let p = 'M' + f(x + a) + ',' + f(y) + 'H' + f(x + w - b);
    if (b) p += 'A' + f(b) + ',' + f(b) + ' 0 0 1 ' + f(x + w) + ',' + f(y + b);
    p += 'V' + f(y + h - c);
    if (c) p += 'A' + f(c) + ',' + f(c) + ' 0 0 1 ' + f(x + w - c) + ',' + f(y + h);
    p += 'H' + f(x + d);
    if (d) p += 'A' + f(d) + ',' + f(d) + ' 0 0 1 ' + f(x) + ',' + f(y + h - d);
    p += 'V' + f(y + a);
    if (a) p += 'A' + f(a) + ',' + f(a) + ' 0 0 1 ' + f(x + a) + ',' + f(y);
    return p + 'Z';
  }
  const rect = (x, y, w, h) => 'M' + f(x) + ',' + f(y) + 'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'Z';
  function circle(cx, cy, r) {
    return 'M' + f(cx - r) + ',' + f(cy) + 'a' + f(r) + ',' + f(r) + ' 0 1,0 ' + f(2 * r) + ',0a' + f(r) + ',' + f(r) + ' 0 1,0 ' + f(-2 * r) + ',0Z';
  }

  // Extra dot shapes, each drawn inside one module (x, y = its top-left corner).
  function poly(pts) { return 'M' + pts.map((p) => f(p[0]) + ',' + f(p[1])).join('L') + 'Z'; }
  const DOT_SHAPES = {
    diamond: (x, y) => poly([[x + 0.5, y - 0.04], [x + 1.04, y + 0.5], [x + 0.5, y + 1.04], [x - 0.04, y + 0.5]]),
    star: (x, y) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.3 : 0.58;
        pts.push([x + 0.5 + Math.cos(a) * r, y + 0.52 + Math.sin(a) * r]);
      }
      return poly(pts);
    },
    heart: (x, y) => 'M' + f(x + 0.5) + ',' + f(y + 0.98) +
      'C' + f(x - 0.25) + ',' + f(y + 0.45) + ' ' + f(x + 0.12) + ',' + f(y - 0.1) + ' ' + f(x + 0.5) + ',' + f(y + 0.3) +
      'C' + f(x + 0.88) + ',' + f(y - 0.1) + ' ' + f(x + 1.25) + ',' + f(y + 0.45) + ' ' + f(x + 0.5) + ',' + f(y + 0.98) + 'Z',
    classy: (x, y) => rrect(x, y, 1, 1, [0.46, 0, 0.46, 0])
  };

  const EYE_FRAME = {
    square: (x, y) => rect(x, y, 7, 7) + rect(x + 1, y + 1, 5, 5),
    rounded: (x, y) => rrect(x, y, 7, 7, [2.2, 2.2, 2.2, 2.2]) + rrect(x + 1, y + 1, 5, 5, [1.3, 1.3, 1.3, 1.3]),
    circle: (x, y) => circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5),
    leaf: (x, y) => rrect(x, y, 7, 7, [2.8, 0, 2.8, 0]) + rrect(x + 1, y + 1, 5, 5, [1.6, 0, 1.6, 0])
  };
  const EYE_BALL = {
    square: (x, y) => rect(x + 2, y + 2, 3, 3),
    rounded: (x, y) => rrect(x + 2, y + 2, 3, 3, [1, 1, 1, 1]),
    circle: (x, y) => circle(x + 3.5, y + 3.5, 1.5),
    leaf: (x, y) => rrect(x + 2, y + 2, 3, 3, [1.3, 0, 1.3, 0])
  };

  const DEFAULTS = {
    margin: 3, moduleStyle: 'square', eyeFrame: 'square', eyeBall: 'square', shape: 'square',
    fg1: '#000000', fg2: '#000000', gradient: false, direction: 'diagonal',
    eyeColor: null, bg: '#ffffff', transparent: false,
    logo: null // { scale, shape, w, h }
  };

  // Returns everything needed to paint: shapes as path strings plus layout.
  const isFinderZone = (r, c, n) => (r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9);

  function buildShapes(matrix, userOpts) {
    const o = Object.assign({}, DEFAULTS, userOpts);
    const n = matrix.length;
    // Round code: the real code stays a square in the middle, with its quiet
    // zone, and the rest of the disc is filled with dots that carry no data.
    const round = o.shape === 'circle';
    const quiet = round ? Math.max(2, Math.min(4, o.margin)) : 0;
    const m = round ? Math.ceil((n / 2 + quiet) * Math.SQRT2 - n / 2) : o.margin;
    const total = n + 2 * m;

    // Logo knock-out zone (in matrix coordinates), kept away from the finder corners.
    let hole = null;
    if (o.logo) {
      const side = Math.min(0.3, Math.max(0.08, o.logo.scale)) * n;
      const pad = 0.6;
      hole = { x0: (n - side) / 2 - pad, x1: (n + side) / 2 + pad, y0: (n - side) / 2 - pad, y1: (n + side) / 2 + pad, side };
    }
    const inHole = (r, c) => hole && c + 0.5 > hole.x0 && c + 0.5 < hole.x1 && r + 0.5 > hole.y0 && r + 0.5 < hole.y1;
    const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    // Timing lines and alignment patterns stay solid squares in dots/bars styles:
    // readers lock onto them, and round shapes there make codes noticeably harder to scan.
    const solid = new Set();
    if (o.moduleStyle !== 'square' && o.moduleStyle !== 'rounded') {
      const D = (r, c) => r >= 0 && c >= 0 && r < n && c < n && matrix[r][c];
      for (let r = 2; r < n - 2; r++) for (let c = 2; c < n - 2; c++) {
        if (isFinderZone(r, c, n) || !D(r, c)) continue;
        let ok = true;
        for (let dr = -2; ok && dr <= 2; dr++) for (let dc = -2; ok && dc <= 2; dc++) {
          if (D(r + dr, c + dc) !== (Math.max(Math.abs(dr), Math.abs(dc)) !== 1)) ok = false;
        }
        if (ok) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) solid.add((r + dr) * 1000 + (c + dc));
      }
      for (let i = 0; i < n; i++) { solid.add(6 * 1000 + i); solid.add(i * 1000 + 6); }
    }
    const isSolid = (r, c) => solid.has(r * 1000 + c);
    const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && matrix[r][c] && !isFinder(r, c) && !inHole(r, c);

    let modules = '';
    const BAR = 0.84;
    if (o.moduleStyle === 'bars') {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (isSolid(r, c) && dark(r, c)) modules += rect(m + c, m + r, 1, 1);
      for (let c = 0; c < n; c++) {
        let r = 0;
        while (r < n) {
          if (!dark(r, c) || isSolid(r, c)) { r++; continue; }
          const start = r;
          while (r < n && dark(r, c) && !isSolid(r, c)) r++;
          modules += rrect(m + c + (1 - BAR) / 2, m + start + 0.05, BAR, r - start - 0.1, [BAR / 2, BAR / 2, BAR / 2, BAR / 2]);
        }
      }
    } else {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!dark(r, c)) continue;
          const x = m + c, y = m + r;
          if (isSolid(r, c)) modules += rect(x, y, 1, 1);
          else if (o.moduleStyle === 'dots') modules += circle(x + 0.5, y + 0.5, 0.45);
          else if (DOT_SHAPES[o.moduleStyle]) modules += DOT_SHAPES[o.moduleStyle](x, y);
          else if (o.moduleStyle === 'rounded') {
            const up = dark(r - 1, c), dn = dark(r + 1, c), lf = dark(r, c - 1), rt = dark(r, c + 1);
            const k = 0.34;
            modules += rrect(x, y, 1, 1, [!up && !lf ? k : 0, !up && !rt ? k : 0, !dn && !rt ? k : 0, !dn && !lf ? k : 0]);
          } else modules += rect(x, y, 1, 1);
        }
      }
    }

    if (round) {
      const R = total / 2 - 0.55, mid = n / 2;
      for (let r = -m; r < n + m; r++) {
        for (let c = -m; c < n + m; c++) {
          if (r >= -quiet && r < n + quiet && c >= -quiet && c < n + quiet) continue;
          const dx = c + 0.5 - mid, dy = r + 0.5 - mid;
          if (dx * dx + dy * dy > R * R) continue;
          // fixed pattern for a given code: same picture every time it is drawn
          let h = (Math.imul(r + 977, 73856093) ^ Math.imul(c + 331, 19349663) ^ Math.imul(n, 83492791)) >>> 0;
          h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
          if (h % 100 >= 46) continue;
          const x = m + c, y = m + r;
          if (o.moduleStyle === 'dots') modules += circle(x + 0.5, y + 0.5, 0.45);
          else if (DOT_SHAPES[o.moduleStyle]) modules += DOT_SHAPES[o.moduleStyle](x, y);
          else if (o.moduleStyle === 'square') modules += rect(x, y, 1, 1);
          else modules += rrect(x, y, 1, 1, [0.3, 0.3, 0.3, 0.3]);
        }
      }
    }

    let eyes = '';
    const corners = [[0, 0], [0, n - 7], [n - 7, 0]];
    for (const [r, c] of corners) {
      const x = m + c, y = m + r;
      eyes += (EYE_FRAME[o.eyeFrame] || EYE_FRAME.square)(x, y);
      eyes += (EYE_BALL[o.eyeBall] || EYE_BALL.square)(x, y);
    }
    return { o, n, m, total, modules, eyes, hole, round };
  }

  function gradientPoints(direction, total) {
    if (direction === 'horizontal') return [0, 0, total, 0];
    if (direction === 'vertical') return [0, 0, 0, total];
    return [0, 0, total, total];
  }

  // Size of a logo sitting on its white plate: inside the circle (corner to corner), or
  // inside the square with a small margin.
  function plateLayout(shape, box, iw, ih) {
    const k = shape === 'circle' ? (box * 0.92) / Math.hypot(iw, ih) : (box * 0.84) / Math.max(iw, ih);
    return { w: iw * k, h: ih * k };
  }

  // ---- Canvas painter. logoImg: an already loaded image (or null).
  function draw(canvas, matrix, userOpts, px, logoImg) {
    const s = buildShapes(matrix, userOpts);
    const o = s.o;
    // The canvas is exactly the requested size. Modules keep a whole number of
    // pixels (crisp edges) and the few pixels left over widen the margin; when
    // that would waste too much room (small size, dense code) the code is
    // stretched to the full size instead.
    const size = Math.max(1, Math.round(px) || 0);
    const whole = Math.floor(size / s.total);
    const crisp = whole >= 1 && whole * s.total >= size * 0.85;
    const cell = crisp ? whole : size / s.total;
    const pad = crisp ? Math.floor((size - whole * s.total) / 2) : 0;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const shaped = s.round || o.shape === 'rounded';
    if (!o.transparent && !shaped) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(cell, cell);
    if (!o.transparent && shaped) {
      ctx.fillStyle = o.bg;
      ctx.fill(new Path2D(s.round ? circle(s.total / 2, s.total / 2, s.total / 2) : rrect(0, 0, s.total, s.total, Array(4).fill(s.total * 0.13))));
    }
    let fill = o.fg1;
    if (o.gradient) {
      const [x1, y1, x2, y2] = gradientPoints(o.direction, s.total);
      fill = ctx.createLinearGradient(x1, y1, x2, y2);
      fill.addColorStop(0, o.fg1);
      fill.addColorStop(1, o.fg2);
    }
    ctx.fillStyle = fill;
    if (s.modules) ctx.fill(new Path2D(s.modules));
    ctx.fillStyle = o.eyeColor || fill;
    ctx.fill(new Path2D(s.eyes), 'evenodd');
    if (s.hole && logoImg && o.logo) {
      const box = s.hole.side;
      const iw = logoImg.naturalWidth || logoImg.width, ih = logoImg.naturalHeight || logoImg.height;
      const k = Math.min(box / iw, box / ih);
      const w = iw * k, h = ih * k;
      const cx = s.m + s.n / 2, cy = s.m + s.n / 2;
      ctx.save();
      if (o.logo.plate) {
        // A white plate under the logo: its white or see-through parts stay readable on
        // any QR color, and the whole logo is kept (no corner is cut off).
        const pl = plateLayout(o.logo.shape, box, iw, ih);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (o.logo.shape === 'circle') ctx.arc(cx, cy, box / 2, 0, Math.PI * 2);
        else ctx.roundRect(cx - box / 2, cy - box / 2, box, box, box * 0.14);
        ctx.fill();
        ctx.drawImage(logoImg, cx - pl.w / 2, cy - pl.h / 2, pl.w, pl.h);
        ctx.restore();
      } else {
      if (o.logo.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(logoImg, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      }
    }
    ctx.restore();
    return canvas;
  }

  // ---- SVG serialiser. logoDataUrl: data URL string or null.
  // px: export size. Callers that do not pass it get the size selected in the
  // generator panel (#qgSize) when there is one.
  function toSVG(matrix, userOpts, logoDataUrl, logoSize, px) {
    const s = buildShapes(matrix, userOpts);
    const o = s.o;
    let size = parseInt(px || o.size, 10);
    if (!(size > 0) && typeof document !== 'undefined') size = parseInt(document.getElementById('qgSize')?.value, 10);
    if (!(size > 0)) size = 1024;
    const T = s.total;
    let defs = '';
    let fill = o.fg1;
    if (o.gradient) {
      const [x1, y1, x2, y2] = gradientPoints(o.direction, T);
      defs += '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"><stop offset="0" stop-color="' + o.fg1 + '"/><stop offset="1" stop-color="' + o.fg2 + '"/></linearGradient>';
      fill = 'url(#g)';
    }
    let body = '';
    if (!o.transparent) {
      if (s.round) body += '<circle cx="' + f(T / 2) + '" cy="' + f(T / 2) + '" r="' + f(T / 2) + '" fill="' + o.bg + '"/>';
      else if (o.shape === 'rounded') body += '<rect width="' + T + '" height="' + T + '" rx="' + f(T * 0.13) + '" fill="' + o.bg + '"/>';
      else body += '<rect width="' + T + '" height="' + T + '" fill="' + o.bg + '"/>';
    }
    if (s.modules) body += '<path fill="' + fill + '" d="' + s.modules + '"/>';
    body += '<path fill="' + (o.eyeColor || fill) + '" fill-rule="evenodd" d="' + s.eyes + '"/>';
    if (s.hole && logoDataUrl && logoSize) {
      const box = s.hole.side;
      const k = Math.min(box / logoSize.w, box / logoSize.h);
      const w = logoSize.w * k, h = logoSize.h * k;
      const cx = s.m + s.n / 2, cy = s.m + s.n / 2;
      if (o.logo.plate) {
        const pl = plateLayout(o.logo.shape, box, logoSize.w, logoSize.h);
        body += o.logo.shape === 'circle'
          ? '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(box / 2) + '" fill="#ffffff"/>'
          : '<rect x="' + f(cx - box / 2) + '" y="' + f(cy - box / 2) + '" width="' + f(box) + '" height="' + f(box) + '" rx="' + f(box * 0.14) + '" fill="#ffffff"/>';
        body += '<image href="' + logoDataUrl + '" x="' + f(cx - pl.w / 2) + '" y="' + f(cy - pl.h / 2) + '" width="' + f(pl.w) + '" height="' + f(pl.h) + '"/>';
      } else {
      if (o.logo.shape === 'circle') {
        defs += '<clipPath id="lc"><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(Math.min(w, h) / 2) + '"/></clipPath>';
        body += '<g clip-path="url(#lc)">';
      }
      body += '<image href="' + logoDataUrl + '" x="' + f(cx - w / 2) + '" y="' + f(cy - h / 2) + '" width="' + f(w) + '" height="' + f(h) + '"/>';
      if (o.logo.shape === 'circle') body += '</g>';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + T + ' ' + T + '" width="' + size + '" height="' + size + '" shape-rendering="geometricPrecision">' +
      (defs ? '<defs>' + defs + '</defs>' : '') + body + '</svg>';
  }

  // ---- Content types -> the text that goes in the code
  const wifiEsc = (v) => String(v).replace(/([\\;,:"])/g, '\\$1');
  const vcEsc = (v) => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const q = (v) => encodeURIComponent(v);

  // Bare text only becomes a link when it reads as a host name: "3.14", "v1.2.3"
  // or two words joined by a full stop must stay plain text. Without "www." the
  // ending has to be a country code or a common extension.
  const COMMON_TLDS = /^(com|org|net|edu|gov|int|info|biz|name|pro|app|dev|xyz|tech|site|online|store|shop|blog|club|cloud|page|link|live|news|art|design|agency|studio|media|email|travel|paris|bzh|africa|asia)$/i;
  function looksLikeHost(t) {
    const m = /^((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+)([a-z]{2,})(:\d{1,5})?([/?#]\S*)?$/i.exec(t);
    if (!m) return false;
    return /^www\./i.test(t) || m[2].length === 2 || COMMON_TLDS.test(m[2]);
  }

  const TYPES = {
    url: {
      group: 'web',
      label: 'Link / Text',
      fields: [{ k: 'text', label: 'Link or text', kind: 'textarea', ph: 'https://example.com' }],
      build: (v) => {
        const t = (v.text || '').trim();
        return looksLikeHost(t) ? 'https://' + t : t;
      }
    },
    wifi: {
      group: 'net',
      label: 'Wi-Fi',
      fields: [
        { k: 'ssid', label: 'Network name', ph: 'MyWifi' },
        { k: 'pass', label: 'Password', ph: '' },
        { k: 'enc', label: 'Security', kind: 'select', options: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'None']] },
        { k: 'hidden', label: 'Hidden network', kind: 'check' }
      ],
      build: (v) => v.ssid ? 'WIFI:T:' + (v.enc || 'WPA') + ';S:' + wifiEsc(v.ssid) + ';' + (v.enc === 'nopass' ? '' : 'P:' + wifiEsc(v.pass || '') + ';') + (v.hidden ? 'H:true;' : '') + ';' : ''
    },
    email: {
      group: 'contact',
      label: 'Email',
      fields: [
        { k: 'to', label: 'Address', ph: 'name@example.com' },
        { k: 'subject', label: 'Subject' },
        { k: 'body', label: 'Message', kind: 'textarea' }
      ],
      build: (v) => {
        if (!v.to) return '';
        const parts = [];
        if (v.subject) parts.push('subject=' + q(v.subject));
        if (v.body) parts.push('body=' + q(v.body));
        return 'mailto:' + v.to.trim() + (parts.length ? '?' + parts.join('&') : '');
      }
    },
    phone: {
      group: 'contact',
      label: 'Phone',
      fields: [{ k: 'tel', label: 'Phone number', ph: '+33 6 12 34 56 78' }],
      build: (v) => v.tel ? 'tel:' + v.tel.replace(/[^\d+]/g, '') : ''
    },
    sms: {
      group: 'contact',
      label: 'SMS',
      fields: [
        { k: 'tel', label: 'Phone number', ph: '+33 6 12 34 56 78' },
        { k: 'msg', label: 'Message', kind: 'textarea' }
      ],
      build: (v) => v.tel ? 'SMSTO:' + v.tel.replace(/[^\d+]/g, '') + ':' + (v.msg || '') : ''
    },
    whatsapp: {
      group: 'contact',
      label: 'WhatsApp',
      fields: [
        { k: 'tel', label: 'Number (with country code)', ph: '33612345678' },
        { k: 'msg', label: 'Pre-filled message', kind: 'textarea' }
      ],
      build: (v) => {
        const d = (v.tel || '').replace(/\D/g, '');
        return d ? 'https://wa.me/' + d + (v.msg ? '?text=' + q(v.msg) : '') : '';
      }
    },
    contact: {
      group: 'contact',
      label: 'Contact',
      fields: [
        { k: 'first', label: 'First name' }, { k: 'last', label: 'Last name' },
        { k: 'org', label: 'Company' }, { k: 'tel', label: 'Phone' },
        { k: 'mail', label: 'Email' }, { k: 'web', label: 'Website' }
      ],
      build: (v) => {
        if (!v.first && !v.last) return '';
        const l = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vcEsc(v.last || '') + ';' + vcEsc(v.first || '') + ';;;',
          'FN:' + vcEsc(((v.first || '') + ' ' + (v.last || '')).trim())];
        if (v.org) l.push('ORG:' + vcEsc(v.org));
        if (v.tel) l.push('TEL:' + v.tel.replace(/[^\d+]/g, ''));
        if (v.mail) l.push('EMAIL:' + vcEsc(v.mail));
        if (v.web) l.push('URL:' + v.web.trim());
        l.push('END:VCARD');
        return l.join('\n');
      }
    },
    geo: {
      group: 'place',
      label: 'Location',
      fields: [
        { k: 'lat', label: 'Latitude', ph: '48.8584' },
        { k: 'lng', label: 'Longitude', ph: '2.2945' }
      ],
      build: (v) => (v.lat && v.lng && isFinite(v.lat) && isFinite(v.lng)) ? 'geo:' + v.lat.trim() + ',' + v.lng.trim() : ''
    },
    social: {
      group: 'web',
      label: 'Social profile',
      fields: [
        { k: 'net', label: 'Network', kind: 'select', options: [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['x', 'X (Twitter)'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['snapchat', 'Snapchat'], ['telegram', 'Telegram'], ['github', 'GitHub'], ['twitch', 'Twitch']] },
        { k: 'user', label: 'User name', ph: 'yourname' }
      ],
      build: (v) => {
        const u = (v.user || '').trim().replace(/^@/, '').replace(/\s+/g, '');
        if (!u) return '';
        const base = { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', x: 'https://x.com/', tiktok: 'https://www.tiktok.com/@', youtube: 'https://www.youtube.com/@', linkedin: 'https://www.linkedin.com/in/', snapchat: 'https://www.snapchat.com/add/', telegram: 'https://t.me/', github: 'https://github.com/', twitch: 'https://www.twitch.tv/' };
        return (base[v.net] || base.instagram) + q(u);
      }
    },
    event: {
      group: 'place',
      label: 'Event',
      fields: [
        { k: 'title', label: 'Title', ph: 'Team meeting' },
        { k: 'start', label: 'Starts', kind: 'datetime' },
        { k: 'end', label: 'Ends', kind: 'datetime' },
        { k: 'where', label: 'Place' },
        { k: 'note', label: 'Details', kind: 'textarea' }
      ],
      build: (v) => {
        if (!v.title || !v.start) return '';
        // local time, as typed: "2026-10-04T09:30" -> "20261004T093000"
        const stamp = (s) => String(s).replace(/[-:]/g, '').replace(/^(\d{8}T\d{4})$/, '$100');
        const l = ['BEGIN:VEVENT', 'SUMMARY:' + vcEsc(v.title), 'DTSTART:' + stamp(v.start)];
        if (v.end) l.push('DTEND:' + stamp(v.end));
        if (v.where) l.push('LOCATION:' + vcEsc(v.where));
        if (v.note) l.push('DESCRIPTION:' + vcEsc(v.note));
        l.push('END:VEVENT');
        return l.join('\n');
      }
    },
    crypto: {
      group: 'net',
      label: 'Crypto',
      fields: [
        { k: 'coin', label: 'Currency', kind: 'select', options: [['bitcoin', 'Bitcoin'], ['ethereum', 'Ethereum'], ['litecoin', 'Litecoin'], ['bitcoincash', 'Bitcoin Cash'], ['dogecoin', 'Dogecoin']] },
        { k: 'addr', label: 'Wallet address' },
        { k: 'amount', label: 'Amount (optional, not used for Ethereum)', ph: '0.01' }
      ],
      build: (v) => {
        const a = (v.addr || '').trim();
        if (!a || /\s/.test(a)) return '';
        const coin = v.coin || 'bitcoin';
        const amt = (v.amount || '').trim().replace(',', '.');
        return coin + ':' + a + (coin !== 'ethereum' && amt && isFinite(amt) && Number(amt) > 0 ? '?amount=' + amt : '');
      }
    },
    paypal: {
      group: 'net',
      label: 'PayPal',
      fields: [
        { k: 'user', label: 'PayPal.Me name', ph: 'yourname' },
        { k: 'amount', label: 'Amount (optional)', ph: '10' },
        { k: 'cur', label: 'Currency', kind: 'select', options: [['EUR', 'EUR'], ['USD', 'USD'], ['GBP', 'GBP'], ['CHF', 'CHF'], ['CAD', 'CAD']] }
      ],
      build: (v) => {
        const u = (v.user || '').trim().replace(/^.*paypal\.me\//i, '').replace(/[^\w.-]/g, '');
        if (!u) return '';
        const amt = (v.amount || '').trim().replace(',', '.');
        return 'https://paypal.me/' + u + (amt && isFinite(amt) && Number(amt) > 0 ? '/' + amt + (v.cur || 'EUR') : '');
      }
    },
    sepa: {
      group: 'net',
      label: 'Bank transfer',
      fields: [
        { k: 'name', label: 'Account holder', ph: 'Jane Doe' },
        { k: 'iban', label: 'IBAN', ph: 'FR76 3000 6000 0112 3456 7890 189' },
        { k: 'bic', label: 'BIC (optional)' },
        { k: 'amount', label: 'Amount in euros (optional)', ph: '25.00' },
        { k: 'ref', label: 'Message (optional)' }
      ],
      // European "EPC" payment code, read by most banking apps in the euro area
      build: (v) => {
        const iban = (v.iban || '').replace(/\s+/g, '').toUpperCase();
        const name = (v.name || '').trim();
        if (!name || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return '';
        const amt = (v.amount || '').trim().replace(',', '.');
        const eur = amt && isFinite(amt) && Number(amt) > 0 ? 'EUR' + Number(amt).toFixed(2) : '';
        return ['BCD', '002', '1', 'SCT', (v.bic || '').replace(/\s+/g, '').toUpperCase(), name.slice(0, 70), iban, eur, '', '', (v.ref || '').trim().slice(0, 140)].join('\n');
      }
    }
  };

  // The order of the groups, and of the types inside them, in the generator.
  const GROUPS = [
    { id: 'web', label: 'Web', types: ['url', 'social'] },
    { id: 'contact', label: 'Contact', types: ['contact', 'email', 'phone', 'sms', 'whatsapp'] },
    { id: 'place', label: 'Place & time', types: ['geo', 'event'] },
    { id: 'net', label: 'Network & pay', types: ['wifi', 'paypal', 'sepa', 'crypto'] }
  ];

  const PRESETS = {
    classic: { moduleStyle: 'square', eyeFrame: 'square', eyeBall: 'square', fg1: '#000000', fg2: '#000000', gradient: false, eyeColor: null, bg: '#ffffff', transparent: false },
    violet: { moduleStyle: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', fg1: '#5b21b6', fg2: '#a855f7', gradient: true, direction: 'diagonal', eyeColor: '#4c1d95', bg: '#ffffff', transparent: false },
    ocean: { moduleStyle: 'dots', eyeFrame: 'circle', eyeBall: 'circle', fg1: '#0369a1', fg2: '#2563eb', gradient: true, direction: 'vertical', eyeColor: null, bg: '#f0f9ff', transparent: false },
    sunset: { moduleStyle: 'bars', eyeFrame: 'leaf', eyeBall: 'leaf', fg1: '#c2410c', fg2: '#be185d', gradient: true, direction: 'horizontal', eyeColor: null, bg: '#fffbeb', transparent: false },
    forest: { moduleStyle: 'rounded', eyeFrame: 'leaf', eyeBall: 'circle', fg1: '#14532d', fg2: '#14532d', gradient: false, eyeColor: '#166534', bg: '#f0fdf4', transparent: false }
  };

  root.WBQr = { makeMatrix, buildShapes, draw, toSVG, TYPES, GROUPS, PRESETS, DEFAULTS };
})(typeof self !== 'undefined' ? self : this);
