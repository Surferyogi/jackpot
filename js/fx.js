/* Jackpot — celebration effects on a full-screen overlay canvas.
   Coins, fireworks, firecrackers, lanterns, red packets, confetti, a golden dragon
   fly-over and a giant 福. Pure canvas; the loop only runs while something is alive. */
(function (root) {
  'use strict';

  let cv = null, ctx = null, W = 0, H = 0, dpr = 1;
  let parts = [];      // particles
  let emitters = [];   // timed emitters {until, every, last, fn}
  let actors = [];     // long-lived drawables (dragon, fu glyph) {t0, dur, draw}
  let raf = 0, lastT = 0;
  let sfx = null;      // optional callbacks {pop(), burst(), coin()}

  function init(canvas, sfxHooks) {
    cv = canvas; ctx = cv.getContext('2d'); sfx = sfxHooks || {};
    resize();
    root.addEventListener('resize', resize);
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(2, root.devicePixelRatio || 1);
    W = root.innerWidth; H = root.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const GOLD = ['#ffe680', '#f5c518', '#ffd34d', '#e0a800'];
  const FEST_DEFAULT = ['#ff3b3b', '#ffd34d', '#ff8c1a', '#fff3b0', '#ff5e7a', '#6ee7ff'];
  let FEST = FEST_DEFAULT.slice();
  // Festival themes can recolour confetti/fireworks; null restores the default palette.
  function setPalette(list) { FEST = (list && list.length) ? list.slice() : FEST_DEFAULT.slice(); }

  // ---- particle factories ---------------------------------------------------------
  function coin(x, y, vx, vy) {
    parts.push({ k: 'coin', x, y, vx, vy, r: rnd(7, 12), rot: rnd(0, 6.28), vr: rnd(-6, 6), ph: rnd(0, 6.28), life: 1, decay: rnd(0.25, 0.45), g: 900, col: GOLD[Math.floor(Math.random() * GOLD.length)] });
  }
  function spark(x, y, vx, vy, col, life) {
    parts.push({ k: 'spark', x, y, vx, vy, r: rnd(1.5, 3), life: 1, decay: 1 / (life || rnd(0.8, 1.4)), g: 260, col, drag: 0.985, trail: [] });
  }
  function bit(x, y, vx, vy, col, w, h) {
    parts.push({ k: 'bit', x, y, vx, vy, w: w || rnd(5, 9), h: h || rnd(8, 14), rot: rnd(0, 6.28), vr: rnd(-8, 8), life: 1, decay: rnd(0.3, 0.5), g: 420, col, drag: 0.99, sway: rnd(0, 6.28) });
  }
  function flash(x, y, r, col) { parts.push({ k: 'flash', x, y, vx: 0, vy: 0, g: 0, r, life: 1, decay: 8, col }); }

  // ---- public effects -------------------------------------------------------------
  function coinFountain(n, x, y, spread) {
    x = x == null ? W / 2 : x; y = y == null ? H * 0.72 : y; spread = spread || 1;
    for (let i = 0; i < n; i++) coin(x + rnd(-20, 20), y, rnd(-260, 260) * spread, rnd(-980, -560));
    if (sfx.coin) sfx.coin();
    kick();
  }

  function goldRain(perSec, dur) {
    emitters.push({ until: performance.now() + dur, every: 1000 / perSec, last: 0, fn: function () { coin(rnd(0, W), -20, rnd(-40, 40), rnd(60, 160)); } });
    kick();
  }

  function firework(x, y, col) {
    x = x == null ? rnd(W * 0.15, W * 0.85) : x; y = y == null ? rnd(H * 0.12, H * 0.45) : y;
    const c = col || FEST[Math.floor(Math.random() * FEST.length)];
    const n = 70;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rnd(-0.05, 0.05); const v = rnd(120, 300); spark(x, y, Math.cos(a) * v, Math.sin(a) * v, c); }
    for (let i = 0; i < 18; i++) { const a = rnd(0, 6.283); const v = rnd(30, 90); spark(x, y, Math.cos(a) * v, Math.sin(a) * v, '#ffffff', 0.6); }
    flash(x, y, 90, c);
    if (sfx.burst) sfx.burst();
    kick();
  }

  function fireworksShow(count, dur) {
    emitters.push({ until: performance.now() + dur, every: dur / count, last: 0, fn: function () { firework(); } });
    kick();
  }

  // A hanging string of firecrackers popping from the bottom up on the left or right edge.
  function firecrackerString(side, count) {
    const x = side === 'left' ? W * 0.09 : W * 0.91;
    const top = H * 0.12, bottom = H * 0.62;
    let i = 0;
    emitters.push({ until: performance.now() + count * 110 + 50, every: 110, last: 0, fn: function () {
      const y = bottom - (i / count) * (bottom - top); i++;
      flash(x, y, 26, '#ffcc66');
      for (let k = 0; k < 10; k++) bit(x, y, rnd(-160, 160), rnd(-220, 40), Math.random() < 0.8 ? '#e0262b' : '#ffd34d', rnd(3, 5), rnd(5, 9));
      for (let k = 0; k < 6; k++) spark(x, y, rnd(-120, 120), rnd(-120, 120), '#fff1a0', 0.4);
      if (sfx.pop) sfx.pop();
    } });
    kick();
  }

  function lanterns(n) {
    for (let i = 0; i < n; i++) {
      parts.push({ k: 'lantern', x: rnd(W * 0.08, W * 0.92), y: H + rnd(20, 260), vx: 0, vy: rnd(-70, -40), r: rnd(14, 22), life: 1, decay: 0.09, ph: rnd(0, 6.28), g: 0 });
    }
    kick();
  }

  function redPackets(n, x, y) {
    for (let i = 0; i < n; i++) bit(x == null ? rnd(W * 0.2, W * 0.8) : x, y == null ? H * 0.4 : y, rnd(-320, 320), rnd(-620, -200), '#e0262b', rnd(12, 18), rnd(18, 26));
    for (let i = 0; i < Math.round(n * 0.6); i++) coin(x == null ? W / 2 : x, y == null ? H * 0.4 : y, rnd(-300, 300), rnd(-700, -300));
    kick();
  }

  function confetti(n) {
    for (let i = 0; i < n; i++) bit(rnd(0, W), rnd(-H * 0.3, -10), rnd(-40, 40), rnd(40, 140), FEST[Math.floor(Math.random() * FEST.length)]);
    kick();
  }

  function sparkleAt(x, y, col) {
    for (let i = 0; i < 12; i++) { const a = rnd(0, 6.283), v = rnd(40, 160); spark(x, y, Math.cos(a) * v, Math.sin(a) * v, col || '#ffe680', 0.5); }
    kick();
  }

  // Golden dragon fly-over: head follows a sine path, body follows the head's trail.
  function dragon(dur) {
    const trail = [];
    actors.push({ t0: performance.now(), dur: dur || 4500, draw: function (p) {
      const x = -W * 0.25 + p * W * 1.5;
      const y = H * 0.32 + Math.sin(p * Math.PI * 4) * H * 0.1;
      trail.unshift({ x, y }); if (trail.length > 400) trail.pop();
      const segs = 34, gap = Math.max(10, W * 0.028);
      // body from tail to head
      for (let i = segs; i >= 1; i--) {
        const idx = Math.min(trail.length - 1, Math.round(i * gap / Math.max(1, (W * 1.5) / (this.dur / 16.7))));
        const pt = trail[idx]; if (!pt) continue;
        const r = (W * 0.024) * (1 - i / (segs + 6)) + 4;
        const g = ctx.createRadialGradient(pt.x - r * 0.3, pt.y - r * 0.3, 1, pt.x, pt.y, r);
        g.addColorStop(0, '#fff3b0'); g.addColorStop(0.6, '#f5c518'); g.addColorStop(1, '#b07a00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(140,60,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        if (i % 3 === 0) { // dorsal fin
          ctx.fillStyle = '#e0262b'; ctx.beginPath(); ctx.moveTo(pt.x - r * 0.6, pt.y - r * 0.6); ctx.lineTo(pt.x, pt.y - r * 1.9); ctx.lineTo(pt.x + r * 0.6, pt.y - r * 0.6); ctx.closePath(); ctx.fill();
        }
      }
      // head
      const hr = W * 0.032 + 6;
      const g2 = ctx.createRadialGradient(x - hr * 0.3, y - hr * 0.3, 2, x, y, hr);
      g2.addColorStop(0, '#fff3b0'); g2.addColorStop(0.6, '#f5c518'); g2.addColorStop(1, '#b07a00');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x, y, hr * 1.25, hr, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(140,60,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      // horns
      ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = hr * 0.22; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - hr * 0.5, y - hr * 0.8); ctx.quadraticCurveTo(x - hr * 1.2, y - hr * 1.9, x - hr * 0.4, y - hr * 2.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + hr * 0.1, y - hr * 0.9); ctx.quadraticCurveTo(x - hr * 0.3, y - hr * 2.0, x + hr * 0.5, y - hr * 2.3); ctx.stroke();
      // whiskers
      ctx.strokeStyle = '#e0262b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + hr * 1.1, y + hr * 0.2); ctx.quadraticCurveTo(x + hr * 2.4, y - hr * 0.6 + Math.sin(p * 40) * 6, x + hr * 2.8, y + hr * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + hr * 1.1, y + hr * 0.4); ctx.quadraticCurveTo(x + hr * 2.2, y + hr * 1.1 + Math.cos(p * 40) * 6, x + hr * 2.9, y + hr * 1.2); ctx.stroke();
      // eye + mane
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + hr * 0.45, y - hr * 0.25, hr * 0.28, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(x + hr * 0.55, y - hr * 0.25, hr * 0.14, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#e0262b';
      for (let k = 0; k < 5; k++) { const a = -2.2 + k * 0.35; ctx.beginPath(); ctx.moveTo(x - hr * 0.7, y); ctx.lineTo(x - hr * 0.7 + Math.cos(a) * hr * 2.2, y + Math.sin(a) * hr * 2.2); ctx.lineTo(x - hr * 0.7 + Math.cos(a + 0.2) * hr * 1.6, y + Math.sin(a + 0.2) * hr * 1.6); ctx.closePath(); ctx.fill(); }
      // pearl
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + hr * 1.9, y - hr * 0.9, hr * 0.32, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.stroke();
      if (Math.random() < 0.6) spark(x - hr, y, rnd(-80, -20), rnd(-40, 40), '#ffe680', 0.5);
    } });
    kick();
  }

  // Giant 福 glyph scaling in and fading out in the middle of the screen.
  function fuGlyph(dur) {
    actors.push({ t0: performance.now(), dur: dur || 2400, draw: function (p) {
      // Small diamond near the top of the screen so it never hides the win banner or the reels.
      const base = Math.min(0.55, W / 900);
      const s = base * (0.5 + Math.min(1, p * 3) * 0.5); const a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.save(); ctx.globalAlpha = a * 0.92; ctx.translate(W / 2, H * 0.09); ctx.scale(s, s);
      ctx.fillStyle = '#e0262b'; ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(150, 0); ctx.lineTo(0, 150); ctx.lineTo(-150, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 8; ctx.stroke();
      ctx.fillStyle = '#ffe680'; ctx.font = '700 150px "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Microsoft YaHei", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('福', 0, 8);
      ctx.restore();
    } });
    kick();
  }

  // ---- ambient (festival) effects: gentle, low-density, run until switched off ---------------
  let ambientKind = null;
  function setAmbient(kind) {
    ambientKind = kind && kind !== 'none' ? kind : null;
    emitters = emitters.filter(function (e) { return !e.ambient; });
    parts = parts.filter(function (p) { return !p.ambient; });
    if (!ambientKind) return;
    const add = function (every, fn) { emitters.push({ ambient: true, until: Infinity, every: every, last: 0, fn: fn }); };
    switch (ambientKind) {
      case 'snow':      add(260, function () { parts.push({ k: 'snow', ambient: true, x: rnd(0, W), y: -10, vx: 0, vy: rnd(28, 55), r: rnd(1.5, 3.5), life: 1, decay: 1 / rnd(12, 20), g: 0, ph: rnd(0, 6.28) }); }); break;
      case 'petals':    add(420, function () { parts.push({ k: 'petal', ambient: true, x: rnd(0, W), y: -10, vx: rnd(-10, 10), vy: rnd(24, 45), r: rnd(2.5, 4.5), life: 1, decay: 1 / rnd(14, 22), g: 0, ph: rnd(0, 6.28), rot: rnd(0, 6.28), vr: rnd(-2, 2), col: Math.random() < 0.6 ? '#ffb347' : '#ffe680' }); }); break;
      case 'balloons':  add(1400, function () { parts.push({ k: 'balloon', ambient: true, x: rnd(W * 0.05, W * 0.95), y: H + 40, vx: 0, vy: rnd(-42, -26), r: rnd(11, 16), life: 1, decay: 1 / rnd(18, 26), g: 0, ph: rnd(0, 6.28), col: FEST[Math.floor(Math.random() * FEST.length)] }); }); break;
      case 'lanterns':  add(1800, function () { parts.push({ k: 'lantern', ambient: true, x: rnd(W * 0.08, W * 0.92), y: H + 40, vx: 0, vy: rnd(-34, -20), r: rnd(9, 14), life: 1, decay: 1 / rnd(24, 34), ph: rnd(0, 6.28), g: 0 }); }); break;
      case 'fireworks': add(5200, function () { const x = rnd(W * 0.15, W * 0.85), y = rnd(H * 0.08, H * 0.3); const c = FEST[Math.floor(Math.random() * FEST.length)]; for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283; const v = rnd(50, 120); const p = { k: 'spark', ambient: true, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.6, life: 1, decay: 1 / 1.1, g: 120, col: c, drag: 0.985, trail: [] }; parts.push(p); } }); break;
      case 'stars':     add(700, function () { parts.push({ k: 'twinkle', ambient: true, x: rnd(0, W), y: rnd(0, H * 0.5), vx: 0, vy: 0, r: rnd(1, 2.4), life: 1, decay: 1 / rnd(1.5, 3), g: 0, ph: 0 }); }); break;
    }
    kick();
  }

  function clear() { parts = parts.filter(function (p) { return p.ambient; }); emitters = emitters.filter(function (e) { return e.ambient; }); actors = []; if (ctx && !parts.length) ctx.clearRect(0, 0, W, H); }

  // ---- loop -----------------------------------------------------------------------
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    ctx.clearRect(0, 0, W, H);

    emitters = emitters.filter(function (e) {
      if (t > e.until) return false;
      if (t - e.last >= e.every) { e.last = t; try { e.fn(); } catch (err) {} }
      return true;
    });

    actors = actors.filter(function (a) {
      const p = (t - a.t0) / a.dur; if (p >= 1) return false;
      ctx.save(); try { a.draw(p); } catch (err) {} ctx.restore();
      return true;
    });

    const keep = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      if (p.g) p.vy += p.g * dt;
      if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > H + 60 || p.y < -80) continue;
      keep.push(p);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      switch (p.k) {
        case 'coin': {
          p.rot += p.vr * dt; p.ph += 9 * dt;
          const sx = Math.max(0.15, Math.abs(Math.cos(p.ph)));
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(sx, 1);
          const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
          g.addColorStop(0, '#fff7c2'); g.addColorStop(0.7, p.col); g.addColorStop(1, '#a86f00');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 6.283); ctx.fill();
          ctx.strokeStyle = 'rgba(120,80,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.strokeStyle = 'rgba(120,80,0,0.45)'; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.62, 0, 6.283); ctx.stroke();
          ctx.restore(); break;
        }
        case 'spark': {
          p.trail.push([p.x, p.y]); if (p.trail.length > 6) p.trail.shift();
          ctx.strokeStyle = p.col; ctx.lineWidth = p.r; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.trail[0][0], p.trail[0][1]); for (let k = 1; k < p.trail.length; k++) ctx.lineTo(p.trail[k][0], p.trail[k][1]); ctx.stroke();
          break;
        }
        case 'bit': {
          p.rot += p.vr * dt; p.sway += 4 * dt; p.x += Math.sin(p.sway) * 30 * dt;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.cos(p.sway * 1.3), 1);
          ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          if (p.w >= 12) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1.5; ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, 0, p.w * 0.18, 0, 6.283); ctx.fill(); }
          ctx.restore(); break;
        }
        case 'flash': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, p.col); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = p.life * 0.8; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); break;
        }
        case 'snow': {
          p.ph += 1.2 * dt; p.x += Math.sin(p.ph) * 14 * dt;
          ctx.globalAlpha = Math.min(1, p.life * 2) * 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); break;
        }
        case 'petal': {
          p.ph += 1.5 * dt; p.x += Math.sin(p.ph) * 20 * dt; p.rot += p.vr * dt;
          ctx.globalAlpha = Math.min(1, p.life * 2) * 0.9; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.283); ctx.fill(); ctx.restore(); break;
        }
        case 'balloon': {
          p.ph += 1.1 * dt; p.x += Math.sin(p.ph) * 16 * dt;
          ctx.globalAlpha = Math.min(1, p.life * 3) * 0.95; ctx.save(); ctx.translate(p.x, p.y);
          const g = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.4, 1, 0, 0, p.r * 1.3); g.addColorStop(0, '#fff'); g.addColorStop(0.25, p.col); g.addColorStop(1, p.col);
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 1.25, 0, 0, 6.283); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, p.r * 1.3); ctx.quadraticCurveTo(4, p.r * 2.2, -2, p.r * 3.2); ctx.stroke();
          ctx.restore(); break;
        }
        case 'twinkle': {
          const a = Math.sin(p.life * Math.PI); ctx.globalAlpha = a; ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - p.r * 3, p.y); ctx.lineTo(p.x + p.r * 3, p.y); ctx.moveTo(p.x, p.y - p.r * 3); ctx.lineTo(p.x, p.y + p.r * 3); ctx.stroke(); break;
        }
        case 'lantern': {
          p.ph += 1.5 * dt; p.x += Math.sin(p.ph) * 18 * dt;
          ctx.globalAlpha = Math.min(1, p.life * 3) * 0.95;
          ctx.save(); ctx.translate(p.x, p.y);
          const r = p.r;
          ctx.fillStyle = '#ffd34d'; ctx.fillRect(-r * 0.45, -r * 1.35, r * 0.9, r * 0.22);
          const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.2);
          g.addColorStop(0, '#ff7a6b'); g.addColorStop(0.7, '#e0262b'); g.addColorStop(1, '#8c0d14');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.15, 0, 0, 6.283); ctx.fill();
          ctx.strokeStyle = 'rgba(255,211,77,0.7)'; ctx.lineWidth = 1.5;
          for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) === 2 ? r * 0.35 : Math.abs(k) === 1 ? r * 0.75 : r, r * 1.15, 0, 0, 6.283); ctx.stroke(); }
          ctx.fillStyle = '#ffd34d'; ctx.fillRect(-r * 0.4, r * 1.1, r * 0.8, r * 0.2);
          ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, r * 1.3); ctx.lineTo(0, r * 2.1); ctx.stroke();
          // glow
          const gg = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4); gg.addColorStop(0, 'rgba(255,200,100,0.35)'); gg.addColorStop(1, 'rgba(255,200,100,0)');
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, 6.283); ctx.fill();
          ctx.restore(); break;
        }
      }
    }
    ctx.globalAlpha = 1;
    parts = keep;

    if (parts.length || emitters.length || actors.length) raf = requestAnimationFrame(frame);
    else { raf = 0; ctx.clearRect(0, 0, W, H); }
  }

  root.JP_FX = { init, coinFountain, goldRain, firework, fireworksShow, firecrackerString, lanterns, redPackets, confetti, sparkleAt, dragon, fuGlyph, clear, setAmbient, setPalette };
})(typeof window !== 'undefined' ? window : globalThis);
