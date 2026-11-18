/*
 * Development only: builds the tone-recognition evaluation set, test/tone-frames.bin.gz.
 * Every recording goes through the app's own pitch path (test/tone-sim.js → Audio2.frameAnalyser), and only the
 * resulting pitch frames are kept (no audio in the repository).
 *
 * Sources (each case is labelled with its source and speaker/voice):
 *  - real-syl:  single syllables, all four tones, one female speaker (Chen Wang), from audio-cmn (CC BY-SA).
 *  - real-word: the app's HSK words, one speaker (Yue Tan, Shtooka), from audio-cmn (CC BY-SA).
 *  - espeak-word / espeak-sent: the app's words and sentences, synthesized by espeak-ng from pinyin, several voices;
 *    syllable start times come from espeak itself.
 *  - synth-syl / synth-word / synth-sent: test/tone-synth.js voices (male, female, child, narrow-range learner), with
 *    exact syllable timings.
 * Real recordings get a random lead-in, mic level and background noise.
 *
 * Needs ffmpeg, espeak-ng (apt) and a checkout of https://github.com/hugolpz/audio-cmn (64k/syllabs and the app's
 * words from 64k/hsk). usage: AUDIO_CMN=/path/to/audio-cmn/64k node tools/tone-data.js [--quick]
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
globalThis.window = globalThis; globalThis.pinyinPro = require('pinyin-pro');
require('../docs/data/sentences.js'); require('../docs/data/words.js');
const ZH = require('../docs/js/chinese.js');
const { synth, speaker, rng } = require('../test/tone-synth.js');
const sim = require('../test/tone-sim.js');

const CMN = process.env.AUDIO_CMN || '';
const OUT = path.join(__dirname, '../test/tone-frames.bin.gz');
const QUICK = process.argv.includes('--quick');
const r = rng(20261118);
const cases = [];
const hanOnly = sy => sy.filter(x => x.p && !x.er);
/** Labels for an app sentence: spoken tones, accepted alternatives (3rd tones that may change), phrase-final flags. */
function sentLabels(sy) {
  const T = hanOnly(sy), finals = T.map(() => false), pauses = T.map(() => false);
  let k = -1;
  for (const x of sy) { if (x.p && !x.er) k++; else if (!x.p && k >= 0) { finals[k] = true; if (/[，,、；;：:]/.test(x.c)) pauses[k] = true; } }
  finals[T.length - 1] = true;
  return { chars: T.map(x => x.c).join(''), tones: T.map(x => x.s), alt: T.map(x => x.x ? [3, 2] : null), finals, pauses };
}
function wordLabels(h) {
  const syl = ZH.spokenTones(h);
  return { chars: syl.map(x => x.c).join(''), tones: syl.map(x => x.s), alt: syl.map(() => null), finals: syl.map((_, i) => i === syl.length - 1), pauses: syl.map(() => false), bases: syl.map(x => x.b) };
}
function addNoise(x, sr, seed) {
  const q = rng(seed), lead = Math.floor(q.range(0.15, 0.5) * sr), tail = Math.floor(0.6 * sr);
  const y = new Float32Array(lead + x.length + tail); y.set(x, lead);
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = q.range(0.03, 0.5) / (peak || 1); let p = 0; for (const v of x) p += v * v * g * g;
  const nr = Math.sqrt(p / x.length) * Math.pow(10, -q.range(18, 40) / 20) * 1.73;
  for (let i = 0; i < y.length; i++) y[i] = y[i] * g + nr * (q() * 2 - 1);
  return { y, leadMs: lead / sr * 1000 };
}
function push(c, frames, truth) {
  const tr = sim.trim(frames);
  c.f = sim.pack(tr.frames);
  if (truth) c.truth = truth.map(([a, b]) => [Math.round(a - tr.shift), Math.round(b - tr.shift)]);
  cases.push(c);
}
const decode = file => { const b = cp.execFileSync('ffmpeg', ['-v', 'quiet', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2); };

// ---------- real: syllables (Chen Wang) and words (Yue Tan)
if (CMN && fs.existsSync(CMN)) {
  const sylFiles = fs.readdirSync(path.join(CMN, 'syllabs')).filter(f => /^cmn-[a-zü]+[1-4]\.mp3$/.test(f));
  const perTone = { 1: [], 2: [], 3: [], 4: [] }; sylFiles.forEach(f => perTone[f.match(/([1-4])\.mp3$/)[1]].push(f));
  const take = QUICK ? 30 : 120;
  for (const t of [1, 2, 3, 4]) {
    const list = perTone[t].map(f => [r(), f]).sort((a, b) => a[0] - b[0]).slice(0, take).map(x => x[1]);
    for (const f of list) {
      const { y } = addNoise(decode(path.join(CMN, 'syllabs', f)), 48000, cases.length + 7);
      push({ src: 'real-syl', spk: 'chen', id: f.slice(4, -4), chars: f.slice(4, -5), tones: [t], alt: [null], finals: [true] }, sim.record(y, 48000, { seed: cases.length }));
    }
  }
  console.log('real-syl', cases.length);
  let nw = 0;
  for (const w of window.WORDS) {
    if ([...w.h].length > 4) continue;
    const file = path.join(CMN, 'hsk', 'cmn-' + w.h + '.mp3'); if (!fs.existsSync(file)) continue;
    const L = wordLabels(w.h); if (L.tones.length === 1 && L.tones[0] === 0) continue; // a lone neutral syllable has no tone to judge
    if (QUICK && nw >= 60) break;
    const { y } = addNoise(decode(file), 48000, cases.length + 7);
    push({ src: 'real-word', spk: 'yue', id: w.h, ...L }, sim.record(y, 48000, { seed: cases.length })); nw++;
  }
  console.log('real-word', nw);
} else console.warn('No audio-cmn checkout at', CMN, '— skipping real recordings');

// ---------- espeak-ng: words and sentences
const VOICES = { tune: ['m1', 'm3', 'f1', 'f3'], held: ['m2', 'f2', 'f4', 'm4'] };
const VPITCH = { m1: 62, m3: 70, f1: 50, f3: 62, m2: 66, f2: 58, f4: 52, m4: 60 }; // a voice keeps its pitch (as a person does), so pitch-range history means something
{
  const jobs = [], meta = {};
  const pin = (bases, tones, pauses) => bases.map((b, i) => b.replace(/ü/g, 'v') + (tones[i] || 5) + (pauses && pauses[i] ? ',' : '')).join(' ');
  const allVoices = [...VOICES.tune, ...VOICES.held];
  const words = window.WORDS.filter(w => [...w.h].length <= 4).map(w => [r(), w]).sort((a, b) => a[0] - b[0]).slice(0, QUICK ? 40 : 160).map(x => x[1]);
  words.forEach((w, i) => {
    const L = wordLabels(w.h); if (L.tones.length === 1 && L.tones[0] === 0) return;
    const v = allVoices[i % allVoices.length], id = 'ew' + i;
    jobs.push({ id, text: pin(L.bases, L.tones), voice: 'cmn-latn-pinyin+' + v, rate: r.range(130, 185), pitch: VPITCH[v] + r.range(-3, 3), range: r.range(70, 99) });
    meta[id] = { src: 'espeak-word', spk: 'espeak-' + v, id: w.h, ...L, bases: undefined };
  });
  const sents = window.SENTENCES.slice(0, QUICK ? 30 : 375);
  sents.forEach((s, i) => {
    const L = sentLabels(s.sy), T = hanOnly(s.sy);
    const bases = T.map((x, k) => { const b = ZH.stripTone(x.p); const nx = s.sy[s.sy.indexOf(x) + 1]; return nx && nx.er ? b + 'r' : b; });
    const v = allVoices[(i * 3 + 1) % allVoices.length], id = 'es' + i;
    jobs.push({ id, text: pin(bases, L.tones, L.pauses), voice: 'cmn-latn-pinyin+' + v, rate: r.range(130, 185), pitch: VPITCH[v] + r.range(-3, 3), range: r.range(70, 99) });
    meta[id] = { src: 'espeak-sent', spk: 'espeak-' + v, id: s.id, ...L };
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tone-espeak-'));
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs));
  cp.execFileSync('python3', ['-I', path.join(__dirname, 'tone-espeak.py'), path.join(dir, 'jobs.json'), path.join(dir, 'out')], { stdio: 'inherit' });
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'index.json')));
  for (const e of index) {
    const m = meta[e.id]; if (!m) continue;
    const b = fs.readFileSync(path.join(dir, 'out', e.id + '.raw')), pcm = new Int16Array(b.buffer, b.byteOffset, b.length >> 1);
    // resample 22050 → 48000 (linear; fine for pitch)
    const N = Math.floor(pcm.length * 48000 / e.sr), x = new Float32Array(N);
    for (let i = 0; i < N; i++) { const p = i * e.sr / 48000, k = Math.floor(p), f = p - k; x[i] = ((pcm[k] || 0) * (1 - f) + (pcm[k + 1] || 0) * f) / 32768; }
    const { y, leadMs } = addNoise(x, 48000, cases.length + 7);
    // syllable spans: from each syllable's start to the next one's (the voiced part lies inside)
    const st = e.words.map(w => w.ms);
    let truth = null;
    if (st.length === m.tones.length) truth = st.map((a, i) => [a + leadMs, (i + 1 < st.length ? st[i + 1] : e.n / e.sr * 1000) + leadMs]);
    push({ ...m, coarse: 1 }, sim.record(y, 48000, { seed: cases.length }), truth);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('espeak', index.length);
}

