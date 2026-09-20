/* Monte Carlo simulation of the Jackpot engine, including every bonus feature exactly as the
   game runs them: free spins with the rising multiplier ladder, Gold Rush, Fortune Pick,
   Lucky Wheel and the progressive jackpot. (Double Up is a fair 50/50, RTP-neutral, not simulated.)
   Usage: node tests/simulate.js [spins] [bet]   — seeded PRNG, reproducible. */
const E = require('../js/engine.js');

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function run(spins, bet, seed) {
  const rng = mulberry(seed);
  const W = { lines: 0, scatter: 0, fs: 0, jackpot: 0, goldRush: 0, pick: 0, wheel: 0 };
  const N = { hits: 0, fsTriggers: 0, fsSpins: 0, jp: 0, goldRush: 0, pick: 0, wheel: 0, wheelFs: 0, wheelJp: 0 };
  let wagered = 0, jackpot = E.JACKPOT.seed, maxX = 0;
  const tiers = { win: 0, big: 0, mega: 0, epic: 0, jackpot: 0 };

  function freeSpins(n) {
    let left = n, mult = E.FS_LADDER[0];
    while (left > 0) {
      left--; N.fsSpins++;
      const r = E.evaluate(E.gridFromStops(E.spinStops(rng)), bet, { freeSpins: true, multiplier: mult, jackpot });
      const won = r.lineTotal + r.scatter.pay;
      W.fs += won;
      if (r.jackpot.hit) { N.jp++; W.jackpot += r.jackpot.amount; jackpot = E.JACKPOT.seed; }
      if (r.scatter.freeSpins) left += r.scatter.freeSpins;
      if (r.pick.hit) { N.pick++; const lay = E.pickLayout(rng); let p = 0; for (let i = 0; i < E.PICK.picks; i++) p += lay[i] * bet; W.pick += p; }
      mult = E.nextLadder(mult, won > 0);
      if (won / bet > maxX) maxX = won / bet;
    }
  }

  for (let i = 0; i < spins; i++) {
    wagered += bet; jackpot += E.jackpotContribution(bet);
    let grid = E.gridFromStops(E.spinStops(rng));
    const gr = E.rollGoldRush(rng);
    if (gr) { N.goldRush++; grid = E.applyGoldRush(grid, gr); }
    const res = E.evaluate(grid, bet, { jackpot, noPick: !!gr });
    const base = res.lineTotal + res.scatter.pay;
    if (gr) W.goldRush += base; else { W.lines += res.lineTotal; W.scatter += res.scatter.pay; }
    if (res.total > 0) N.hits++;
    if (res.jackpot.hit) { N.jp++; W.jackpot += res.jackpot.amount; jackpot = E.JACKPOT.seed; }
    const t = E.winTier(res.total, bet, res.jackpot.hit); if (tiers[t] !== undefined) tiers[t]++;
    if (res.total / bet > maxX) maxX = res.total / bet;
    if (res.pick.hit) { N.pick++; const lay = E.pickLayout(rng); let p = 0; for (let k = 0; k < E.PICK.picks; k++) p += lay[k] * bet; W.pick += p; }
    if (res.scatter.freeSpins) { N.fsTriggers++; freeSpins(res.scatter.freeSpins); }
    else if (res.total === 0 && !res.pick.hit && E.rollWheel(rng)) {
      N.wheel++;
      const seg = E.WHEEL.segments[E.spinWheel(rng)];
      if (seg.t === 'x') W.wheel += seg.v * bet;
      else if (seg.t === 'fs') { N.wheelFs++; const before = W.fs; freeSpins(seg.v); W.wheel += W.fs - before; W.fs = before; }
      else { N.wheelJp++; W.wheel += Math.round(jackpot); jackpot = E.JACKPOT.seed; }
    }
  }
  const pct = (v) => (100 * v / wagered).toFixed(2) + '%';
  const every = (n) => n ? Math.round(spins / n) + ' spins' : 'never';
  const total = Object.values(W).reduce((a, b) => a + b, 0);
  return {
    spins, bet, rtp_total: pct(total),
    rtp: { lines: pct(W.lines), scatter: pct(W.scatter), free_spins: pct(W.fs), gold_rush: pct(W.goldRush), fortune_pick: pct(W.pick), lucky_wheel: pct(W.wheel), jackpot_7s: pct(W.jackpot) },
    hit_rate: (100 * N.hits / spins).toFixed(2) + '%',
    frequency: { free_spins: every(N.fsTriggers), gold_rush: every(N.goldRush), fortune_pick: every(N.pick), lucky_wheel: every(N.wheel), jackpot_7s: every(N.jp), wheel_jackpots: N.wheelJp, any_bonus: every(N.fsTriggers + N.goldRush + N.pick + N.wheel) },
    avg_fs_per_trigger: N.fsTriggers ? (N.fsSpins / N.fsTriggers).toFixed(1) : '-',
    max_win_x_bet: Math.round(maxX), tiers,
  };
}

const spins = parseInt(process.argv[2] || '1000000', 10);
const bet = parseInt(process.argv[3] || '100', 10);
console.log(JSON.stringify(run(spins, bet, 12345), null, 2));
