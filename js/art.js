/* Jackpot — symbol artwork. Everything is drawn in code on canvas; no image assets.
   drawSymbol(ctx, id, cx, cy, size) draws one symbol centred at (cx, cy) inside a
   size×size box. All shapes are original, generic fruit-machine icons. */
(function (root) {
  'use strict';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shine(ctx, cx, cy, r) {
    // soft white highlight blob (top-left)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  function leaf(ctx, x, y, len, angle, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = color || '#3fa24a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,60,0,0.35)'; ctx.lineWidth = Math.max(1, len * 0.05);
    ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
    ctx.restore();
  }

  function ball(ctx, cx, cy, r, c1, c2, c3) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, c1); g.addColorStop(0.6, c2); g.addColorStop(1, c3);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
    shine(ctx, cx - r * 0.38, cy - r * 0.4, r * 0.42);
  }

  const D = {};

  D.CHERRY = function (ctx, cx, cy, s) {
    const r = s * 0.19;
    // stems
    ctx.strokeStyle = '#6b4a1f'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.05, cy + r * 1.0); ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 1.6, cx + r * 0.2, cy - r * 1.9);
    ctx.moveTo(cx + r * 1.15, cy + r * 0.7); ctx.quadraticCurveTo(cx + r * 1.0, cy - r * 1.2, cx + r * 0.2, cy - r * 1.9);
    ctx.stroke();
    leaf(ctx, cx + r * 0.2, cy - r * 1.9, s * 0.3, -0.35);
    ball(ctx, cx - r * 1.05, cy + r * 1.0, r, '#ff8a8a', '#e0262b', '#8c0d14');
    ball(ctx, cx + r * 1.15, cy + r * 0.7, r, '#ff8a8a', '#e0262b', '#8c0d14');
  };

  D.LEMON = function (ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.5);
    const rx = s * 0.34, ry = s * 0.25;
    const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, ry * 0.1, 0, 0, rx);
    g.addColorStop(0, '#fff7a8'); g.addColorStop(0.6, '#f5d31a'); g.addColorStop(1, '#c79a00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // end nubs
    ctx.fillStyle = '#d9b400';
    ctx.beginPath(); ctx.arc(rx * 0.98, 0, ry * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-rx * 0.98, 0, ry * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,0,0.35)'; ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    shine(ctx, -rx * 0.35, -ry * 0.4, ry * 0.6);
    ctx.restore();
    leaf(ctx, cx + s * 0.22, cy - s * 0.24, s * 0.26, -1.1);
  };

  D.ORANGE = function (ctx, cx, cy, s) {
    const r = s * 0.31;
    ball(ctx, cx, cy + s * 0.03, r, '#ffd08a', '#ff8c1a', '#b85500');
    // dimples
    ctx.fillStyle = 'rgba(160,70,0,0.18)';
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + 0.3, d = r * (0.35 + (i % 3) * 0.18);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + s * 0.03 + Math.sin(a) * d, r * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#6b3a12';
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.95 + s * 0.03, r * 0.1, 0, Math.PI * 2); ctx.fill();
    leaf(ctx, cx + r * 0.05, cy - r * 0.95 + s * 0.03, s * 0.28, -0.5);
  };

  D.PLUM = function (ctx, cx, cy, s) {
    const r = s * 0.31;
    ball(ctx, cx, cy + s * 0.03, r, '#d9a6ff', '#8a3fc7', '#3c1466');
    ctx.strokeStyle = 'rgba(40,0,70,0.45)'; ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath(); ctx.moveTo(cx - r * 0.05, cy - r * 0.9 + s * 0.03); ctx.quadraticCurveTo(cx + r * 0.5, cy + s * 0.03, cx + r * 0.15, cy + r * 0.92 + s * 0.03); ctx.stroke();
    ctx.strokeStyle = '#6b4a1f'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.95 + s * 0.03); ctx.lineTo(cx + s * 0.06, cy - r * 1.35 + s * 0.03); ctx.stroke();
    leaf(ctx, cx + s * 0.06, cy - r * 1.3 + s * 0.03, s * 0.26, -0.2);
  };

  D.MELON = function (ctx, cx, cy, s) {
    const r = s * 0.36;
    const y = cy + s * 0.12;
    // rind
    ctx.fillStyle = '#1f7a2d';
    ctx.beginPath(); ctx.arc(cx, y, r, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9f0b0';
    ctx.beginPath(); ctx.arc(cx, y, r * 0.88, Math.PI, 0); ctx.closePath(); ctx.fill();
    // flesh
    const g = ctx.createLinearGradient(cx, y - r, cx, y);
    g.addColorStop(0, '#ff6b7a'); g.addColorStop(1, '#e0233a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, y, r * 0.78, Math.PI, 0); ctx.closePath(); ctx.fill();
    // seeds
    ctx.fillStyle = '#1a1a1a';
    const seeds = [[-0.45, -0.28], [-0.15, -0.5], [0.2, -0.45], [0.48, -0.22], [0.02, -0.18], [-0.3, -0.05], [0.3, -0.06]];
    seeds.forEach(function (p) {
      ctx.save(); ctx.translate(cx + p[0] * r, y + p[1] * r); ctx.rotate(p[0] * 0.8);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.05, r * 0.085, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    ctx.strokeStyle = 'rgba(0,40,0,0.35)'; ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath(); ctx.arc(cx, y, r, Math.PI, 0); ctx.closePath(); ctx.stroke();
  };

  D.BELL = function (ctx, cx, cy, s) {
    const w = s * 0.62, h = s * 0.6, top = cy - h * 0.5 + s * 0.02;
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, '#b8860b'); g.addColorStop(0.35, '#ffe680'); g.addColorStop(0.6, '#f2c230'); g.addColorStop(1, '#a86f00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, top + h * 0.82);
    ctx.quadraticCurveTo(cx - w * 0.42, top + h * 0.35, cx - w * 0.2, top + h * 0.12);
    ctx.quadraticCurveTo(cx, top - h * 0.05, cx + w * 0.2, top + h * 0.12);
    ctx.quadraticCurveTo(cx + w * 0.42, top + h * 0.35, cx + w * 0.5, top + h * 0.82);
    ctx.quadraticCurveTo(cx, top + h * 0.7, cx - w * 0.5, top + h * 0.82);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,0,0.5)'; ctx.lineWidth = Math.max(1, s * 0.02); ctx.stroke();
    // rim
    ctx.fillStyle = '#d9a520';
    ctx.beginPath(); ctx.ellipse(cx, top + h * 0.84, w * 0.52, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,0,0.5)'; ctx.stroke();
    // clapper
    ctx.fillStyle = '#7a4e00';
    ctx.beginPath(); ctx.arc(cx, top + h * 0.95, w * 0.09, 0, Math.PI * 2); ctx.fill();
    // knob
    ctx.fillStyle = '#c9931a';
    ctx.beginPath(); ctx.arc(cx, top + h * 0.02, w * 0.08, 0, Math.PI * 2); ctx.fill();
    shine(ctx, cx - w * 0.2, top + h * 0.3, w * 0.22);
  };

  D.BAR = function (ctx, cx, cy, s) {
    const w = s * 0.8, h = s * 0.34;
    ctx.save();
    ctx.translate(cx, cy);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.5, '#0f0f0f'); g.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, h * 0.25); ctx.fill();
    ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(1.5, s * 0.03); rr(ctx, -w / 2, -h / 2, w, h, h * 0.25); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + Math.round(h * 0.78) + 'px "Arial Black", Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BAR', 0, h * 0.04);
    ctx.restore();
  };

  D.SEVEN = function (ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    const H = s * 0.7, W = s * 0.5, t = s * 0.16; // height, width, stroke thickness
    const path = function () {
      ctx.beginPath();
      ctx.moveTo(-W / 2, -H / 2);
      ctx.lineTo(W / 2, -H / 2);
      ctx.lineTo(W / 2, -H / 2 + t * 0.35);
      ctx.lineTo(-W * 0.02, H / 2);
      ctx.lineTo(-W * 0.02 - t * 1.05, H / 2);
      ctx.lineTo(W / 2 - t * 1.1, -H / 2 + t);
      ctx.lineTo(-W / 2, -H / 2 + t);
      ctx.closePath();
    };
    // shadow
    ctx.translate(s * 0.02, s * 0.03); ctx.fillStyle = 'rgba(0,0,0,0.3)'; path(); ctx.fill(); ctx.translate(-s * 0.02, -s * 0.03);
    // gold outline
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f5d76e'; ctx.lineWidth = Math.max(2, s * 0.07); path(); ctx.stroke();
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = Math.max(1, s * 0.02); path(); ctx.stroke();
    const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    g.addColorStop(0, '#ff6a6a'); g.addColorStop(0.5, '#e01b24'); g.addColorStop(1, '#8e0a10');
    ctx.fillStyle = g; path(); ctx.fill();
    // gloss
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.moveTo(-W / 2 + t * 0.15, -H / 2 + t * 0.15); ctx.lineTo(W / 2 - t * 0.15, -H / 2 + t * 0.15); ctx.lineTo(W / 2 - t * 0.3, -H / 2 + t * 0.5); ctx.lineTo(-W / 2 + t * 0.15, -H / 2 + t * 0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  D.WILD = function (ctx, cx, cy, s) {
    // Gold: an ingot (yuanbao) — boat-shaped base with a domed centre. Acts as the wild.
    ctx.save();
    ctx.translate(cx, cy + s * 0.06);
    const w = s * 0.8, h = s * 0.42;
    const g = ctx.createLinearGradient(0, -h * 0.7, 0, h * 0.5);
    g.addColorStop(0, '#fff2a8'); g.addColorStop(0.45, '#f5c518'); g.addColorStop(1, '#b07a00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.25);
    ctx.quadraticCurveTo(-w * 0.45, h * 0.55, 0, h * 0.5);
    ctx.quadraticCurveTo(w * 0.45, h * 0.55, w / 2, -h * 0.25);
    ctx.quadraticCurveTo(w * 0.3, h * 0.05, 0, h * 0.02);
    ctx.quadraticCurveTo(-w * 0.3, h * 0.05, -w / 2, -h * 0.25);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = Math.max(1, s * 0.02); ctx.stroke();
    // dome
    const g2 = ctx.createRadialGradient(-w * 0.08, -h * 0.45, s * 0.02, 0, -h * 0.2, w * 0.32);
    g2.addColorStop(0, '#fff7c2'); g2.addColorStop(0.6, '#f2c230'); g2.addColorStop(1, '#b07a00');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.2, w * 0.3, h * 0.5, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a3a00';
    ctx.font = '900 ' + Math.round(s * 0.15) + 'px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GOLD', 0, h * 0.27);
    ctx.restore();
  };

  D.SCATTER = function (ctx, cx, cy, s) {
    // Red packet (hongbao) with gold trim and 福.
    ctx.save();
    ctx.translate(cx, cy);
    const w = s * 0.5, h = s * 0.72;
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#b3121a'); g.addColorStop(0.5, '#e8232c'); g.addColorStop(1, '#9e0d14');
    ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, s * 0.05); ctx.fill();
    ctx.strokeStyle = '#f5d76e'; ctx.lineWidth = Math.max(1.5, s * 0.03); rr(ctx, -w / 2, -h / 2, w, h, s * 0.05); ctx.stroke();
    // flap
    ctx.fillStyle = '#c4161e';
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(0, -h / 2 + h * 0.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(245,215,110,0.7)'; ctx.lineWidth = Math.max(1, s * 0.015); ctx.stroke();
    // gold coin seal
    ctx.fillStyle = '#f5c518';
    ctx.beginPath(); ctx.arc(0, -h * 0.2, w * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = Math.max(1, s * 0.015); ctx.stroke();
    // 福 character
    ctx.fillStyle = '#ffe680';
    ctx.font = '700 ' + Math.round(s * 0.28) + 'px "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Microsoft YaHei", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('福', 0, h * 0.18);
    ctx.restore();
  };

  function drawSymbol(ctx, id, cx, cy, size) {
    const fn = D[id];
    if (!fn) return;
    ctx.save();
    try { fn(ctx, cx, cy, size); } finally { ctx.restore(); }
  }

  // Friendly names for the paytable and win captions.
  const NAMES = {
    SEVEN: 'Lucky 7', BAR: 'Bar', BELL: 'Bell', MELON: 'Melon', PLUM: 'Plum',
    ORANGE: 'Orange', LEMON: 'Lemon', CHERRY: 'Cherry', WILD: 'Gold (Wild)', SCATTER: 'Red Packet (Free Spins)',
  };

  root.JP_ART = { drawSymbol, NAMES, roundRect: rr };
})(typeof window !== 'undefined' ? window : globalThis);