// ---------- synthetic voices
{
  const kinds = ['male', 'female', 'child', 'flat'], NSPK = QUICK ? 8 : 36;
  const words = window.WORDS.filter(w => [...w.h].length <= 4 && [...w.h].length >= 2);
  for (let s = 0; s < NSPK; s++) {
    const kind = kinds[s % 4], spk = speaker(kind, 1000 + s), name = 'syn-' + kind + '-' + s;
    const sets = [];
    for (let k = 0; k < (QUICK ? 3 : 6); k++) { const t = 1 + Math.floor(r() * 4); sets.push(['synth-syl', { chars: '?', tones: [t], alt: [null], finals: [true], pauses: [false] }, 'syl' + k]); }
    for (let k = 0; k < (QUICK ? 3 : 10); k++) { const w = r.pick(words); sets.push(['synth-word', wordLabels(w.h), w.h]); }
    for (let k = 0; k < (QUICK ? 2 : 7); k++) { const se = r.pick(window.SENTENCES); sets.push(['synth-sent', sentLabels(se.sy), se.id]); }
    for (const [src, L, id] of sets) {
      const seed = 5000 + cases.length, q = rng(seed);
      const out = synth({ tones: L.tones, finals: L.finals, pauses: L.pauses, speaker: spk, snrDb: q.range(15, 40), gain: q.range(0.02, 0.5) }, seed);
      push({ src, spk: name, id, chars: L.chars, tones: L.tones, alt: L.alt, finals: L.finals }, sim.record(out.samples, out.sr, { seed }), out.truth.map(x => [x.t0, x.t1]));
    }
  }
}
// tuning vs held-out: whole speakers and voices are held out
for (const c of cases) {
  const n = +(c.spk.match(/(\d+)$/) || [])[1];
  c.held = c.spk === 'yue' || VOICES.held.some(v => c.spk === 'espeak-' + v) || (c.spk.startsWith('syn-') && n >= 24) ? 1 : 0;
}
sim.save(OUT, { made: 'tools/tone-data.js', cases });
console.log(cases.length, 'cases →', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
