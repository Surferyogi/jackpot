/* Jackpot — game engine (pure maths, no DOM, no audio).
   Loaded in the browser as window.JP_ENGINE and require()-able in Node for tests.
   Everything that decides money lives here so it can be simulated and unit-tested. */
(function (root) {
  'use strict';

  const REELS = 5;
  const ROWS = 3;

  // Symbol ids. Order = paytable order (highest first) for the paytable screen.
  const SYMBOLS = ['SEVEN', 'BAR', 'BELL', 'MELON', 'PLUM', 'ORANGE', 'LEMON', 'CHERRY', 'WILD', 'SCATTER'];

  // Line pays in multiples of the LINE bet (total bet / 20), for N-of-a-kind left to right.
  const PAY = {
    SEVEN:  { 3: 25, 4: 90,  5: 450 },
    BAR:    { 3: 15, 4: 60,  5: 230 },
    BELL:   { 3: 12, 4: 30,  5: 115 },
    MELON:  { 3: 8,  4: 23,  5: 60 },
    PLUM:   { 3: 6,  4: 15,  5: 45 },
    ORANGE: { 3: 4,  4: 12,  5: 30 },
    LEMON:  { 3: 3,  4: 8,   5: 23 },
    CHERRY: { 2: 2,  3: 3,   4: 8,   5: 23 },
  };

  // Scatter (red packet): pays in multiples of the TOTAL bet and awards free spins.
  const SCATTER_PAY = { 3: 2, 4: 5, 5: 20 };
  const FREE_SPINS  = { 3: 10, 4: 15, 5: 20 };

  const WILD_MULT = 2;   // any line win that uses a Gold (wild ingot) is doubled
  const FS_MULT   = 2;   // free spins start at ×2 …
  const FS_LADDER = [2, 3, 4, 5]; // … and every winning free spin in a row climbs the ladder; a blank spin resets to ×2

  // ---- Bonus features -------------------------------------------------------------
  // Gold Rush (base game, random): before the reels stop, 1 or 2 of reels 2–4 turn fully Gold.
  const GOLD_RUSH = { prob: 1 / 75, twoReelProb: 0.25, reels: [1, 2, 3] };
  // Fortune Pick (symbol trigger): a Gold showing on each of reels 2, 3 and 4 at the same time.
  // 12 red packets; the player opens PICKS of them; each holds a prize in multiples of the total bet.
  const PICK = { picks: 3, prizes: [1, 1, 1, 1, 2, 2, 2, 3, 3, 5, 5, 8] };
  // Lucky Wheel (mystery trigger): after a losing base-game spin, with probability WHEEL.prob.
  // Twelve equal segments, chosen uniformly. 'x' = multiple of total bet, 'fs' = free spins, 'jackpot' = the meter.
  const WHEEL = {
    prob: 1 / 90,
    segments: [
      { t: 'x', v: 2 }, { t: 'x', v: 5 }, { t: 'fs', v: 5 }, { t: 'x', v: 3 }, { t: 'x', v: 8 }, { t: 'x', v: 2 },
      { t: 'jackpot' }, { t: 'x', v: 3 }, { t: 'fs', v: 10 }, { t: 'x', v: 5 }, { t: 'x', v: 15 }, { t: 'x', v: 2 },
    ],
  };
  // Double Up (optional, player's choice): after a base-game win of 1×–25× the bet, guess Red or Black.
  // Fair 50/50; win doubles the amount, lose forfeits it; up to DOUBLE.maxRounds in a row.
  const DOUBLE = { minX: 1, maxX: 25, maxRounds: 3 };

  const LINE_COUNT = 20;
  // 20 fixed paylines: row index (0 top, 1 middle, 2 bottom) per reel.
  const LINES = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
    [0,0,1,0,0], [2,2,1,2,2], [1,0,0,0,1], [1,2,2,2,1], [1,0,1,0,1],
    [1,2,1,2,1], [0,1,0,1,0], [2,1,2,1,2], [0,1,1,1,0], [2,1,1,1,2],
    [1,1,0,1,1], [1,1,2,1,1], [0,0,2,0,0], [2,2,0,2,2], [0,2,0,2,0],
  ];

  // Total-bet presets (credits per spin, all 20 lines always active).
  const BETS = [20, 40, 100, 200, 400, 1000];

  // Progressive jackpot: a share of every bet feeds the meter; five SEVENs (wilds may
  // substitute) on any payline wins the whole meter on top of the line pay, then it reseeds.
  const JACKPOT = { seed: 5000, rate: 0.015 };

  const START_CREDITS  = 5000;
  const REFILL_CREDITS = 5000;

  // Reel strips (48 stops each). Generated once with the constraints: no two identical
  // neighbours; WILD/SCATTER at least 3 stops apart so at most one can show per reel.
  // WILD appears on reels 2–4 only; SCATTER on all reels.
  const STRIPS = [
    ["SEVEN","LEMON","PLUM","LEMON","CHERRY","ORANGE","LEMON","MELON","SEVEN","CHERRY","ORANGE","PLUM","ORANGE","LEMON","CHERRY","BAR","LEMON","SCATTER","PLUM","ORANGE","MELON","CHERRY","SEVEN","MELON","ORANGE","BELL","PLUM","CHERRY","MELON","BAR","MELON","BELL","CHERRY","BAR","LEMON","CHERRY","ORANGE","BAR","BELL","PLUM","MELON","BELL","SEVEN","ORANGE","CHERRY","BELL","PLUM","LEMON"],
    ["ORANGE","PLUM","CHERRY","BELL","SEVEN","PLUM","LEMON","MELON","WILD","SEVEN","PLUM","ORANGE","PLUM","BELL","CHERRY","BAR","LEMON","WILD","ORANGE","MELON","SEVEN","CHERRY","PLUM","BELL","SCATTER","CHERRY","ORANGE","BAR","WILD","BELL","CHERRY","LEMON","BELL","MELON","LEMON","MELON","ORANGE","LEMON","ORANGE","LEMON","MELON","CHERRY","LEMON","PLUM","SCATTER","BAR","CHERRY","BAR"],
    ["LEMON","SCATTER","BAR","ORANGE","WILD","CHERRY","PLUM","SEVEN","BAR","MELON","SEVEN","MELON","BELL","BAR","CHERRY","MELON","LEMON","PLUM","ORANGE","SEVEN","CHERRY","LEMON","SCATTER","PLUM","ORANGE","LEMON","CHERRY","LEMON","PLUM","MELON","BELL","ORANGE","LEMON","PLUM","BELL","CHERRY","MELON","WILD","ORANGE","CHERRY","PLUM","BELL","BAR","ORANGE","BELL","LEMON","WILD","CHERRY"],
    ["ORANGE","BELL","BAR","MELON","BELL","CHERRY","MELON","LEMON","PLUM","MELON","LEMON","CHERRY","LEMON","SCATTER","ORANGE","BELL","MELON","WILD","ORANGE","CHERRY","LEMON","PLUM","ORANGE","MELON","SEVEN","PLUM","SEVEN","BAR","WILD","CHERRY","BAR","ORANGE","BAR","PLUM","BELL","CHERRY","LEMON","PLUM","CHERRY","LEMON","SCATTER","CHERRY","ORANGE","WILD","PLUM","LEMON","SEVEN","BELL"],
    ["ORANGE","BAR","ORANGE","LEMON","CHERRY","PLUM","ORANGE","CHERRY","LEMON","MELON","PLUM","CHERRY","SEVEN","BELL","ORANGE","LEMON","MELON","SCATTER","LEMON","MELON","PLUM","ORANGE","PLUM","BELL","SEVEN","BELL","CHERRY","BAR","MELON","CHERRY","BELL","CHERRY","ORANGE","CHERRY","SEVEN","BAR","PLUM","MELON","SCATTER","BAR","MELON","PLUM","LEMON","ORANGE","BELL","LEMON","SEVEN","LEMON"],
  ];

  // ---- RNG -------------------------------------------------------------------
  function defaultRng() {
    const c = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (c && c.getRandomValues) {
      const buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  }

  function spinStops(rng) {
    rng = rng || defaultRng;
    const stops = [];
    for (let r = 0; r < REELS; r++) stops.push(Math.floor(rng() * STRIPS[r].length));
    return stops;
  }

  // grid[reel][row]
  function gridFromStops(stops) {
    const grid = [];
    for (let r = 0; r < REELS; r++) {
      const strip = STRIPS[r];
      const col = [];
      for (let k = 0; k < ROWS; k++) col.push(strip[(stops[r] + k) % strip.length]);
      grid.push(col);
    }
    return grid;
  }

  function symbolAt(reel, offset) {
    const strip = STRIPS[reel];
    const n = strip.length;
    return strip[((offset % n) + n) % n];
  }

  // ---- Evaluation --------------------------------------------------------------
  /* evaluate(grid, totalBet, opts)
     opts.freeSpins  – true while inside a free-spin round (applies FS_MULT unless opts.multiplier is given)
     opts.multiplier – explicit win multiplier (free-spin ladder)
     opts.jackpot    – current meter value; awarded in full when hit
     Returns { lineWins:[{line, symbol, count, pay, positions:[[reel,row]...], wild}],
               scatter:{count, positions, pay, freeSpins},
               jackpot:{hit, amount, line},
               lineTotal, total, multiplier } */
  function evaluate(grid, totalBet, opts) {
    opts = opts || {};
    const lineBet = totalBet / LINE_COUNT;
    const mult = opts.multiplier != null ? opts.multiplier : (opts.freeSpins ? FS_MULT : 1);
    const lineWins = [];
    let jackpotHit = false, jackpotLine = -1;

    for (let li = 0; li < LINES.length; li++) {
      const line = LINES[li];
      // Paying symbol = first non-wild from the left.
      let sym = null;
      for (let r = 0; r < REELS; r++) {
        const s = grid[r][line[r]];
        if (s !== 'WILD') { sym = s; break; }
      }
      if (sym === null) sym = 'SEVEN'; // all wilds (not reachable with current strips; treated as top symbol)
      if (sym === 'SCATTER') continue;
      let count = 0, wild = false;
      const positions = [];
      for (let r = 0; r < REELS; r++) {
        const s = grid[r][line[r]];
        if (s === sym || s === 'WILD') {
          count++; positions.push([r, line[r]]);
          if (s === 'WILD') wild = true;
        } else break;
      }
      const table = PAY[sym];
      if (!table || !table[count]) continue;
      let pay = table[count] * lineBet;
      if (wild) pay *= WILD_MULT;
      pay *= mult;
      lineWins.push({ line: li, symbol: sym, count, pay, positions, wild });
      if (sym === 'SEVEN' && count === 5 && !jackpotHit) { jackpotHit = true; jackpotLine = li; }
    }

    // Scatters anywhere on the visible grid.
    const scPos = [];
    for (let r = 0; r < REELS; r++) for (let k = 0; k < ROWS; k++) if (grid[r][k] === 'SCATTER') scPos.push([r, k]);
    const scCount = scPos.length;
    const scatter = {
      count: scCount,
      positions: scPos,
      pay: (SCATTER_PAY[scCount] || 0) * totalBet * mult,
      freeSpins: FREE_SPINS[scCount] || 0,
    };

    // Fortune Pick trigger: a Gold visible on each of reels 2, 3 and 4 (not during Gold Rush reels).
    const goldPos = [];
    let goldReels = 0;
    for (let r = 1; r <= 3; r++) { let has = false; for (let k = 0; k < ROWS; k++) if (grid[r][k] === 'WILD') { goldPos.push([r, k]); has = true; } if (has) goldReels++; }
    const pick = { hit: !opts.noPick && goldReels === 3, positions: goldPos };

    const lineTotal = lineWins.reduce((a, w) => a + w.pay, 0);
    const jackpotAmount = jackpotHit ? Math.round(opts.jackpot || 0) : 0;
    const total = lineTotal + scatter.pay + jackpotAmount;
    return {
      lineWins, scatter, pick,
      jackpot: { hit: jackpotHit, amount: jackpotAmount, line: jackpotLine },
      lineTotal, total, multiplier: mult,
    };
  }

  // ---- Bonus helpers (pure; rng defaults to crypto) -------------------------------------
  function rollGoldRush(rng) {
    rng = rng || defaultRng;
    if (rng() >= GOLD_RUSH.prob) return null;
    const pool = GOLD_RUSH.reels.slice();
    const pickOne = function () { return pool.splice(Math.floor(rng() * pool.length), 1)[0]; };
    const reels = [pickOne()];
    if (rng() < GOLD_RUSH.twoReelProb) reels.push(pickOne());
    return reels.sort();
  }
  function applyGoldRush(grid, reels) {
    const g = grid.map(function (col) { return col.slice(); });
    (reels || []).forEach(function (r) { for (let k = 0; k < ROWS; k++) g[r][k] = 'WILD'; });
    return g;
  }
  function rollWheel(rng) { rng = rng || defaultRng; return rng() < WHEEL.prob; }
  function spinWheel(rng) { rng = rng || defaultRng; return Math.floor(rng() * WHEEL.segments.length); }
  // Shuffled packet layout for Fortune Pick (multiples of bet, in packet order).
  function pickLayout(rng) {
    rng = rng || defaultRng;
    const a = PICK.prizes.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function nextLadder(mult, won) { if (!won) return FS_LADDER[0]; const i = FS_LADDER.indexOf(mult); return i < 0 ? FS_LADDER[0] : FS_LADDER[Math.min(FS_LADDER.length - 1, i + 1)]; }
  function canDouble(total, totalBet) { return total >= DOUBLE.minX * totalBet && total <= DOUBLE.maxX * totalBet; }
  function doubleDraw(rng) { rng = rng || defaultRng; return rng() < 0.5 ? 'red' : 'black'; }

  // Win tier for celebrations, by total win ÷ total bet.
  function winTier(total, totalBet, jackpotHit) {
    if (jackpotHit) return 'jackpot';
    if (total <= 0) return 'none';
    const x = total / totalBet;
    if (x >= 25) return 'epic';
    if (x >= 10) return 'mega';
    if (x >= 4)  return 'big';
    return 'win';
  }

  function jackpotContribution(totalBet) { return totalBet * JACKPOT.rate; }

  const ENGINE = {
    REELS, ROWS, SYMBOLS, PAY, SCATTER_PAY, FREE_SPINS, WILD_MULT, FS_MULT, FS_LADDER,
    GOLD_RUSH, PICK, WHEEL, DOUBLE,
    LINE_COUNT, LINES, BETS, JACKPOT, START_CREDITS, REFILL_CREDITS, STRIPS,
    defaultRng, spinStops, gridFromStops, symbolAt, evaluate, winTier, jackpotContribution,
    rollGoldRush, applyGoldRush, rollWheel, spinWheel, pickLayout, nextLadder, canDouble, doubleDraw,
  };

  root.JP_ENGINE = ENGINE;
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
