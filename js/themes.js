/* Jackpot — festival themes.
   Decides which festival (if any) is active on a given date, every year, with no end date:
   Chinese festivals come from js/lunar.js (astronomical calendar), Western/fixed dates and
   Father's Day are computed directly. Also draws the festive banner motifs.
   Windows: Spring Festival = CNY eve (D-1) through D+15; every other festival = D-1 and D.
   Priority when two overlap: the order of the WINDOWS list below (Dad's birthday first).
   Loaded as window.JP_THEMES; require()-able in Node for tests (drawing needs a canvas). */
(function (root) {
  'use strict';

  const L = root.JP_LUNAR || (typeof require === 'function' ? require('./lunar.js') : null);

  const THEMES = {
    birthday:   { name: "Dad's Birthday",     zh: '生日快乐', en: 'Happy Birthday, Dad!', ambient: 'balloons', palette: ['#ff5e7a', '#ffd34d', '#6ee7ff', '#b78cff', '#7ef29a'] },
    cny:        { name: 'Spring Festival',     zh: '新年快乐 · 恭喜发财', en: 'Happy Lunar New Year!', ambient: 'fireworks', palette: ['#ff3b3b', '#ffd34d', '#ff8c1a', '#fff3b0'] },
    lantern:    { name: 'Lantern Festival',    zh: '元宵节快乐', en: 'Happy Lantern Festival!', ambient: 'lanterns', palette: ['#ff3b3b', '#ffd34d', '#ff8c1a', '#fff3b0'] },
    duanwu:     { name: 'Dragon Boat Festival', zh: '端午安康', en: 'Happy Dragon Boat Festival!', ambient: 'none', palette: ['#2fd0a8', '#ffd34d', '#ff5e5e', '#c9f0b0'] },
    qixi:       { name: 'Qixi Festival',       zh: '七夕快乐', en: 'Happy Qixi!', ambient: 'stars', palette: ['#ff7ab8', '#ffd34d', '#b78cff', '#fff3b0'] },
    zhongqiu:   { name: 'Mid-Autumn Festival', zh: '中秋节快乐', en: 'Happy Mid-Autumn Festival!', ambient: 'petals', palette: ['#ffd34d', '#ff8c1a', '#fff3b0', '#9fd3ff'] },
    dongzhi:    { name: 'Winter Solstice',     zh: '冬至快乐', en: 'Happy Winter Solstice!', ambient: 'snow', palette: ['#ffffff', '#9fd3ff', '#ffd34d', '#ff8c8c'] },
    xmas:       { name: 'Christmas',           zh: '圣诞快乐', en: 'Merry Christmas!', ambient: 'snow', palette: ['#ff3b3b', '#2fd06a', '#ffffff', '#ffd34d'] },
    newyear:    { name: "New Year's Day",      zh: '新年快乐', en: 'Happy New Year!', ambient: 'fireworks', palette: ['#ffd34d', '#ffffff', '#6ee7ff', '#b78cff'] },
    fathersday: { name: "Father's Day",        zh: '父亲节快乐', en: "Happy Father's Day!", ambient: 'stars', palette: ['#6ee7ff', '#ffd34d', '#ffffff', '#9fd3ff'] },
  };

  const BIRTHDAY = { m: 9, d: 18 };

  function dn(y, m, d) { return L.ymdToDn(y, m, d); }
  function thirdSundayOfJune(y) {
    const first = dn(y, 6, 1);
    const dow = (first + 1) % 7; // 0 = Sunday (JDN 0 was a Monday)
    return first + ((7 - dow) % 7) + 14;
  }

  // Festival anchor dates (day numbers) for a Gregorian year, with their windows [from, to].
  function windows(y) {
    const f = L.festivals(y);
    return [
      { id: 'birthday',   anchor: dn(y, BIRTHDAY.m, BIRTHDAY.d), from: -1, to: 0 },
      { id: 'cny',        anchor: f.cny,      from: -1, to: 15 },
      { id: 'zhongqiu',   anchor: f.zhongqiu, from: -1, to: 0 },
      { id: 'duanwu',     anchor: f.duanwu,   from: -1, to: 0 },
      { id: 'qixi',       anchor: f.qixi,     from: -1, to: 0 },
      { id: 'dongzhi',    anchor: f.dongzhi,  from: -1, to: 0 },
      { id: 'xmas',       anchor: dn(y, 12, 25), from: -1, to: 0 },
      { id: 'newyear',    anchor: dn(y, 1, 1),   from: 0, to: 0 },   // 1 Jan of this year
      { id: 'newyear',    anchor: dn(y + 1, 1, 1), from: -1, to: -1 }, // 31 Dec of this year (eve of next year)
      { id: 'fathersday', anchor: thirdSundayOfJune(y), from: -1, to: 0 },
    ];
  }

  // Resolve the active theme for a day number. Returns null when it is an ordinary day.
  function resolveDn(d) {
    const y = L.dnToYmd(d).y;
    const list = windows(y);
    for (let i = 0; i < list.length; i++) {
      const w = list[i]; const off = d - w.anchor;
      if (off < w.from || off > w.to) continue;
      const base = THEMES[w.id];
      const t = { id: w.id, variant: w.id, dayIndex: off, name: base.name, zh: base.zh, en: base.en, ambient: base.ambient, palette: base.palette, year: y, anchor: w.anchor };
      if (w.id === 'cny') {
        if (off === 14) { const lt = THEMES.lantern; t.variant = 'lantern'; t.name = lt.name; t.zh = lt.zh; t.en = lt.en; t.ambient = lt.ambient; }
        t.sub = off === -1 ? 'Reunion Eve · 除夕' : off === 0 ? 'Day 1 of 15' : off <= 14 ? 'Day ' + (off + 1) + ' of 15' : 'Spring Festival afterglow';
      } else if (w.id === 'newyear') {
        const ny = off === 0 ? y : y + 1;
        t.en = off === 0 ? 'Happy New Year ' + ny + '!' : 'New Year’s Eve — ' + ny + ' is almost here!';
      } else if (off === -1) {
        t.sub = 'Tomorrow';
        t.en = t.name + ' Eve';
      }
      return t;
    }
    return null;
  }

  function resolve(date) { return resolveDn(L.dateToDn(date || new Date())); }

  // Next festival window start on or after the date (searches ~14 months ahead).
  function next(date) {
    const d0 = L.dateToDn(date || new Date());
    let best = null;
    [L.dnToYmd(d0).y, L.dnToYmd(d0).y + 1].forEach(function (y) {
      windows(y).forEach(function (w) {
        const start = w.anchor + w.from; const day = w.anchor + (w.to >= 0 ? 0 : w.to);
        if (day >= d0 && (!best || day < best.day)) best = { id: w.id, name: THEMES[w.id].name, start: start, day: day, inDays: day - d0, date: L.dnToYmd(day) };
      });
    });
    return best;
  }

  // ---- banner motifs (canvas) ------------------------------------------------------------
  const M = {};
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function star(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); }

  M.lantern = function (ctx, x, y, s) {
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - s * 0.2, y - s * 0.55, s * 0.4, s * 0.1);
    const g = ctx.createRadialGradient(x - s * 0.12, y - s * 0.12, 1, x, y, s * 0.5); g.addColorStop(0, '#ff7a6b'); g.addColorStop(0.7, '#e0262b'); g.addColorStop(1, '#8c0d14');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.45, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,211,77,.8)'; ctx.lineWidth = 1.2; [0.15, 0.3, 0.42].forEach(function (k) { ctx.beginPath(); ctx.ellipse(x, y, s * k, s * 0.45, 0, 0, 6.283); ctx.stroke(); });
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - s * 0.16, y + s * 0.42, s * 0.32, s * 0.08);
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x, y + s * 0.78); ctx.stroke();
    ctx.fillStyle = '#ffe680'; ctx.font = '700 ' + Math.round(s * 0.28) + 'px "PingFang SC","Hiragino Sans","Noto Sans CJK SC",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('福', x, y + 1);
  };
  M.firecrackers = function (ctx, x, y, s) {
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x, y + s * 0.6); ctx.stroke();
    for (let i = 0; i < 5; i++) { const yy = y - s * 0.45 + i * s * 0.22; const xx = x + (i % 2 ? s * 0.16 : -s * 0.16);
      ctx.fillStyle = '#e0262b'; rr(ctx, xx - s * 0.11, yy - s * 0.09, s * 0.22, s * 0.18, 3); ctx.fill(); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1; ctx.stroke(); }
    star(ctx, x, y - s * 0.7, s * 0.14, '#ffd34d');
  };
  M.mooncake = function (ctx, x, y, s) {
    ctx.fillStyle = '#a0622a'; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; const r = s * (i % 2 ? 0.42 : 0.48); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c98a45'; ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 1.5; ctx.strokeRect(x - s * 0.16, y - s * 0.16, s * 0.32, s * 0.32);
    ctx.fillStyle = '#7a4a1a'; ctx.font = '700 ' + Math.round(s * 0.24) + 'px "PingFang SC","Hiragino Sans","Noto Sans CJK SC",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('月', x, y + 1);
  };
  M.moon = function (ctx, x, y, s) {
    const gg = ctx.createRadialGradient(x, y, s * 0.3, x, y, s * 0.9); gg.addColorStop(0, 'rgba(255,240,180,.45)'); gg.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, s * 0.9, 0, 6.283); ctx.fill();
    const g = ctx.createRadialGradient(x - s * 0.15, y - s * 0.15, 2, x, y, s * 0.5); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#f0d060'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, 6.283); ctx.fill();
    // rabbit silhouette
    ctx.fillStyle = 'rgba(160,110,20,.55)';
    ctx.beginPath(); ctx.ellipse(x + s * 0.02, y + s * 0.12, s * 0.2, s * 0.13, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x - s * 0.18, y + s * 0.02, s * 0.09, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - s * 0.24, y - s * 0.16, s * 0.035, s * 0.13, -0.2, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - s * 0.15, y - s * 0.17, s * 0.035, s * 0.13, 0.2, 0, 6.283); ctx.fill();
  };
  M.dragonBoat = function (ctx, x, y, s) {
    ctx.fillStyle = '#c9932a'; ctx.beginPath(); ctx.moveTo(x - s * 0.9, y - s * 0.1); ctx.quadraticCurveTo(x, y + s * 0.55, x + s * 0.8, y - s * 0.05); ctx.lineTo(x + s * 0.8, y + s * 0.1); ctx.quadraticCurveTo(x, y + s * 0.3, x - s * 0.85, y + s * 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0262b'; ctx.beginPath(); ctx.moveTo(x - s * 0.9, y - s * 0.1); ctx.quadraticCurveTo(x, y + s * 0.4, x + s * 0.8, y - s * 0.05); ctx.quadraticCurveTo(x, y + s * 0.25, x - s * 0.9, y - s * 0.02); ctx.closePath(); ctx.fill();
    // head
    ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.ellipse(x + s * 0.9, y - s * 0.2, s * 0.2, s * 0.15, -0.3, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + s * 0.85, y - s * 0.32); ctx.lineTo(x + s * 0.72, y - s * 0.5); ctx.moveTo(x + s * 0.95, y - s * 0.34); ctx.lineTo(x + s * 0.9, y - s * 0.55); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(x + s * 0.96, y - s * 0.23, s * 0.035, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#e0262b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + s * 1.08, y - s * 0.15); ctx.quadraticCurveTo(x + s * 1.25, y - s * 0.1, x + s * 1.3, y + s * 0.02); ctx.stroke();
    // paddlers + paddles
    for (let i = 0; i < 4; i++) { const px = x - s * 0.55 + i * s * 0.32; ctx.fillStyle = '#2f6fbf'; ctx.beginPath(); ctx.arc(px, y - s * 0.22, s * 0.08, 0, 6.283); ctx.fill(); ctx.fillRect(px - s * 0.07, y - s * 0.14, s * 0.14, s * 0.14);
      ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + s * 0.06, y - s * 0.12); ctx.lineTo(px + s * 0.22, y + s * 0.32); ctx.stroke(); }
    // drum + water
    ctx.fillStyle = '#e0262b'; ctx.beginPath(); ctx.arc(x - s * 0.72, y - s * 0.12, s * 0.1, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(160,230,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(x - s * 1.1, y + s * 0.42 + i * 5); ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.3 + i * 5, x, y + s * 0.42 + i * 5); ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.55 + i * 5, x + s * 1.1, y + s * 0.42 + i * 5); } ctx.stroke();
  };
  M.zongzi = function (ctx, x, y, s) {
    ctx.fillStyle = '#2f8a4a'; ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.48, y + s * 0.35); ctx.lineTo(x - s * 0.48, y + s * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4caf62'; ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.48, y + s * 0.35); ctx.lineTo(x + s * 0.05, y + s * 0.35); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y + s * 0.02); ctx.lineTo(x + s * 0.3, y + s * 0.02); ctx.moveTo(x - s * 0.15, y - s * 0.24); ctx.lineTo(x + s * 0.15, y - s * 0.24); ctx.stroke();
  };
  M.hearts = function (ctx, x, y, s) {
    const heart = function (cx, cy, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.9); ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.2, cx - r * 0.6, cy - r * 1.1, cx, cy - r * 0.4); ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.1, cx + r * 1.4, cy - r * 0.2, cx, cy + r * 0.9); ctx.fill(); };
    heart(x - s * 0.15, y + s * 0.05, s * 0.28, '#ff5e7a'); heart(x + s * 0.2, y - s * 0.1, s * 0.22, '#ff8fb0');
    star(ctx, x - s * 0.5, y - s * 0.4, s * 0.1, '#ffe680'); star(ctx, x + s * 0.55, y + s * 0.3, s * 0.08, '#ffe680'); star(ctx, x + s * 0.45, y - s * 0.5, s * 0.12, '#fff');
  };
  M.tangyuan = function (ctx, x, y, s) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * s * 0.18, y - s * 0.15); ctx.quadraticCurveTo(x + i * s * 0.18 + 5, y - s * 0.35, x + i * s * 0.18, y - s * 0.55); ctx.stroke(); }
    ctx.fillStyle = '#2f6fbf'; ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a9be0'; ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.12, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; [[-0.22, -0.02], [0.02, -0.06], [0.24, 0], [-0.1, 0.08], [0.14, 0.1]].forEach(function (p) { ctx.beginPath(); ctx.arc(x + p[0] * s, y + p[1] * s, s * 0.11, 0, 6.283); ctx.fill(); });
    ctx.fillStyle = '#2f6fbf'; ctx.fillRect(x - s * 0.2, y + s * 0.45, s * 0.4, s * 0.08);
  };
  M.xmasTree = function (ctx, x, y, s) {
    ctx.fillStyle = '#6b3a12'; ctx.fillRect(x - s * 0.08, y + s * 0.35, s * 0.16, s * 0.2);
    ['#1f7a2d', '#2f9a3f', '#3fb050'].forEach(function (c, i) { const yy = y + s * 0.35 - i * s * 0.28; const w = s * (0.6 - i * 0.14); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, yy - s * 0.42); ctx.lineTo(x + w, yy); ctx.lineTo(x - w, yy); ctx.closePath(); ctx.fill(); });
    [['#e0262b', -0.25, 0.22], ['#ffd34d', 0.18, 0.1], ['#6ee7ff', -0.08, -0.12], ['#e0262b', 0.12, -0.3], ['#ffd34d', -0.3, -0.02]].forEach(function (b) { ctx.fillStyle = b[0]; ctx.beginPath(); ctx.arc(x + b[1] * s, y + b[2] * s, s * 0.05, 0, 6.283); ctx.fill(); });
    star(ctx, x, y - s * 0.62, s * 0.12, '#ffe680');
  };
  M.gift = function (ctx, x, y, s) {
    ctx.fillStyle = '#e0262b'; rr(ctx, x - s * 0.35, y - s * 0.25, s * 0.7, s * 0.55, 4); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - s * 0.06, y - s * 0.25, s * 0.12, s * 0.55); ctx.fillRect(x - s * 0.38, y - s * 0.28, s * 0.76, s * 0.12);
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.36, s * 0.1, 0, 6.283); ctx.arc(x + s * 0.12, y - s * 0.36, s * 0.1, 0, 6.283); ctx.stroke();
  };
  M.fireworks = function (ctx, x, y, s) {
    ['#ffd34d', '#ff5e7a', '#6ee7ff'].forEach(function (c, k) { const cx = x + (k - 1) * s * 0.45, cy = y + (k === 1 ? -s * 0.15 : s * 0.05), r = s * (k === 1 ? 0.5 : 0.32);
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.stroke();
      ctx.fillStyle = c; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 0, 6.283); ctx.fill(); } });
  };
  M.cake = function (ctx, x, y, s) {
    ctx.fillStyle = '#f7c8d8'; rr(ctx, x - s * 0.5, y, s * 1.0, s * 0.4, 6); ctx.fill();
    ctx.fillStyle = '#ffe0ec'; rr(ctx, x - s * 0.36, y - s * 0.3, s * 0.72, s * 0.34, 6); ctx.fill();
    ctx.fillStyle = '#e0262b'; ctx.beginPath(); ctx.arc(x, y - s * 0.3, s * 0.06, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x - s * 0.42 + i * s * 0.168, y + s * 0.02, s * 0.06, 0, 6.283); ctx.fill(); }
    [-0.22, 0, 0.22].forEach(function (k) { ctx.fillStyle = '#6ee7ff'; ctx.fillRect(x + k * s - s * 0.03, y - s * 0.55, s * 0.06, s * 0.26); ctx.fillStyle = '#ff8c1a'; ctx.beginPath(); ctx.ellipse(x + k * s, y - s * 0.62, s * 0.045, s * 0.08, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.ellipse(x + k * s, y - s * 0.6, s * 0.02, s * 0.04, 0, 0, 6.283); ctx.fill(); });
  };
  M.balloons = function (ctx, x, y, s) {
    [['#ff5e7a', -0.3, 0], ['#ffd34d', 0, -0.15], ['#6ee7ff', 0.3, 0.02]].forEach(function (b) { const bx = x + b[1] * s, by = y + b[2] * s;
      const g = ctx.createRadialGradient(bx - s * 0.06, by - s * 0.1, 1, bx, by, s * 0.24); g.addColorStop(0, '#fff'); g.addColorStop(0.2, b[0]); g.addColorStop(1, b[0]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, s * 0.18, s * 0.23, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by + s * 0.24); ctx.quadraticCurveTo(bx + 4, by + s * 0.45, bx - 2, by + s * 0.7); ctx.stroke(); });
  };
  M.tie = function (ctx, x, y, s) {
    ctx.fillStyle = '#2f6fbf'; ctx.beginPath(); ctx.moveTo(x - s * 0.14, y - s * 0.55); ctx.lineTo(x + s * 0.14, y - s * 0.55); ctx.lineTo(x + s * 0.08, y - s * 0.38); ctx.lineTo(x + s * 0.22, y + s * 0.3); ctx.lineTo(x, y + s * 0.55); ctx.lineTo(x - s * 0.22, y + s * 0.3); ctx.lineTo(x - s * 0.08, y - s * 0.38); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = -1; i <= 2; i++) { ctx.moveTo(x - s * 0.2, y + i * s * 0.2 - s * 0.05); ctx.lineTo(x + s * 0.2, y + i * s * 0.2 - s * 0.25); } ctx.stroke();
    star(ctx, x + s * 0.5, y - s * 0.4, s * 0.16, '#ffd34d');
  };
  M.stars = function (ctx, x, y, s) { star(ctx, x, y - s * 0.1, s * 0.3, '#ffe680'); star(ctx, x - s * 0.45, y + s * 0.2, s * 0.14, '#fff'); star(ctx, x + s * 0.45, y + s * 0.15, s * 0.17, '#9fd3ff'); star(ctx, x + s * 0.3, y - s * 0.45, s * 0.1, '#fff'); };

  // Which motifs go left / right of the greeting for each variant.
  const MOTIFS = {
    birthday: ['cake', 'balloons'], cny: ['lantern', 'firecrackers'], lantern: ['lantern', 'lantern'],
    duanwu: ['dragonBoat', 'zongzi'], qixi: ['hearts', 'stars'], zhongqiu: ['moon', 'mooncake'],
    dongzhi: ['tangyuan', 'tangyuan'], xmas: ['xmasTree', 'gift'], newyear: ['fireworks', 'fireworks'], fathersday: ['tie', 'stars'],
  };

  // Draw the festive banner motifs onto a canvas of css size w×h (already scaled for dpr).
  function drawBanner(ctx, theme, w, h) {
    ctx.clearRect(0, 0, w, h);
    const ids = MOTIFS[theme.variant] || MOTIFS[theme.id]; if (!ids) return;
    const s = Math.min(h * 0.8, 64);
    const left = M[ids[0]], right = M[ids[1]];
    ctx.save(); try { if (left) left(ctx, s * (ids[0] === 'dragonBoat' ? 1.1 : 0.75), h / 2, s); } catch (e) {} ctx.restore();
    ctx.save(); try { if (right) right(ctx, w - s * 0.9, h / 2, s); } catch (e) {} ctx.restore();
    // a few small stars/sparkles in the middle background
    ctx.save(); ctx.globalAlpha = 0.35; for (let i = 0; i < 6; i++) star(ctx, w * 0.25 + i * w * 0.1, h * (i % 2 ? 0.2 : 0.8), 3, '#ffe680'); ctx.restore();
  }

  root.JP_THEMES = { THEMES, BIRTHDAY, windows, resolve, resolveDn, next, drawBanner, motifs: M, thirdSundayOfJune };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JP_THEMES;
})(typeof window !== 'undefined' ? window : globalThis);
