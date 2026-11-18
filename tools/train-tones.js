/*
 * Development only: trains the tone model (a small softmax regression over per-syllable shape features) on the
 * tuning part of test/tone-frames.bin.gz and writes docs/data/tone-model.js. Held-out speakers and voices are never
 * seen here; test/tone-eval.js reports on them.
 * usage: node tools/train-tones.js [--hidden 16] [--l2 0.003] [--iters 700] [--val]
 *   --hidden 0 trains a plain softmax regression; --val trains on part of the tuning speakers and reports on the rest
 *   (for choosing these settings) without writing the model.
 */
'use strict';
const fs = require('fs'), path = require('path');
globalThis.window = globalThis;
const sim = require('../test/tone-sim.js');
const Tones = require('../docs/js/tones.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const L2 = arg('--l2', 0.003), ITERS = arg('--iters', 700), HID = arg('--hidden', 16), VAL = process.argv.includes('--val');

const FEATURES = ['lvl', 'lv0', 'lv1', 'slope', 'curv', 's1', 's2', 'mpos', 'ext', 'dur', 'db', 'prev', 'hasPrev', 'next', 'fin', 'conf', 'few',
  'lvlC', 'lv0C', 'lv1C', 'lvlF', 'lv0F', 'lv1F', 'slopeF', 'curvF', 's1F', 's2F', 'mposF', 'extF', 'durF', 'slope2', 'curv2', 'q0', 'q1', 'q2', 'q3', 'q4'];
const CLASSES = Tones.CLASSES;
const dummy = { features: [], mean: [], std: [], classes: CLASSES, W: CLASSES.map(() => []), b: CLASSES.map(() => 0) };

const data = sim.load(path.join(__dirname, '../test/tone-frames.bin.gz')).cases;
const isVal = c => VAL && (['espeak-m1', 'espeak-f1'].includes(c.spk) || /^syn-.*[13579]$/.test(c.spk));
const tune = data.map((c, i) => [c, i]).filter(([c]) => !c.held);
// running-range history from other recordings of the same speaker, as in the evaluation
const by = {}; tune.forEach(([c, i]) => (by[c.spk] = by[c.spk] || []).push(i));
const X = [], Y = [], SW = [], VX = [], VY = [];
for (const [c, i] of tune) {
  const idx = by[c.spk], k = idx.indexOf(i); let h = null;
  for (let j = 1; j <= 6 && j < idx.length; j++) h = Tones.updateRange(h, Tones.track(sim.unpack(data[idx[(k + j) % idx.length]].f)));
  const syls = c.tones.map((s, q) => ({ c: c.chars[q], s, alt: c.alt && c.alt[q], final: c.finals[q] }));
  const fr = sim.unpack(c.f);
  for (const hist of [h, null]) {
    const res = Tones.analyse(fr, syls, hist, { model: dummy }).syls;
    res.forEach((r, q) => {
      if (!r.feat || (c.alt && c.alt[q])) return;
      (isVal(c) ? VX : X).push(FEATURES.map(f => r.feat[f] || 0)); (isVal(c) ? VY : Y).push(CLASSES.indexOf(syls[q].s));
      if (!isVal(c)) SW.push(c.src.startsWith('real') ? 3 : 1);
    });
  }
}
const N = X.length, F = FEATURES.length, C = CLASSES.length;
const counts = CLASSES.map((_, k) => Y.filter(y => y === k).length);
console.log('training on', N, 'syllables; per class', CLASSES.map((c, k) => c + ':' + counts[k]).join(' '));
// balance classes, standardise features
for (let i = 0; i < N; i++) SW[i] *= N / (C * counts[Y[i]]);
const mean = FEATURES.map((_, j) => X.reduce((s, x) => s + x[j], 0) / N);
const std = FEATURES.map((_, j) => Math.sqrt(X.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / N) || 1);
const Z = X.map(x => x.map((v, j) => (v - mean[j]) / std[j]));
// parameters: optional tanh hidden layer (H × F), then softmax (C × H or C × F)
const r = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; }; })();
const IN = HID ? HID : F;
const params = { W: Array.from({ length: C }, () => Float64Array.from({ length: IN }, () => r() * 0.2)), b: new Float64Array(C) };
if (HID) { params.H = Array.from({ length: HID }, () => Float64Array.from({ length: F }, () => r() * 2 / Math.sqrt(F))); params.hb = new Float64Array(HID); }
const flat = () => [...params.W, params.b, ...(HID ? [...params.H, params.hb] : [])];
const adam = flat().map(v => ({ m: new Float64Array(v.length), v: new Float64Array(v.length) }));
function forward(z) {
  const h = HID ? params.H.map((w, k) => { let s = params.hb[k]; for (let j = 0; j < F; j++) s += w[j] * z[j]; return Math.tanh(s); }) : z;
  const o = params.W.map((w, c) => { let s = params.b[c]; for (let j = 0; j < IN; j++) s += w[j] * h[j]; return s; });
  const mx = Math.max(...o), ex = o.map(v => Math.exp(v - mx)), S = ex.reduce((a, c) => a + c, 0);
  return { h, p: ex.map(v => v / S) };
}
const acc = (Xs, Ys) => { let ok = 0; Xs.forEach((x, i) => { const p = forward(x.map((v, j) => (v - mean[j]) / std[j])).p; if (p.indexOf(Math.max(...p)) === Ys[i]) ok++; }); return Xs.length ? (100 * ok / Xs.length).toFixed(1) + '%' : '–'; };
const sw = SW.reduce((a, c) => a + c, 0);
for (let it = 1; it <= ITERS; it++) {
  const g = flat().map(v => new Float64Array(v.length)); let loss = 0;
  const gW = g.slice(0, C), gb = g[C], gH = HID ? g.slice(C + 1, C + 1 + HID) : null, ghb = HID ? g[C + 1 + HID] : null;
  for (let i = 0; i < N; i++) {
    const z = Z[i], { h, p } = forward(z), wi = SW[i];
    loss -= wi * Math.log(p[Y[i]] + 1e-12);
    const dh = HID ? new Float64Array(HID) : null;
    for (let c = 0; c < C; c++) {
      const d = wi * (p[c] - (c === Y[i] ? 1 : 0)); gb[c] += d;
      for (let j = 0; j < IN; j++) { gW[c][j] += d * h[j]; if (HID) dh[j] += d * params.W[c][j]; }
    }
    if (HID) for (let k = 0; k < HID; k++) { const d = dh[k] * (1 - h[k] * h[k]); ghb[k] += d; for (let j = 0; j < F; j++) gH[k][j] += d * z[j]; }
  }
  const lr = HID ? 0.01 : 0.03;
  flat().forEach((v, q) => {
    const st = adam[q], isBias = v === params.b || v === params.hb;
    for (let j = 0; j < v.length; j++) {
      const gr = g[q][j] / sw + (isBias ? 0 : L2 * v[j]);
      st.m[j] = 0.9 * st.m[j] + 0.1 * gr; st.v[j] = 0.999 * st.v[j] + 0.001 * gr * gr;
      v[j] -= lr * (st.m[j] / (1 - 0.9 ** it)) / (Math.sqrt(st.v[j] / (1 - 0.999 ** it)) + 1e-8);
    }
  });
  if (it % 250 === 0 || it === 1) console.log(`iter ${it}: loss ${(loss / sw).toFixed(4)}, train ${acc(X, Y)}` + (VAL ? `, validation ${acc(VX, VY)}` : ''));
}
if (VAL) process.exit(0);
const r4 = x => Math.round(x * 1e4) / 1e4;
const model = { features: FEATURES, classes: CLASSES, mean: mean.map(r4), std: std.map(r4), W: params.W.map(w => Array.from(w, r4)), b: Array.from(params.b, r4) };
if (HID) { model.H = params.H.map(w => Array.from(w, r4)); model.hb = Array.from(params.hb, r4); }
const file = path.join(__dirname, '../docs/data/tone-model.js');
fs.writeFileSync(file, '// Tone model: a tiny neural network over per-syllable pitch features (docs/js/tones.js). Generated by tools/train-tones.js.\nwindow.TONE_MODEL=' + JSON.stringify(model) + ';\n');
console.log('wrote', path.relative(process.cwd(), file), fs.statSync(file).size, 'bytes');
