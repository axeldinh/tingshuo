/*
 * Tone-recognition evaluation on test/tone-frames.bin.gz (built by tools/tone-data.js: real recordings, espeak-ng
 * and synthetic voices, all passed through the app's own pitch path).
 *
 *   node test/tone-eval.js                 current analysis, all data
 *   node test/tone-eval.js --check         …and fail if accuracy falls below the floors (part of npm test)
 *   node test/tone-eval.js --baseline      the old method (equal time slices + fixed thresholds), for comparison
 *   node test/tone-eval.js --split held    only held-out speakers/voices (tune | held | all)
 *   node test/tone-eval.js --nohist        no pitch-range history (a first recording)
 *
 * Every spoken syllable is checked twice: against its real tone (should be ✓, "slipped" is a false alarm), and
 * against a different target tone, as if the learner had said the wrong one (should be "slipped").
 */
'use strict';
const sim = require('./tone-sim.js');
globalThis.window = globalThis;
const A2 = require('./tone-baseline.js');
let Tones = null; try { require('../docs/data/tone-model.js'); Tones = require('../docs/js/tones.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const BASE = process.argv.includes('--baseline') || !Tones, SPLIT = arg('--split') || 'all', NOHIST = process.argv.includes('--nohist');
const data = sim.load(require('path').join(__dirname, 'tone-frames.bin.gz')).cases;

/** The app's old method: equal time slices of the voiced span, fixed thresholds, range from this recording only. */
function baseline(frames, syls) {
  const cont = A2.contour(frames);
  if (!cont) return syls.map(() => ({ heard: null, verdict: 'unsure', span: null }));
  const n = syls.length, span = cont.t1 - cont.t0, all = cont.pts.map(p => p.st).sort((a, b) => a - b);
  const range = { lo: all[Math.floor(all.length * .05)], hi: all[Math.floor(all.length * .95)] };
  return syls.map((s, i) => {
    const a = cont.t0 + span * i / n, b = cont.t0 + span * (i + 1) / n;
    const heard = A2.guessTone(cont.pts.filter(p => p.t >= a && p.t <= b), range);
    return { heard, verdict: heard == null ? 'unsure' : heard === s.s ? 'ok' : 'slip', span: [a, b] };
  });
}

// pitch-range history: built from other recordings of the same speaker (as the app builds it from earlier ones)
const hist = {};
if (!BASE && !NOHIST) {
  const by = {}; data.forEach((c, i) => (by[c.spk] = by[c.spk] || []).push(i));
  for (const spk in by) {
    const idx = by[spk];
    idx.forEach((ci, k) => {
      let h = null;
      for (let j = 1; j <= 6 && j < idx.length; j++) { const o = data[idx[(k + j) % idx.length]]; h = Tones.updateRange(h, Tones.track(sim.unpack(o.f))); }
      hist[ci] = h;
    });
  }
}
const cache = new Map(); const framesOf = i => { if (!cache.has(i)) cache.set(i, sim.unpack(data[i].f)); return cache.get(i); };
function run(i, syls) {
  const fr = framesOf(i);
  if (BASE) return baseline(fr, syls);
  return Tones.analyse(fr, syls, hist[i] || null).syls;
}
const OTHER = { 1: [2, 4, 3], 2: [3, 1, 4], 3: [2, 4, 1], 4: [1, 3, 2] };

function evaluate(filter) {
  const R = { n: 0, ok: 0, unsure: 0, slip: 0, nNeut: 0, neutOk: 0, neutSlip: 0, conf: {}, perTone: {}, err: { n: 0, caught: 0, unsure: 0, missed: 0 }, seg: { n: 0, ok: 0 }, top: { n: 0, ok: 0 } };
  for (const t of [1, 2, 3, 4]) { R.perTone[t] = { n: 0, ok: 0, unsure: 0 }; R.conf[t] = { 1: 0, 2: 0, 3: 0, 4: 0, 0: 0, '?': 0 }; }
  data.forEach((c, i) => {
    if (!filter(c) || (SPLIT === 'held' && !c.held) || (SPLIT === 'tune' && c.held)) return;
    const syls = c.tones.map((s, k) => ({ c: c.chars[k], s, alt: c.alt && c.alt[k], final: c.finals[k] }));
    const res = run(i, syls);
    res.forEach((r, k) => {
      const s = syls[k], okSet = [s.s, ...(s.alt || [])];
      // segmentation: the found span (frame times are window ends; a frame is ~22 ms behind) should sit in the truth
      if (c.truth && r.span) {
        const [a, b] = [r.span[0] - 22, r.span[1] - 22], [ta, tb] = c.truth[k], mid = (a + b) / 2;
        const ov = Math.max(0, Math.min(b, tb) - Math.max(a, ta));
        R.seg.n++; if (mid >= ta && mid <= tb && ov >= 0.5 * (b - a)) R.seg.ok++;
      }
      if (s.s === 0) { R.nNeut++; if (r.verdict === 'ok') R.neutOk++; if (r.verdict === 'slip') R.neutSlip++; return; }
      R.n++; R.perTone[s.s].n++;
      R.top.n++; if (okSet.includes(r.heard)) R.top.ok++;
      R.conf[s.s][r.heard == null ? '?' : r.heard]++;
      if (r.verdict === 'ok') { R.ok++; R.perTone[s.s].ok++; } else if (r.verdict === 'unsure') { R.unsure++; R.perTone[s.s].unsure++; } else R.slip++;
    });
    // simulated slips: one syllable at a time gets a different target (in long ones, the first, middle and last)
    const ks = c.tones.map((t, k) => k).filter(k => c.tones[k] && !(c.alt && c.alt[k]));
    const pickK = ks.length > 3 ? [ks[0], ks[ks.length >> 1], ks[ks.length - 1]] : ks;
    for (const k of pickK) {
      const wrong = OTHER[c.tones[k]][(i + k) % 3];
      const syl2 = syls.map((s, j) => j === k ? { ...s, s: wrong } : s);
      const r = run(i, syl2)[k];
      R.err.n++; if (r.verdict === 'slip') R.err.caught++; else if (r.verdict === 'unsure') R.err.unsure++; else R.err.missed++;
    }
  });
  return R;
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
function report(name, R) {
  console.log(`\n${name}: ${R.n} toned syllables` + (R.seg.n ? `, segmentation ${pct(R.seg.ok, R.seg.n)} of ${R.seg.n}` : ''));
  console.log(`  best guess right ${pct(R.top.ok, R.top.n)} · said right → ✓ ${pct(R.ok, R.n)}, unsure ${pct(R.unsure, R.n)}, false "slipped" ${pct(R.slip, R.n)}`);
  console.log(`  wrong target → caught ${pct(R.err.caught, R.err.n)}, unsure ${pct(R.err.unsure, R.err.n)}, missed ${pct(R.err.missed, R.err.n)} (of ${R.err.n})`);
  if (R.nNeut) console.log(`  neutral: ✓ ${pct(R.neutOk, R.nNeut)}, false "slipped" ${pct(R.neutSlip, R.nNeut)} (of ${R.nNeut})`);
  console.log('  per tone (✓ / unsure):', [1, 2, 3, 4].map(t => `${t}: ${pct(R.perTone[t].ok, R.perTone[t].n)} / ${pct(R.perTone[t].unsure, R.perTone[t].n)}`).join('  '));
  console.log('  confusion (said → heard 1 2 3 4 ?):');
  for (const t of [1, 2, 3, 4]) { const c = R.conf[t], n = R.perTone[t].n || 1; console.log(`    ${t}: ` + [1, 2, 3, 4, '?'].map(h => String(Math.round(100 * c[h] / n)).padStart(4)).join('')); }
}
const groups = [
  ['single syllables (real, Chen Wang)', c => c.src === 'real-syl'],
  ['words (real, Yue Tan)', c => c.src === 'real-word'],
  ['words (espeak-ng)', c => c.src === 'espeak-word'],
  ['sentences (espeak-ng)', c => c.src === 'espeak-sent'],
  ['single syllables (synthetic)', c => c.src === 'synth-syl'],
  ['words (synthetic)', c => c.src === 'synth-word'],
  ['sentences (synthetic)', c => c.src === 'synth-sent'],
];
const t0 = Date.now();
console.log(`Tone recognition — ${BASE ? 'OLD method (baseline)' : 'current method'}, ${SPLIT} data${NOHIST ? ', no range history' : ''}`);
const out = {};
for (const [name, f] of groups) { out[name] = evaluate(f); report(name, out[name]); }
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
// floors (all data, with range history): best-guess accuracy, most false "slipped" on correctly said syllables, segmentation
const FLOORS = {
  'single syllables (real, Chen Wang)': [91, 3], 'words (real, Yue Tan)': [81, 10], 'words (espeak-ng)': [78, 7], 'sentences (espeak-ng)': [86, 4, 96],
  'single syllables (synthetic)': [91, 4], 'words (synthetic)': [87, 5, 95], 'sentences (synthetic)': [77, 9, 81],
};
if (process.argv.includes('--check') && !BASE && SPLIT === 'all' && !NOHIST) {
  const bad = [];
  for (const [name, [acc, slip, seg]] of Object.entries(FLOORS)) {
    const R = out[name], a = 100 * R.top.ok / R.top.n, sl = 100 * R.slip / R.n, sg = R.seg.n ? 100 * R.seg.ok / R.seg.n : 100;
    if (a < acc) bad.push(`${name}: accuracy ${a.toFixed(1)}% < ${acc}%`);
    if (sl > slip) bad.push(`${name}: false "slipped" ${sl.toFixed(1)}% > ${slip}%`);
    if (seg && sg < seg) bad.push(`${name}: segmentation ${sg.toFixed(1)}% < ${seg}%`);
  }
  if (bad.length) { console.error('\nTone recognition fell below its floors:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('Tone recognition floors met.');
}
module.exports = out;
