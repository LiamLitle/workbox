// Point-cloud sphere used by the timer and the stopwatch.
// Every point is lit at the start; points go dark as `lit` drops from 1 to 0.
(function () {
  const N = 560;
  const TILT = 0.38;
  const PALETTE = {
    violet: { tint: [205, 190, 255], glow: [124, 58, 237] },
    green: { tint: [170, 245, 200], glow: [34, 197, 94] },
    blue: { tint: [175, 215, 255], glow: [59, 130, 246] },
    orange: { tint: [255, 214, 165], glow: [249, 115, 22] },
    pink: { tint: [255, 190, 225], glow: [236, 72, 153] },
    red: { tint: [255, 185, 185], glow: [239, 68, 68] }
  };

  // a palette name or any '#rrggbb' picked on the colour wheel
  function resolve(v) {
    const m = typeof v === 'string' && /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return PALETTE[v] || PALETTE.violet;
    const n = parseInt(m[1], 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
    return { glow: rgb, tint: rgb.map(c => Math.round(c + (255 - c) * 0.6)) };
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function create(canvas, opts) {
    if (!canvas || !canvas.getContext) return { setLit() {}, setSweep() {}, setRunning() {}, pulse() {}, setMarks() {}, setColor() {} };
    const ctx = canvas.getContext('2d');
    const size = (opts && opts.size) || 140;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = size + 'px';

    const rnd = seeded((opts && opts.seed) || 7);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const a = i * golden;
      pts.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, rank: 0, b: 1 });
    }
    // shuffled order: the sphere thins out evenly instead of emptying from one side
    const order = pts.map((_, i) => i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    order.forEach((idx, k) => { pts[idx].rank = k / N; });

    let lit = 1, sweep = null, running = false, angle = 0, speed = 0.12, last = 0;
    let pulseT = -1, marks = [];
    let tint = [205, 190, 255], glow = [124, 58, 237];
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);

    // panels are hidden with visibility:hidden, which offsetParent does not see
    const visible = () => (canvas.checkVisibility
      ? canvas.checkVisibility({ visibilityProperty: true })
      : !!canvas.offsetParent && getComputedStyle(canvas).visibility !== 'hidden');
    let dirty = true, shown = false;
    const IDLE_MS = 400;
    const later = () => setTimeout(() => requestAnimationFrame(draw), IDLE_MS);

    function draw(now) {
      if (!visible()) { shown = false; last = 0; later(); return; }
      if (!shown) { shown = true; dirty = true; }
      // reduced motion: nothing rotates, so only redraw while something is changing
      if (still && !dirty) { last = 0; setTimeout(() => requestAnimationFrame(draw), 100); return; }
      requestAnimationFrame(draw);
      const dt = last ? Math.min(0.05, (now - last) / 1000 || 0) : 0; last = now;
      let moving = false;
      const target = still ? 0 : (running ? 0.55 : 0.12);
      speed += (target - speed) * Math.min(1, dt * 3);
      angle += speed * dt;

      // lap confirmation: the sphere swells for a moment and a ring expands from it
      let swell = 0, ringK = -1;
      if (pulseT >= 0) { pulseT += dt / 0.6; if (pulseT >= 1) pulseT = -1; else { swell = Math.sin(pulseT * Math.PI) * (1 - pulseT); ringK = pulseT; } }
      const W = canvas.width, c = W / 2, R = W * 0.4 * (1 + 0.1 * swell);
      ctx.clearRect(0, 0, W, W);
      const g = ctx.createRadialGradient(c, c, 0, c, c, R * 1.15);
      g.addColorStop(0, 'rgba(' + glow.join(',') + ',' + (0.05 + 0.17 * lit) + ')');
      g.addColorStop(1, 'rgba(' + glow.join(',') + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);

      const ca = Math.cos(angle), sa = Math.sin(angle);
      const ease = Math.min(1, dt * 5);
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
        for (let i = 0; i < N; i++) {
          const p = pts[i];
          const x1 = p.x * ca + p.z * sa, z1 = -p.x * sa + p.z * ca;
          const y2 = p.y * cosT - z1 * sinT, z2 = p.y * sinT + z1 * cosT;
          let on = p.rank < lit, near = 0;
          if (sweep !== null) {
            // clock position of the point as seen on screen, 0 at 12 o'clock
            let th = Math.atan2(x1, -y2) / 6.2832; if (th < 0) th += 1;
            const behind = sweep - th;
            on = behind >= 0;
            if (behind >= 0 && behind < 0.035) near = 1 - behind / 0.035;
          }
          if (!pass) {
            const goal = on ? 1 : 0;
            if (Math.abs(goal - p.b) > 0.01) { moving = true; p.b += (goal - p.b) * ease; } else p.b = goal;
          }
          const k = 2.6 / (2.6 - z2);
          const px = c + x1 * R * k, py = c + y2 * R * k;
          const d = (z2 + 1) / 2;
          if (!pass) {
            if (p.b > 0.98) continue;
            ctx.fillStyle = 'rgba(150,140,190,' + ((0.07 + 0.1 * d) * (1 - p.b)) + ')';
            ctx.beginPath(); ctx.arc(px, py, (0.55 + 0.6 * d) * dpr, 0, 6.2832); ctx.fill();
          } else {
            if (p.b < 0.02) continue;
            const rad = (0.6 + 1.25 * d) * dpr * (1 + 0.9 * near);
            if (near > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.3 * near) + ')'; ctx.beginPath(); ctx.arc(px, py, rad * 1.7, 0, 6.2832); ctx.fill(); }
            if (d > 0.55) { ctx.fillStyle = 'rgba(' + glow.join(',') + ',' + (0.16 * p.b * d) + ')'; ctx.beginPath(); ctx.arc(px, py, rad * 3.2, 0, 6.2832); ctx.fill(); }
            ctx.fillStyle = 'rgba(' + Math.round(tint[0] + (255 - tint[0]) * swell) + ',' + Math.round(tint[1] + (255 - tint[1]) * swell) + ',' + Math.round(tint[2] + (255 - tint[2]) * swell) + ',' + Math.min(1, (0.22 + 0.78 * d) * p.b + 0.5 * swell * p.b) + ')';
            ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.2832); ctx.fill();
          }
        }
      }
      if (sweep !== null) {
        // the hand itself: a soft beam from the centre to the rim
        const a = sweep * 6.2832, ex = c + Math.sin(a) * R * 1.08, ey = c - Math.cos(a) * R * 1.08;
        const lg = ctx.createLinearGradient(c, c, ex, ey);
        lg.addColorStop(0, 'rgba(196,181,253,0)'); lg.addColorStop(1, 'rgba(233,225,255,0.85)');
        ctx.strokeStyle = lg; ctx.lineWidth = 1.6 * dpr; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(ex, ey); ctx.stroke();
      }
      if (ringK >= 0) {
        ctx.strokeStyle = 'rgba(233,225,255,' + (0.7 * (1 - ringK)) + ')'; ctx.lineWidth = 2 * dpr * (1 - ringK) + 0.5;
        ctx.beginPath(); ctx.arc(c, c, W * 0.4 * (0.9 + 0.32 * ringK), 0, 6.2832); ctx.stroke();
      }
      // one small tick on the rim for each lap, at the second it was taken
      for (let i = 0; i < marks.length; i++) {
        const a = marks[i] * 6.2832, r0 = W * 0.4 * 1.1, r1 = W * 0.4 * 1.19;
        ctx.strokeStyle = i === marks.length - 1 ? 'rgba(255,255,255,0.95)' : 'rgba(196,181,253,0.55)';
        ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); ctx.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      dirty = moving || pulseT >= 0;
    }
    requestAnimationFrame(draw);

    return {
      setLit(v) { v = Math.max(0, Math.min(1, v)); if (v !== lit) { lit = v; dirty = true; } },
      // null = off; 0..1 = position of the light hand around the sphere
      setSweep(v) { v = (v === null || v === undefined) ? null : Math.max(0, Math.min(1, v)); if (v !== sweep) { sweep = v; dirty = true; } },
      pulse() { pulseT = 0; dirty = true; },
      setColor(name) { const c = resolve(name); tint = c.tint; glow = c.glow; dirty = true; },
      setMarks(list) { marks = (list || []).slice(-12); dirty = true; },
      setRunning(v) { running = !!v; }
    };
  }

  window.WBOrb = { create, colors: Object.keys(PALETTE), css: (name) => 'rgb(' + resolve(name).glow.join(',') + ')', text: (name) => 'rgb(' + resolve(name).tint.join(',') + ')' };
})();
