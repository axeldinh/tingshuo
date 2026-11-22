// Release gates: things that must never break for people who already use the app.
// Run by `npm test`. See PIPELINE.md → Gates for what each check protects and how to fix a failure.
const assert = require('assert'), fs = require('fs'), path = require('path');
global.window = global;
const ROOT = path.join(__dirname, '..');
const { createStore } = require('../docs/js/store.js');
const { current, FILE } = require('../tools/released-items.js');
let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n  ', e.message.split('\n').join('\n   ')); } };
const fixtures = path.join(__dirname, 'fixtures');
const memAdapter = raw => ({ load: () => raw, save() { return true; } });
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- 1. Saved data of every released schema still loads, and nothing is lost ----------------------------------------
const stored = file => JSON.parse(fs.readFileSync(path.join(fixtures, file), 'utf8'));
const live = recs => Object.values(recs).filter(r => !r.deleted);
const sum = (recs, col, f) => live(recs).filter(r => r.col === col).reduce((a, r) => a + (f(r.v) || 0), 0);
const storeFiles = fs.readdirSync(fixtures).filter(f => /^store-v\d+\.json$/.test(f));
t('a fixture exists for every schema up to the current one', () => {
  const cur = createStore(memAdapter(null)).SCHEMA_VERSION;
  for (let v = 1; v <= cur; v++) assert(storeFiles.includes(`store-v${v}.json`), `missing test/fixtures/store-v${v}.json: when you bump SCHEMA_VERSION, keep the old fixture and add the new one`);
});
for (const f of storeFiles) t(`saved data ${f} loads with this code, nothing lost`, () => {
  const before = stored(f), raw = fs.readFileSync(path.join(fixtures, f), 'utf8');
  const s = createStore(memAdapter(raw)), after = s.snapshot();
  assert.strictEqual(after.schema, s.SCHEMA_VERSION, 'not migrated to the current schema');
  assert.strictEqual(after.device, before.device, 'device id changed (the device would look like a new one)');
  // events: every one survives, same ids
  const ids = new Set(after.events.map(e => e.id));
  for (const e of before.events) assert(ids.has(e.id), 'event lost: ' + e.id);
  // records: no collection shrinks, and the numbers that measure a learner's advancement never go down
  for (const col of new Set(live(before.records).map(r => r.col)))
    assert(live(after.records).filter(r => r.col === col).length >= live(before.records).filter(r => r.col === col).length, `records lost in collection '${col}'`);
  for (const [col, field] of [['progress', v => v.ok], ['progress', v => v.seen], ['progress', v => v.reps], ['chars', v => v], ['levels', v => v]])
    assert(sum(after.records, col, field) >= sum(before.records, col, field), `'${col}' totals went down`);
  // the file the app really writes keeps the same key (a new key would orphan all saved data)
});
t('the real localStorage adapter reads the key released apps wrote (tingshuo.v1)', () => {
  const raw = fs.readFileSync(path.join(fixtures, 'store-v1.json'), 'utf8'), seen = [];
  const mem = { getItem: k => (seen.push(k), k === 'tingshuo.v1' ? raw : null), setItem() {} };
  globalThis.localStorage = mem;
  try { const s = createStore(); assert(s.snapshot().events.length > 0, 'saved data not found under tingshuo.v1; reads: ' + seen); }
  finally { delete globalThis.localStorage; }
});
t('a backup code made by an older release still imports', () => {
  const code = fs.readFileSync(path.join(fixtures, 'backup-v1.txt'), 'utf8').trim();
  const s = createStore(memAdapter(null)); globalThis.atob = globalThis.atob || (x => Buffer.from(x, 'base64').toString('binary')); s.importCode(code);
  assert(s.events().length > 0 && Object.keys(s.all('progress')).length > 0);
});
t('data from a NEWER schema is refused, never merged blindly', () => {
  const s = createStore(memAdapter(null));
  assert.throws(() => s.merge({ schema: s.SCHEMA_VERSION + 1, records: [], events: [] }), /newer app version/);
});
t('a schema bump comes with a migration', () => {
  const s = createStore(memAdapter(null)), src = read('docs/js/store.js');
  for (let v = 2; v <= s.SCHEMA_VERSION; v++) assert(new RegExp(`^\\s*${v}:\\s*(data|d)\\s*=>`, 'm').test(src), `SCHEMA_VERSION is ${s.SCHEMA_VERSION} but MIGRATIONS has no entry for ${v}`);
});

