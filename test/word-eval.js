/*
 * Word-check evaluation (shadowing and word tones: did the learner say the right words?).
 *
 *   node test/word-eval.js            all measurements
 *   node test/word-eval.js --check    …and fail below the floors (part of npm test)
 *   node test/word-eval.js --fails    list the attempts judged wrongly
 *
 * 1. The optional on-device model: test/word-transcripts.json.gz (made by tools/word-data.js) holds, for recordings
 *    of right and wrong attempts (real HSK word recordings, natural and robotic synthetic voices; no audio), what the
 *    model heard and its scores. The app's own comparison (ZH.compareSpeech) and confidence check (Transcribe.mark)
 *    run on them here.
 * 2. The browser's speech recognition cannot run here, so its side is measured on written recogniser-style outputs of
 *    the same attempts (digits, homophones, punctuation, fillers): this checks the comparison logic only.
 * An attempt counts as caught when at least one wrong, missing or extra word (or a tone heard as another word) is
 * reported; a right attempt is a false alarm when any wrong, missing or extra word is reported.
 */
'use strict';
const fs = require('fs'), zlib = require('zlib'), path = require('path');
globalThis.window = globalThis; globalThis.pinyinPro = require('pinyin-pro');
require('../docs/data/sentences.js');
const ZH = require('../docs/js/chinese.js'), Tr = require('../docs/js/transcribe.js');

const CHECK = process.argv.includes('--check'), FAILS = process.argv.includes('--fails');
const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'word-transcripts.json.gz'))));
const SENT = new Map(window.SENTENCES.map(s => [s.id, s]));
const targetSy = c => c.src === 'real-word' ? ZH.syllablesOf(c.target).map(x => ({ c: x.c, p: ZH.markTone(x.b, x.t), t: x.t, s: x.t })) : SENT.get(c.target).sy;
const han = s => [...s.replace(/\d+/g, ZH.numToZh)].filter(ZH.isHan).join('');
const pc = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';

/** One attempt judged: problems reported (sure ones only), and the truth from what was really said. */
function judge(c, heardText, scores, theta, single) {
  const sy = targetSy(c), cmp = ZH.compareSpeech(sy, ZH.normalizeHeard(heardText));
  if (scores) Tr.mark(cmp, scores, theta, single); else { cmp.syl.forEach(s => s.sure = true); cmp.extra.forEach(e => e.sure = true); }
  const probs = [...cmp.syl.map((s, i) => s.st !== 'ok' && s.sure ? { i, st: s.st } : null).filter(Boolean), ...cmp.extra.filter(e => e.sure).map(e => ({ i: e.after + 0.5, st: 'extra' }))];
  const truth = ZH.compareSpeech(sy, c.said);
  const tprobs = [...truth.syl.map((s, i) => s.st !== 'ok' ? i : null).filter(i => i != null), ...truth.extra.map(e => e.after + 0.5)];
  return { probs, tprobs, cmp };
}
function measure(cases, heard, scores, theta, single) {
  const R = { n: 0, right: 0, acc: 0, falseWord: 0, bad: 0, caught: 0, located: 0, tone: 0, toneAsWord: 0, kinds: {}, fails: [] };
  for (const c of cases) {
    const j = judge(c, heard(c), scores && scores(c), theta, single), word = j.probs.filter(p => p.st !== 'tone');
    R.n++;
    if (c.kind === 'right') { R.right++; if (!j.probs.length) R.acc++; if (word.length) { R.falseWord++; R.fails.push([c, 'false alarm', j]); } }
    else if (c.kind === 'tone') { R.tone++; if (word.length) R.toneAsWord++; }
    else {
      const K = R.kinds[c.kind] = R.kinds[c.kind] || { n: 0, caught: 0 }; R.bad++; K.n++;
      if (j.probs.length) { R.caught++; K.caught++; } else R.fails.push([c, 'missed', j]);
      if (j.probs.some(p => j.tprobs.some(t => Math.abs(t - p.i) <= 1))) R.located++;
    }
  }
  return R;
}
const line = (name, R) => `${name.padEnd(26)} ${String(R.n).padStart(5)}   ${pc(R.acc, R.right).padStart(6)}   ${pc(R.falseWord, R.right).padStart(6)}   ${pc(R.caught, R.bad).padStart(6)}   ${pc(R.located, R.bad).padStart(6)}   ${Object.entries(R.kinds).map(([k, v]) => `${k} ${pc(v.caught, v.n)}`).join(', ')}${R.tone ? `; tone slip read as a wrong word ${pc(R.toneAsWord, R.tone)}` : ''}`;
const head = () => console.log(`${''.padEnd(26)} ${'n'.padStart(5)}   ${'right'.padStart(6)}   ${'false'.padStart(6)}   ${'caught'.padStart(6)}   ${'placed'.padStart(6)}   (right: right attempts passed clean; false: right attempts with a wrong word reported; caught: wrong attempts reported; placed: at the right syllable)`);
const syl1 = c => c.src === 'real-word' && [...c.target].length === 1;
const GROUPS = [[c => syl1(c), 'HSK words, one syllable'], [c => c.src === 'real-word' && !syl1(c), 'HSK words, 2+ syllables'], [c => c.src === 'tts-sent', 'sentences, natural voices'], [c => c.src === 'rough-sent', 'sentences, rough voice'], [c => c.src === 'espeak-sent', 'sentences, espeak-ng']];
const fails = [];

