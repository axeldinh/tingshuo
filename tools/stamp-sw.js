// Stamps docs/sw.js VERSION with a hash of the app files, so installed apps always pick up changes.
// `node tools/stamp-sw.js`          rewrites VERSION
// `node tools/stamp-sw.js --check`  exits 1 if VERSION is stale (used in CI)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const docs = path.join(__dirname, '../docs'), swPath = path.join(docs, 'sw.js');
const skip = new Set(['sw.js', '.nojekyll']);
function walk(d, base = '') {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) return rel === 'data/strokes' ? [] : walk(path.join(d, e.name), rel);
    return skip.has(rel) ? [] : [rel];
  }).sort();
}
const h = crypto.createHash('sha256');
for (const f of walk(docs)) { h.update(f); h.update(fs.readFileSync(path.join(docs, f))); }
// the file list inside sw.js also matters
const sw = fs.readFileSync(swPath, 'utf8');
h.update(sw.replace(/const VERSION = '[^']*';/, ''));
const version = 'tingshuo-' + h.digest('hex').slice(0, 8);
const next = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
if (process.argv.includes('--check')) {
  if (next !== sw) { console.error(`docs/sw.js VERSION is stale (should be ${version}). Run: npm run build`); process.exit(1); }
  console.log('sw.js VERSION up to date:', version);
} else { fs.writeFileSync(swPath, next); console.log('sw.js VERSION =', version); }
