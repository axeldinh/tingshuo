/* The app's earlier tone guess, kept only so test/tone-eval.js can compare against it (--baseline). */
'use strict';
/** Turn raw frames into a smoothed contour in semitones relative to the speaker's median. */
function contour(frames) {
  const maxRms = Math.max(0.01, ...frames.map(f => f.rms));
  let v = frames.filter(f => f.f0 && f.rms > maxRms * 0.12);
  if (v.length < 3) return null;
  const med = median(v.map(f => f.f0));
  let pts = v.map(f => ({ t: f.t, st: 12 * Math.log2(f.f0 / med) }));
  for (let i = 1; i < pts.length; i++) { // octave jump repair
    const d = pts[i].st - pts[i - 1].st;
    if (d > 8) pts[i].st -= 12; else if (d < -8) pts[i].st += 12;
  }
  pts = pts.map((p, i) => ({ t: p.t, st: median(pts.slice(Math.max(0, i - 2), i + 3).map(x => x.st)) }));
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  // split into voiced segments where gaps > 120 ms
  const segs = []; let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) { if (pts[i].t - pts[i - 1].t > 120) { segs.push(cur); cur = []; } cur.push(pts[i]); }
  segs.push(cur);
  return { pts, t0, t1, segs };
}
function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }

/** Rough tone guess for one syllable's contour points (semitones). */
function guessTone(pts, rangeSt) {
  if (!pts || pts.length < 3) return null;
  const n = pts.length, q = Math.max(1, Math.floor(n * 0.25));
  const avg = a => a.reduce((s, p) => s + p.st, 0) / a.length;
  const start = avg(pts.slice(0, q)), end = avg(pts.slice(-q));
  let mi = 0; pts.forEach((p, i) => { if (p.st < pts[mi].st) mi = i; });
  const min = pts[mi].st, mpos = mi / (n - 1);
  const slope = end - start;
  const dip = Math.min(start, end) - min;
  if (mpos > 0.2 && mpos < 0.8 && dip > 1.2 && start - min > 1.2) return 3;
  if (slope <= -2.5) return 4;
  if (slope >= 2) return start - min > 1.5 ? 3 : 2;
  if (Math.abs(slope) < 1.5 && Math.max(...pts.map(p => p.st)) - min < 2.5) {
    // flat: high = 1st, low (relative to the speaker's range) = half-3rd
    return rangeSt != null && avg(pts) < rangeSt.lo + (rangeSt.hi - rangeSt.lo) * 0.3 ? 3 : 1;
  }
  return slope > 0 ? 2 : 4;
}

module.exports = { contour, guessTone };
