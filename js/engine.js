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
    SEVEN:  { 3: 30, 4: 120, 5: 600 },
    BAR:    { 3: 20, 4: 75,  5: 300 },
    BELL:   { 3: 15, 4: 40,  5: 150 },
    MELON:  { 3: 10, 4: 30,  5: 80 },
    PLUM:   { 3: 8,  4: 20,  5: 60 },
    ORANGE: { 3: 5,  4: 15,  5: 40 },
    LEMON:  { 3: 4,  4: 10,  5: 30 },
    CHERRY: { 2: 2,  3: 4,   4: 10,  5: 30 },
  };

  // Scatter (red packet): pays in multiples of the TOTAL bet and awards free spins.
  const SCATTER_PAY = { 3: 2, 4: 5, 5: 20 };
  const FREE_SPINS  = { 3: 10, 4: 15, 5: 20 };

  const WILD_MULT = 2;   // any line win that uses a wild (gold ingot) is doubled
  const FS_MULT   = 2;   // all wins during free spins are doubled (stacks with wild → ×4)

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
     opts.freeSpins  – true while inside a free-spin round (applies FS_MULT)
     opts.jackpot    – current meter value; awarded in full when hit
     Returns { lineWins:[{line, symbol, count, pay, positions:[[reel,row]...], wild}],
               scatter:{count, positions, pay, freeSpins},
               jackpot:{hit, amount, line},
               lineTotal, total, multiplier } */
  function evaluate(grid, totalBet, opts) {
    opts = opts || {};
    const lineBet = totalBet / LINE_COUNT;
    const mult = opts.freeSpins ? FS_MULT : 1;
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

    const lineTotal = lineWins.reduce((a, w) => a + w.pay, 0);
    const jackpotAmount = jackpotHit ? Math.round(opts.jackpot || 0) : 0;
    const total = lineTotal + scatter.pay + jackpotAmount;
    return {
      lineWins, scatter,
      jackpot: { hit: jackpotHit, amount: jackpotAmount, line: jackpotLine },
      lineTotal, total, multiplier: mult,
    };
  }

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
    REELS, ROWS, SYMBOLS, PAY, SCATTER_PAY, FREE_SPINS, WILD_MULT, FS_MULT,
    LINE_COUNT, LINES, BETS, JACKPOT, START_CREDITS, REFILL_CREDITS, STRIPS,
    defaultRng, spinStops, gridFromStops, symbolAt, evaluate, winTier, jackpotContribution,
  };

  root.JP_ENGINE = ENGINE;
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
