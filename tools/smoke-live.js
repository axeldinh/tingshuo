// Checks a deployed copy of the app: every file the service worker precaches is served, and sw.js carries the VERSION
// we released. Used after a release (it waits for GitHub Pages to publish) and works on `npm run serve` too.
//   node tools/smoke-live.js https://axeldinh.github.io/tingshuo/ [--wait 600]   exit 1 if the deploy is wrong or never arrives
const fs = require('fs'), path = require('path');
const base = (process.argv[2] || 'http://localhost:8000/').replace(/\/?$/, '/');
const wait = +(process.argv[process.argv.indexOf('--wait') + 1] || 0) || 0;
const local = fs.readFileSync(path.join(__dirname, '../docs/sw.js'), 'utf8');
const want = local.match(/const VERSION = '([^']+)'/)[1];
const files = [...local.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const get = async p => { const r = await fetch(base + p + (p.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { cache: 'no-store' }); return { r, text: r.ok ? await r.text() : '' }; };
(async () => {
  const deadline = Date.now() + wait * 1000; let got = null;
  for (;;) {
    try { const { r, text } = await get('sw.js'); got = r.ok ? (text.match(/const VERSION = '([^']+)'/) || [])[1] : 'HTTP ' + r.status; } catch (e) { got = String(e.message); }
    if (got === want) break;
    if (Date.now() > deadline) { console.error(`✗ ${base}sw.js serves ${got}, expected ${want}`); process.exit(1); }
    console.log(`waiting for Pages: serving ${got}, want ${want}`); await new Promise(r => setTimeout(r, 15000));
  }
  console.log('✓ sw.js VERSION', want);
  const bad = [];
  for (const f of [...files.map(f => f === './' ? '' : f), 'sw.js']) { const { r } = await get(f); if (!r.ok) bad.push(`${f} → HTTP ${r.status}`); }
  if (bad.length) { console.error('✗ not served:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log(`✓ all ${files.length} precached files are served`);
})();
