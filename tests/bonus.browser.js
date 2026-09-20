/* Forces each bonus round in headless Chromium and checks credits, overlays and errors.
   Saves screenshots to tests/out/bonus-*.png */
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r); });
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const shot = (page, n) => page.screenshot({ path: path.join(__dirname, 'out', 'bonus-' + n + '.png') });
const credits = async (page) => parseInt((await page.textContent('#credits')).replace(/,/g, ''), 10);
const waitIdle = (page) => page.waitForFunction(() => window.JP_DEBUG && window.JP_DEBUG.phase() === 'idle', null, { timeout: 30000 });
srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/'; const b = await chromium.launch(); const errs = []; const out = {};
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base); await page.waitForTimeout(600);
  await page.click('#btnTurbo'); // faster
  const setGamble = async (on) => { await page.evaluate((v) => { const p = JSON.parse(localStorage.getItem('jp_profile_v1')); p.gamble = v; localStorage.setItem('jp_profile_v1', JSON.stringify(p)); }, on); await page.reload(); await page.waitForTimeout(600); };
  await setGamble(false);
  const noBonus = () => page.evaluate(() => { const E = window.JP_ENGINE; E.rollGoldRush = () => null; E.rollWheel = () => false; });
  await noBonus();
  const findStops = (pred) => page.evaluate((src) => { const E = window.JP_ENGINE; const pred = new Function('r', 'g', 'return (' + src + ')(r, g)'); for (let a = 0; a < 48; a++) for (let b2 = 0; b2 < 48; b2++) for (let c = 0; c < 48; c++) { const s = [a, b2, c, 5, 9]; const g = E.gridFromStops(s); const r = E.evaluate(g, 100, { jackpot: 5000 }); if (pred(r, g)) return s; } return null; }, pred.toString());

  // ---- 1. Gold Rush on reel 3, with a losing spin otherwise
  const loseStops = await findStops((r) => r.total === 0 && !r.pick.hit && r.scatter.count === 0);
  await page.evaluate((s) => { window.JP_ENGINE.spinStops = () => s.slice(); window.JP_ENGINE.rollGoldRush = () => [2]; }, loseStops);
  let c0 = await credits(page);
  await page.click('#btnSpin'); await page.waitForTimeout(1300); await shot(page, 'goldrush-wipe');
  await page.waitForTimeout(2600); await shot(page, 'goldrush-after');
  await waitIdle(page); await page.waitForTimeout(300);
  out.goldRush = { creditsDelta: (await credits(page)) - c0 + 100, msg: await page.textContent('#msg') };
  await page.evaluate(() => { window.JP_ENGINE.rollGoldRush = () => null; });

  // ---- 2. Fortune Pick: a Gold on each of reels 2-4
  const goldStops = await page.evaluate(() => { const E = window.JP_ENGINE; const s = [3, 0, 0, 0, 9]; for (let r = 1; r <= 3; r++) { const i = E.STRIPS[r].indexOf('WILD'); s[r] = ((i - 1) + 48) % 48; } return s; });
  await page.evaluate((s) => { window.JP_ENGINE.spinStops = () => s.slice(); }, goldStops);
  c0 = await credits(page);
  await page.click('#btnSpin'); await page.waitForTimeout(2400); await shot(page, 'pick-trigger');
  await page.waitForFunction(() => !document.getElementById('pickOverlay').classList.contains('hidden'), null, { timeout: 15000 });
  await page.waitForTimeout(500); await shot(page, 'pick-open');
  const packets = await page.$$('#pickGrid .packet');
  await packets[0].click(); await page.waitForTimeout(400); await packets[5].click(); await page.waitForTimeout(400); await packets[10].click(); await page.waitForTimeout(900);
  await shot(page, 'pick-done');
  const pickTotal = parseInt((await page.textContent('#pickTotal')).replace(/,/g, ''), 10);
  const collectVisible = !(await page.$eval('#pickCollectRow', (e) => e.classList.contains('hidden')));
  await page.click('#btnPickCollect'); await page.waitForTimeout(800); await waitIdle(page);
  const afterPick = await credits(page);
  out.pick = { pickTotal, collectVisible, creditsDeltaMatches: afterPick - c0 + 100 === pickTotal + (await page.evaluate(() => 0)), overlayClosed: await page.$eval('#pickOverlay', (e) => e.classList.contains('hidden')) };
  // note: the spin itself may also have paid a line; check delta >= pickTotal
  out.pick.deltaAtLeastPick = afterPick - c0 + 100 >= pickTotal;

  // ---- 3. Lucky Wheel: losing spin, forced trigger, segment 10 (15×)
  await page.evaluate((s) => { const E = window.JP_ENGINE; E.spinStops = () => s.slice(); E.rollWheel = () => true; E.spinWheel = () => 10; }, loseStops);
  c0 = await credits(page);
  await page.click('#btnSpin');
  await page.waitForFunction(() => !document.getElementById('wheelOverlay').classList.contains('hidden'), null, { timeout: 15000 });
  await page.waitForTimeout(400); await shot(page, 'wheel-open');
  await page.click('#btnWheelSpin'); await page.waitForTimeout(2500); await shot(page, 'wheel-spinning');
  await page.waitForFunction(() => document.getElementById('wheelResult').textContent.length > 0, null, { timeout: 15000 });
  await shot(page, 'wheel-result');
  out.wheel15x = { result: await page.textContent('#wheelResult') };
  await page.click('#btnWheelCollect'); await page.waitForTimeout(600); await waitIdle(page);
  out.wheel15x.creditsDelta = (await credits(page)) - c0 + 100;
  // wheel → free spins segment (index 2 = 5 FREE)
  await page.evaluate(() => { window.JP_ENGINE.spinWheel = () => 2; });
  await page.click('#btnSpin');
  await page.waitForFunction(() => !document.getElementById('wheelOverlay').classList.contains('hidden'), null, { timeout: 15000 });
  await page.click('#btnWheelSpin');
  await page.waitForFunction(() => document.getElementById('wheelResult').textContent.length > 0, null, { timeout: 15000 });
  out.wheelFs = { result: await page.textContent('#wheelResult') };
  await page.click('#btnWheelCollect');
  await page.waitForFunction(() => !document.getElementById('fsIntroOverlay').classList.contains('hidden'), null, { timeout: 15000 });
  out.wheelFs.fsIntro = await page.textContent('#fsIntroNum');
  await page.evaluate(() => { const E = window.JP_ENGINE; E.spinStops = function (rng) { rng = rng || E.defaultRng; const s = []; for (let r = 0; r < E.REELS; r++) s.push(Math.floor(rng() * E.STRIPS[r].length)); return s; }; E.rollWheel = () => false; });
  await page.click('#btnFsStart'); await page.waitForTimeout(3000); await shot(page, 'fs-ladder');
  out.wheelFs.badge = await page.textContent('#fsBadge');
  await page.waitForFunction(() => !document.getElementById('fsEndOverlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.click('#btnFsCollect'); await page.waitForTimeout(600); await waitIdle(page);
  // wheel → jackpot segment (index 6)
  await page.evaluate((s) => { const E = window.JP_ENGINE; E.spinStops = () => s.slice(); E.rollWheel = () => true; E.spinWheel = () => 6; }, loseStops);
  c0 = await credits(page); const meter = parseInt((await page.textContent('#jpValue')).replace(/,/g, ''), 10);
  await page.click('#btnSpin');
  await page.waitForFunction(() => !document.getElementById('wheelOverlay').classList.contains('hidden'), null, { timeout: 15000 });
  await page.click('#btnWheelSpin');
  await page.waitForFunction(() => document.getElementById('wheelResult').textContent.length > 0, null, { timeout: 15000 });
  out.wheelJackpot = { result: await page.textContent('#wheelResult') };
  await page.click('#btnWheelCollect'); await page.waitForTimeout(800); await shot(page, 'wheel-jackpot');
  out.wheelJackpot.overlay = !(await page.$eval('#jackpotOverlay', (e) => e.classList.contains('hidden')));
  await page.click('#btnJpCollect'); await page.waitForTimeout(500); await waitIdle(page);
  out.wheelJackpot.creditsDelta = (await credits(page)) - c0 + 100; out.wheelJackpot.meterBefore = meter; out.wheelJackpot.meterAfter = await page.textContent('#jpValue');
  await page.evaluate(() => { window.JP_ENGINE.rollWheel = () => false; });

  // ---- 4. Double Up: a 4x win, guess red with a forced red draw, then collect
  await setGamble(true); await noBonus();
  const winStops = await findStops((r) => r.total >= 300 && r.total <= 800 && !r.pick.hit && !r.scatter.freeSpins);
  await page.evaluate((s) => { const E = window.JP_ENGINE; E.spinStops = () => s.slice(); E.doubleDraw = () => 'red'; }, winStops);
  c0 = await credits(page);
  await page.click('#btnSpin');
  await page.waitForFunction(() => !document.getElementById('gambleOverlay').classList.contains('hidden'), null, { timeout: 20000 });
  await page.waitForTimeout(300); await shot(page, 'double-offer');
  const amt0 = parseInt((await page.textContent('#gambleAmt')).replace(/,/g, ''), 10);
  await page.click('#btnGambleRed'); await page.waitForTimeout(1500); await shot(page, 'double-won');
  const amt1 = parseInt((await page.textContent('#gambleAmt')).replace(/,/g, ''), 10);
  await page.click('#btnGambleCollect'); await page.waitForTimeout(600); await waitIdle(page);
  out.doubleUp = { offered: amt0, afterWin: amt1, doubled: amt1 === amt0 * 2, creditsDelta: (await credits(page)) - c0 + 100, expectedDelta: amt1 };
  // a losing guess
  await page.evaluate(() => { window.JP_ENGINE.doubleDraw = () => 'black'; });
  c0 = await credits(page);
  await page.click('#btnSpin');
  await page.waitForFunction(() => !document.getElementById('gambleOverlay').classList.contains('hidden'), null, { timeout: 20000 });
  await page.click('#btnGambleRed'); await page.waitForTimeout(1500); await shot(page, 'double-lost');
  out.doubleLost = { msg: await page.textContent('#gambleMsg') };
  await page.click('#btnGambleCollect'); await page.waitForTimeout(600); await waitIdle(page);
  out.doubleLost.creditsDelta = (await credits(page)) - c0 + 100;

  // ---- 5. settings: picker hidden, gamble toggle present; paytable bonus section
  await page.click('#btnMore'); await page.waitForTimeout(300);
  out.settings = { themeSelectGone: await page.evaluate(() => !document.getElementById('themeSelect')), gambleToggle: await page.evaluate(() => !!document.getElementById('btnGamble')), records: await page.textContent('#records') };
  await page.click('#btnMoreBack');
  await page.click('#btnPays'); await page.waitForTimeout(300);
  out.paytable = { hasBonusRounds: (await page.textContent('#paysList')).includes('BONUS ROUNDS'), goldName: (await page.textContent('#paysList')).includes('Gold (Wild)') };
  await page.evaluate(() => { document.querySelector('#paysOverlay .sheet').scrollTop = 1400; }); await page.waitForTimeout(200); await shot(page, 'paytable-bonus');
  await page.click('#btnPaysBack');

  console.log(JSON.stringify(out, null, 1)); console.log('errors', errs);
  await b.close(); srv.close(); if (errs.length) process.exitCode = 1;
});
