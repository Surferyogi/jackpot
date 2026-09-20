/* Festival theme screenshots with a shifted clock (Asia/Singapore). Saves tests/out/theme-*.png */
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r); });
const DATES = [
  ['none', '2026-09-20T10:00:00+08:00'], ['birthday', '2026-09-18T10:00:00+08:00'], ['birthday-eve', '2026-09-17T10:00:00+08:00'],
  ['cny-eve', '2026-02-16T20:00:00+08:00'], ['cny-day3', '2026-02-19T10:00:00+08:00'], ['lantern', '2026-03-03T10:00:00+08:00'],
  ['zhongqiu', '2026-09-25T10:00:00+08:00'], ['duanwu', '2026-06-19T10:00:00+08:00'], ['qixi', '2026-08-19T10:00:00+08:00'],
  ['dongzhi', '2026-12-22T10:00:00+08:00'], ['xmas', '2026-12-25T10:00:00+08:00'], ['nye', '2026-12-31T22:00:00+08:00'], ['newyear', '2027-01-01T01:00:00+08:00'], ['fathersday', '2026-06-21T10:00:00+08:00'],
];
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/'; const b = await chromium.launch(); const errs = []; const out = {};
  for (const [name, iso] of DATES) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: 'Asia/Singapore' });
    await ctx.addInitScript((target) => {
      const RealDate = Date; const delta = target - RealDate.now();
      class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + delta); else super(...a); } static now() { return RealDate.now() + delta; } }
      FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse; window.Date = FakeDate;
    }, new Date(iso).getTime());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
    await page.goto(base); await page.waitForTimeout(900);
    const info = await page.evaluate(() => ({ theme: document.body.getAttribute('data-theme'), zh: document.getElementById('festiveZh').textContent, en: document.getElementById('festiveEn').textContent, sub: document.getElementById('festiveSub').textContent, banner: !document.getElementById('festive').classList.contains('hidden'), gift: !document.getElementById('giftOverlay').classList.contains('hidden'), credits: document.getElementById('credits').textContent, msg: document.getElementById('msg').textContent }));
    out[name] = info;
    if (name === 'birthday') {
      await page.waitForTimeout(1200); await page.screenshot({ path: path.join(__dirname, 'out', 'theme-birthday-gift.png') });
      await page.click('#btnGiftCollect'); await page.waitForTimeout(400);
      info.afterGift = { credits: await page.textContent('#credits'), giftYear: await page.evaluate(() => JSON.parse(localStorage.getItem('jp_profile_v1')).gifts.birthdayYear) };
      await page.reload(); await page.waitForTimeout(800);
      info.giftAgainOnReload = !(await page.$eval('#giftOverlay', (e) => e.classList.contains('hidden')));
    }
    if (name === 'cny-day3') {
      // a forced mega win under the CNY theme to see the flourish
      const stops = await page.evaluate(() => { const E = window.JP_ENGINE; const n = 48; for (let a = 0; a < n; a++) for (let b2 = 0; b2 < n; b2++) for (let c = 0; c < n; c++) { const s = [a, b2, c, 0, 0]; const r = E.evaluate(E.gridFromStops(s), 100, { jackpot: 5000 }); if (r.total >= 1000 && r.total < 2500 && !r.scatter.freeSpins) return s; } return null; });
      await page.evaluate((s) => { window.JP_ENGINE.spinStops = () => s.slice(); }, stops);
      await page.click('#btnSpin'); await page.waitForTimeout(3800);
      await page.screenshot({ path: path.join(__dirname, 'out', 'theme-cny-megawin.png') });
      await page.waitForTimeout(3500);
    }
    if (name === 'zhongqiu') {
      await page.click('#btnMore'); await page.waitForTimeout(400);
      info.picker = await page.evaluate(() => ({ options: Array.from(document.querySelectorAll('#themeSelect option')).map((o) => o.textContent), next: document.getElementById('nextFest').textContent }));
      await page.screenshot({ path: path.join(__dirname, 'out', 'theme-settings.png') });
      await page.selectOption('#themeSelect', 'xmas'); await page.waitForTimeout(300);
      info.previewTheme = await page.evaluate(() => document.body.getAttribute('data-theme'));
      await page.selectOption('#themeSelect', 'auto'); await page.waitForTimeout(300);
      info.backToAuto = await page.evaluate(() => document.body.getAttribute('data-theme'));
      await page.click('#btnMoreBack');
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(__dirname, 'out', 'theme-' + name + '.png') });
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); console.log('errors', errs);
  await b.close(); srv.close(); if (errs.length) process.exitCode = 1;
});