// ---------- 1. the on-device model
const cases = data.cases;
const cer = cs => { let e = 0, n = 0; for (const c of cs) { const s = [...han(c.said)]; e += ZH.lev([...han(ZH.normalizeHeard(c.raw))], s); n += s.length; } return e / Math.max(1, n); };
console.log(`On-device model (${data.model}, ${cases.length} recorded attempts; mean ${Math.round(cases.reduce((a, c) => a + c.ms, 0) / cases.length)} ms each in Node)`);
console.log(`character error rate: words ${pc(cer(cases.filter(c => c.src === 'real-word')) * 1000, 1000)}, sentences ${pc(cer(cases.filter(c => c.src !== 'real-word')) * 1000, 1000)}`);
const model = {};
for (const [label, theta, single] of [['every difference reported', -Infinity, true], ['only sure differences, as the app does (none for one syllable)', Tr.THETA, false]]) {
  console.log(`\n${label}:`); head();
  GROUPS.forEach(([f, name], g) => {
    const R = measure(cases.filter(f), c => c.raw, c => c.sc, theta, single);
    console.log(line(name, R)); model[(single ? 'raw' : 'app') + g] = R;
    if (!single) fails.push(...R.fails);
  });
  const all = measure(cases, c => c.raw, c => c.sc, theta, single); console.log(line('all', all)); model[single ? 'raw' : 'app'] = all;
}

// ---------- 2. written recogniser-style outputs (the browser's recognition), same attempts
// homophones (same syllable and tone, another character), digits, punctuation, a filler: none of these is a wrong word
const HOMO = new Map(); for (const w of [...new Set(window.SENTENCES.flatMap(s => s.sy.filter(x => x.p && !x.er).map(x => x.c)))]) {
  const k = ZH.syllablesOf(w)[0]; if (!k) continue; const key = k.b + k.t; if (!HOMO.has(key)) HOMO.set(key, []); HOMO.get(key).push(w);
}
function recogniserStyle(c, k) {
  let t = c.said.replace(/[。！？]/g, '');
  if (k % 4 === 1) t = t.replace(/[一二三四五六七八九十]+(?=[本个块岁点号月年天])/g, m => String(ZH.syllablesOf(m).length === 1 ? '一二三四五六七八九'.indexOf(m) + 1 || m : m));
  if (k % 4 === 2) { const chars = [...t], i = chars.findIndex(ch => { const s = ZH.syllablesOf(ch)[0]; return s && (HOMO.get(s.b + s.t) || []).some(o => o !== ch); }); if (i >= 0) { const s = ZH.syllablesOf(chars[i])[0]; chars[i] = HOMO.get(s.b + s.t).find(o => o !== chars[i]); t = chars.join(''); } }
  if (k % 4 === 3) t = '嗯，' + t + '。';
  return t;
}
console.log('\nBrowser recognition, written outputs (comparison logic only):'); head();
const written = cases.filter(c => c.kind !== 'tone'), idx = new Map(written.map((c, i) => [c, i]));
const rec = measure(written, c => recogniserStyle(c, idx.get(c)), null);
console.log(line('all', rec));

if (FAILS) for (const [c, why, j] of fails) console.log(`${why.padEnd(11)} ${c.src.padEnd(11)} ${c.kind.padEnd(5)} target ${c.target}  said ${c.said}  heard ${c.raw}  → ${j.probs.map(p => p.st + '@' + p.i).join(' ') || 'clean'}`);

if (CHECK) {
  const R = model.app, words = model.app1, sent = model.app2;
  const floors = [
    ['model: right attempts passed clean', R.acc / R.right, 0.85],
    ['model: no false wrong word, right sentences (natural voices)', 1 - sent.falseWord / sent.right, 0.92],
    ['model: no false wrong word, right words of 2+ syllables', 1 - words.falseWord / words.right, 0.92],
    ['model: wrong sentences caught (natural voices)', sent.caught / sent.bad, 0.85],
    ['model: wrong words of 2+ syllables caught', words.caught / words.bad, 0.68],
    ['written outputs: right attempts passed', rec.acc / rec.right, 0.97],
    ['written outputs: wrong attempts caught', rec.caught / rec.bad, 0.97],
  ];
  const bad = floors.filter(([, v, f]) => !(v >= f));
  bad.forEach(([n, v, f]) => console.error(`FLOOR ${n}: ${(v * 100).toFixed(1)}% < ${f * 100}%`));
  if (bad.length) process.exit(1);
  console.log('\nword-check floors ok');
}
