// The ledger of learner-facing item ids that have shipped (test/fixtures/released-items.json).
// Progress is stored per item id, so an id that disappears or starts meaning another item silently wipes or corrupts
// what a learner has earned. test/compat.js fails if a released id is gone or changed.
//
//   node tools/released-items.js           show what is new since the ledger (safe)
//   node tools/released-items.js --write   append NEW ids to the ledger (never edits or removes an entry)
//   node tools/released-items.js --append-only <old-ledger.json>   exit 1 if the ledger edited or dropped an entry of the old one (CI)
//
// Run --write as part of promoting dev to main (see PIPELINE.md), not on feature branches.
const fs = require('fs'), path = require('path');
global.window = global;
for (const f of ['words', 'sentences', 'dialogues']) require('../docs/data/' + f + '.js');
const FILE = path.join(__dirname, '../test/fixtures/released-items.json');

function current() {
  const out = { words: {}, sentences: {}, replies: {}, nodes: {}, scenes: {} };
  for (const w of window.WORDS) out.words[w.id] = w.h;
  for (const s of window.SENTENCES) out.sentences[s.id] = s.zh;
  for (const sc of window.DIALOGUES) {
    out.scenes[sc.id] = sc.l;
    for (const n of Object.values(sc.nodes)) {
      out.nodes[n.id] = n.zh;
      for (const r of n.replies || []) out.replies[r.id] = r.zh;
    }
  }
  return out;
}
module.exports = { current, FILE };

if (require.main === module && process.argv.includes('--append-only')) {
  const old = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--append-only') + 1], 'utf8')), cur = JSON.parse(fs.readFileSync(FILE, 'utf8')), bad = [];
  for (const k of Object.keys(old)) for (const [id, v] of Object.entries(old[k])) if (!cur[k] || cur[k][id] !== v) bad.push(`${k} ${id}: "${v}" → ${cur[k] && id in cur[k] ? '"' + cur[k][id] + '"' : 'removed'}`);
  if (bad.length) { console.error('The released-items ledger may only grow. Changed:\n  ' + bad.slice(0, 10).join('\n  ')); process.exit(1); }
  console.log('ledger is append-only: ok');
} else if (require.main === module) {
  const ledger = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  const now = current(), next = {}; let added = 0;
  for (const kind of Object.keys(now)) {
    next[kind] = Object.assign({}, ledger[kind]);
    for (const [id, v] of Object.entries(now[kind])) if (!(id in next[kind])) { next[kind][id] = v; added++; console.log('new', kind, id, v); }
  }
  if (!added) console.log('ledger already has every current id');
  if (process.argv.includes('--write')) { fs.writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n'); console.log(`ledger written (+${added})`); }
  else if (added) console.log('(dry run; add --write to record them)');
}
