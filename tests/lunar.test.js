/* Validation of js/lunar.js.
   1. Meeus worked examples (new moon 1977 Feb 18; Sun longitude 1992 Oct 13).
   2. Every lunar-month start date 2025–2040 and every winter-solstice date against the
      Hong Kong Observatory Gregorian-Lunar Calendar Conversion Tables
      (https://www.hko.gov.hk/en/gts/time/calendar/text/files/T20xxe.txt, rows "Nth Lunar Month").
   Run: node tests/lunar.test.js */
const L = require('../js/lunar.js');
const assert = require('assert');

// --- 1. Meeus examples -------------------------------------------------------------------
// Example 49.a: new moon of 1977 February, JDE = 2443192.65118 (k = -283)
const jde = L.newMoonJDE(-283);
assert.ok(Math.abs(jde - 2443192.65118) < 0.0002, 'Meeus 49.a new moon: got ' + jde);
// Example 25.a: 1992 Oct 13.0 TD → apparent longitude 199.90895° (low-accuracy method ≈ 199.909)
const lon = L.sunLongitude(2448908.5);
assert.ok(Math.abs(lon - 199.90895) < 0.01, 'Meeus 25.a longitude: got ' + lon);
console.log('ok - Meeus worked examples');

// --- 2. HKO month starts -----------------------------------------------------------------
// Format per Gregorian year: "M/D=n" for regular months, "M/D=nL" for the leap (intercalary) month,
// and "WS=M/D" for the winter solstice row. Transcribed verbatim from the HKO text tables.
const HKO = {
  2025: '1/29=1 2/28=2 3/29=3 4/28=4 5/27=5 6/25=6 7/25=6L 8/23=7 9/22=8 10/21=9 11/20=10 12/20=11 WS=12/21',
  2026: '1/19=12 2/17=1 3/19=2 4/17=3 5/17=4 6/15=5 7/14=6 8/13=7 9/11=8 10/10=9 11/9=10 12/9=11 WS=12/22',
  2027: '1/8=12 2/6=1 3/8=2 4/7=3 5/6=4 6/5=5 7/4=6 8/2=7 9/1=8 9/30=9 10/29=10 11/28=11 12/28=12 WS=12/22',
  2028: '1/26=1 2/25=2 3/26=3 4/25=4 5/24=5 6/23=5L 7/22=6 8/20=7 9/19=8 10/18=9 11/16=10 12/16=11 WS=12/21',
  2029: '1/15=12 2/13=1 3/15=2 4/14=3 5/13=4 6/12=5 7/11=6 8/10=7 9/8=8 10/8=9 11/6=10 12/5=11 WS=12/21',
  2030: '1/4=12 2/3=1 3/4=2 4/3=3 5/2=4 6/1=5 7/1=6 7/30=7 8/29=8 9/27=9 10/27=10 11/25=11 12/25=12 WS=12/22',
  2031: '1/23=1 2/21=2 3/23=3 4/22=3L 5/21=4 6/20=5 7/19=6 8/18=7 9/17=8 10/16=9 11/15=10 12/14=11 WS=12/22',
  2032: '1/13=12 2/11=1 3/12=2 4/10=3 5/9=4 6/8=5 7/7=6 8/6=7 9/5=8 10/4=9 11/3=10 12/3=11 WS=12/21',
  2033: '1/1=12 1/31=1 3/1=2 3/31=3 4/29=4 5/28=5 6/27=6 7/26=7 8/25=8 9/23=9 10/23=10 11/22=11 12/22=11L WS=12/21',
  2034: '1/20=12 2/19=1 3/20=2 4/19=3 5/18=4 6/16=5 7/16=6 8/14=7 9/13=8 10/12=9 11/11=10 12/11=11 WS=12/22',
  2035: '1/9=12 2/8=1 3/10=2 4/8=3 5/8=4 6/6=5 7/5=6 8/4=7 9/2=8 10/1=9 10/31=10 11/30=11 12/29=12 WS=12/22',
  2036: '1/28=1 2/27=2 3/28=3 4/26=4 5/26=5 6/24=6 7/23=6L 8/22=7 9/20=8 10/19=9 11/18=10 12/17=11 WS=12/21',
  2037: '1/16=12 2/15=1 3/17=2 4/16=3 5/15=4 6/14=5 7/13=6 8/11=7 9/10=8 10/9=9 11/7=10 12/7=11 WS=12/21',
  2038: '1/5=12 2/4=1 3/6=2 4/5=3 5/4=4 6/3=5 7/2=6 8/1=7 8/30=8 9/29=9 10/28=10 11/26=11 12/26=12 WS=12/22',
  2039: '1/24=1 2/23=2 3/25=3 4/23=4 5/23=5 6/22=5L 7/21=6 8/20=7 9/18=8 10/18=9 11/16=10 12/16=11 WS=12/22',
  2040: '1/14=12 2/12=1 3/13=2 4/11=3 5/11=4 6/10=5 7/9=6 8/8=7 9/6=8 10/6=9 11/5=10 12/4=11 WS=12/21',
};

