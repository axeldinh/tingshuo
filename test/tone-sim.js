/*
 * Feeds a recording through the app's own pitch path (Audio2.frameAnalyser, the code the recorder runs every ~33 ms),
 * and packs/unpacks the resulting frames compactly for the evaluation set. Development and tests only.
 */
'use strict';
const zlib = require('zlib');
const A2 = require('../docs/js/audio.js');
const { rng } = require('./tone-synth.js');

/** Frames as the recorder would produce them: one every `frameMs` (± jitter), each from the latest 4096 samples. */
function record(samples, sr, { seed = 1, frameMs = 33, jitterMs = 4 } = {}) {
  const r = rng(seed), fa = A2.frameAnalyser(sr), raw = new Float32Array(4096), frames = [];
  const dur = samples.length / sr * 1000;
  for (let t = frameMs + r() * 10; t <= dur; t += frameMs + (r() * 2 - 1) * jitterMs) {
    const end = Math.floor(t / 1000 * sr);
    for (let i = 0; i < 4096; i++) { const k = end - 4096 + i; raw[i] = k >= 0 ? samples[k] : 0; }
    frames.push(fa.frame(raw, Math.round(t)));
  }
  return frames;
}

// 6 bytes a frame, stored column by column (compresses well): time step (ms), f0 (0.05 semitone steps above 40 Hz,
// 0 = none, top bit set = a weak guess only; 2 bytes), level (0.8 dB steps), clarity (1/16 steps)
function pack(frames) {
  const n = frames.length, b = Buffer.alloc(n * 6); let prev = 0;
  frames.forEach((f, i) => {
    const dt = Math.max(0, Math.min(255, Math.round(f.t - prev))); prev += dt; b[i] = dt;
    const hz = f.f0 || f.w, c = hz ? Math.max(1, Math.min(13107, Math.round(240 * Math.log2(hz / 40)))) | (f.f0 ? 0 : 0x8000) : 0;
    b[n + i] = c & 255; b[2 * n + i] = c >> 8;
    b[3 * n + i] = Math.max(0, Math.min(127, Math.round((20 * Math.log10(Math.max(f.rms, 1e-5)) + 100) / 0.8)));
    b[4 * n + i] = Math.max(0, Math.min(16, Math.round((f.cl || 0) * 16)));
  });
  return b.subarray(0, n * 5);
}
function unpack(b) {
  const n = b.length / 5, out = []; let t = 0;
  for (let i = 0; i < n; i++) {
    t += b[i]; const c = b[n + i] | b[2 * n + i] << 8;
    const hz = c ? 40 * Math.pow(2, (c & 0x7fff) / 240) : null, weak = !!(c & 0x8000);
    out.push({ t, f0: weak ? null : hz, w: weak ? hz : null, rms: Math.pow(10, (b[3 * n + i] * 0.8 - 100) / 20), cl: b[4 * n + i] / 16 });
  }
  return out;
}
/** Keep frames from a little before the first voiced frame to a little after the last (the rest is silence). */
function trim(frames, beforeMs = 300, afterMs = 450) {
  const v = frames.filter(f => f.f0); if (!v.length) return { frames, shift: 0 };
  const a = v[0].t - beforeMs, z = v[v.length - 1].t + afterMs, kept = frames.filter(f => f.t >= a && f.t <= z);
  const t0 = kept.length ? kept[0].t - 33 : 0;
  return { frames: kept.map(f => ({ ...f, t: f.t - t0 })), shift: t0 };
}
/** The set is one gzip file: a JSON header (the cases, each with the offset and length of its frames), then the frames. */
function save(file, data) {
  let off = 0; const bufs = [];
  const cases = data.cases.map(c => { const f = c.f; bufs.push(f); const o = { ...c, f: [off, f.length] }; off += f.length; return o; });
  const head = Buffer.from(JSON.stringify({ ...data, cases })), len = Buffer.alloc(4); len.writeUInt32LE(head.length);
  require('fs').writeFileSync(file, zlib.gzipSync(Buffer.concat([len, head, ...bufs]), { level: 9 }));
}
function load(file) {
  const b = zlib.gunzipSync(require('fs').readFileSync(file)), hl = b.readUInt32LE(0), d = JSON.parse(b.subarray(4, 4 + hl).toString()), base = 4 + hl;
  d.cases.forEach(c => { c.f = b.subarray(base + c.f[0], base + c.f[0] + c.f[1]); });
  return d;
}

module.exports = { record, pack, unpack, trim, save, load };
