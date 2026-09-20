/* Monte Carlo simulation of the Jackpot engine.
   Usage: node tests/simulate.js [spins] [bet]
   Reports RTP split by component, hit frequency, free-spin and jackpot frequency.
   Uses a seeded PRNG so runs are reproducible. */
const E = require('../js/engine.js');

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function run(spins, bet, seed) {
  const rng = mulberry(seed);
  let wagered = 0, lineWon = 0, scatterWon = 0, fsWon = 0, jpWon = 0;
  let hits = 0, fsTriggers = 0, fsSpinsTotal = 0, jpHits = 0, retriggers = 0;
  let jackpot = E.JACKPOT.seed;
  let maxWinX = 0;
  const tiers = { win: 0, big: 0, mega: 0, epic: 0, jackpot: 0 };
  for (let i = 0; i < spins; i++) {
    wagered += bet;
    jackpot += E.jackpotContribution(bet);
    const res = E.evaluate(E.gridFromStops(E.spinStops(rng)), bet, { freeSpins: false, jackpot });
    if (res.total > 0) hits++;
    lineWon += res.lineTotal; scatterWon += res.scatter.pay;
    if (res.jackpot.hit) { jpHits++; jpWon += res.jackpot.amount; jackpot = E.JACKPOT.seed; }
    const t = E.winTier(res.total, bet, res.jackpot.hit); if (tiers[t] !== undefined) tiers[t]++;
    if (res.total / bet > maxWinX) maxWinX = res.total / bet;
    let fs = res.scatter.freeSpins;
    if (fs) fsTriggers++;
    let fsRound = 0;
    while (fs > 0) {
      fs--; fsSpinsTotal++;
      jackpot += 0; // free spins do not feed the meter (no bet placed)
      const r2 = E.evaluate(E.gridFromStops(E.spinStops(rng)), bet, { freeSpins: true, jackpot });
      fsWon += r2.lineTotal + r2.scatter.pay; fsRound += r2.lineTotal + r2.scatter.pay;
      if (r2.jackpot.hit) { jpHits++; jpWon += r2.jackpot.amount; fsWon += r2.jackpot.amount; jackpot = E.JACKPOT.seed; }
      if (r2.scatter.freeSpins) { fs += r2.scatter.freeSpins; retriggers++; }
    }
    if (fsRound / bet > maxWinX) maxWinX = fsRound / bet;
  }
  const pct = (v) => (100 * v / wagered).toFixed(2) + '%';
  return {
    spins, bet,
    rtp_total: pct(lineWon + scatterWon + fsWon + jpWon),
    rtp_lines: pct(lineWon), rtp_scatter: pct(scatterWon), rtp_freespins: pct(fsWon), rtp_jackpot: pct(jpWon),
    hit_rate: (100 * hits / spins).toFixed(2) + '%',
    free_spin_every: fsTriggers ? Math.round(spins / fsTriggers) + ' spins' : 'never',
    avg_fs_per_trigger: fsTriggers ? (fsSpinsTotal / fsTriggers).toFixed(1) : '-',
    retriggers,
    jackpot_every: jpHits ? Math.round(spins / jpHits) + ' spins' : 'never',
    jackpot_hits: jpHits,
    max_win_x_bet: Math.round(maxWinX),
    tiers,
  };
}

const spins = parseInt(process.argv[2] || '1000000', 10);
const bet = parseInt(process.argv[3] || '100', 10);
console.log(JSON.stringify(run(spins, bet, 12345), null, 2));