let checked = 0, failures = [];
Object.keys(HKO).forEach(function (ys) {
  const Y = parseInt(ys, 10);
  // months computed for the Chinese years starting in Y-1 and Y cover every month start in Gregorian Y
  const mine = {};
  [Y - 1, Y].forEach(function (cy) { L.chineseYear(cy).months.forEach(function (m) { mine[m.start] = (m.leap ? 'L' : '') + m.n; }); });
  HKO[ys].split(' ').forEach(function (tok) {
    if (tok.startsWith('WS=')) {
      const [m, d] = tok.slice(3).split('/').map(Number);
      const got = L.festivals(Y).dongzhi, want = L.ymdToDn(Y, m, d);
      checked++; if (got !== want) failures.push(Y + ' winter solstice: want ' + tok.slice(3) + ' got ' + JSON.stringify(L.dnToYmd(got)));
      return;
    }
    const [md, val] = tok.split('='); const [m, d] = md.split('/').map(Number);
    const want = val.endsWith('L') ? 'L' + val.slice(0, -1) : val;
    const dn = L.ymdToDn(Y, m, d); const got = mine[dn];
    checked++; if (got !== want) failures.push(Y + '/' + m + '/' + d + ': want month ' + want + ' got ' + (got || 'no month start'));
  });
  // and no extra month starts that HKO does not list within the Gregorian year
  Object.keys(mine).forEach(function (dn) {
    const o = L.dnToYmd(+dn); if (o.y !== Y) return;
    const listed = HKO[ys].split(' ').some(function (tok) { return tok.startsWith(o.m + '/' + o.d + '='); });
    if (!listed) failures.push(Y + ': extra month start ' + o.m + '/' + o.d + ' = ' + mine[dn]);
  });
});
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('ok - ' + checked + ' HKO month-start / solstice dates 2025-2040 match');

// --- 3. festival dates derived for a few years (spot-check against the tables above) -------
const f = (y) => { const o = L.festivals(y); const s = (dn) => { const d = L.dnToYmd(dn); return d.y + '-' + d.m + '-' + d.d; }; return { cny: s(o.cny), lantern: s(o.lantern), duanwu: s(o.duanwu), qixi: s(o.qixi), zhongqiu: s(o.zhongqiu), dongzhi: s(o.dongzhi) }; };
assert.deepStrictEqual(f(2026), { cny: '2026-2-17', lantern: '2026-3-3', duanwu: '2026-6-19', qixi: '2026-8-19', zhongqiu: '2026-9-25', dongzhi: '2026-12-22' });
assert.deepStrictEqual(f(2033), { cny: '2033-1-31', lantern: '2033-2-14', duanwu: '2033-6-1', qixi: '2033-8-1', zhongqiu: '2033-9-8', dongzhi: '2033-12-21' });
console.log('ok - festival dates 2026 & 2033');
console.log('all lunar tests passed');
