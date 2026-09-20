/* Headless browser smoke test: serves the repo, loads the game at iPhone and iPad sizes,
   checks for console/page errors, spins a few times (normal + turbo), forces a big win,
   free spins and a jackpot through a seeded RNG, and saves screenshots to tests/out/. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

(async () => {
  const { srv, port } = await serve();
  const base = 'http://127.0.0.1:' + port + '/';
  const browser = await chromium.launch();
  const errors = [];
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  const results = {};

  async function fresh(viewport, name) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    return { ctx, page };
  }

  // ---- iPhone portrait ----
  let { ctx, page } = await fresh({ width: 390, height: 844 }, 'iphone');
  await page.screenshot({ path: path.join(out, '01-iphone-idle.png'), fullPage: true });
  results.verTag = await page.textContent('#verTag');
  results.creditsStart = await page.textContent('#credits');

  // normal spin
  await page.click('#btnSpin');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, '02-iphone-spinning.png') });
  await page.waitForFunction(() => document.getElementById('btnSpin').textContent.trim() === 'SPIN' && !document.getElementById('btnSpin').disabled, null, { timeout: 15000 });
  await page.waitForTimeout(3500);
  results.afterSpin1 = { credits: await page.textContent('#credits'), win: await page.textContent('#win'), msg: await page.textContent('#msg') };
  await page.screenshot({ path: path.join(out, '03-iphone-after-spin.png') });

  // Force outcomes by overriding the RNG-driven spinStops (test hook via engine object).
  async function forceStops(stops) { await page.evaluate((s) => { window.JP_ENGINE.spinStops = () => s.slice(); }, stops); }
  async function spinAndWait(extra) {
    await page.click('#btnSpin');
    await page.waitForTimeout(3200 + (extra || 0));
  }
  // find stops that produce: (a) a big line win, (b) 3+ scatters, (c) five sevens
  const found = await page.evaluate(() => {
    const E = window.JP_ENGINE; const res = {};
    const n = E.STRIPS[0].length;
    outer: for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
      const stops = [a, b, c, 0, 0];
      const g = E.gridFromStops(stops); const r = E.evaluate(g, 100, { jackpot: 5000 });
      if (!res.big && r.total >= 400 && r.total < 1000 && !r.scatter.freeSpins) res.big = stops;
      if (!res.mega && r.total >= 1000 && r.total < 2500 && !r.scatter.freeSpins) res.mega = stops;
      if (res.big && res.mega) break outer;
    }
    // scatters: pick a stop on each reel showing SCATTER in middle row
    const sc = E.STRIPS.map((s) => { const i = s.indexOf('SCATTER'); return ((i - 1) + s.length) % s.length; });
    res.scatter = [sc[0], sc[1], sc[2], 0, 0];
    // five sevens on the middle line
    const sv = E.STRIPS.map((s) => { const i = s.indexOf('SEVEN'); return ((i - 1) + s.length) % s.length; });
    res.jackpot = sv;
    return res;
  });
  results.found = found;

  await forceStops(found.big); await spinAndWait(0);
  await page.screenshot({ path: path.join(out, '04-iphone-bigwin.png') });
  await page.waitForFunction(() => document.getElementById('banner').classList.contains('hidden'), null, { timeout: 15000 });
  results.afterBig = { credits: await page.textContent('#credits'), win: await page.textContent('#win'), msg: await page.textContent('#msg') };

  await forceStops(found.mega); await spinAndWait(500);
  await page.screenshot({ path: path.join(out, '05-iphone-megawin.png') });
  await page.waitForFunction(() => document.getElementById('banner').classList.contains('hidden'), null, { timeout: 15000 });
  results.afterMega = { credits: await page.textContent('#credits'), win: await page.textContent('#win') };

  // paytable
  await page.click('#btnPays'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '06-iphone-paytable.png'), fullPage: false });
  await page.click('#btnPaysBack');

  // free spins: scatter trigger, then let the round run with turbo on
  await page.click('#btnTurbo');
  await forceStops(found.scatter); await spinAndWait(2500);
  await page.screenshot({ path: path.join(out, '07-iphone-freespins-intro.png') });
  results.fsIntroVisible = !(await page.$eval('#fsIntroOverlay', (e) => e.classList.contains('hidden')));
  // during the round, use random stops again (restore) so it ends
  await page.evaluate(() => { delete window.JP_ENGINE.spinStops; });
  // restoring the original: reload engine function from a fresh copy is not possible, so re-define quickly
  await page.evaluate(() => {
    const E = window.JP_ENGINE;
    E.spinStops = function (rng) { rng = rng || E.defaultRng; const s = []; for (let r = 0; r < E.REELS; r++) s.push(Math.floor(rng() * E.STRIPS[r].length)); return s; };
  });
  await page.click('#btnFsStart');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '08-iphone-freespins-running.png') });
  await page.waitForFunction(() => !document.getElementById('fsEndOverlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.screenshot({ path: path.join(out, '09-iphone-freespins-end.png') });
  results.fsEndTotal = await page.textContent('#fsEndTotal');
  await page.click('#btnFsCollect'); await page.waitForTimeout(500);
  results.afterFs = { credits: await page.textContent('#credits'), badgeHidden: await page.$eval('#fsBadge', (e) => e.classList.contains('hidden')) };

  // jackpot
  await forceStops(found.jackpot); await spinAndWait(2500);
  await page.screenshot({ path: path.join(out, '10-iphone-jackpot.png') });
  results.jackpotVisible = !(await page.$eval('#jackpotOverlay', (e) => e.classList.contains('hidden')));
  await page.waitForTimeout(6000);
  results.jpWonAmt = await page.textContent('#jpWonAmt');
  await page.click('#btnJpCollect'); await page.waitForTimeout(500);
  results.afterJackpot = { credits: await page.textContent('#credits'), meter: await page.textContent('#jpValue'), msg: await page.textContent('#msg') };

  // persistence: reload and compare credits
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('jp_profile_v1')));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('jp_profile_v1')));
  results.persist = { creditsBefore: before.credits, creditsAfter: after.credits, jackpotsBefore: before.stats.jackpots, jackpotsAfter: after.stats.jackpots, spins: after.stats.spins };

  // refill path: drain credits
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('jp_profile_v1')); p.credits = 5; localStorage.setItem('jp_profile_v1', JSON.stringify(p)); });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  results.refillShown = !(await page.$eval('#btnRefill', (e) => e.classList.contains('hidden')));
  await page.screenshot({ path: path.join(out, '11-iphone-refill.png') });
  await page.click('#btnRefill'); await page.waitForTimeout(600);
  results.afterRefill = await page.textContent('#credits');

  // records
  await page.click('#btnMore'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '12-iphone-settings.png') });
  results.records = await page.$eval('#records', (e) => e.textContent);
  await page.click('#btnMoreBack');
  await ctx.close();

  // ---- iPad landscape + portrait ----
  ({ ctx, page } = await fresh({ width: 1194, height: 834 }, 'ipad-land'));
  await page.screenshot({ path: path.join(out, '13-ipad-landscape.png') });
  await ctx.close();
  ({ ctx, page } = await fresh({ width: 834, height: 1194 }, 'ipad-port'));
  await page.screenshot({ path: path.join(out, '14-ipad-portrait.png') });
  await ctx.close();

  await browser.close(); srv.close();
  results.errors = errors;
  console.log(JSON.stringify(results, null, 2));
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