// ---- 2. Item ids keep their meaning (progress is stored per id) ------------------------------------------------------
t('every released item id still exists and means the same item', () => {
  const ledger = JSON.parse(fs.readFileSync(FILE, 'utf8')), now = current(), bad = [];
  for (const kind of Object.keys(ledger)) for (const [id, v] of Object.entries(ledger[kind])) {
    if (!(id in now[kind])) bad.push(`${kind} ${id} ("${v}") was removed`);
    else if (now[kind][id] !== v) bad.push(`${kind} ${id} was "${v}", now "${now[kind][id]}"`);
  }
  assert(!bad.length, bad.length + ' released ids changed:\n' + bad.slice(0, 8).join('\n') + (bad.length > 8 ? '\n…' : '') +
    '\nSentence ids are by position (s001…): add new sentences at the END of src/sentences.src.js, never insert, reorder or delete. Reply ids are by position inside a node.');
});
t('new ids are recorded in the ledger before release (node tools/released-items.js --write)', () => {
  // Only enforced on release (RELEASE=1 set by the main-branch workflow): feature branches may add items freely.
  if (!process.env.RELEASE) return;
  const ledger = JSON.parse(fs.readFileSync(FILE, 'utf8')), now = current();
  for (const kind of Object.keys(now)) for (const id of Object.keys(now[kind])) assert(id in ledger[kind], `${kind} ${id} is not in the ledger: run node tools/released-items.js --write`);
});

// ---- 3. Offline cache: the app must install and start offline -------------------------------------------------------
const sw = read('docs/sw.js'), index = read('docs/index.html');
const swFiles = [...(sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g))].map(m => m[1]);
t('every file in the service worker list exists (one 404 makes the whole install fail)', () => {
  for (const f of swFiles) { const p = f === './' ? 'index.html' : f; assert(fs.existsSync(path.join(ROOT, 'docs', p)), 'sw.js lists a missing file: ' + f); }
});
t('every script and stylesheet index.html loads is precached', () => {
  const refs = [...index.matchAll(/(?:src|href)="((?:js|css|data|vendor)\/[^"]+)"/g)].map(m => m[1]);
  for (const r of refs) assert(swFiles.includes(r), `index.html loads ${r} but sw.js does not precache it: the app would break offline`);
});
t('the optional-model caches survive app updates and use the same pinned library', () => {
  assert(/k !== VERSION && k !== MEANING/.test(sw), 'sw.js activate must keep the MEANING cache');
  const lib = sw.match(/transformers@([\d.]+)/)[1];
  for (const f of ['meaning.js', 'transcribe.js']) assert(read('docs/js/' + f).includes('transformers@' + lib), `${f} uses a different transformers version than sw.js (${lib})`);
});
t('the app keeps its install scope (a different scope or start_url orphans installed apps)', () => {
  const m = JSON.parse(read('docs/manifest.webmanifest'));
  assert.strictEqual(m.scope, './'); assert(m.start_url.startsWith('./'));
});
t('only store.js touches localStorage', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'docs/js')).filter(f => f !== 'store.js'))
    assert(!/localStorage|indexedDB/.test(read('docs/js/' + f).replace(/\/\/.*$/gm, '')), f + ' reads or writes browser storage directly: go through the store');
});

console.log(failed ? `\n${failed} compat check(s) FAILED` : `\n${n} compat checks passed`);
if (failed) process.exit(1);
