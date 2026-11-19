/*
 * Development only: builds the word-check evaluation set, test/word-transcripts.json.gz.
 * Audio stays outside the repository (WORD_AUDIO); only what the on-device model heard is kept, with its scores.
 *
 *   node tools/word-data.js audio        make the audio (16 kHz mono, as a phone would record it) and its manifest
 *   node tools/word-data.js transcribe   run the optional speech model (transcribe.js) on it  [--model tiny|base|small]
 *                                        [--every N: one pair of cases in N] [--threads N: CPU threads]
 *   node tools/word-data.js pack         write test/word-transcripts.json.gz (no audio)        [--model base]
 *
 * Attempts (each with what was really said, so the truth is exact):
 *  - real-word:   the app's HSK words recorded by one native speaker (Yue Tan, audio-cmn, CC BY-SA): each word said
 *                 right, and the recording of a near word (closest pinyin, same length) given as the attempt instead.
 *  - tts-sent:    bank sentences from two natural neural text-to-speech voices (a third of the second one pitched
 *                 down): right, each of the three near-miss distractors said instead, one word left out, one put in.
 *  - rough-sent:  a lower-quality multi-speaker text-to-speech voice (8 kHz): right and a distractor.
 *  - espeak-sent: espeak-ng from pinyin (robotic): right, a distractor, and the right words with one tone changed.
 * Every clip gets a lead-in and tail, a random level, background noise and Opus at 32 kbit/s (as MediaRecorder),
 * then is trimmed to the speech found by the app's own pitch code, as the app does before transcribing.
 *
 * Needs: ffmpeg, espeak-ng, AUDIO_CMN (audio-cmn/64k), SHERPA (a folder with node_modules/sherpa-onnx-node and the
 * three text-to-speech model folders named below, from the sherpa-onnx GitHub releases; see README, Credits),
 * MODEL_DIR (a folder holding the speech model's files as published on the model hub, as transcribe.js loads them),
 * TRANSFORMERS_PATH (transformers.node.mjs of @huggingface/transformers 3.7.6), WORD_AUDIO (work folder).
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), zlib = require('zlib');
globalThis.window = globalThis; globalThis.pinyinPro = require('pinyin-pro');
require('../docs/data/sentences.js'); require('../docs/data/words.js'); require('../docs/data/tone-model.js');
const ZH = require('../docs/js/chinese.js'), Tones = require('../docs/js/tones.js');
const sim = require('../test/tone-sim.js'), { rng } = require('../test/tone-synth.js');

const step = process.argv[2], arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = process.env.WORD_AUDIO, SIZE = arg('--model') || 'base';
const PACKED = path.join(__dirname, '../test/word-transcripts.json.gz');
if (!OUT) { console.error('Set WORD_AUDIO to a work folder outside the repository.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const MANIFEST = path.join(OUT, 'manifest.json');
const SENT = new Map(window.SENTENCES.map(s => [s.id, s]));
const WORDSET = new Set(window.WORDS.map(w => w.h));
const han = s => [...s].filter(ZH.isHan).join('');
/** Target syllable data for a case, as the app builds it (sentence `sy`, or a word's syllables). */
const targetSy = c => c.src === 'real-word' ? ZH.syllablesOf(c.target).map(x => ({ c: x.c, p: ZH.markTone(x.b, x.t), t: x.t, s: x.t })) : SENT.get(c.target).sy;

