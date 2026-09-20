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
      stats: { spins: 0, wagered: 0, won: 0, refills: 0, jackpots: 0, fsRounds: 0, bigWins: 0 },
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
      if (p.fs && num(p.fs.left, 0) > 0) d.fs = { left: Math.round(p.fs.left), total: num(p.fs.total, 0), bet: num(p.fs.bet, E.BETS[d.betIdx]), spins: num(p.fs.spins, 0) };
      if (p.pending && Array.isArray(p.pending.stops) && p.pending.stops.length === E.REELS) d.pending = { stops: p.pending.stops.map(Number), bet: num(p.pending.bet, E.BETS[d.betIdx]), free: !!p.pending.free };
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

  function cellCenter(r, k) { return { x: padX + (r + 0.5) * cell, y: padY + (k + 0.5) * cell }; }
  function easeOutBack(u) { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }

  function initReels() {
    S.reels = [];
    const base = S.stops || [0, 5, 10, 15, 20];
    for (let r = 0; r < E.REELS; r++) S.reels.push({ pos: base[r], phase: 'stopped', target: base[r], start: 0, landT0: 0, glow: 0, tickAcc: 0 });
  }

  // ---------------------------------------------------------------- drawing
  function drawFrame() {
    if (!ctx) return;
    // outer frame (gold) and window (cream)
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#b07a00'); g.addColorStop(0.3, '#ffe680'); g.addColorStop(0.55, '#f5c518'); g.addColorStop(1, '#8a5a00');
    ctx.fillStyle = g; ART.roundRect(ctx, 0, 0, W, H, 16); ctx.fill();
    ctx.fillStyle = '#fff6e0'; ART.roundRect(ctx, padX - 4, padY - 4, W - padX * 2 + 8, H - padY * 2 + 8, 10); ctx.fill();
  }

  function drawReels(now) {
    if (!ctx) return;
    drawFrame();
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
    // symbols
    for (let r = 0; r < E.REELS; r++) {
      const R = S.reels[r]; if (!R) continue;
      const base = Math.floor(R.pos), frac = R.pos - base;
      const spinning = R.phase === 'spin' || R.phase === 'land';
      for (let k = -1; k <= E.ROWS; k++) {
        const id = E.symbolAt(r, base + k);
        const y = padY + (k - frac) * cell + cell / 2;
        const x = padX + r * cell + cell / 2;
        if (spinning && R.phase === 'spin') {
          ctx.globalAlpha = 0.55; ART.drawSymbol(ctx, id, x, y - cell * 0.18, cell * 0.86);
          ctx.globalAlpha = 0.55; ART.drawSymbol(ctx, id, x, y + cell * 0.18, cell * 0.86);
          ctx.globalAlpha = 1;
        } else {
          ART.drawSymbol(ctx, id, x, y, cell * 0.86);
        }
      }
      if (R.glow > 0) { // anticipation glow
        const a = 0.25 + 0.2 * Math.sin(now / 90);
        ctx.fillStyle = 'rgba(245,197,24,' + (a * R.glow) + ')'; ctx.fillRect(padX + r * cell, padY, cell, H - padY * 2);
      }
    }
    // win highlight
    const hl = S.present ? S.present.entry : (S.idleHighlight ? S.idleHighlight.entry : null);
    if (hl && S.grid) drawHighlight(hl, now);
    ctx.restore();
  }

  function drawHighlight(entry, now) {
    ctx.fillStyle = 'rgba(40,10,0,0.42)'; ctx.fillRect(padX, padY, W - padX * 2, H - padY * 2);
    const pulse = 0.5 + 0.5 * Math.sin(now / 120);
    if (entry.kind === 'line') {
      const line = E.LINES[entry.line];
      // payline path across all reels
      ctx.save();
      ctx.strokeStyle = 'rgba(255,230,128,0.95)'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = '#f5c518'; ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let r = 0; r < E.REELS; r++) { const c = cellCenter(r, line[r]); if (r === 0) ctx.moveTo(padX, c.y); ctx.lineTo(c.x, c.y); if (r === E.REELS - 1) ctx.lineTo(W - padX, c.y); }
      ctx.stroke();
      ctx.restore();
    }
    entry.positions.forEach(function (p) {
      const c = cellCenter(p[0], p[1]);
      ctx.save();
      ctx.shadowColor = entry.kind === 'scatter' ? '#e0262b' : '#f5c518'; ctx.shadowBlur = 18 + pulse * 10;
      ctx.fillStyle = '#fff6e0'; ART.roundRect(ctx, c.x - cell * 0.47, c.y - cell * 0.47, cell * 0.94, cell * 0.94, cell * 0.14); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = entry.kind === 'scatter' ? '#e0262b' : '#f5c518'; ctx.lineWidth = 3 + pulse * 2;
      ART.roundRect(ctx, c.x - cell * 0.47, c.y - cell * 0.47, cell * 0.94, cell * 0.94, cell * 0.14); ctx.stroke();
      ART.drawSymbol(ctx, S.grid[p[0]][p[1]], c.x, c.y, cell * (0.9 + pulse * 0.06));
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
        if (u >= 1) { R.pos = R.target; R.phase = 'stopped'; R.glow = 0; onReelStopped(r); }
      }
      if (R.glow > 0 && R.phase === 'stopped') R.glow = 0;
    }

    // win presentation
    if (S.present) { busy = true; stepPresentation(now); }
    else if (S.idleHighlight) {
      busy = true;
      const ih = S.idleHighlight;
      if (now - ih.t > t.lineCycle * 1.4) { ih.t = now; ih.idx = (ih.idx + 1) % ih.entries.length; ih.entry = ih.entries[ih.idx]; }
    }

    // animated numbers
    if (Math.abs(S.shownCredits - creditsTarget()) > 0.5) {
      busy = true;
      const d = creditsTarget() - S.shownCredits;
      S.shownCredits += Math.abs(d) < 2 ? d : d * Math.min(1, dt * 10);
      setText('credits', fmt(S.shownCredits));
    }

    drawReels(now);
    if (busy) requestFrame();
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
    P.pending = { stops: S.stops.slice(), bet: b, free: free };
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
    S.grid = E.gridFromStops(S.stops);
    const b = P.pending ? P.pending.bet : currentBet();
    const res = E.evaluate(S.grid, b, { freeSpins: !!S.fs, jackpot: P.jackpot });
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

    if (tier === 'none') {
      setMsg(S.fs ? ('Free spin ' + S.fs.spins + ' of ' + (S.fs.spins + S.fs.left)) : pick(['So close!', 'Try again!', 'Next one!', 'Almost…']));
      S.phase = 'idle';
      updateHud();
      afterPresentation(res);
      return;
    }

    S.phase = 'present';
    const dur = t.tier[tier];
    S.present = { res, tier, entries, idx: 0, entry: entries[0], entryT: performance.now(), t0: performance.now(), dur, countTotal: res.total, countDur: Math.min(dur * 0.75, 6500), lastTick: 0, done: false, b };
    S.shownWin = 0;
    if (entries[0]) setMsg(entries[0].caption);
    celebrate(tier, res, b);
    if (S.fs) setText('fsLeft', S.fs.left);
    requestFrame();
  }

  function lineCaption(w) {
    return 'Line ' + (w.line + 1) + ' · ' + w.count + ' × ' + ART.NAMES[w.symbol].split(' (')[0] + (w.wild ? ' + Wild ×2' : '') + ' · ' + fmt(w.pay);
  }

  function stepPresentation(now) {
    const pr = S.present; const t = T();
    // cycle entries
    if (pr.entries.length > 1 && now - pr.entryT > t.lineCycle) {
      pr.entryT = now; pr.idx = (pr.idx + 1) % pr.entries.length; pr.entry = pr.entries[pr.idx];
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
    if (S.fs) {
      if (res.scatter.freeSpins) { setMsg('+' + res.scatter.freeSpins + ' more free spins!'); setText('fsLeft', S.fs.left); }
      if (S.fs.left > 0) { later(startSpin, t.gap + (res.total > 0 ? 300 : 0)); }
      else { later(endFreeSpins, 400); }
      refreshControls();
      return;
    }
    if (res.scatter.freeSpins) { later(function () { beginFreeSpins(res.scatter.freeSpins, P.pending ? P.pending.bet : E.BETS[P.betIdx]); }, 500); return; }
    if (S.auto > 0) {
      if (!canAfford()) { S.auto = 0; setMsg('Auto stopped — not enough credits'); }
      else { later(function () { if (S.auto > 0 && S.phase === 'idle') { S.auto -= 1; startSpin(); } }, t.gap); }
    }
    refreshControls();
    if (S.auto === 0) maybeBirthdayGift();
  }

  function beginFreeSpins(n, atBet) {
    S.fs = { left: n, total: 0, bet: atBet || E.BETS[P.betIdx], spins: 0 };
    P.fs = S.fs; P.stats.fsRounds += 1; save();
    S.phase = 'overlay';
    setText('fsIntroNum', n);
    const para = $('fsIntroOverlay') && $('fsIntroOverlay').querySelector('p');
    if (para) para.innerHTML = 'All wins are <b>doubled</b> during free spins. More red packets add more spins.';
    show('fsIntroOverlay');
    FX.redPackets(30); FX.coinFountain(30);
    AU.sfx.fsIntro();
    later(function () { if (!$('fsIntroOverlay').classList.contains('hidden')) startFreeSpins(); }, 5000);
  }
  function startFreeSpins() {
    hide('fsIntroOverlay');
    setText('fsLeft', S.fs.left); show('fsBadge');
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
    if (res && S.fs) { afterPresentation({ jackpot: { hit: false }, scatter: res.scatter, total: res.total }); }
    else if (res && res.scatter.freeSpins) later(function () { beginFreeSpins(res.scatter.freeSpins); }, 500);
  }

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
    if (S.fs) { setText('fsLeft', S.fs.left); show('fsBadge'); } else hide('fsBadge');
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
        const n = document.createElement('div'); n.className = 'pnote'; n.textContent = 'Stands in for any fruit, Bell, Bar or 7 (not the Red Packet). Appears on reels 2, 3 and 4. Any line win that uses a Gold Ingot is doubled.'; info.appendChild(n);
      } else if (id === 'SCATTER') {
        vals.textContent = Object.keys(E.SCATTER_PAY).map(function (k) { return k + '× = ' + fmt(E.SCATTER_PAY[k] * b) + ' + ' + E.FREE_SPINS[k] + ' free spins'; }).join(' \u00B7 ');
        info.appendChild(vals);
        const n = document.createElement('div'); n.className = 'pnote'; n.textContent = 'Counts anywhere on the reels. All wins during free spins are doubled; more red packets during free spins add more spins.'; info.appendChild(n);
      }
      row.appendChild(c); row.appendChild(info); list.appendChild(row);
    });
    const foot = document.createElement('div'); foot.className = 'pnote'; foot.style.marginTop = '6px';
    foot.textContent = 'Jackpot meter: ' + (E.JACKPOT.rate * 100).toFixed(1) + '% of every bet is added; it restarts at ' + fmt(E.JACKPOT.seed) + ' after it is won. Free play only — no real money.';
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
      ['Total wagered', fmt(P.stats.wagered)], ['Total won', fmt(P.stats.won)], ['Refills used', fmt(P.stats.refills)],
    ];
    dl.innerHTML = '';
    rows.forEach(function (r) { const dt = document.createElement('dt'); dt.textContent = r[0]; const dd = document.createElement('dd'); dd.textContent = r[1]; dl.appendChild(dt); dl.appendChild(dd); });
    setText('moreVer', 'Jackpot ' + CFG.APP_VERSION + ' · saved on this device only');
  }

  // ---------------------------------------------------------------- festival themes
  function currentTheme() {
    if (!TH) return null;
    if (P.themeOverride && P.themeOverride !== 'auto' && TH.THEMES[P.themeOverride]) {
      const b = TH.THEMES[P.themeOverride];
      return { id: P.themeOverride, variant: P.themeOverride, dayIndex: 0, name: b.name, zh: b.zh, en: b.en, ambient: b.ambient, palette: b.palette, year: new Date().getFullYear(), preview: true };
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

  function renderThemePicker() {
    const sel = $('themeSelect'); if (!sel || !TH) return;
    const auto = TH.resolve(new Date());
    sel.innerHTML = '';
    const optAuto = document.createElement('option'); optAuto.value = 'auto';
    optAuto.textContent = 'Auto \u2014 today: ' + (auto ? auto.name : 'everyday look'); sel.appendChild(optAuto);
    Object.keys(TH.THEMES).forEach(function (id) { const o = document.createElement('option'); o.value = id; o.textContent = 'Preview: ' + TH.THEMES[id].name; sel.appendChild(o); });
    sel.value = P.themeOverride || 'auto';
    const nx = TH.next(new Date());
    const today = new Date();
    const fmtD = function (d) { return d.d + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.m - 1] + ' ' + d.y; };
    setText('nextFest', 'Today: ' + fmtD({ y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() }) + (nx ? ' \u00B7 Next: ' + nx.name + ' \u2014 ' + fmtD(nx.date) + (nx.inDays === 0 ? ' (today)' : nx.inDays === 1 ? ' (tomorrow)' : ' (in ' + nx.inDays + ' days)') : ''));
  }
  on('themeSelect', 'change', function () {
    const v = $('themeSelect').value; P.themeOverride = (v === 'auto' || (TH && TH.THEMES[v])) ? v : 'auto'; save(); applyTheme(true);
  });

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

  on('btnMore', 'click', function () { AU.sfx.button(); if (S.present) skipPresentation(); if (openOverlay('moreOverlay')) { renderRecords(); renderThemePicker(); renderAudioStatus(); } });
  on('btnMoreBack', 'click', function () { closeOverlay('moreOverlay'); });
  on('btnSfx', 'click', function () { P.sfx = !P.sfx; AU.setSfx(P.sfx); $('btnSfx').setAttribute('aria-pressed', P.sfx ? 'true' : 'false'); save(); AU.sfx.button(); later(renderAudioStatus, 300); });
  on('btnMusic', 'click', function () { P.music = !P.music; AU.setMusic(P.music); $('btnMusic').setAttribute('aria-pressed', P.music ? 'true' : 'false'); save(); later(renderAudioStatus, 300); });
  on('btnReset', 'click', function () { hide('moreOverlay'); show('resetOverlay'); });
  on('btnResetNo', 'click', function () { hide('resetOverlay'); show('moreOverlay'); });
  on('btnResetYes', 'click', function () {
    const keep = { sfx: P.sfx, music: P.music, turbo: P.turbo, gifts: P.gifts };
    P = defaultProfile(); P.sfx = keep.sfx; P.music = keep.music; P.turbo = keep.turbo; P.gifts = keep.gifts;
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
      S.stops = pend.stops; S.grid = E.gridFromStops(S.stops);
      const res = E.evaluate(S.grid, pend.bet, { freeSpins: !!S.fs, jackpot: P.jackpot });
      if (res.jackpot.hit) { P.stats.jackpots += 1; P.jackpot = E.JACKPOT.seed; }
      P.credits += res.total; P.stats.won += res.total;
      if (res.total > P.best.win) P.best.win = res.total;
      if (S.fs) { S.fs.spins += 1; S.fs.left -= 1; S.fs.total += res.total; if (res.scatter.freeSpins) S.fs.left += res.scatter.freeSpins; P.fs = S.fs; }
      P.pending = null; save();
      initReels();
      setMsg(res.total > 0 ? ('Your last spin finished while the app was closed: won ' + fmt(res.total)) : 'Welcome back!');
      setText('win', fmt(res.total));
      if (!S.fs && res.scatter.freeSpins) later(function () { beginFreeSpins(res.scatter.freeSpins, pend.bet); }, 800);
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

    // Festival theme for today (after the free-spin check so the birthday gift never stacks on it).
    applyTheme(true);
    if (S.theme && !P.pending && S.phase === 'idle') setMsg(S.theme.en + (S.theme.sub ? ' \u00B7 ' + S.theme.sub : ''));
  }
  boot();
})();
