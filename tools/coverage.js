// Reports which HSK words never appear in any example sentence.  node tools/coverage.js [--list]
const path = require('path');
globalThis.window = globalThis; require(path.join(__dirname, '../docs/data/words.js')); require(path.join(__dirname, '../docs/data/sentences.js'));
const text = window.SENTENCES.map(s => s.zh).join('\n');
const missing = window.WORDS.filter(w => !text.includes(w.h));
console.log(`${window.WORDS.length - missing.length}/${window.WORDS.length} words appear in a sentence (${window.SENTENCES.length} sentences).`);
for (const l of [1, 2, 3]) { const m = missing.filter(w => w.l === l); console.log(`  HSK ${l}: ${m.length} missing`); if (process.argv.includes('--list')) console.log('   ', m.map(w => w.h).join(' ')); }
