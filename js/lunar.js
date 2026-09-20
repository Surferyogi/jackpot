/* Jackpot — Chinese lunisolar calendar, computed astronomically (no lookup tables, no end date).
   Method: the official rules of the Chinese calendar (GB/T 33661-2017) applied with the
   astronomical algorithms from Jean Meeus, "Astronomical Algorithms" (2nd ed.):
     - new moons: chapter 49 (mean phase + periodic corrections, accuracy well under 1 minute)
     - Sun's apparent longitude: chapter 25 (low-accuracy series, ~0.01° ≈ 15 min in time)
     - ΔT (TT→UT): Espenak & Meeus 2006 polynomials
   Days are Beijing-time calendar days (UTC+8), the same civil time as Singapore.
   Rules: the lunar month containing the winter solstice is month 11; if 13 lunar months
   begin between two successive month-11 starts, the first one without a principal solar
   term (zhongqi) is the leap month. Month 1 day 1 is Chinese New Year.
   Validated against the Hong Kong Observatory conversion tables 2025–2040 (tests/lunar.test.js).
   Loaded in the browser as window.JP_LUNAR; require()-able in Node. */
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  const sin = function (d) { return Math.sin(d * RAD); };
  const cos = function (d) { return Math.cos(d * RAD); };
  const norm = function (d) { d = d % 360; return d < 0 ? d + 360 : d; };

  // ---- calendar day numbers -----------------------------------------------------------
  // dn = Julian Day Number of a civil (Gregorian) date, i.e. floor(JD + 0.5) of that day.
  function ymdToDn(y, m, d) {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function dnToYmd(dn) {
    const a = dn + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
    const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
    return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
  }

  // ---- ΔT = TT − UT in seconds (Espenak & Meeus 2006) -----------------------------------
  function deltaT(year) {
    let t, u;
    if (year < 1961) { t = year - 1950; return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; } // 1941–1961 polynomial (also used, approximately, for earlier years — not needed by this app)
    if (year < 1986) { t = year - 1975; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
    if (year < 2005) { t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t; }
    if (year < 2050) { t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (year < 2150) { return -20 + 32 * Math.pow((year - 1820) / 100, 2) - 0.5628 * (2150 - year); }
    u = (year - 1820) / 100; return -20 + 32 * u * u;
  }
  // JDE (Terrestrial Time) → Beijing civil day number (UTC+8).
  function jdeToBjDn(jde) {
    const year = 2000 + (jde - 2451545) / 365.25;
    const jdUt = jde - deltaT(year) / 86400;
    return Math.floor(jdUt + 8 / 24 + 0.5);
  }

  // ---- new moons (Meeus ch. 49) ---------------------------------------------------------
  // k: integer lunation number, k = 0 at the new moon of 2000 Jan 6.
  function newMoonJDE(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const M = norm(2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3);
    const Mp = norm(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4);
    const F = norm(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4);
    const Om = norm(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);
    let c = 0;
    c += -0.40720 * sin(Mp);
    c += 0.17241 * E * sin(M);
    c += 0.01608 * sin(2 * Mp);
    c += 0.01039 * sin(2 * F);
    c += 0.00739 * E * sin(Mp - M);
    c += -0.00514 * E * sin(Mp + M);
    c += 0.00208 * E * E * sin(2 * M);
    c += -0.00111 * sin(Mp - 2 * F);
    c += -0.00057 * sin(Mp + 2 * F);
    c += 0.00056 * E * sin(2 * Mp + M);
    c += -0.00042 * sin(3 * Mp);
    c += 0.00042 * E * sin(M + 2 * F);
    c += 0.00038 * E * sin(M - 2 * F);
    c += -0.00024 * E * sin(2 * Mp - M);
    c += -0.00017 * sin(Om);
    c += -0.00007 * sin(Mp + 2 * M);
    c += 0.00004 * sin(2 * Mp - 2 * F);
    c += 0.00004 * sin(3 * M);
    c += 0.00003 * sin(Mp + M - 2 * F);
    c += 0.00003 * sin(2 * Mp + 2 * F);
    c += -0.00003 * sin(Mp + M + 2 * F);
    c += 0.00003 * sin(Mp - M + 2 * F);
    c += -0.00002 * sin(Mp - M - 2 * F);
    c += -0.00002 * sin(3 * Mp + M);
    c += 0.00002 * sin(4 * Mp);
    const A = [
      [0.000325, 299.77 + 0.107408 * k - 0.009173 * T2], [0.000165, 251.88 + 0.016321 * k], [0.000164, 251.83 + 26.651886 * k],
      [0.000126, 349.42 + 36.412478 * k], [0.000110, 84.66 + 18.206239 * k], [0.000062, 141.74 + 53.303771 * k],
      [0.000060, 207.14 + 2.453732 * k], [0.000056, 154.84 + 7.306860 * k], [0.000047, 34.52 + 27.261239 * k],
      [0.000042, 207.19 + 0.121824 * k], [0.000040, 291.34 + 1.844379 * k], [0.000037, 161.72 + 24.198154 * k],
      [0.000035, 239.56 + 25.513099 * k], [0.000023, 331.55 + 3.592518 * k],
    ];
    for (let i = 0; i < A.length; i++) c += A[i][0] * sin(A[i][1]);
    return jde + c;
  }
  // Lunation number of the first new moon at or after the given JDE.
  function firstLunationAfter(jde) {
    let k = Math.floor((jde - 2451550.09766) / 29.530588861) - 1;
    while (newMoonJDE(k) < jde) k++;
    return k;
  }

  // ---- Sun's apparent longitude (Meeus ch. 25, low accuracy) ------------------------------
  function sunLongitude(jde) {
    const T = (jde - 2451545) / 36525, T2 = T * T;
    const L0 = norm(280.46646 + 36000.76983 * T + 0.0003032 * T2);
    const M = norm(357.52911 + 35999.05029 * T - 0.0001537 * T2);
    const C = (1.914602 - 0.004817 * T - 0.000014 * T2) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    const Om = 125.04 - 1934.136 * T;
    return norm(L0 + C - 0.00569 - 0.00478 * sin(Om));
  }
  // JDE at which the Sun's apparent longitude equals `lon` (degrees), near `approxJde`.
  function solarTermJDE(lon, approxJde) {
    let jde = approxJde;
    for (let i = 0; i < 10; i++) {
      let diff = lon - sunLongitude(jde);
      diff = ((diff + 180) % 360 + 360) % 360 - 180;
      jde += diff / (360 / 365.2422);
      if (Math.abs(diff) < 1e-6) break;
    }
    return jde;
  }
  // Winter solstice (λ = 270°) of a Gregorian year, as JDE.
  function winterSolsticeJDE(year) { return solarTermJDE(270, ymdToDn(year, 12, 21) - 0.5); }

  // ---- month construction --------------------------------------------------------------
  // A "sui" runs from the month containing one winter solstice to the month containing the
  // next. Returns the lunar months whose numbering is fixed by that sui: month 11 of the
  // previous Chinese year, then 12, 1, 2, ... 10 (with a leap month inserted where required).
  const suiCache = {};
  function sui(year) { // year = Gregorian year of the second winter solstice
    if (suiCache[year]) return suiCache[year];
    const ws1 = winterSolsticeJDE(year - 1), ws2 = winterSolsticeJDE(year);
    const ws1dn = jdeToBjDn(ws1), ws2dn = jdeToBjDn(ws2);
    // new moon on or before each solstice (by Beijing calendar day)
    let k1 = firstLunationAfter(ws1 - 31); while (jdeToBjDn(newMoonJDE(k1 + 1)) <= ws1dn) k1++;
    let k2 = firstLunationAfter(ws2 - 31); while (jdeToBjDn(newMoonJDE(k2 + 1)) <= ws2dn) k2++;
    const starts = []; for (let k = k1; k <= k2; k++) starts.push(jdeToBjDn(newMoonJDE(k)));
    const count = k2 - k1; // months from month 11 to the next month 11 (exclusive)
    const months = [];
    let leapUsed = false;
    // principal terms in this sui: λ = 300°, 330°, 0°, ..., 240° (270° is the solstice itself)
    const terms = []; let approx = ws1;
    for (let i = 1; i <= 12; i++) { approx = solarTermJDE(norm(270 + 30 * i), approx + 30.44); terms.push(jdeToBjDn(approx)); }
    let n = 11;
    for (let i = 0; i < count; i++) {
      const s = starts[i], e = starts[i + 1];
      let leap = false;
      if (count === 13 && !leapUsed && i > 0) {
        const hasTerm = terms.some(function (t) { return t >= s && t < e; });
        if (!hasTerm) { leap = true; leapUsed = true; }
      }
      if (!leap) { if (i > 0) n = n === 12 ? 1 : n + 1; }
      months.push({ n: n, leap: leap, start: s, days: e - s });
    }
    suiCache[year] = months;
    return months;
  }

  // Months of the Chinese year that begins with the New Year in Gregorian year `year`:
  // month 1 .. month 12 (13 entries when there is a leap month).
  const yearCache = {};
  function chineseYear(year) {
    if (yearCache[year]) return yearCache[year];
    const a = sui(year), b = sui(year + 1);
    const all = a.concat(b);
    const i1 = all.findIndex(function (m) { return m.n === 1 && !m.leap; });
    let i2 = -1; for (let i = i1 + 1; i < all.length; i++) if (all[i].n === 1 && !all[i].leap) { i2 = i; break; }
    if (i1 < 0 || i2 < 0) throw new Error('Chinese year construction failed for ' + year);
    const months = all.slice(i1, i2);
    const res = { year: year, months: months, newYear: months[0].start, nextNewYear: all[i2].start };
    yearCache[year] = res;
    return res;
  }

  // Day number of lunar date (month n, day d) in the Chinese year starting in Gregorian `year`.
  // Leap months are not used for festivals (leap = false picks the regular month).
  function lunarToDn(year, n, d, leap) {
    const cy = chineseYear(year);
    const m = cy.months.find(function (x) { return x.n === n && !!x.leap === !!leap; });
    if (!m) return null;
    if (d > m.days) return null;
    return m.start + d - 1;
  }

  function dnToDate(dn) { const o = dnToYmd(dn); return o; }
  function dateToDn(date) { return ymdToDn(date.getFullYear(), date.getMonth() + 1, date.getDate()); }

  // Festival day numbers for the Chinese year starting in Gregorian `year`.
  function festivals(year) {
    const cy = chineseYear(year);
    return {
      cnyEve: cy.newYear - 1,
      cny: cy.newYear,
      lantern: lunarToDn(year, 1, 15),
      duanwu: lunarToDn(year, 5, 5),
      qixi: lunarToDn(year, 7, 7),
      zhongqiu: lunarToDn(year, 8, 15),
      dongzhi: jdeToBjDn(winterSolsticeJDE(year)),
      nextCny: cy.nextNewYear,
    };
  }

  const LUNAR = { ymdToDn, dnToYmd, dnToDate, dateToDn, deltaT, jdeToBjDn, newMoonJDE, sunLongitude, solarTermJDE, winterSolsticeJDE, sui, chineseYear, lunarToDn, festivals };
  root.JP_LUNAR = LUNAR;
  if (typeof module !== 'undefined' && module.exports) module.exports = LUNAR;
})(typeof window !== 'undefined' ? window : globalThis);
