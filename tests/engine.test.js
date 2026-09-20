/* Deterministic engine tests. Run: node tests/engine.test.js */
const E = require('../js/engine.js');
const assert = require('assert');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('strip integrity', () => {
  E.STRIPS.forEach((s, r) => {
    assert.strictEqual(s.length, 48);
    s.forEach((sym, i) => { assert.ok(E.SYMBOLS.includes(sym)); assert.notStrictEqual(sym, s[(i + 1) % s.length], 'no identical neighbours'); });
    const wilds = s.filter((x) => x === 'WILD').length;
    if (r === 0 || r === 4) assert.strictEqual(wilds, 0, 'no wild on reels 1 and 5'); else assert.strictEqual(wilds, 3);
    const special = []; s.forEach((x, i) => { if (x === 'SCATTER' || x === 'WILD') special.push(i); });
    for (let a = 0; a < special.length; a++) for (let b = a + 1; b < special.length; b++) { const d = Math.abs(special[a] - special[b]); assert.ok(Math.min(d, 48 - d) >= 3, 'specials spaced ≥3'); }
  });
});
t('paylines are 20 valid rows', () => { assert.strictEqual(E.LINES.length, 20); E.LINES.forEach((l) => { assert.strictEqual(l.length, 5); l.forEach((r) => assert.ok(r >= 0 && r <= 2)); }); assert.strictEqual(new Set(E.LINES.map(String)).size, 20); });
const G = (rows) => { const g = []; for (let r = 0; r < 5; r++) g.push([rows[0][r], rows[1][r], rows[2][r]]); return g; };
const X = 'LEMON';
t('three bells on middle line pays 15× line bet', () => {
  const g = G([['CHERRY','PLUM','ORANGE','MELON','BAR'], ['BELL','BELL','BELL','CHERRY','PLUM'], ['ORANGE','MELON','BAR','LEMON','ORANGE']]);
  const r = E.evaluate(g, 100, {});
  assert.strictEqual(r.lineWins.length, 1); assert.strictEqual(r.lineWins[0].symbol, 'BELL'); assert.strictEqual(r.lineWins[0].count, 3);
  assert.strictEqual(r.lineWins[0].pay, 15 * 5); assert.strictEqual(r.total, 75);
});
t('wild substitutes and doubles', () => {
  const g = G([['BAR','WILD','WILD','WILD','BAR'], [X,'CHERRY',X,'CHERRY',X], ['CHERRY',X,'CHERRY',X,'CHERRY']]);
  const r = E.evaluate(g, 20, {});
  const top = r.lineWins.find((w) => w.line === 1);
  assert.ok(top && top.symbol === 'BAR' && top.count === 5 && top.wild);
  assert.strictEqual(top.pay, 300 * 1 * 2);
});
t('no pay for two of a kind except cherry', () => {
  const g = G([['BAR','BAR',X,'PLUM',X], ['CHERRY','CHERRY','PLUM',X,'PLUM'], [X,'PLUM',X,'PLUM',X]]);
  const r = E.evaluate(g, 20, {});
  // cherry pair on reels 1-2 middle row sits on lines 1, 16 and 17 (all start mid, mid)
  assert.deepStrictEqual(r.lineWins.map((w) => w.symbol + w.count), ['CHERRY2', 'CHERRY2', 'CHERRY2']);
  assert.deepStrictEqual(r.lineWins.map((w) => w.line), [0, 15, 16]);
  assert.strictEqual(r.total, 6);
});
// Neutral grid: each reel filled with a different symbol, so no line can ever pay.
const N = () => { const F = ['LEMON','ORANGE','PLUM','MELON','BELL']; return F.map((f) => [f, f, f]); };
t('scatters anywhere: 3 → 10 free spins + 2× bet', () => {
  const g = N(); g[0][0] = 'SCATTER'; g[2][1] = 'SCATTER'; g[3][2] = 'SCATTER';
  const r = E.evaluate(g, 100, {});
  assert.strictEqual(r.scatter.count, 3); assert.strictEqual(r.scatter.freeSpins, 10); assert.strictEqual(r.scatter.pay, 200); assert.strictEqual(r.lineWins.length, 0);
});
t('free-spin multiplier doubles line and scatter pays', () => {
  const g = N(); g[0][1] = 'BELL'; g[1][1] = 'BELL'; g[2][1] = 'BELL'; g[0][0] = 'SCATTER'; g[1][2] = 'SCATTER'; g[3][2] = 'SCATTER'; g[4][0] = 'SCATTER';
  const r = E.evaluate(g, 100, { freeSpins: true });
  assert.strictEqual(r.multiplier, 2); assert.strictEqual(r.lineTotal, 150); assert.strictEqual(r.scatter.count, 4); assert.strictEqual(r.scatter.pay, 5 * 100 * 2); assert.strictEqual(r.scatter.freeSpins, 15);
});
t('five sevens wins the meter and reports the line', () => {
  const g = N(); g[0][1] = 'SEVEN'; g[1][1] = 'SEVEN'; g[2][1] = 'WILD'; g[3][1] = 'SEVEN'; g[4][1] = 'SEVEN';
  const r = E.evaluate(g, 100, { jackpot: 5432.6 });
  assert.ok(r.jackpot.hit); assert.strictEqual(r.jackpot.amount, 5433); assert.strictEqual(r.jackpot.line, 0);
  assert.strictEqual(r.lineTotal, 600 * 5 * 2); assert.strictEqual(r.total, 6000 + 5433);
  assert.strictEqual(E.winTier(r.total, 100, true), 'jackpot');
});
t('win tiers', () => { assert.strictEqual(E.winTier(0, 100, false), 'none'); assert.strictEqual(E.winTier(399, 100, false), 'win'); assert.strictEqual(E.winTier(400, 100, false), 'big'); assert.strictEqual(E.winTier(1000, 100, false), 'mega'); assert.strictEqual(E.winTier(2500, 100, false), 'epic'); });
t('spinStops respects strip lengths and rng', () => { const s = E.spinStops(() => 0.999999); s.forEach((v) => assert.strictEqual(v, 47)); const z = E.spinStops(() => 0); z.forEach((v) => assert.strictEqual(v, 0)); });
t('gridFromStops wraps', () => { const g = E.gridFromStops([47, 0, 0, 0, 0]); assert.strictEqual(g[0][0], E.STRIPS[0][47]); assert.strictEqual(g[0][1], E.STRIPS[0][0]); assert.strictEqual(g[0][2], E.STRIPS[0][1]); });
console.log(n + ' tests passed');
