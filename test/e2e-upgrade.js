// "A release must never cost a learner their progress", end to end in a real browser.
// Seeds the saved data of an earlier release (test/fixtures/store-v*.json) into localStorage, opens the built app
// from docs/, walks every screen, reloads, and checks that every record and event is still there.
// Needs Playwright with Chromium (CI installs it; locally: it is skipped with a note if missing). Not part of `npm test`:
//   node test/e2e-upgrade.js          (npm run test:e2e)
const fs = require('fs'), path = require('path'), http = require('http');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('playwright not installed: skipping e2e-upgrade (CI runs it)'); process.exit(process.env.CI ? 1 : 0); }
const DOCS = path.join(__dirname, '../docs'), FIX = path.join(__dirname, 'fixtures');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DOCS, p); if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, r)); const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch(); let failed = 0;
  const check = (ok, msg) => { console.log(ok ? '✓' : '✗', msg); if (!ok) failed++; };
  for (const file of fs.readdirSync(FIX).filter(f => /^store-v\d+\.json$/.test(f))) {
    const raw = fs.readFileSync(path.join(FIX, file), 'utf8'), before = JSON.parse(raw);
    const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, ['tingshuo.v1', raw]);
    await page.goto(base); await page.waitForFunction(() => window.__app && window.__app.store, null, { timeout: 15000 });
    for (const h of ['#words', '#progress', '#settings', '#talk', '#home']) { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(300); }
    const verify = async label => {
      await page.evaluate(() => window.__app.store.flush());
      const after = await page.evaluate(() => JSON.parse(localStorage.getItem('tingshuo.v1')));
      const evIds = new Set(after.events.map(e => e.id)), lostEv = before.events.filter(e => !evIds.has(e.id)).length;
      const lostRec = Object.entries(before.records).filter(([k, r]) => !r.deleted && (!after.records[k] || after.records[k].deleted)).length;
      check(lostEv === 0 && lostRec === 0, `${file} ${label}: ${before.events.length} events, ${Object.keys(before.records).length} records kept (lost ${lostEv} events, ${lostRec} records)`);
      check(after.device === before.device, `${file} ${label}: same device id`);
    };
    await verify('after a full tour'); await page.reload(); await page.waitForFunction(() => window.__app && window.__app.store, null, { timeout: 15000 }); await verify('after reload');
    check(errors.length === 0, `${file}: no script errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