function makeAudio() {
  const CMN = process.env.AUDIO_CMN, SH = process.env.SHERPA;
  if (!CMN || !SH) { console.error('Set AUDIO_CMN and SHERPA (see the top of this file).'); process.exit(1); }
  const sherpa = require(path.join(SH, 'node_modules/sherpa-onnx-node'));
  const tts = name => {
    const T = p => path.join(SH, p);
    if (name === 'aishell3') return new sherpa.OfflineTts({ model: { vits: { model: T('vits-icefall-zh-aishell3/model.onnx'), lexicon: T('vits-icefall-zh-aishell3/lexicon.txt'), tokens: T('vits-icefall-zh-aishell3/tokens.txt') }, numThreads: 2 }, ruleFsts: ['phone', 'date', 'number'].map(f => T(`vits-icefall-zh-aishell3/${f}.fst`)).join(',') });
    if (name === 'melo') return new sherpa.OfflineTts({ model: { vits: { model: T('vits-melo-tts-zh_en/model.onnx'), lexicon: T('vits-melo-tts-zh_en/lexicon.txt'), tokens: T('vits-melo-tts-zh_en/tokens.txt'), dictDir: T('vits-melo-tts-zh_en/dict') }, numThreads: 2 } });
    return new sherpa.OfflineTts({ model: { matcha: { acousticModel: T('matcha-icefall-zh-baker/model-steps-3.onnx'), vocoder: T('vocos-22khz-univ.onnx'), lexicon: T('matcha-icefall-zh-baker/lexicon.txt'), tokens: T('matcha-icefall-zh-baker/tokens.txt'), dictDir: T('matcha-icefall-zh-baker/dict') }, numThreads: 2 } });
  };
  const r = rng(20261119), cases = [];
  // lead-in and tail, level, noise, then Opus 32k (as MediaRecorder) and back to 16 kHz
  function degrade(x, sr, id) {
    const q = rng(cases.length * 7 + 3), lead = Math.floor(q.range(0.25, 0.7) * sr), tail = Math.floor(q.range(0.5, 1.2) * sr);
    const y = new Float32Array(lead + x.length + tail); y.set(x, lead);
    let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
    const g = q.range(0.08, 0.6) / (peak || 1); let p = 0; for (const v of x) p += v * v * g * g;
    const nr = Math.sqrt(p / x.length) * Math.pow(10, -q.range(18, 38) / 20) * 1.73;
    for (let i = 0; i < y.length; i++) y[i] = y[i] * g + nr * (q() * 2 - 1);
    const tmp = path.join(OUT, id + '.in.f32'), ogg = path.join(OUT, id + '.ogg');
    fs.writeFileSync(tmp, Buffer.from(y.buffer));
    cp.execFileSync('ffmpeg', ['-v', 'quiet', '-y', '-f', 'f32le', '-ar', String(sr), '-ac', '1', '-i', tmp, '-c:a', 'libopus', '-b:a', '32k', ogg]);
    fs.writeFileSync(path.join(OUT, id + '.f32'), cp.execFileSync('ffmpeg', ['-v', 'quiet', '-i', ogg, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 28 }));
    fs.unlinkSync(tmp); fs.unlinkSync(ogg);
  }
  const decode = file => { const b = cp.execFileSync('ffmpeg', ['-v', 'quiet', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2); };
  const add = (c, x, sr) => { c.id = 'c' + cases.length; degrade(x, sr, c.id); cases.push(c); };

  // real words: right, and a near word said instead
  const py = w => ZH.syllablesOf(w).map(s => s.b);
  const words = window.WORDS.filter(w => [...w.h].length <= 4 && fs.existsSync(path.join(CMN, 'hsk', 'cmn-' + w.h + '.mp3')));
  const nearWord = w => {
    const a = py(w.h), n = a.length; let best = null;
    for (const o of words) {
      if (o.h === w.h || [...o.h].length !== n) continue;
      const b = py(o.h); if ([...o.h].every((c, i) => c === [...w.h][i])) continue;
      const d = ZH.lev(a.join(' '), b.join(' ')) + r() * 1.5 - [...o.h].filter((c, i) => c === [...w.h][i]).length * 0.5;
      if (!best || d < best[0]) best = [d, o];
    }
    return best && best[1];
  };
  for (const w of words.map(w => [r(), w]).sort((a, b) => a[0] - b[0]).map(x => x[1])) {
    add({ src: 'real-word', voice: 'yue', kind: 'right', target: w.h, said: w.h }, decode(path.join(CMN, 'hsk', 'cmn-' + w.h + '.mp3')), 22050);
    const o = nearWord(w);
    if (o) add({ src: 'real-word', voice: 'yue', kind: 'wrong', target: w.h, said: o.h }, decode(path.join(CMN, 'hsk', 'cmn-' + o.h + '.mp3')), 22050);
  }
  console.log('words', cases.length);
  // natural voices: right, the three distractors, a word missing, a word extra
  const V = [['melo', tts('melo')], ['baker', tts('baker')]], ash = tts('aishell3');
  const EXTRA = ['也', '很', '都', '就', '的', '了', '还', '不'];
  const variants = s => {
    const ws = ZH.segmentWords(han(s.zh), WORDSET), out = [{ kind: 'right', said: s.zh }];
    s.d.forEach(d => out.push({ kind: 'wrong', said: d.zh }));
    if (ws.length >= 3) { const k = 1 + Math.floor(r() * (ws.length - 1)); out.push({ kind: 'miss', said: ws.filter((_, i) => i !== k).join('') }); }
    if (ws.length >= 2) { const k = 1 + Math.floor(r() * (ws.length - 1)); const e = EXTRA[Math.floor(r() * EXTRA.length)]; out.push({ kind: 'extra', said: [...ws.slice(0, k), e, ...ws.slice(k)].join('') }); }
    return out;
  };
  const sents = window.SENTENCES.map(s => [r(), s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  sents.slice(0, 160).forEach((s, i) => {
    for (const v of variants(s)) {
      const [name, engine] = V[(i + cases.length) % V.length], a = engine.generate({ text: v.said, sid: 0, speed: r.range(0.85, 1.15) });
      let sr = a.sampleRate, voice = name;
      if (name === 'baker' && r() < 0.35) { voice = 'baker-low'; sr = Math.round(sr * 0.8); } // played slower: a lower voice
      add({ src: 'tts-sent', voice, kind: v.kind, target: s.id, said: v.said }, Float32Array.from(a.samples), sr);
    }
  });
  sents.slice(160, 220).forEach(s => {
    for (const v of variants(s).slice(0, 2)) {
      const sid = Math.floor(r() * 170), a = ash.generate({ text: v.said, sid, speed: 1 });
      add({ src: 'rough-sent', voice: 'aishell3-' + sid, kind: v.kind, target: s.id, said: v.said }, Float32Array.from(a.samples), a.sampleRate);
    }
  });
  console.log('voices', cases.length);
  // espeak-ng from pinyin
  const jobs = [], meta = {}, OT = { 1: 4, 2: 3, 3: 4, 4: 1 };
  const pin = sy => sy.filter(x => x.p && !x.er).map(x => ZH.stripTone(x.p).replace(/ü/g, 'v') + (x.s || 5)).join(' ');
  sents.slice(220, 300).forEach((s, i) => {
    const v = ['m1', 'f1', 'm2', 'f2'][i % 4];
    const job = (id, text, m) => { jobs.push({ id, text, voice: 'cmn-latn-pinyin+' + v, rate: r.range(130, 170), pitch: 55, range: 80 }); meta[id] = { src: 'espeak-sent', voice: 'espeak-' + v, target: s.id, ...m }; };
    job('e' + i + 'r', pin(s.sy), { kind: 'right', said: s.zh });
    const d = s.d[Math.floor(r() * 3)]; job('e' + i + 'w', pin(d.sy), { kind: 'wrong', said: d.zh });
    const T = s.sy.filter(x => x.p && !x.er), k = Math.floor(r() * T.length);
    job('e' + i + 't', pin(s.sy.map(x => x === T[k] && x.s ? { ...x, s: OT[x.s] } : x)), { kind: 'tone', said: s.zh });
  });
  const dir = path.join(OUT, 'espeak'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs));
  cp.execFileSync('python3', ['-I', path.join(__dirname, 'tone-espeak.py'), path.join(dir, 'jobs.json'), path.join(dir, 'out')], { stdio: 'inherit' });
  for (const e of JSON.parse(fs.readFileSync(path.join(dir, 'out', 'index.json')))) {
    const b = fs.readFileSync(path.join(dir, 'out', e.id + '.raw')), pcm = new Int16Array(b.buffer, b.byteOffset, b.length >> 1);
    add({ ...meta[e.id] }, Float32Array.from(pcm, v => v / 32768), e.sr);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(cases));
  console.log(cases.length, 'cases in', OUT);
}

/** The speech in a clip, with the app's margins (app.js, speechSpan). */
function trim(x) {
  const trk = Tones.track(sim.record(x, 16000, { seed: 1 }));
  if (!trk) return x;
  const a = trk.sf[0].t - 350, b = trk.sf[trk.sf.length - 1].t + 400;
  return x.subarray(Math.max(0, Math.floor(a * 16)), Math.min(x.length, Math.ceil(b * 16)));
}
async function transcribe() {
  const Tr = require('../docs/js/transcribe.js'), every = +(arg('--every') || 1), threads = arg('--threads');
  const ok = await Tr.loadForNode(process.env.MODEL_DIR, process.env.TRANSFORMERS_PATH, { model: 'Xenova/whisper-' + SIZE, ...(threads ? { session_options: { intraOpNumThreads: +threads, interOpNumThreads: 1 } } : {}) });
  if (!ok) throw Tr.error || new Error('Set MODEL_DIR and TRANSFORMERS_PATH (see the top of this file).');
  const file = path.join(OUT, `transcripts-${SIZE}.json`), out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
  const cases = JSON.parse(fs.readFileSync(MANIFEST)).filter((_, i) => Math.floor(i / 2) % every === 0); // pairs stay together
  let k = 0;
  for (const c of cases) {
    if (out[c.id]) continue;
    const b = fs.readFileSync(path.join(OUT, c.id + '.f32')), x = trim(new Float32Array(b.buffer, b.byteOffset, b.length >> 2));
    const sy = targetSy(c), r = await Tr.hear(x, sy.filter(s => s.p && !s.er).map(s => s.c).join(''));
    const cmp = ZH.compareSpeech(sy, ZH.normalizeHeard(r.raw)), texts = Tr.variants(cmp), t1 = Date.now(), lp = await r.score(texts);
    out[c.id] = { raw: r.raw, ms: r.ms, sms: Date.now() - t1, dur: +(x.length / 16000).toFixed(2), sc: Object.fromEntries(texts.map((t, i) => [t, +lp[i].toFixed(3)])) };
    if (++k % 25 === 0) { fs.writeFileSync(file, JSON.stringify(out)); process.stdout.write(k + ' '); }
  }
  fs.writeFileSync(file, JSON.stringify(out)); console.log('\n' + Object.keys(out).length, 'transcripts in', file);
}
function pack() {
  const tr = JSON.parse(fs.readFileSync(path.join(OUT, `transcripts-${SIZE}.json`)));
  const cases = JSON.parse(fs.readFileSync(MANIFEST)).filter(c => tr[c.id]).map(c => {
    const t = tr[c.id];
    return { id: c.id, src: c.src, voice: c.voice, kind: c.kind, target: c.target, said: c.said, raw: t.raw, ms: t.ms + t.sms, sc: t.sc };
  });
  fs.writeFileSync(PACKED, zlib.gzipSync(JSON.stringify({ made: 'tools/word-data.js', model: 'whisper-' + SIZE, cases })));
  console.log(cases.length, 'cases →', path.relative(process.cwd(), PACKED), (fs.statSync(PACKED).size / 1024).toFixed(0) + ' KB');
}

if (step === 'audio') makeAudio();
else if (step === 'transcribe') transcribe().catch(e => { console.error(e); process.exit(1); });
else if (step === 'pack') pack();
else console.error('usage: node tools/word-data.js audio | transcribe | pack');
