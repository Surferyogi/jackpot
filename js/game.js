/* Jackpot — game controller: state, persistence, reel animation, win presentation, UI.
   Depends on: js/config.js, js/engine.js, js/art.js, js/audio.js, js/fx.js (all loaded before this). */

// Crash guard: any uncaught error flips the version tag to "· ERROR" so it can be diagnosed
// on the device without a console. Registered first so it also catches errors below.
window.addEventListener('error', function (e) {
  try {
    var v = document.getElementById('verTag');
    if (v && window.JP_CONFIG) v.textContent = JP_CONFIG.APP_VERSION + ' · ERROR';
    console.error('Jackpot error:', e.message, e.filename, e.lineno);
  } catch (_) {}
});

(function () {
  'use strict';

  const E = window.JP_ENGINE, ART = window.JP_ART, FX = window.JP_FX, AU = window.JP_AUDIO, CFG = window.JP_CONFIG, TH = window.JP_THEMES;
  const $ = function (id) { return document.getElementById(id); };
  function on(id, ev, fn) { const el = $(id); if (el) el.addEventListener(ev, fn); }
  function show(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
  function hide(id) { const el = $(id); if (el) el.classList.add('hidden'); }
  function setText(id, t) { const el = $(id); if (el) el.textContent = t; }
  const fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // ---------------------------------------------------------------- profile (localStorage)
  const KEY = (CFG && CFG.STORAGE_KEY) || 'jp_profile_v1';
  function defaultProfile() {
    return {
      v: 1,
      credits: E.START_CREDITS,
      jackpot: E.JACKPOT.seed,
      betIdx: 2,
      sfx: true, music: true, turbo: false,
      best: { win: 0, balance: E.START_CREDITS },
      stats: { spins: 0, wagered: 0, won: 0, refills: 0, jackpots: 0, fsRounds: 0, bigWins: 0, goldRush: 0, picks: 0, wheels: 0, gambleWon: 0, gambleLost: 0 },
      gamble: true,           // offer Double Up after qualifying base-game wins
      bonus: null,            // an in-progress Fortune Pick / Lucky Wheel, so it survives a reload
      themeOverride: 'auto',  // 'auto' = festival theme by today's date; otherwise a theme id chosen in Settings
      gifts: { birthdayYear: 0 }, // Gregorian year in which the birthday gift was last given
      fs: null,        // { left, total, bet, spins } while a free-spin round is in progress
      pending: null,   // { stops, bet, free } a spin whose bet was taken but not yet resolved
      created: Date.now(), lastPlayed: Date.now(),
    };
  }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function loadProfile() {
    const d = defaultProfile();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return d;
      d.credits = Math.max(0, Math.round(num(p.credits, d.credits)));
      d.jackpot = Math.max(E.JACKPOT.seed, num(p.jackpot, d.jackpot));
      d.betIdx = clamp(Math.round(num(p.betIdx, d.betIdx)), 0, E.BETS.length - 1);
      d.sfx = p.sfx !== false; d.music = p.music !== false; d.turbo = p.turbo === true;
      if (p.best) { d.best.win = num(p.best.win, 0); d.best.balance = num(p.best.balance, d.credits); }
      if (p.stats) for (const k in d.stats) d.stats[k] = num(p.stats[k], 0);
      if (typeof p.themeOverride === 'string' && (p.themeOverride === 'auto' || (TH && TH.THEMES[p.themeOverride]))) d.themeOverride = p.themeOverride;
      if (p.gifts) d.gifts.birthdayYear = Math.round(num(p.gifts.birthdayYear, 0));
      d.gamble = p.gamble !== false;
      if (p.bonus && (p.bonus.type === 'pick' || p.bonus.type === 'wheel')) d.bonus = p.bonus;
      if (p.fs && num(p.fs.left, 0) > 0) d.fs = { left: Math.round(p.fs.left), total: num(p.fs.total, 0), bet: num(p.fs.bet, E.BETS[d.betIdx]), spins: num(p.fs.spins, 0), mult: E.FS_LADDER.indexOf(p.fs.mult) >= 0 ? p.fs.mult : E.FS_LADDER[0] };
      if (p.pending && Array.isArray(p.pending.stops) && p.pending.stops.length === E.REELS) d.pending = { stops: p.pending.stops.map(Number), bet: num(p.pending.bet, E.BETS[d.betIdx]), free: !!p.pending.free, gold: Array.isArray(p.pending.gold) ? p.pending.gold.map(Number) : null };
      d.created = num(p.created, d.created);
    } catch (e) { /* corrupt or blocked storage → fresh profile */ }
    return d;
  }
  let P = loadProfile();
  function save() { P.lastPlayed = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }

  // ---------------------------------------------------------------- state
  const S = {
    phase: 'idle',          // idle | spinning | present | overlay
    reels: [],              // per-reel animation state
    stops: null, grid: null, result: null,
    auto: 0,                // remaining auto spins
    autoArmed: false,
    present: null,          // win presentation state
    idleHighlight: null,    // {entries, idx, t} – keep cycling last win lines while idle
    shownCredits: 0,        // animated credit display
    shownWin: 0,
    anticipating: false,
    theme: null, themeKey: '',   // active festival theme (see js/themes.js)
    goldRush: null, reelGold: null, goldWipe: null, // Gold Rush: reels chosen for this spin / drawn as Gold / wipe animation
    after: null,                 // what still has to happen after the current bonus (free spins to start, etc.)
    gamble: null,                // Double Up state
    lastFrame: 0, raf: 0,
  };
  function later(fn, ms) { return setTimeout(fn, ms); }
  function bet() { return S.fs ? S.fs.bet : E.BETS[P.betIdx]; }
  S.fs = P.fs; // live free-spin state mirrors the profile

  // Timings (ms) — normal / turbo
  function T() {
    const t = P.turbo;
    return {
      firstStop: t ? 420 : 900, stagger: t ? 110 : 290, land: t ? 210 : 380, anticipation: t ? 600 : 1100,
      lineCycle: t ? 550 : 950, gap: t ? 250 : 550,
      tier: { win: t ? 500 : 900, big: t ? 1500 : 2600, mega: t ? 2400 : 4200, epic: t ? 3400 : 6000, jackpot: 8000 },
    };
  }
  const SPEED = 22; // symbols per second while spinning

  // ---------------------------------------------------------------- canvas / layout
  const cv = $('reels'); const ctx = cv ? cv.getContext('2d') : null;
  let W = 600, H = 360, cell = 100, padX = 14, padY = 14, dpr = 1;
  function layout() {
    if (!cv) return;
    const wrap = $('reelWrap'); const cssW = Math.max(280, wrap ? wrap.clientWidth : 360);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    padX = Math.round(cssW * 0.03); padY = padX;
    cell = (cssW - padX * 2) / E.REELS;
    W = cssW; H = Math.round(cell * E.ROWS + padY * 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestFrame();
  }
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastDrawT = 0; requestFrame(); } });

  function cellCenter(r, k) { return { x: padX + (r + 0.5) * cell, y: padY + (k + 0.5) * cell }; }
  function easeOutBack(u) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }

  function initReels() {
    S.reels = [];
    const base = S.stops || [0, 5, 10, 15, 20];
    for (let r = 0; r < E.REELS; r++) S.reels.push({ pos: base[r], phase: 'stopped', target: base[r], start: 0, landT0: 0, glow: 0, tickAcc: 0 });
  }

  // ---------------------------------------------------------------- drawing
  // Symbol sprites: each symbol is rendered once per size into an offscreen canvas, then
  // drawn with drawImage. That makes the idle/win animations (scale, wobble, blur) cheap.
  const spriteCache = {};
  function sprite(id, size) {
    const px = Math.round(size * dpr); const key = id + '@' + px;
    let sp = spriteCache[key];
    if (sp) return sp;
    const box = Math.round(size * 1.2); // margin for leaves/stems that poke past the symbol box
    const c = document.createElement('canvas'); c.width = Math.round(box * dpr); c.height = Math.round(box * dpr);
    const cx = c.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ART.drawSymbol(cx, id, box / 2, box / 2, size);
    sp = { c: c, box: box };
    spriteCache[key] = sp;
    return sp;
  }
  // Draw a symbol centred at (x,y) with optional scale (sx, sy), rotation and alpha.
  function drawSym(id, x, y, size, o) {
    const sp = sprite(id, size);
    o = o || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    const sx = o.sx != null ? o.sx : (o.s || 1), sy = o.sy != null ? o.sy : (o.s || 1);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.drawImage(sp.c, -sp.box / 2, -sp.box / 2, sp.box, sp.box);
    ctx.restore();
  }
  function star4(x, y, r, col, alpha) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    ctx.restore();
  }

  function drawFrame(now) {
    if (!ctx) return;
    // outer frame (gold) and window (cream)
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#b07a00'); g.addColorStop(0.3, '#ffe680'); g.addColorStop(0.55, '#f5c518'); g.addColorStop(1, '#8a5a00');
    ctx.fillStyle = g; ART.roundRect(ctx, 0, 0, W, H, 16); ctx.fill();
    // frame glow while a win is being shown
    if (S.present || S.idleHighlight) {
      const a = 0.35 + 0.35 * Math.sin(now / 160);
      ctx.save(); ctx.strokeStyle = 'rgba(255,240,160,' + a + ')'; ctx.lineWidth = 6; ART.roundRect(ctx, 3, 3, W - 6, H - 6, 14); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#fff6e0'; ART.roundRect(ctx, padX - 4, padY - 4, W - padX * 2 + 8, H - padY * 2 + 8, 10); ctx.fill();
  }

  // In-window sparkle particles (win cells, wild glints). Kept small and drawn on the reel canvas.
  let sparks = [];
  function addSpark(x, y, vx, vy, col, life) { if (sparks.length < 90) sparks.push({ x, y, vx, vy, col: col || '#ffe680', life: 1, decay: 1 / (life || 0.7), r: 2 + Math.random() * 3 }); }
  function drawSparks(dt) {
    const keep = [];
    for (let i = 0; i < sparks.length; i++) {
      const p = sparks[i]; p.life -= p.decay * dt; if (p.life <= 0) continue;
      p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; keep.push(p);
      star4(p.x, p.y, p.r * (0.5 + p.life), p.col, Math.min(1, p.life * 1.5));
    }
    sparks = keep;
  }

  let lastDrawT = 0;
  function drawReels(now) {
    if (!ctx) return;
    const dt = Math.min(0.05, (now - (lastDrawT || now)) / 1000); lastDrawT = now;
    drawFrame(now);
    ctx.save();
    ctx.beginPath(); ctx.rect(padX, padY, W - padX * 2, H - padY * 2); ctx.clip();
    // reel column shading
    for (let r = 0; r < E.REELS; r++) {
      const x = padX + r * cell;
      const g = ctx.createLinearGradient(0, padY, 0, H - padY);
      g.addColorStop(0, 'rgba(0,0,0,0.10)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
      ctx.fillStyle = g; ctx.fillRect(x, padY, cell, H - padY * 2);
      if (r > 0) { ctx.fillStyle = 'rgba(120,80,0,0.18)'; ctx.fillRect(x - 1, padY, 2, H - padY * 2); }
    }
    const size = cell * 0.86;
    const hl = S.present ? S.present.entry : (S.idleHighlight ? S.idleHighlight.entry : null);
    // symbols
    for (let r = 0; r < E.REELS; r++) {
      const R = S.reels[r]; if (!R) continue;
      const base = Math.floor(R.pos), frac = R.pos - base;
      // landing squash & stretch for ~320 ms after the reel stops
      let bounce = 0;
      if (R.phase === 'stopped' && R.stoppedAt) { const u = (now - R.stoppedAt) / 320; if (u < 1) bounce = Math.sin(u * Math.PI) * (1 - u); }
      const goldReel = S.reelGold && S.reelGold.indexOf(r) >= 0;
      const wipe = S.goldWipe && S.goldWipe.reels.indexOf(r) >= 0 ? clamp((now - S.goldWipe.t0) / 750, 0, 1) : -1;
      const wipeFront = padY + wipe * (H - padY * 2);
      for (let k = -1; k <= E.ROWS; k++) {
        let id = E.symbolAt(r, base + k);
        const y = padY + (k - frac) * cell + cell / 2;
        const x = padX + r * cell + cell / 2;
        if (k >= 0 && k < E.ROWS && (goldReel || (wipe >= 0 && y < wipeFront))) id = 'WILD';
        if (R.phase === 'spin') {
          // motion blur: a stretched ghost plus the symbol itself
          drawSym(id, x, y, size, { sy: 1.45, alpha: 0.35 });
          drawSym(id, x, y, size, { alpha: 0.75 });
        } else if (R.phase === 'land') {
          drawSym(id, x, y, size);
        } else {
          // idle life: gentle breathing/bobbing per cell, plus per-symbol character
          const ph = (r * 3 + k) * 0.9;
          const o = { s: 1 + 0.025 * Math.sin(now / 650 + ph) };
          const dy = 1.5 * Math.sin(now / 800 + ph);
          if (bounce) { o.sx = (o.s) * (1 + 0.10 * bounce); o.sy = (o.s) * (1 - 0.14 * bounce); }
          if (id === 'SCATTER') { const w = Math.max(0, Math.sin(now / 1500 + ph)); o.rot = 0.07 * Math.sin(now / 90) * w * w; }
          if (id === 'SEVEN') { // soft golden halo
            const a = 0.16 + 0.1 * Math.sin(now / 420 + ph);
            const g2 = ctx.createRadialGradient(x, y, size * 0.1, x, y, size * 0.6); g2.addColorStop(0, 'rgba(255,220,120,' + a + ')'); g2.addColorStop(1, 'rgba(255,220,120,0)');
            ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, size * 0.6, 0, 6.283); ctx.fill();
          }
          drawSym(id, x, y + dy, size, o);
          if (id === 'WILD') { // glint on the ingot
            const gl = ((now / 1400 + ph * 0.37) % 1 + 1) % 1;
            if (gl < 0.22) { const a = Math.sin(gl / 0.22 * Math.PI); star4(x - size * 0.18 + gl * size * 0.9, y - size * 0.12 + dy, size * 0.14 * a, '#ffffff', a); }
          }
        }
      }
      if (R.glow > 0) { // anticipation glow
        const a = 0.25 + 0.2 * Math.sin(now / 90);
        ctx.fillStyle = 'rgba(245,197,24,' + (a * R.glow) + ')'; ctx.fillRect(padX + r * cell, padY, cell, H - padY * 2);
      }
      if (wipe >= 0 && wipe < 1) { // Gold Rush wipe front: bright band + sparks
        const g4 = ctx.createLinearGradient(0, wipeFront - cell * 0.5, 0, wipeFront + cell * 0.2);
        g4.addColorStop(0, 'rgba(255,240,160,0)'); g4.addColorStop(0.7, 'rgba(255,230,120,0.85)'); g4.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g4; ctx.fillRect(padX + r * cell, wipeFront - cell * 0.5, cell, cell * 0.7);
        if (Math.random() < 0.7) addSpark(padX + r * cell + Math.random() * cell, wipeFront, (Math.random() - 0.5) * 120, -40 - Math.random() * 100, '#ffe680', 0.5);
      } else if (goldReel && !hl) { // settled gold reel shimmer
        const a = 0.10 + 0.08 * Math.sin(now / 300 + r);
        ctx.fillStyle = 'rgba(255,215,90,' + a + ')'; ctx.fillRect(padX + r * cell, padY, cell, H - padY * 2);
      }
    }
    // light sweep across the window every few seconds while idle (no win showing)
    if (!hl && S.reels.every(function (R) { return R.phase === 'stopped'; })) {
      const per = 4600, u = (now % per) / per;
      if (u < 0.22) {
        const sx = -W * 0.3 + (u / 0.22) * W * 1.6;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g3 = ctx.createLinearGradient(sx - W * 0.12, 0, sx + W * 0.12, 0);
        g3.addColorStop(0, 'rgba(255,255,255,0)'); g3.addColorStop(0.5, 'rgba(255,250,220,0.32)'); g3.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g3; ctx.translate(sx, 0); ctx.transform(1, 0, -0.35, 1, 0, 0); ctx.translate(-sx, 0);
        ctx.fillRect(sx - W * 0.2, 0, W * 0.4, H); ctx.restore();
      }
    }
    // win highlight
    if (hl && S.grid) drawHighlight(hl, now);
    drawSparks(dt);
    ctx.restore();
  }

  // Point at fraction u (0..1) along a polyline of points.
  function alongPath(pts, u) {
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
    let d = u * total;
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? d / seg[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }; } d -= seg[i]; }
    return pts[pts.length - 1];
  }

  function drawHighlight(entry, now) {
    if (!entry.t0) entry.t0 = now;
    const age = (now - entry.t0) / 1000;
    ctx.fillStyle = 'rgba(40,10,0,0.42)'; ctx.fillRect(padX, padY, W - padX * 2, H - padY * 2);
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    const isSc = entry.kind === 'scatter';
    const col = isSc ? '#e0262b' : (entry.kind === 'gold' ? '#ffd34d' : '#f5c518');
    if (entry.kind === 'line') {
      const line = E.LINES[entry.line];
      const pts = [];
      for (let r = 0; r < E.REELS; r++) { const c = cellCenter(r, line[r]); if (r === 0) pts.push({ x: padX, y: c.y }); pts.push(c); if (r === E.REELS - 1) pts.push({ x: W - padX, y: c.y }); }
      // payline path, drawn in from the left on reveal
      const reveal = Math.min(1, age / 0.45);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,230,128,0.95)'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = '#f5c518'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      const nSeg = pts.length - 1;
      for (let i = 1; i < pts.length; i++) { const segEnd = i / nSeg; if (segEnd <= reveal) ctx.lineTo(pts[i].x, pts[i].y); else { const f = (reveal - (i - 1) / nSeg) * nSeg; if (f > 0) ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f); break; } }
      ctx.stroke();
      ctx.restore();
      // travelling light pulse with a short comet tail
      if (reveal >= 1) {
        const u = ((age - 0.45) % 1.1) / 1.1;
        for (let t = 0; t < 4; t++) {
          const uu = u - t * 0.035; if (uu < 0) continue;
          const pnt = alongPath(pts, uu); const rr = cell * (0.22 - t * 0.04);
          const g = ctx.createRadialGradient(pnt.x, pnt.y, 0, pnt.x, pnt.y, rr);
          g.addColorStop(0, 'rgba(255,255,255,' + (0.95 - t * 0.2) + ')'); g.addColorStop(0.4, 'rgba(255,230,128,' + (0.6 - t * 0.12) + ')'); g.addColorStop(1, 'rgba(255,230,128,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pnt.x, pnt.y, rr, 0, 6.283); ctx.fill();
        }
      }
    }
    entry.positions.forEach(function (p, i) {
      const c = cellCenter(p[0], p[1]);
      // reveal pop (staggered left to right), then a lively pulse + wobble
      const a0 = Math.max(0, age - i * 0.06);
      const pop = a0 < 0.4 ? Math.sin(a0 / 0.4 * Math.PI) * 0.3 : 0;
      const sc = 1.02 + pop + 0.05 * Math.sin(now / 150 + i);
      let rot = 0.06 * Math.sin(now / 130 + i * 0.7);
      if (isSc) rot = a0 < 1.2 ? 0.16 * Math.sin(now / 35) * (1 - a0 / 1.2) : 0.05 * Math.sin(now / 200 + i);
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 18 + pulse * 12;
      ctx.fillStyle = '#fff6e0'; ART.roundRect(ctx, c.x - cell * 0.47, c.y - cell * 0.47, cell * 0.94, cell * 0.94, cell * 0.14); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = col; ctx.lineWidth = 3 + pulse * 2;
      ART.roundRect(ctx, c.x - cell * 0.47, c.y - cell * 0.47, cell * 0.94, cell * 0.94, cell * 0.14); ctx.stroke();
      drawSym(S.grid[p[0]][p[1]], c.x, c.y, cell * 0.9, { s: sc, rot: rot });
      // sparkles rising out of the winning cell
      if (Math.random() < (a0 < 0.5 ? 0.6 : 0.12)) addSpark(c.x + (Math.random() - 0.5) * cell * 0.7, c.y + (Math.random() - 0.5) * cell * 0.6, (Math.random() - 0.5) * 90, -60 - Math.random() * 120, isSc ? '#ffb3b3' : '#ffe680', 0.6 + Math.random() * 0.4);
    });
  }

  // ---------------------------------------------------------------- animation loop
  function requestFrame() { if (!S.raf) { S.lastFrame = performance.now(); S.raf = requestAnimationFrame(tick); } }
  function tick(now) {
    S.raf = 0;
    const dt = Math.min(0.05, (now - S.lastFrame) / 1000); S.lastFrame = now;
    let busy = false;
    const t = T();

    // reels
    for (let r = 0; r < E.REELS; r++) {
      const R = S.reels[r]; if (!R) continue;
      if (R.phase === 'spin') {
        busy = true;
        R.pos -= SPEED * dt;
        R.tickAcc += SPEED * dt; if (R.tickAcc >= 1) { R.tickAcc -= 1; if (r === 0) AU.sfx.reelTick(); }
        if (now >= R.stopAt) {
          const n = E.STRIPS[r].length; const s = S.stops[r];
          const pf = Math.floor(R.pos);
          let target = pf - ((((pf - s) % n) + n) % n);
          if (R.pos - target < 1.5) target -= n;
          R.target = target; R.start = R.pos; R.landT0 = now; R.phase = 'land';
        }
      } else if (R.phase === 'land') {
        busy = true;
        const u = clamp((now - R.landT0) / t.land, 0, 1);
        R.pos = R.target + (R.start - R.target) * (1 - easeOutBack(u));
        if (u >= 1) { R.pos = R.target; R.phase = 'stopped'; R.glow = 0; R.stoppedAt = now; onReelStopped(r); }
      }
      if (R.glow > 0 && R.phase === 'stopped') R.glow = 0;
    }

    // win presentation
    if (S.present) { busy = true; stepPresentation(now); }
    else if (S.idleHighlight) {
      busy = true;
      const ih = S.idleHighlight;
      if (now - ih.t > t.lineCycle * 1.4) { ih.t = now; ih.idx = (ih.idx + 1) % ih.entries.length; ih.entry = ih.entries[ih.idx]; ih.entry.t0 = now; }
    }

    // animated numbers
    if (Math.abs(S.shownCredits - creditsTarget()) > 0.5) {
      busy = true;
      const d = creditsTarget() - S.shownCredits;
      S.shownCredits += Math.abs(d) < 2 ? d : d * Math.min(1, dt * 10);
      setText('credits', fmt(S.shownCredits));
    }

    // Idle: keep the reels alive (breathing symbols, glints, light sweep) at ~30 fps to save battery;
    // busy phases (spinning, wins, count-ups) run at full frame rate.
    if (busy || document.hidden === false) {
      if (busy || now - lastDrawT >= 32) drawReels(now);
      requestFrame();
    }
  }
  function creditsTarget() {
    // during a count-up the credits climb together with the win display
    if (S.present && S.present.countTotal > 0) return P.credits - S.present.countTotal + S.shownWin;
    return P.credits;
  }

  // ---------------------------------------------------------------- spin flow
  function currentBet() { return bet(); }
  function canAfford() { return P.credits >= currentBet(); }

  function startSpin() {
    if (S.phase !== 'idle') return;
    const free = !!S.fs;
    const b = currentBet();
    if (!free) {
      if (P.credits < b) { refreshControls(); return; }
      P.credits -= b;
      P.jackpot += E.jackpotContribution(b);
      P.stats.wagered += b;
    }
    P.stats.spins += 1;
    S.stops = E.spinStops();
    S.goldRush = free ? null : E.rollGoldRush();
    S.reelGold = null; S.goldWipe = null;
    P.pending = { stops: S.stops.slice(), bet: b, free: free, gold: S.goldRush };
    save();

    S.phase = 'spinning';
    S.result = null; S.idleHighlight = null; S.present = null; S.shownWin = 0; S.anticipating = false;
    setText('win', '0'); hideBanner();
    setMsg(free ? ('Free spin ' + (S.fs.spins + 1)) : pick(['Good luck!', 'Here we go!', 'Spinning…', 'Feeling lucky?', 'Come on, Lucky 7s!']));
    const t = T();
    const now = performance.now();
    for (let r = 0; r < E.REELS; r++) {
      const R = S.reels[r];
      R.phase = 'spin'; R.stopAt = now + t.firstStop + r * t.stagger; R.glow = 0; R.tickAcc = 0;
    }
    AU.sfx.spinStart();
    refreshControls();
    requestFrame();
  }

  function onReelStopped(r) {
    AU.sfx.reelStop(r);
    // Anticipation: two red packets already showing with reels still to come → slow the rest down.
    const t = T();
    if (!S.anticipating && r <= 2) {
      let sc = 0;
      for (let i = 0; i <= r; i++) for (let k = 0; k < E.ROWS; k++) if (E.symbolAt(i, S.stops[i] + k) === 'SCATTER') sc++;
      if (sc >= 2) {
        S.anticipating = true;
        const now = performance.now();
        for (let j = r + 1; j < E.REELS; j++) { const R = S.reels[j]; R.stopAt = Math.max(R.stopAt, now) + t.anticipation * (j - r); R.glow = 1; }
        AU.sfx.anticipation();
        setMsg('Red packets… one more!');
      }
    }
    for (let k = 0; k < E.ROWS; k++) if (E.symbolAt(r, S.stops[r] + k) === 'SCATTER') { AU.sfx.scatterLand(r); break; }
    if (S.reels.every(function (R) { return R.phase === 'stopped'; })) later(onAllStopped, 60);
  }

  function onAllStopped() {
    const b = P.pending ? P.pending.bet : currentBet();
    if (S.goldRush && !S.reelGold) {
      // Gold Rush: sweep the chosen reel(s) to Gold, then settle the spin.
      S.goldWipe = { reels: S.goldRush, t0: performance.now() };
      showBanner('GOLD RUSH!', 'gold'); setText('bannerAmt', S.goldRush.length === 2 ? 'TWO GOLDEN REELS' : 'GOLDEN REEL');
      AU.sfx.gong(); later(function () { AU.sfx.fsIntro(); }, 250);
      const rect = cv.getBoundingClientRect();
      S.goldRush.forEach(function (r) { FX.coinFountain(14, rect.left + padX + (r + 0.5) * cell, rect.top + rect.height, 0.5); });
      P.stats.goldRush += 1; save();
      later(function () { S.reelGold = S.goldRush; S.goldWipe = null; hideBanner(); onAllStopped(); }, 1400);
      requestFrame();
      return;
    }
    S.grid = E.applyGoldRush(E.gridFromStops(S.stops), S.reelGold);
    const res = E.evaluate(S.grid, b, { freeSpins: !!S.fs, multiplier: S.fs ? S.fs.mult : undefined, jackpot: P.jackpot, noPick: !!S.reelGold });
    commitResult(res, b);
    present(res, b);
  }

  function commitResult(res, b) {
    P.credits += res.total;
    P.stats.won += res.total;
    if (res.jackpot.hit) { P.stats.jackpots += 1; P.jackpot = E.JACKPOT.seed; }
    if (res.total > P.best.win) P.best.win = res.total;
    if (P.credits > P.best.balance) P.best.balance = P.credits;
    if (res.total >= b * 4) P.stats.bigWins += 1;
    if (S.fs) {
      S.fs.spins += 1; S.fs.left -= 1; S.fs.total += res.total;
      if (res.scatter.freeSpins) S.fs.left += res.scatter.freeSpins;
      S.fs.usedMult = S.fs.mult;
      S.fs.mult = E.nextLadder(S.fs.mult, res.lineTotal + res.scatter.pay > 0);
      P.fs = S.fs;
    }
    P.pending = null;
    save();
    S.result = res;
  }

  // ---------------------------------------------------------------- win presentation
  function present(res, b) {
    const t = T();
    const tier = E.winTier(res.total, b, res.jackpot.hit);
    const entries = [];
    res.lineWins.forEach(function (w) { entries.push({ kind: 'line', line: w.line, positions: w.positions, caption: lineCaption(w) }); });
    if (res.scatter.count >= 3) entries.push({ kind: 'scatter', positions: res.scatter.positions, caption: res.scatter.count + ' Red Packets · ' + res.scatter.freeSpins + ' Free Spins' + (res.scatter.pay ? ' + ' + fmt(res.scatter.pay) : '') });
    if (res.pick.hit) entries.unshift({ kind: 'gold', positions: res.pick.positions, caption: 'Three Golds · FORTUNE PICK!' });

    if (tier === 'none' && !res.pick.hit) {
      setMsg(S.fs ? ('Free spin ' + S.fs.spins + ' of ' + (S.fs.spins + S.fs.left)) : pick(['So close!', 'Try again!', 'Next one!', 'Almost…']));
      S.phase = 'idle';
      updateHud();
      afterPresentation(res);
      return;
    }

    S.phase = 'present';
    const dur = tier === 'none' ? 1500 : t.tier[tier];
    if (res.pick.hit) AU.sfx.scatterLand(3);
    S.present = { res, tier, entries, idx: 0, entry: entries[0], entryT: performance.now(), t0: performance.now(), dur, countTotal: res.total, countDur: Math.min(dur * 0.75, 6500), lastTick: 0, done: false, b };
    if (entries[0]) entries[0].t0 = performance.now();
    S.shownWin = 0;
    if (entries[0]) setMsg(entries[0].caption);
    celebrate(tier, res, b);
    if (S.fs) setText('fsLeft', S.fs.left);
    requestFrame();
  }

  function lineCaption(w) {
    return 'Line ' + (w.line + 1) + ' · ' + w.count + ' × ' + ART.NAMES[w.symbol].split(' (')[0] + (w.wild ? ' + Gold ×2' : '') + ' · ' + fmt(w.pay);
  }

  function stepPresentation(now) {
    const pr = S.present; const t = T();
    // cycle entries
    if (pr.entries.length > 1 && now - pr.entryT > t.lineCycle) {
      pr.entryT = now; pr.idx = (pr.idx + 1) % pr.entries.length; pr.entry = pr.entries[pr.idx]; pr.entry.t0 = now;
      setMsg(pr.entry.caption); AU.sfx.winLine();
    }
    // count-up
    const u = clamp((now - pr.t0) / pr.countDur, 0, 1);
    const eased = 1 - Math.pow(1 - u, 2);
    S.shownWin = Math.round(pr.countTotal * eased);
    setText('win', fmt(S.shownWin));
    setText('bannerAmt', fmt(S.shownWin));
    if (pr.tier === 'jackpot') setText('jpWonAmt', fmt(S.shownWin));
    if (u < 1 && now - pr.lastTick > (pr.tier === 'win' ? 70 : 45)) { pr.lastTick = now; AU.sfx.countTick(u); }
    if (now - pr.t0 >= pr.dur) finishPresentation();
  }

  function finishPresentation() {
    const pr = S.present; if (!pr) return;
    S.present = null;
    S.shownWin = pr.countTotal;
    setText('win', fmt(pr.countTotal)); setText('bannerAmt', fmt(pr.countTotal));
    S.shownCredits = P.credits; setText('credits', fmt(P.credits));
    S.idleHighlight = pr.entries.length ? { entries: pr.entries, idx: pr.idx, entry: pr.entries[pr.idx], t: performance.now() } : null;
    sparks = [];
    if (pr.tier !== 'jackpot') { hideBanner(); FX.clear(); }
    const ws = $('win'); if (ws && ws.parentElement) { ws.parentElement.classList.remove('pop'); void ws.offsetWidth; ws.parentElement.classList.add('pop'); }
    S.phase = 'idle';
    updateHud();
    afterPresentation(pr.res);
  }

  function skipPresentation() { if (S.present && S.present.tier !== 'jackpot') finishPresentation(); }

  function celebrate(tier, res, b) {
    const rect = cv.getBoundingClientRect();
    const midX = rect.left + rect.width / 2, midY = rect.top + rect.height / 2;
    const t = T();
    if (res.scatter.count >= 3) {
      res.scatter.positions.forEach(function (p, i) { const c = cellCenter(p[0], p[1]); later(function () { FX.redPackets(8, rect.left + c.x, rect.top + c.y); }, i * 120); });
      AU.sfx.fsIntro();
    }
    switch (tier) {
      case 'win':
        AU.sfx.winLine();
        if (res.total >= b) { FX.coinFountain(10, midX, rect.bottom, 0.7); }
        break;
      case 'big':
        showBanner('BIG WIN', '');
        AU.sfx.fanfare(1); AU.sfx.cymbal();
        FX.coinFountain(40, midX, rect.bottom, 1);
        later(function () { FX.coinFountain(30, midX, rect.bottom, 1.2); }, 600);
        FX.lanterns(4);
        break;
      case 'mega':
        showBanner('MEGA WIN', 'mega');
        AU.sfx.gong(); later(function () { AU.sfx.fanfare(2); }, 500);
        FX.coinFountain(50, midX, rect.bottom, 1.2);
        FX.firecrackerString('left', 12); later(function () { FX.firecrackerString('right', 12); }, 300);
        FX.lanterns(6); FX.goldRain(18, t.tier.mega * 0.7);
        later(function () { FX.fuGlyph(2200); }, 900);
        break;
      case 'epic':
        showBanner('EPIC WIN', 'epic');
        AU.sfx.gong(); later(function () { AU.sfx.fanfare(3); }, 400);
        drumRoll(8);
        FX.dragon(4800); FX.fireworksShow(9, t.tier.epic * 0.8); FX.goldRain(30, t.tier.epic * 0.8);
        FX.firecrackerString('left', 16); FX.firecrackerString('right', 16); FX.lanterns(8);
        later(function () { FX.fuGlyph(2600); }, 1500);
        break;
      case 'jackpot':
        // Let the five 7s be seen on the reels first, then bring in the full-screen overlay.
        showBanner('JACKPOT!', '');
        setText('jpWonAmt', '0');
        setText('jpSub', 'Five Lucky 7s \u2014 meter ' + fmt(res.jackpot.amount) + ' + line wins ' + fmt(res.total - res.jackpot.amount));
        later(function () { if (S.present && S.present.tier === 'jackpot') { hideBanner(); show('jackpotOverlay'); } }, 1800);
        AU.sfx.gong(); later(function () { AU.sfx.gong(); }, 900); later(function () { AU.sfx.fanfare(3); }, 1200);
        drumRoll(16);
        FX.fireworksShow(16, 7500); FX.goldRain(40, 7500); FX.dragon(5000); later(function () { FX.dragon(5000); }, 3000);
        FX.firecrackerString('left', 20); FX.firecrackerString('right', 20); FX.lanterns(10); FX.confetti(120);
        later(function () { FX.fuGlyph(3000); }, 2000);
        break;
    }
    themeFlourish(tier);
  }
  // Festival-flavoured extras layered on top of the normal celebration (big wins and up).
  function themeFlourish(tier) {
    const th = S.theme; if (!th || tier === 'win' || tier === 'none') return;
    switch (th.variant) {
      case 'cny': case 'lantern': FX.redPackets(18); later(function () { FX.firecrackerString('left', 8); }, 200); if (th.variant === 'lantern') FX.lanterns(6); break;
      case 'zhongqiu': FX.lanterns(5); break;
      case 'duanwu': drumRoll(6); FX.confetti(40); break;
      case 'newyear': FX.fireworksShow(4, 2600); FX.confetti(60); break;
      case 'birthday': FX.confetti(120); later(function () { FX.confetti(80); }, 700); break;
      case 'xmas': case 'dongzhi': FX.confetti(70); break;
      case 'qixi': case 'fathersday': FX.confetti(50); break;
    }
  }
  function drumRoll(n) { for (let i = 0; i < n; i++) later(function () { AU.sfx.drum(i % 4 === 3 ? 'tom' : 'kick'); }, i * 160); }

  function showBanner(title, cls) {
    const b = $('banner'); if (!b) return;
    b.className = cls || ''; setText('bannerTitle', title); setText('bannerAmt', '0'); b.classList.remove('hidden');
  }
  function hideBanner() { const b = $('banner'); if (b) b.classList.add('hidden'); }

  // ---------------------------------------------------------------- after a spin
  function afterPresentation(res) {
    const t = T();
    if (res.jackpot.hit) return; // wait for COLLECT on the jackpot overlay
    const b = res.bet || (S.fs ? S.fs.bet : E.BETS[P.betIdx]);
    if (S.fs) {
      if (res.scatter.freeSpins) { setMsg('+' + res.scatter.freeSpins + ' more free spins!'); setText('fsLeft', S.fs.left); }
      else if (res.total > 0 && S.fs.mult > S.fs.usedMult) setMsg('Multiplier rises to \u00D7' + S.fs.mult + '!');
      updateFsBadge();
      if (res.pick && res.pick.hit) { later(function () { beginPick(S.fs.bet); }, 500); refreshControls(); return; }
      continueFreeSpins(res.total > 0);
      return;
    }
    // base game: Fortune Pick first, then free spins, else maybe the Lucky Wheel or a Double Up offer
    S.after = { fs: res.scatter.freeSpins || 0, bet: b };
    if (res.pick && res.pick.hit) { later(function () { beginPick(b); }, 500); return; }
    if (S.after.fs) { const n = S.after.fs; S.after = null; later(function () { beginFreeSpins(n, b); }, 500); return; }
    S.after = null;
    if (res.total === 0 && E.rollWheel()) { later(function () { beginWheel(b); }, 450); return; }
    if (res.total > 0 && P.gamble && S.auto === 0 && E.canDouble(res.total, b)) { offerDouble(res.total, b); return; }
    continueBaseGame();
  }
  function continueFreeSpins(hadWin) {
    const t = T();
    if (S.fs.left > 0) { later(startSpin, t.gap + (hadWin ? 300 : 0)); }
    else { later(endFreeSpins, 400); }
    refreshControls();
  }
  function continueBaseGame() {
    const t = T();
    if (S.auto > 0) {
      if (!canAfford()) { S.auto = 0; setMsg('Auto stopped \u2014 not enough credits'); }
      else { later(function () { if (S.auto > 0 && S.phase === 'idle') { S.auto -= 1; startSpin(); } }, t.gap); }
    }
    refreshControls();
    if (S.auto === 0) maybeBirthdayGift();
  }
  // Called when a bonus (pick / wheel / gamble) closes: carry on with whatever was queued.
  function finishBonus() {
    S.phase = 'idle'; updateHud(); refreshControls();
    if (S.fs) { continueFreeSpins(true); return; }
    if (S.after && S.after.fs) { const n = S.after.fs, b = S.after.bet; S.after = null; later(function () { beginFreeSpins(n, b); }, 400); return; }
    S.after = null;
    continueBaseGame();
  }
  function updateFsBadge() {
    if (!S.fs) return;
    setText('fsLeft', S.fs.left); setText('fsMult', '\u00D7' + S.fs.mult);
  }

  function beginFreeSpins(n, atBet) {
    S.fs = { left: n, total: 0, bet: atBet || E.BETS[P.betIdx], spins: 0, mult: E.FS_LADDER[0], usedMult: E.FS_LADDER[0] };
    P.fs = S.fs; P.stats.fsRounds += 1; save();
    S.phase = 'overlay';
    setText('fsIntroNum', n);
    const para = $('fsIntroOverlay') && $('fsIntroOverlay').querySelector('p');
    if (para) para.innerHTML = 'Wins start at <b>\u00D72</b> and every winning spin in a row climbs the ladder: \u00D73, \u00D74, \u00D75. A blank spin drops back to \u00D72. More red packets add more spins.';
    show('fsIntroOverlay');
    FX.redPackets(30); FX.coinFountain(30);
    AU.sfx.fsIntro();
    later(function () { if (!$('fsIntroOverlay').classList.contains('hidden')) startFreeSpins(); }, 5000);
  }
  function startFreeSpins() {
    hide('fsIntroOverlay');
    updateFsBadge(); show('fsBadge');
    AU.setTempo(1.15);
    S.phase = 'idle';
    refreshControls();
    later(startSpin, 300);
  }
  function endFreeSpins() {
    const total = S.fs.total, b = S.fs.bet;
    S.phase = 'overlay';
    setText('fsEndTotal', fmt(total));
    show('fsEndOverlay');
    const tier = E.winTier(total, b, false);
    if (tier === 'epic' || tier === 'mega') { FX.fireworksShow(6, 3000); FX.goldRain(20, 3000); AU.sfx.gong(); }
    else if (tier === 'big') { FX.coinFountain(40); AU.sfx.fanfare(1); }
    else { FX.coinFountain(15); AU.sfx.winLine(); }
    later(function () { if (!$('fsEndOverlay').classList.contains('hidden')) collectFreeSpins(); }, 6000);
  }
  function collectFreeSpins() {
    hide('fsEndOverlay'); hide('fsBadge');
    S.fs = null; P.fs = null; save();
    AU.setTempo(1);
    S.phase = 'idle';
    setMsg('Back to normal play — good luck!');
    updateHud(); refreshControls();
    if (S.auto > 0) later(function () { if (S.auto > 0 && S.phase === 'idle' && canAfford()) { S.auto -= 1; startSpin(); } }, T().gap);
  }
  function collectJackpot() {
    hide('jackpotOverlay'); hideBanner(); FX.clear();
    S.present = null; S.phase = 'idle';
    S.shownCredits = P.credits; updateHud(); refreshControls();
    setMsg('JACKPOT collected! The meter starts again at ' + fmt(E.JACKPOT.seed) + '.');
    const res = S.result;
    if (S.jpFromWheel) { S.jpFromWheel = false; finishBonus(); return; }
    if (res && S.fs) { afterPresentation({ jackpot: { hit: false }, scatter: res.scatter, pick: res.pick, total: res.total }); }
    else if (res && res.scatter.freeSpins) later(function () { beginFreeSpins(res.scatter.freeSpins); }, 500);
  }

  // ---------------------------------------------------------------- bonus: Fortune Pick
  // Three Golds (one on each of reels 2–4) → open 3 of 12 red packets; each holds a multiple of the bet.
  function beginPick(b) {
    P.bonus = { type: 'pick', bet: b, layout: E.pickLayout(), opened: [], total: 0, id: Date.now() };
    P.stats.picks += 1; save();
    showPick();
  }
  function showPick() {
    const bo = P.bonus; if (!bo || bo.type !== 'pick') return;
    S.phase = 'overlay';
    const grid = $('pickGrid'); grid.innerHTML = '';
    bo.layout.forEach(function (mult, i) {
      const btn = document.createElement('button'); btn.className = 'packet'; btn.setAttribute('data-i', i);
      const opened = bo.opened.indexOf(i) >= 0;
      btn.innerHTML = opened ? '<b>' + fmt(mult * bo.bet) + '</b><span>\u00D7' + mult + '</span>' : '<i>\u798F</i>';
      if (opened) btn.classList.add('open');
      btn.addEventListener('click', function () { openPacket(i); });
      grid.appendChild(btn);
    });
    updatePickText();
    hide('pickCollectRow'); if (bo.opened.length >= E.PICK.picks) revealPickRest();
    show('pickOverlay');
    AU.sfx.fsIntro(); FX.redPackets(24);
    armPickAutoPick();
  }
  function updatePickText() {
    const bo = P.bonus; const left = E.PICK.picks - bo.opened.length;
    setText('pickLeft', left > 0 ? ('Open ' + left + ' more red packet' + (left === 1 ? '' : 's')) : 'All picked!');
    setText('pickTotal', fmt(bo.total));
  }
  let pickTimer = 0;
  function armPickAutoPick() { // if nobody taps (e.g. autoplay), open packets by itself
    clearTimeout(pickTimer);
    pickTimer = later(function () { const bo = P.bonus; if (!bo || bo.type !== 'pick') return; if (bo.opened.length < E.PICK.picks) { const closed = bo.layout.map(function (_, i) { return i; }).filter(function (i) { return bo.opened.indexOf(i) < 0; }); openPacket(closed[Math.floor(Math.random() * closed.length)]); } else collectPick(); }, S.auto > 0 ? 1500 : 12000);
  }
  function openPacket(i) {
    const bo = P.bonus; if (!bo || bo.type !== 'pick' || bo.opened.indexOf(i) >= 0 || bo.opened.length >= E.PICK.picks) return;
    const prize = bo.layout[i] * bo.bet;
    bo.opened.push(i); bo.total += prize;
    P.credits += prize; P.stats.won += prize; if (P.credits > P.best.balance) P.best.balance = P.credits;
    save();
    const btn = $('pickGrid').querySelector('[data-i="' + i + '"]');
    if (btn) { btn.classList.add('open'); btn.innerHTML = '<b>' + fmt(prize) + '</b><span>\u00D7' + bo.layout[i] + '</span>'; }
    AU.sfx.coin(); AU.sfx.winLine();
    if (btn) { const r = btn.getBoundingClientRect(); FX.coinFountain(bo.layout[i] >= 5 ? 30 : 12, r.left + r.width / 2, r.top + r.height / 2, 0.8); }
    if (bo.layout[i] >= 5) AU.sfx.fanfare(1);
    updatePickText(); updateHud();
    if (bo.opened.length >= E.PICK.picks) { later(revealPickRest, 500); }
    armPickAutoPick();
  }
  function revealPickRest() {
    const bo = P.bonus; if (!bo) return;
    $('pickGrid').querySelectorAll('.packet').forEach(function (btn) {
      const i = parseInt(btn.getAttribute('data-i'), 10);
      if (bo.opened.indexOf(i) < 0) { btn.classList.add('missed'); btn.innerHTML = '<b>' + fmt(bo.layout[i] * bo.bet) + '</b><span>\u00D7' + bo.layout[i] + '</span>'; }
    });
    show('pickCollectRow');
    if (bo.total >= bo.bet * 10) { AU.sfx.fanfare(2); FX.goldRain(20, 2500); }
  }
  function collectPick() {
    clearTimeout(pickTimer);
    const bo = P.bonus; const total = bo ? bo.total : 0;
    P.bonus = null; save();
    hide('pickOverlay');
    setMsg('Fortune Pick paid ' + fmt(total) + '!');
    if (total > P.best.win) { P.best.win = total; save(); }
    finishBonus();
  }
  on('btnPickCollect', 'click', collectPick);

  // ---------------------------------------------------------------- bonus: Lucky Wheel
  // Mystery trigger after a losing base-game spin. Twelve equal segments; the result is drawn
  // when the wheel is triggered (and saved), then the wheel animates to it.
  const wheelCv = $('wheelCanvas'); const wctx = wheelCv ? wheelCv.getContext('2d') : null;
  let wheel = null; // { angle, from, to, t0, dur, spinning, done }
  function beginWheel(b) {
    P.bonus = { type: 'wheel', bet: b, seg: E.spinWheel(), spun: false, id: Date.now() };
    P.stats.wheels += 1; save();
    showWheel();
  }
  function showWheel() {
    const bo = P.bonus; if (!bo || bo.type !== 'wheel') return;
    S.phase = 'overlay';
    wheel = { angle: 0, spinning: false, done: false };
    setText('wheelResult', ''); show('btnWheelSpin'); hide('wheelCollectRow');
    show('wheelOverlay');
    drawWheel();
    AU.sfx.fsIntro(); FX.confetti(40);
    const id = bo.id;
    later(function () { if (P.bonus && P.bonus.id === id && wheel && !wheel.spinning && !wheel.done) spinWheelNow(); }, S.auto > 0 ? 1200 : 4000);
  }
  function wheelLabel(seg) { return seg.t === 'x' ? seg.v + '\u00D7' : seg.t === 'fs' ? seg.v + ' FREE' : 'JACKPOT'; }
  function drawWheel() {
    if (!wctx || !wheel) return;
    const size = 300, r = size / 2 - 6, cx = size / 2, cy = size / 2; const dp = Math.min(2, window.devicePixelRatio || 1);
    if (wheelCv.width !== size * dp) { wheelCv.width = size * dp; wheelCv.height = size * dp; wheelCv.style.width = size + 'px'; wheelCv.style.height = size + 'px'; }
    wctx.setTransform(dp, 0, 0, dp, 0, 0); wctx.clearRect(0, 0, size, size);
    const segs = E.WHEEL.segments, n = segs.length, step = Math.PI * 2 / n;
    wctx.save(); wctx.translate(cx, cy); wctx.rotate(wheel.angle);
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * step, a1 = a0 + step; const seg = segs[i];
      wctx.beginPath(); wctx.moveTo(0, 0); wctx.arc(0, 0, r, a0, a1); wctx.closePath();
      wctx.fillStyle = seg.t === 'jackpot' ? '#e0262b' : seg.t === 'fs' ? '#2f6fbf' : (i % 2 ? '#f5c518' : '#fff3b0'); wctx.fill();
      wctx.strokeStyle = '#8a5a00'; wctx.lineWidth = 2; wctx.stroke();
      wctx.save(); wctx.rotate(a0 + step / 2); wctx.textAlign = 'right'; wctx.textBaseline = 'middle';
      wctx.fillStyle = seg.t === 'x' ? '#4a0509' : '#fff'; wctx.font = '900 ' + (seg.t === 'jackpot' ? 13 : 17) + 'px Arial, Helvetica, sans-serif';
      wctx.fillText(wheelLabel(seg), r - 10, 0); wctx.restore();
    }
    wctx.restore();
    // hub + rim
    wctx.strokeStyle = '#ffd34d'; wctx.lineWidth = 6; wctx.beginPath(); wctx.arc(cx, cy, r + 2, 0, 6.283); wctx.stroke();
    const g = wctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 26); g.addColorStop(0, '#fff7c2'); g.addColorStop(1, '#b07a00');
    wctx.fillStyle = g; wctx.beginPath(); wctx.arc(cx, cy, 24, 0, 6.283); wctx.fill(); wctx.strokeStyle = '#8a5a00'; wctx.lineWidth = 2; wctx.stroke();
    // pointer at the top
    wctx.fillStyle = '#e0262b'; wctx.beginPath(); wctx.moveTo(cx - 14, 2); wctx.lineTo(cx + 14, 2); wctx.lineTo(cx, 30); wctx.closePath(); wctx.fill(); wctx.strokeStyle = '#fff3b0'; wctx.lineWidth = 2; wctx.stroke();
  }
  function spinWheelNow() {
    const bo = P.bonus; if (!bo || bo.type !== 'wheel' || !wheel || wheel.spinning || wheel.done) return;
    hide('btnWheelSpin');
    const n = E.WHEEL.segments.length, step = Math.PI * 2 / n;
    // segment `seg` must end under the pointer (top): rotate by -(centre of segment) plus whole turns
    const jitter = (Math.random() - 0.5) * step * 0.6;
    wheel.from = wheel.angle; wheel.to = -(bo.seg * step + step / 2 + jitter) - Math.PI * 2 * 6; wheel.t0 = performance.now(); wheel.dur = 5200; wheel.spinning = true; wheel.lastSeg = -1;
    AU.sfx.spinStart();
    const step2 = function (now) {
      if (!wheel || !wheel.spinning) return;
      const u = clamp((now - wheel.t0) / wheel.dur, 0, 1); const e = 1 - Math.pow(1 - u, 3);
      wheel.angle = wheel.from + (wheel.to - wheel.from) * e;
      const segNow = Math.floor(((-wheel.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / step);
      if (segNow !== wheel.lastSeg) { wheel.lastSeg = segNow; AU.sfx.reelTick(); }
      drawWheel();
      if (u < 1) requestAnimationFrame(step2); else { wheel.spinning = false; wheel.done = true; wheelLanded(); }
    };
    requestAnimationFrame(step2);
  }
  function wheelLanded() {
    const bo = P.bonus; if (!bo) return;
    const seg = E.WHEEL.segments[bo.seg];
    let text = '';
    if (seg.t === 'x') {
      const prize = seg.v * bo.bet;
      P.credits += prize; P.stats.won += prize; if (P.credits > P.best.balance) P.best.balance = P.credits; if (prize > P.best.win) P.best.win = prize;
      text = 'You win ' + fmt(prize) + ' (' + seg.v + '\u00D7 your bet)';
      AU.sfx.fanfare(seg.v >= 8 ? 2 : 1); FX.coinFountain(seg.v >= 8 ? 50 : 25);
      if (seg.v >= 8) FX.goldRain(18, 2500);
    } else if (seg.t === 'fs') {
      text = seg.v + ' FREE SPINS!';
      S.after = { fs: seg.v, bet: bo.bet };
      AU.sfx.fsIntro(); FX.redPackets(30);
    } else {
      const amount = Math.round(P.jackpot);
      P.credits += amount; P.stats.won += amount; P.stats.jackpots += 1; P.jackpot = E.JACKPOT.seed;
      if (P.credits > P.best.balance) P.best.balance = P.credits; if (amount > P.best.win) P.best.win = amount;
      text = 'JACKPOT! ' + fmt(amount);
      bo.jackpotAmount = amount;
    }
    bo.spun = true; save();
    setText('wheelResult', text);
    show('wheelCollectRow');
    updateHud();
    const id = bo.id;
    later(function () { if (P.bonus && P.bonus.type === 'wheel' && P.bonus.id === id) collectWheel(); }, S.auto > 0 ? 2000 : 8000);
  }
  function collectWheel() {
    const bo = P.bonus; if (!bo) return;
    const seg = E.WHEEL.segments[bo.seg];
    P.bonus = null; save();
    hide('wheelOverlay'); wheel = null;
    if (seg.t === 'jackpot') {
      // hand over to the jackpot celebration overlay
      S.jpFromWheel = true;
      setText('jpSub', 'Lucky Wheel \u2014 the whole meter is yours'); setText('jpWonAmt', fmt(bo.jackpotAmount || 0));
      show('jackpotOverlay'); AU.sfx.gong(); later(function () { AU.sfx.fanfare(3); }, 600);
      FX.fireworksShow(12, 6000); FX.goldRain(30, 6000); FX.dragon(5000); FX.firecrackerString('left', 16); FX.firecrackerString('right', 16);
      S.phase = 'overlay';
      return;
    }
    setMsg(seg.t === 'x' ? ('Lucky Wheel paid ' + fmt(seg.v * bo.bet) + '!') : ('Lucky Wheel: ' + seg.v + ' free spins!'));
    finishBonus();
  }
  on('btnWheelSpin', 'click', spinWheelNow);
  on('btnWheelCollect', 'click', collectWheel);

  // ---------------------------------------------------------------- bonus: Double Up
  // Optional after a base-game win of 1×–25× the bet: guess Red or Black. Fair 50/50, up to 3 rounds.
  let gambleTimer = 0, gambleTick = 0;
  function offerDouble(amount, b) {
    S.gamble = { amount: amount, bet: b, rounds: 0, busy: false };
    S.phase = 'overlay';
    renderGamble('Pick a colour to try for ' + fmt(amount * 2) + ' \u2014 or collect ' + fmt(amount) + '.');
    setText('gambleCard', '?'); $('gambleCard').className = 'card';
    show('gambleOverlay');
    armGambleTimer(7);
  }
  function renderGamble(msg) {
    const g = S.gamble; if (!g) return;
    setText('gambleAmt', fmt(g.amount)); setText('gambleMsg', msg);
    setText('btnGambleCollect', 'COLLECT ' + fmt(g.amount));
    const can = g.rounds < E.DOUBLE.maxRounds;
    $('btnGambleRed').disabled = !can || g.busy; $('btnGambleBlack').disabled = !can || g.busy;
  }
  function armGambleTimer(secs) {
    clearInterval(gambleTick); clearTimeout(gambleTimer);
    let left = secs; setText('gambleTimer', 'Auto-collect in ' + left + 's');
    gambleTick = setInterval(function () { left--; setText('gambleTimer', left > 0 ? ('Auto-collect in ' + left + 's') : ''); }, 1000);
    gambleTimer = later(collectGamble, secs * 1000);
  }
  function gambleGuess(colour) {
    const g = S.gamble; if (!g || g.busy || g.rounds >= E.DOUBLE.maxRounds) return;
    clearInterval(gambleTick); clearTimeout(gambleTimer); setText('gambleTimer', '');
    g.busy = true; renderGamble('Turning the card\u2026');
    const card = $('gambleCard'); card.className = 'card flip'; setText('gambleCard', '');
    AU.sfx.button();
    later(function () {
      const draw = E.doubleDraw();
      card.className = 'card ' + draw; setText('gambleCard', draw === 'red' ? '\u2665' : '\u2660');
      g.rounds += 1;
      if (draw === colour) {
        P.credits += g.amount; P.stats.won += g.amount; P.stats.gambleWon += 1; g.amount *= 2;
        if (P.credits > P.best.balance) P.best.balance = P.credits; if (g.amount > P.best.win) P.best.win = g.amount;
        save(); updateHud();
        AU.sfx.fanfare(1); FX.coinFountain(30);
        g.busy = false;
        if (g.rounds >= E.DOUBLE.maxRounds) { renderGamble(draw.toUpperCase() + '! Doubled to ' + fmt(g.amount) + '. That is the maximum \u2014 collecting.'); later(collectGamble, 1800); }
        else { renderGamble(draw.toUpperCase() + '! Doubled to ' + fmt(g.amount) + '. Again, or collect?'); armGambleTimer(7); }
      } else {
        P.credits -= g.amount; P.stats.gambleLost += 1; const lost = g.amount; g.amount = 0;
        save(); updateHud();
        AU.sfx.lose();
        renderGamble(draw.toUpperCase() + ' \u2014 not this time. ' + fmt(lost) + ' gone. Better luck on the next spin!');
        setText('btnGambleCollect', 'OK');
        $('btnGambleRed').disabled = true; $('btnGambleBlack').disabled = true;
        later(collectGamble, 2500);
      }
    }, 900);
  }
  function collectGamble() {
    clearInterval(gambleTick); clearTimeout(gambleTimer);
    const g = S.gamble; S.gamble = null;
    hide('gambleOverlay');
    if (g && g.amount > 0 && g.rounds > 0) setMsg('Collected ' + fmt(g.amount) + '!');
    finishBonus();
  }
  on('btnGambleRed', 'click', function () { gambleGuess('red'); });
  on('btnGambleBlack', 'click', function () { gambleGuess('black'); });
  on('btnGambleCollect', 'click', collectGamble);

  // ---------------------------------------------------------------- refill / bet
  function refill() {
    if (S.phase !== 'idle') return;
    P.credits += E.REFILL_CREDITS; P.stats.refills += 1;
    if (P.credits > P.best.balance) P.best.balance = P.credits;
    save();
    AU.sfx.refill(); FX.coinFountain(25);
    setMsg('+' + fmt(E.REFILL_CREDITS) + ' credits. Good luck!');
    updateHud(); refreshControls();
  }
  function changeBet(d) {
    if (S.fs || S.phase === 'spinning') return;
    const i = clamp(P.betIdx + d, 0, E.BETS.length - 1);
    if (i === P.betIdx) return;
    P.betIdx = i; save(); AU.sfx.button();
    updateHud(); refreshControls(); renderPaytable();
  }

  // ---------------------------------------------------------------- HUD
  function updateHud() {
    setText('jpValue', fmt(P.jackpot));
    setText('betTxt', fmt(currentBet())); setText('betBig', fmt(currentBet()));
    if (!S.present) { S.shownCredits = P.credits; setText('credits', fmt(P.credits)); }
    if (S.fs) { updateFsBadge(); show('fsBadge'); } else hide('fsBadge');
    requestFrame();
  }
  function refreshControls() {
    const spin = $('btnSpin'), rf = $('btnRefill');
    const idle = S.phase === 'idle';
    const inFs = !!S.fs;
    if (S.auto > 0) { spin.textContent = 'STOP · ' + S.auto; spin.classList.add('stop'); }
    else { spin.textContent = inFs ? 'FREE SPIN' : 'SPIN'; spin.classList.remove('stop'); }
    const needRefill = !inFs && P.credits < currentBet();
    if (needRefill && idle) { hide('btnSpin'); show('btnRefill'); rf.textContent = 'REFILL +' + fmt(E.REFILL_CREDITS); setMsg(P.credits > 0 ? 'Not enough for this bet — lower the bet or refill.' : 'Out of credits — tap REFILL to keep playing.'); }
    else { show('btnSpin'); hide('btnRefill'); }
    spin.disabled = inFs && S.auto === 0; // free spins run by themselves
    $('btnBetDown').disabled = inFs || P.betIdx === 0 || S.phase === 'spinning';
    $('btnBetUp').disabled = inFs || P.betIdx === E.BETS.length - 1 || S.phase === 'spinning';
    const auto = $('btnAuto'); if (auto) { auto.classList.toggle('active', S.auto > 0); }
    const turbo = $('btnTurbo'); if (turbo) turbo.setAttribute('aria-pressed', P.turbo ? 'true' : 'false');
  }
  function setMsg(t) { setText('msg', t); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // ---------------------------------------------------------------- paytable & records
  function renderPaytable() {
    const list = $('paysList'); if (!list) return;
    const b = currentBet(); const lb = b / E.LINE_COUNT;
    setText('paysBet', fmt(b));
    list.innerHTML = '';
    E.SYMBOLS.forEach(function (id) {
      const row = document.createElement('div'); row.className = 'payRow';
      const c = document.createElement('canvas'); c.width = 112; c.height = 112;
      const cx = c.getContext('2d'); cx.fillStyle = '#fff6e0'; cx.fillRect(0, 0, 112, 112); ART.drawSymbol(cx, id, 56, 56, 96);
      const info = document.createElement('div');
      const name = document.createElement('div'); name.className = 'pname'; name.textContent = ART.NAMES[id];
      info.appendChild(name);
      const vals = document.createElement('div'); vals.className = 'pvals';
      if (E.PAY[id]) {
        vals.textContent = Object.keys(E.PAY[id]).map(function (k) { return k + '× = ' + fmt(E.PAY[id][k] * lb); }).join(' \u00B7 ');
        info.appendChild(vals);
        if (id === 'SEVEN') { const n = document.createElement('div'); n.className = 'pnote'; n.textContent = 'Five Lucky 7s on a line also win the whole JACKPOT meter.'; info.appendChild(n); }
      } else if (id === 'WILD') {
        const n = document.createElement('div'); n.className = 'pnote'; n.textContent = 'Stands in for any fruit, Bell, Bar or 7 (not the Red Packet). Appears on reels 2, 3 and 4. Any line win that uses a Gold is doubled. Three Golds at once (one on each of reels 2, 3 and 4) start the FORTUNE PICK.'; info.appendChild(n);
      } else if (id === 'SCATTER') {
        vals.textContent = Object.keys(E.SCATTER_PAY).map(function (k) { return k + '× = ' + fmt(E.SCATTER_PAY[k] * b) + ' + ' + E.FREE_SPINS[k] + ' free spins'; }).join(' \u00B7 ');
        info.appendChild(vals);
        const n = document.createElement('div'); n.className = 'pnote'; n.textContent = 'Counts anywhere on the reels. Free-spin wins start at \u00D72 and climb \u00D73 \u2192 \u00D74 \u2192 \u00D75 with every winning spin in a row (a blank spin resets to \u00D72). More red packets during free spins add more spins.'; info.appendChild(n);
      }
      row.appendChild(c); row.appendChild(info); list.appendChild(row);
    });
    const h = document.createElement('h3'); h.textContent = 'BONUS ROUNDS'; list.appendChild(h);
    const bonuses = [
      ['\u2728 Gold Rush', 'At random, before the reels stop, one or two of reels 2\u20134 turn completely Gold \u2014 every symbol on them becomes a Gold for that spin.'],
      ['\uD83E\uDDE7 Fortune Pick', 'Three Golds showing at once (one on each of reels 2, 3 and 4): open 3 of 12 red packets. Each holds ' + Math.min.apply(null, E.PICK.prizes) + '\u00D7 to ' + Math.max.apply(null, E.PICK.prizes) + '\u00D7 your bet (' + fmt(Math.min.apply(null, E.PICK.prizes) * b) + ' to ' + fmt(Math.max.apply(null, E.PICK.prizes) * b) + ' at your current bet).'],
      ['\uD83C\uDFA1 Lucky Wheel', 'Can appear by surprise after a spin that won nothing. Twelve equal slices: 2\u00D7 to 15\u00D7 your bet, 5 or 10 free spins, or the whole JACKPOT meter.'],
      ['\uD83C\uDCCF Double Up', 'After a win of 1\u00D7 to 25\u00D7 your bet you may guess Red or Black: right doubles the win, wrong loses it. A fair 50/50, up to 3 times. Always optional \u2014 COLLECT keeps the win (auto-collects after 7 s). Can be switched off in Settings.'],
      ['\u2666 JACKPOT', 'Five Lucky 7s on a line (Golds may fill in) win the whole meter. ' + (E.JACKPOT.rate * 100).toFixed(1) + '% of every bet is added; it restarts at ' + fmt(E.JACKPOT.seed) + ' after it is won.'],
    ];
    bonuses.forEach(function (bn) { const row = document.createElement('div'); row.className = 'bonusRow'; row.innerHTML = '<b></b><span></span>'; row.querySelector('b').textContent = bn[0]; row.querySelector('span').textContent = bn[1]; list.appendChild(row); });
    const foot = document.createElement('div'); foot.className = 'pnote'; foot.style.marginTop = '6px';
    foot.textContent = 'Free play only \u2014 no real money.';
    list.appendChild(foot);
  }
  function renderAudioStatus() {
    const el = $('audioStatus'); if (!el || !AU.state) return;
    const st = AU.state();
    el.textContent = 'Audio engine: ' + st.context + (st.context === 'running' ? '' : ' (tap anywhere, then check the ring/silent switch and volume)') + ' \u00B7 session: ' + st.session + ' \u00B7 music ' + (st.musicRunning ? 'playing' : 'stopped');
  }
  function renderRecords() {
    const dl = $('records'); if (!dl) return;
    const rows = [
      ['Biggest single win', fmt(P.best.win)], ['Highest balance', fmt(P.best.balance)], ['Jackpots hit', fmt(P.stats.jackpots)],
      ['Big wins (4× bet or more)', fmt(P.stats.bigWins)], ['Free-spin rounds', fmt(P.stats.fsRounds)], ['Total spins', fmt(P.stats.spins)],
      ['Gold Rush spins', fmt(P.stats.goldRush)], ['Fortune Picks', fmt(P.stats.picks)], ['Lucky Wheels', fmt(P.stats.wheels)],
      ['Double Up won / lost', fmt(P.stats.gambleWon) + ' / ' + fmt(P.stats.gambleLost)],
      ['Total wagered', fmt(P.stats.wagered)], ['Total won', fmt(P.stats.won)], ['Refills used', fmt(P.stats.refills)],
    ];
    dl.innerHTML = '';
    rows.forEach(function (r) { const dt = document.createElement('dt'); dt.textContent = r[0]; const dd = document.createElement('dd'); dd.textContent = r[1]; dl.appendChild(dt); dl.appendChild(dd); });
    setText('moreVer', 'Jackpot ' + CFG.APP_VERSION + ' · saved on this device only');
  }

  // ---------------------------------------------------------------- festival themes
  // Theme previews are not shown in Settings (Dad only ever sees the automatic theme).
  // For testing, open the page with ?theme=<id> (e.g. ?theme=zhongqiu); it is never saved.
  let urlTheme = null;
  try { const q = new URLSearchParams(location.search).get('theme'); if (q && TH && TH.THEMES[q]) urlTheme = q; } catch (e) {}
  function currentTheme() {
    if (!TH) return null;
    if (urlTheme) {
      const b = TH.THEMES[urlTheme];
      return { id: urlTheme, variant: urlTheme, dayIndex: 0, name: b.name, zh: b.zh, en: b.en, ambient: b.ambient, palette: b.palette, year: new Date().getFullYear(), preview: true };
    }
    try { return TH.resolve(new Date()); } catch (e) { return null; }
  }
  function drawFestiveBanner() {
    const c = $('festiveCanvas'), box = $('festive'); if (!c || !box || !S.theme) return;
    const w = box.clientWidth || 360, h = box.clientHeight || 68; const r = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    const cx = c.getContext('2d'); cx.setTransform(r, 0, 0, r, 0, 0);
    try { TH.drawBanner(cx, S.theme, w, h); } catch (e) {}
  }
  function applyTheme(force) {
    const th = currentTheme();
    const key = th ? (th.variant + ':' + th.dayIndex + ':' + th.en + ':' + (th.sub || '')) : '';
    if (!force && key === S.themeKey) return;
    const wasKey = S.themeKey;
    S.theme = th; S.themeKey = key;
    if (th) document.body.setAttribute('data-theme', th.variant); else document.body.removeAttribute('data-theme');
    if (th) {
      setText('festiveZh', th.zh); setText('festiveEn', th.en); setText('festiveSub', th.sub || (th.preview ? 'Preview' : ''));
      show('festive'); $('festive').classList.add('pulse');
      requestAnimationFrame(drawFestiveBanner);
    } else hide('festive');
    FX.setAmbient(th ? th.ambient : null);
    FX.setPalette(th ? th.palette : null);
    if (th && wasKey !== '' && S.phase === 'idle') setMsg(th.en);
    maybeBirthdayGift();
  }
  window.addEventListener('resize', function () { if (S.theme) drawFestiveBanner(); });
  // Once a year, on the birthday itself (not the eve, not in preview mode): +8,888 credits.
  function maybeBirthdayGift() {
    const th = S.theme;
    if (!th || th.preview || th.id !== 'birthday' || th.dayIndex !== 0) return;
    const y = new Date().getFullYear();
    if (P.gifts.birthdayYear === y) return;
    if (S.phase !== 'idle' || S.fs || S.auto > 0) return; // try again when the game is quiet
    P.gifts.birthdayYear = y;
    P.credits += 8888; if (P.credits > P.best.balance) P.best.balance = P.credits;
    save();
    S.phase = 'overlay';
    setText('giftAmt', '+' + fmt(8888));
    show('giftOverlay');
    AU.sfx.fanfare(2); FX.confetti(150); FX.coinFountain(40);
    later(function () { FX.confetti(100); }, 900);
  }
  on('btnGiftCollect', 'click', function () { hide('giftOverlay'); if (S.phase === 'overlay') S.phase = 'idle'; updateHud(); refreshControls(); setMsg('Happy Birthday! Enjoy the gift \u2014 good luck!'); });
  setInterval(function () { applyTheme(false); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) applyTheme(false); });

  // ---------------------------------------------------------------- overlays helpers
  function openOverlay(id) { if (S.phase !== 'idle') return false; S.phase = 'overlay'; show(id); return true; }
  function closeOverlay(id) { hide(id); if (S.phase === 'overlay') S.phase = 'idle'; refreshControls(); }

  // ---------------------------------------------------------------- input wiring
  // Audio unlock on activation-triggering events (iOS ignores touchstart / touch pointerdown for this).
  ['touchend', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { AU.unlock(); }, { passive: true }); });

  on('btnSpin', 'click', function () {
    AU.unlock();
    if (S.auto > 0) { S.auto = 0; setMsg('Auto spin stopped'); refreshControls(); return; }
    if (S.present) { skipPresentation(); return; }
    if (S.phase === 'idle' && !S.fs) startSpin();
  });
  on('btnRefill', 'click', function () { AU.unlock(); refill(); });
  on('btnBetDown', 'click', function () { changeBet(-1); });
  on('btnBetUp', 'click', function () { changeBet(1); });
  if (cv) cv.addEventListener('pointerdown', function () { if (S.present) skipPresentation(); }, { passive: true });

  on('btnAuto', 'click', function () {
    AU.sfx.button();
    if (S.auto > 0) { S.auto = 0; setMsg('Auto spin stopped'); refreshControls(); return; }
    if (S.present) skipPresentation();
    openOverlay('autoOverlay');
  });
  document.querySelectorAll('[data-auto]').forEach(function (b) {
    b.addEventListener('click', function () {
      const n = parseInt(b.getAttribute('data-auto'), 10) || 0;
      closeOverlay('autoOverlay');
      if (!canAfford()) { refreshControls(); return; }
      S.auto = n; refreshControls();
      if (S.auto > 0) { S.auto -= 1; startSpin(); }
    });
  });
  on('btnAutoBack', 'click', function () { closeOverlay('autoOverlay'); });

  on('btnTurbo', 'click', function () { P.turbo = !P.turbo; save(); AU.sfx.button(); refreshControls(); setMsg(P.turbo ? 'Turbo on — faster reels' : 'Turbo off'); });

  on('btnPays', 'click', function () { AU.sfx.button(); if (S.present) skipPresentation(); if (openOverlay('paysOverlay')) renderPaytable(); });
  on('btnPaysBack', 'click', function () { closeOverlay('paysOverlay'); });

  on('btnMore', 'click', function () { AU.sfx.button(); if (S.present) skipPresentation(); if (openOverlay('moreOverlay')) { renderRecords(); renderAudioStatus(); $('btnGamble').setAttribute('aria-pressed', P.gamble ? 'true' : 'false'); } });
  on('btnGamble', 'click', function () { P.gamble = !P.gamble; $('btnGamble').setAttribute('aria-pressed', P.gamble ? 'true' : 'false'); save(); AU.sfx.button(); });
  on('btnMoreBack', 'click', function () { closeOverlay('moreOverlay'); });
  on('btnSfx', 'click', function () { P.sfx = !P.sfx; AU.setSfx(P.sfx); $('btnSfx').setAttribute('aria-pressed', P.sfx ? 'true' : 'false'); save(); AU.sfx.button(); later(renderAudioStatus, 300); });
  on('btnMusic', 'click', function () { P.music = !P.music; AU.setMusic(P.music); $('btnMusic').setAttribute('aria-pressed', P.music ? 'true' : 'false'); save(); later(renderAudioStatus, 300); });
  on('btnReset', 'click', function () { hide('moreOverlay'); show('resetOverlay'); });
  on('btnResetNo', 'click', function () { hide('resetOverlay'); show('moreOverlay'); });
  on('btnResetYes', 'click', function () {
    const keep = { sfx: P.sfx, music: P.music, turbo: P.turbo, gifts: P.gifts, gamble: P.gamble };
    P = defaultProfile(); P.sfx = keep.sfx; P.music = keep.music; P.turbo = keep.turbo; P.gifts = keep.gifts; P.gamble = keep.gamble;
    S.reelGold = null; S.goldWipe = null; S.goldRush = null; S.after = null; S.gamble = null; hide('pickOverlay'); hide('wheelOverlay'); hide('gambleOverlay');
    S.fs = null; S.auto = 0; S.idleHighlight = null; S.result = null; S.stops = null; S.grid = null;
    save(); initReels();
    hide('resetOverlay'); hide('fsBadge'); S.phase = 'idle';
    setMsg('Fresh start — ' + fmt(E.START_CREDITS) + ' credits. Good luck!');
    updateHud(); refreshControls();
  });

  on('btnFsStart', 'click', function () { if (S.fs && S.phase === 'overlay') startFreeSpins(); });
  on('btnFsCollect', 'click', function () { if (S.phase === 'overlay') collectFreeSpins(); });
  on('btnJpCollect', 'click', function () { if (S.present && S.present.tier === 'jackpot') { S.present.dur = 0; finishPresentation(); } collectJackpot(); });

  // Keyboard (iPad with keyboard / desktop testing): space or enter spins.
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); const b = $('btnSpin'); if (b && !b.classList.contains('hidden') && !b.disabled) b.click(); }
  });

  // ---------------------------------------------------------------- boot
  function boot() {
    setText('verTag', CFG.APP_VERSION);
    AU.setSfx(P.sfx); AU.setMusic(P.music);
    $('btnSfx').setAttribute('aria-pressed', P.sfx ? 'true' : 'false');
    $('btnMusic').setAttribute('aria-pressed', P.music ? 'true' : 'false');
    FX.init($('fx'), { pop: AU.sfx.firecracker, burst: AU.sfx.fireworkBurst, coin: AU.sfx.coin });

    // Resolve a spin that was interrupted by a reload: the bet was already taken.
    if (P.pending) {
      const pend = P.pending;
      S.stops = pend.stops; S.reelGold = pend.gold || null; S.grid = E.applyGoldRush(E.gridFromStops(S.stops), S.reelGold);
      const res = E.evaluate(S.grid, pend.bet, { freeSpins: !!S.fs, multiplier: S.fs ? S.fs.mult : undefined, jackpot: P.jackpot, noPick: !!S.reelGold });
      if (res.jackpot.hit) { P.stats.jackpots += 1; P.jackpot = E.JACKPOT.seed; }
      P.credits += res.total; P.stats.won += res.total;
      if (res.total > P.best.win) P.best.win = res.total;
      if (S.fs) { S.fs.spins += 1; S.fs.left -= 1; S.fs.total += res.total; if (res.scatter.freeSpins) S.fs.left += res.scatter.freeSpins; S.fs.mult = E.nextLadder(S.fs.mult, res.lineTotal + res.scatter.pay > 0); P.fs = S.fs; }
      P.pending = null;
      if (res.pick.hit && !P.bonus) { P.bonus = { type: 'pick', bet: pend.bet, layout: E.pickLayout(), opened: [], total: 0 }; P.stats.picks += 1; S.after = { fs: (!S.fs && res.scatter.freeSpins) || 0, bet: pend.bet }; }
      save();
      initReels();
      setMsg(res.total > 0 ? ('Your last spin finished while the app was closed: won ' + fmt(res.total)) : 'Welcome back!');
      setText('win', fmt(res.total));
      if (!S.fs && res.scatter.freeSpins && !P.bonus) later(function () { beginFreeSpins(res.scatter.freeSpins, pend.bet); }, 800);
    } else {
      S.stops = null; initReels();
      setMsg(P.stats.spins === 0 ? 'Welcome! Tap SPIN to play. Free credits, no real money.' : 'Welcome back — good luck!');
    }
    layout();
    updateHud();
    refreshControls();

    if (S.fs && S.fs.left > 0) {
      // Resume an unfinished free-spin round.
      S.phase = 'overlay';
      setText('fsIntroNum', S.fs.left);
      show('fsIntroOverlay');
      $('fsIntroOverlay').querySelector('p').textContent = 'Resuming your free-spin round — ' + S.fs.left + ' spins left. All wins doubled.';
    } else if (S.fs) { S.fs = null; P.fs = null; save(); }

    // Resume an interrupted bonus round (its result/layout was saved when it was triggered).
    if (P.bonus && P.bonus.type === 'pick') later(showPick, 600);
    else if (P.bonus && P.bonus.type === 'wheel') later(function () { if (P.bonus.spun) { P.bonus = null; save(); } else showWheel(); }, 600);

    // Festival theme for today (after the free-spin check so the birthday gift never stacks on it).
    applyTheme(true);
    if (S.theme && !P.pending && S.phase === 'idle') setMsg(S.theme.en + (S.theme.sub ? ' \u00B7 ' + S.theme.sub : ''));
  }
  boot();
  // Read-only hook for the automated browser tests (phase of the game loop).
  window.JP_DEBUG = { phase: function () { return S.phase; } };
})();
