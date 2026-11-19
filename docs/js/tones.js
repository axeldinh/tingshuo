/*
 * Tones: from pitch frames to a verdict per syllable.
 *
 *   track(frames)                 voiced pitch points in semitones (re 100 Hz), octave slips repaired, lightly smoothed
 *   segment(trk, syls)            finds each expected syllable among the speech frames (voiced, or loud without a
 *                                 clear pitch): silences, consonant onsets, loudness dips and pitch jumps are boundary
 *                                 evidence, and a dynamic-programming alignment fits them to the syllables' expected lengths (neutral short, phrase-final long); a syllable that
 *                                 was not said comes out empty, stray sounds before/after can be left out
 *   analyse(frames, syls, range)  segments, features and the tone model (docs/data/tone-model.js) → per syllable:
 *                                 { heard, p, verdict: 'ok' | 'slip' | 'unsure', span, pts }
 *   updateRange(range, trk)       the speaker's running pitch range (kept in the store, collection `meta`)
 *
 * syls: [{ c, s (spoken tone 0–4, after 一/不 and 3+3 changes), alt ([other accepted tones] or null), final }]
 * A 3rd tone is expected as a full dip only when final; elsewhere a low "half-third" counts. A neutral tone is
 * judged by its pitch relative to the syllable before.
 */
(function (global) {
  'use strict';
  const ST = f => 12 * Math.log2(f / 100);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : 0; };
  const DB = r => 20 * Math.log10(Math.max(r, 1e-5));

  /** Voiced points { t, st, db } from raw frames: loud enough, clear enough, octave slips repaired, smoothed. */
  function track(frames) {
    if (!frames || !frames.length) return null;
    const loud = pct(frames.map(f => f.rms), 0.97);
    // a weak pitch guess counts too when the frame is loud (a fast fall or a creaky dip still has a pitch)
    // (only when it continues a clear pitch close by, within 4 semitones)
    const strong = frames.filter(f => f.f0 && f.rms > loud * 0.05 && (f.cl == null || f.cl === 0 || f.cl >= 0.6));
    const near = f => strong.some(g => Math.abs(g.t - f.t) < 100 && Math.abs(ST(g.f0) - ST(f.w)) < 4);
    const v = frames.map(f => strong.includes(f) ? f : f.w && f.cl >= 0.4 && f.rms > loud * 0.2 && near(f) ? { t: f.t, f0: f.w, rms: f.rms, cl: f.cl } : null)
      .filter(f => f && f.f0 > 60 && f.f0 < 700);
    if (v.length < 2) return null;
    // octave repair: each point may really be half or double what was found; a Viterbi pass keeps the track continuous
    const raw = v.map(f => ST(f.f0)), ref = median(raw), opts = [0, -12, 12];
    let cost = opts.map(o => Math.abs(raw[0] + o - ref) * 0.15 + (o ? 2.5 : 0)), back = [];
    for (let i = 1; i < raw.length; i++) {
      const near = v[i].t - v[i - 1].t < 120, b = [], c = [];
      opts.forEach((o, k) => {
        let best = Infinity, bi = 0;
        opts.forEach((o2, k2) => { const j = cost[k2] + (near ? Math.min(8, Math.abs(raw[i] + o - raw[i - 1] - o2)) : 0); if (j < best) { best = j; bi = k2; } });
        c.push(best + Math.abs(raw[i] + o - ref) * 0.15 + (o ? 2.5 : 0)); b.push(bi);
      });
      cost = c; back.push(b);
    }
    let k = cost.indexOf(Math.min(...cost)); const st = new Array(raw.length);
    for (let i = raw.length - 1; i >= 0; i--) { st[i] = raw[i] + opts[k]; if (i) k = back[i - 1][k]; }
    // drop lone spikes (a point far from both neighbours), then a light median-of-3 within voiced runs
    let pts = v.map((f, i) => ({ t: f.t, st: st[i], db: DB(f.rms) }));
    pts = pts.filter((p, i) => {
      const a = pts[i - 1], b = pts[i + 1];
      const da = a && p.t - a.t < 80 ? Math.abs(p.st - a.st) : null, db = b && b.t - p.t < 80 ? Math.abs(p.st - b.st) : null;
      return !(da != null && db != null && da > 4 && db > 4 && Math.abs(a.st - b.st) < 3) && !(da == null && db != null && db > 6) && !(db == null && da != null && da > 6);
    });
    if (pts.length < 2) return null;
    const sm = pts.map((p, i) => {
      const a = pts[i - 1], b = pts[i + 1];
      if (!a || !b || p.t - a.t > 80 || b.t - p.t > 80) return p.st;
      return median([a.st, p.st, b.st]);
    });
    pts = pts.map((p, i) => ({ t: p.t, st: sm[i], db: p.db }));
    // speech frames: voiced points, plus loud frames without a clear pitch (consonants, creak) that still take time
    const floor = pct(frames.map(f => f.rms), 0.15), gate = Math.max(loud * 0.1, floor * 2.5);
    const byT = new Map(pts.map((p, i) => [p.t, i])), sf = [];
    for (const f of frames) {
      const i = byT.has(f.t) ? byT.get(f.t) : -1;
      if (i >= 0 || (f.rms > gate && f.t >= pts[0].t - 250 && f.t <= pts[pts.length - 1].t + 150)) sf.push({ t: f.t, db: DB(f.rms), i });
    }
    return { pts, sf, t0: pts[0].t, t1: pts[pts.length - 1].t, step: median(frames.slice(1).map((f, i) => f.t - frames[i].t)) || 33 };
  }

  // ---------------- segmentation ----------------
  const SEG = { dur: 5, internal: 0.7, gain: 3.5, base: 1.5, skip: 4, short: 0.5, edge: 1.2, neutral: 0.45, final: 1.2, novoice: 1.5 };
  /** Boundary evidence between speech frame k and k+1, 0–1: silence, the start of a consonant, a loudness dip, a pitch jump. */
  function evidence(trk) {
    const { sf, pts, step } = trk, e = new Float32Array(Math.max(0, sf.length - 1));
    for (let k = 0; k < sf.length - 1; k++) {
      const a = sf[k], b = sf[k + 1];
      const gap = clamp((b.t - a.t - step * 1.35) / 60, 0, 1);
      let l = -Infinity, r = -Infinity;
      for (let i = Math.max(0, k - 3); i <= k; i++) if (a.t - sf[i].t < 150) l = Math.max(l, sf[i].db);
      for (let i = k + 1; i <= Math.min(sf.length - 1, k + 4); i++) if (sf[i].t - b.t < 150) r = Math.max(r, sf[i].db);
      const dip = clamp((Math.min(l, r) - Math.min(a.db, b.db) - 2) / 8, 0, 1);
      const voicing = a.i >= 0 && b.i < 0 ? 0.6 : a.i < 0 && b.i >= 0 ? 0.1 : 0;
      const jump = a.i >= 0 && b.i >= 0 ? clamp((Math.abs(pts[b.i].st - pts[a.i].st) - 1.5) / 3, 0, 1) : 0;
      e[k] = 1 - (1 - gap) * (1 - dip * 0.8) * (1 - jump * 0.7) * (1 - voicing);
    }
    return e;
  }
  /**
   * Assign each expected syllable a run of speech frames, returned as [first, last] voiced-point indices (null when the
   * syllable seems not to have been said, or has no pitch at all).
   */
  function segment(trk, syls, P = SEG) {
    const n = syls.length, sf = trk ? trk.sf : [], V = sf.length;
    if (!n) return [];
    if (!trk || trk.pts.length < 2) return syls.map(() => null);
    const e = evidence(trk), cum = new Float64Array(V), nv = new Int32Array(V + 1); // prefix sums: evidence, voiced frames
    for (let k = 1; k < V; k++) cum[k] = cum[k - 1] + e[k - 1];
    for (let k = 0; k < V; k++) nv[k + 1] = nv[k] + (sf[k].i >= 0 ? 1 : 0);
    const w = syls.map((s, i) => (s.s === 0 ? P.neutral : 1) * (s.final || i === n - 1 ? P.final : 1));
    const W = w.reduce((a, b) => a + b, 0);
    const INF = 1e9, D = [], B = [];
    // leading frames may be left out (a cough, an "um") only at a clear break
    D[0] = new Float64Array(V + 1).fill(INF); B[0] = [];
    D[0][0] = 0;
    for (let k = 1; k < V; k++) D[0][k] = P.edge + 3 * (1 - e[k - 1]) + k * 0.02;
    for (let m = 0; m < n; m++) {
      const Dm = D[m], Dn = new Float64Array(V + 1).fill(INF), Bn = new Array(V + 1);
      const exp = w[m] / W * V;
      for (let i = 0; i <= V; i++) {
        if (Dm[i] >= INF) continue;
        if (Dm[i] + P.skip < Dn[i]) { Dn[i] = Dm[i] + P.skip; Bn[i] = [i, -1]; } // syllable m not heard
        const bc = i > 0 && m > 0 ? P.base - P.gain * e[i - 1] : 0;
        for (let j = i; j < V; j++) {
          const len = j - i + 1, r = Math.log(len / exp), voiced = nv[j + 1] - nv[i];
          const c = Dm[i] + bc + P.dur * r * r + P.internal * (cum[j] - cum[i]) + (voiced < 3 ? P.short * (3 - voiced) / 2 : 0) + (voiced ? 0 : P.novoice);
          if (c < Dn[j + 1]) { Dn[j + 1] = c; Bn[j + 1] = [i, j]; }
          if (r > 1.6) break;
        }
      }
      D[m + 1] = Dn; B[m + 1] = Bn;
    }
    let best = INF, end = V;
    for (let k = 1; k <= V; k++) { const c = D[n][k] + (k < V ? P.edge + 3 * (1 - e[k - 1]) + (V - k) * 0.02 : 0); if (c < best) { best = c; end = k; } }
    const out = new Array(n); let k = end;
    for (let m = n; m >= 1; m--) {
      const [i, j] = B[m][k];
      if (j < 0) out[m - 1] = null;
      else { let a = i, b = j; while (a <= j && sf[a].i < 0) a++; while (b >= i && sf[b].i < 0) b--; out[m - 1] = a <= b ? [sf[a].i, sf[b].i] : null; }
      k = i;
    }
    return out;
  }

  // ---------------- speaker range ----------------
  /** Pitch range of one recording: { mid, span } in semitones re 100 Hz, and how much voicing it rests on. */
  function rangeOf(trk) {
    const s = trk.pts.map(p => p.st), lo = pct(s, 0.1), hi = pct(s, 0.9);
    return { mid: (lo + hi) / 2, span: hi - lo, n: s.length };
  }
  /** Running range over earlier recordings (stored in `meta`): a slow average, so one odd recording barely moves it. */
  function updateRange(prev, trk) {
    if (!trk || trk.pts.length < 6) return prev || null;
    const r = rangeOf(trk), k = prev ? Math.min(prev.k + 1, 12) : 1, a = 1 / k;
    const span = r.n >= 25 ? r.span : null; // a short word says little about the span
    return prev ? { mid: prev.mid + (r.mid - prev.mid) * a, span: span != null ? prev.span + (span - prev.span) * a * 0.7 : prev.span, k }
      : { mid: r.mid, span: span != null ? Math.max(6, span) : 9, k };
  }
  /** The reference for this recording: history when there is some, blended with this recording's own range. */
  function reference(trk, hist) {
    const r = rangeOf(trk), u = Math.min(1, r.n / 60);
    const h = hist ? Math.min(0.85, hist.k / (hist.k + 1.5)) : 0;
    const wh = h * (1 - 0.35 * u), mid = hist ? hist.mid * wh + r.mid * (1 - wh) : r.mid;
    const uSpan = Math.max(r.span, 5), span = hist ? hist.span * wh + Math.max(uSpan, 7) * (1 - wh) : Math.max(uSpan, 8 - 2 * u);
    return { mid, span: clamp(span, 5, 16), conf: hist ? wh : 0, own: r };
  }

  // ---------------- features & model ----------------
  function fit(pts) {
    const n = pts.length, t0 = pts[0].t, T = Math.max(1, pts[n - 1].t - t0);
    const xs = pts.map(p => (p.t - t0) / T), ys = pts.map(p => p.st), ws = pts.map((p, i) => i === 0 || i === n - 1 ? 0.5 : 1);
    if (n < 4) { // straight line
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      xs.forEach((x, i) => { const w = ws[i]; sw += w; sx += w * x; sy += w * ys[i]; sxx += w * x * x; sxy += w * x * ys[i]; });
      const d = sw * sxx - sx * sx, b = n > 1 && Math.abs(d) > 1e-9 ? (sw * sxy - sx * sy) / d : 0, a = (sy - b * sx) / sw;
      return x => a + b * x;
    }
    const S = [0, 0, 0, 0, 0], R = [0, 0, 0];
    xs.forEach((x, i) => { const w = ws[i]; let p = w; for (let k = 0; k < 5; k++) { S[k] += p; p *= x; } R[0] += w * ys[i]; R[1] += w * x * ys[i]; R[2] += w * x * x * ys[i]; });
    const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d = det(M); if (Math.abs(d) < 1e-9) return () => median(ys);
    const col = (k) => det(M.map((row, i) => row.map((v, j) => j === k ? R[i] : v)));
    const c0 = col(0) / d, c1 = col(1) / d, c2 = col(2) / d;
    const lo = Math.min(...ys) - 1.5, hi = Math.max(...ys) + 1.5;
    return x => clamp(c0 + c1 * x + c2 * x * x, lo, hi);
  }
  /** Shape and level of one syllable's points, relative to the speaker's range. */
  function features(seg, ctx) {
    const { pts, ref } = ctx, f = fit(pts), n = pts.length, sp = ref.span;
    const v0 = f(0), vm = f(0.5), v1 = f(1), mean = pts.reduce((s, p) => s + p.st, 0) / n;
    let mi = 0, ma = 0; pts.forEach((p, i) => { if (p.st < pts[mi].st) mi = i; if (p.st > pts[ma].st) ma = i; });
    const T = Math.max(1, pts[n - 1].t - pts[0].t), mpos = n > 1 ? (pts[mi].t - pts[0].t) / T : 0.5;
    const L = x => (x - ref.mid) / sp;
    const fin = ctx.final ? 1 : 0, c = ref.conf;
    const base = {
      lvl: L(mean), lv0: L(v0), lv1: L(v1), slope: (v1 - v0) / 6, curv: (vm - (v0 + v1) / 2) / 3, s1: (vm - v0) / 4, s2: (v1 - vm) / 4,
      mpos: mpos - 0.5, ext: (pts[ma].st - pts[mi].st) / 6, dur: Math.log(ctx.dur / ctx.meanDur), db: (ctx.db - ctx.maxDb) / 10,
      prev: ctx.prevEnd != null ? (v0 - ctx.prevEnd) / 6 : 0, hasPrev: ctx.prevEnd != null ? 1 : 0, next: ctx.nextStart != null ? (ctx.nextStart - v1) / 6 : 0,
      fin, conf: c, few: n < 5 ? 1 : 0,
    };
    base.lvlC = base.lvl * c; base.lv0C = base.lv0 * c; base.lv1C = base.lv1 * c;
    for (const k of ['lvl', 'lv0', 'lv1', 'slope', 'curv', 's1', 's2', 'mpos', 'ext', 'dur']) base[k + 'F'] = base[k] * fin;
    base.slope2 = base.slope * Math.abs(base.slope); base.curv2 = base.curv * Math.abs(base.curv);
    // the contour itself at five even times (relative to its own mean), for the finer shape
    for (let q = 0; q < 5; q++) {
      const x = pts[0].t + T * q / 4; let k = 0; while (k < n - 2 && pts[k + 1].t < x) k++;
      const a = pts[k], b = pts[Math.min(n - 1, k + 1)], y = b.t > a.t ? a.st + (b.st - a.st) * clamp((x - a.t) / (b.t - a.t), 0, 1) : a.st;
      base['q' + q] = (y - mean) / 3;
    }
    return base;
  }
  const CLASSES = [1, 2, 3, 4, 0];
  /** Class probabilities from the shipped model (a tiny neural network or softmax regression, see tools/train-tones.js). */
  function predict(feat, model) {
    const M = model || global.TONE_MODEL;
    let x = M.features.map((k, i) => ((feat[k] || 0) - M.mean[i]) / M.std[i]);
    if (M.H) x = M.H.map((row, h) => Math.tanh(row.reduce((s, w, i) => s + w * x[i], M.hb[h]))); // hidden layer
    const z = M.W.map((row, c) => row.reduce((s, w, i) => s + w * x[i], M.b[c]));
    const mx = Math.max(...z), ex = z.map(v => Math.exp(v - mx)), S = ex.reduce((a, b) => a + b, 0);
    const p = {}; M.classes.forEach((c, i) => { p[c] = ex[i] / S; });
    return p;
  }
  /** Verdict thresholds: a slip is only called when the model is fairly sure; otherwise "unsure". */
  const VERDICT = { ok: 0.35, slip: 0.8, okNeutral: 0.2, slipNeutral: 0.85, noHistory: 0.1 }; // stricter before the voice's range is known

  /**
   * Everything for one recording. range: the stored running range (or null). Returns
   * { trk, ref, syls: [{ heard, p, conf, verdict, span: [t0, t1] | null, pts }] } — trk null when no voice was found.
   */
  function analyse(frames, syls, range, opts = {}) {
    const trk = track(frames);
    if (!trk || trk.pts.length < 3) return { trk: null, ref: null, syls: syls.map(() => ({ heard: null, p: null, verdict: 'unsure', span: null, pts: [] })) };
    const ref = reference(trk, range), segs = segment(trk, syls, opts.seg);
    const pts = trk.pts, maxDb = Math.max(...pts.map(p => p.db));
    const lens = segs.filter(Boolean).map(([a, b]) => b - a + 1), meanDur = lens.length ? lens.reduce((x, y) => x + y, 0) / lens.length : 1;
    const parts = segs.map(sg => sg ? pts.slice(sg[0], sg[1] + 1) : []);
    const ends = parts.map(p => p.length >= 2 ? fit(p) : null);
    const out = syls.map((s, i) => {
      const P = parts[i];
      if (!segs[i] || P.length < 2) return { heard: null, p: null, verdict: 'unsure', span: segs[i] ? [P[0].t - trk.step, P[P.length - 1].t] : null, pts: P, missing: !segs[i] };
      const prevI = i > 0 && ends[i - 1] && pts[segs[i][0]].t - parts[i - 1][parts[i - 1].length - 1].t < 400 ? i - 1 : -1;
      const nextI = i < syls.length - 1 && ends[i + 1] && parts[i + 1][0].t - P[P.length - 1].t < 400 ? i + 1 : -1;
      const db = P.reduce((a, p) => a + p.db, 0) / P.length;
      const feat = features(segs[i], { pts: P, ref, final: !!s.final || i === syls.length - 1, dur: P.length, meanDur, db, maxDb,
        prevEnd: prevI >= 0 ? ends[prevI](1) : null, nextStart: nextI >= 0 ? ends[nextI](0) : null });
      const p = predict(feat, opts.model);
      // for a full-tone target, "light" is not a tone the learner can be told they said: a short low syllable is
      // most like a reduced 3rd tone, so that share goes to the 3rd tone
      if (s.s !== 0) { p[3] += p[0]; p[0] = 0; }
      let heard = 1; for (const c of CLASSES) if (p[c] > p[heard]) heard = c;
      const okSet = [s.s, ...(s.alt || [])], pOk = okSet.reduce((a, c) => a + (p[c] || 0), 0);
      const V = opts.verdict || VERDICT, neutral = s.s === 0;
      let verdict = 'unsure';
      if (pOk >= (neutral ? V.okNeutral : V.ok) && (okSet.includes(heard) || pOk >= 0.9 * p[heard])) verdict = 'ok';
      else if (!okSet.includes(heard) && p[heard] >= (neutral ? V.slipNeutral : V.slip) + V.noHistory * (1 - ref.conf) && P.length >= 3) verdict = 'slip';
      return { heard, p, pOk, verdict, span: [P[0].t - trk.step, P[P.length - 1].t], pts: P, feat };
    });
    return { trk, ref, syls: out };
  }

  /** Expected syllables of a sentence (its `sy`): spoken tones, 3rd tones that may change, and phrase ends. */
  function targetsOf(sy) {
    const out = [];
    for (const x of sy) {
      if (x.p && !x.er) out.push({ c: x.c, s: x.s, t: x.t, alt: x.x ? [3, 2] : null, final: false });
      else if (!x.p && !x.er && out.length) out[out.length - 1].final = true;
    }
    if (out.length) out[out.length - 1].final = true;
    return out;
  }

  /**
   * One recording's two checks together: the tone verdicts (analyse) and the word check (a transcript compared with
   * the target, see ZH.compareSpeech; each difference with `sure` when it can be trusted). Per syllable:
   *   word: 'ok' | 'tone' (the right syllable heard with another tone: 买 as 卖) | 'wrong' | 'miss' | 'unsure' | null
   *         (null: no word check), heard: the character heard instead, tone: 'ok' | 'slip' | 'unsure', toneHeard.
   * A tone verdict is not trusted for a syllable whose word was wrong or missing: it becomes 'unsure'. When the
   * recogniser heard another tone but the pitch says the tone was right, the pitch wins (a recogniser often picks the
   * more common of two words that sound alike); when the pitch was unsure, the recogniser's tone is used.
   * Also: extra (sure extra syllables: { c, after }), and counts { wrong, miss, extra, slips, unsure, n }.
   */
  function withWords(syls, an, words) {
    const res = (an && an.syls) || syls.map(() => ({ verdict: 'unsure', heard: null }));
    const out = syls.map((s, i) => {
      const r = res[i] || { verdict: 'unsure' }, w = words && words.syl[i];
      const o = { word: null, heard: null, tone: r.verdict, toneHeard: r.heard };
      if (!words) return o;
      if (!w || w.st === 'ok') { o.word = 'ok'; return o; }
      if (!w.sure) { o.word = 'unsure'; return o; }
      o.word = w.st; o.heard = w.heard ? w.heard.c : null;
      if (w.st === 'wrong' || w.st === 'miss') o.tone = 'unsure';
      else if (w.st === 'tone') {
        if (r.verdict === 'ok') { o.word = 'ok'; o.heard = null; }
        else { o.tone = 'slip'; if (r.verdict !== 'slip') o.toneHeard = w.heard.t; }
      }
      return o;
    });
    const extra = words ? words.extra.filter(e => e.sure) : [];
    const n = syls.length, cnt = st => out.filter(o => o.word === st).length;
    return { syls: out, extra, checked: !!words, counts: { n, wrong: cnt('wrong'), miss: cnt('miss'), extra: extra.length, slips: out.filter(o => o.tone === 'slip').length, doubt: cnt('unsure'), unsure: out.filter(o => o.tone === 'unsure' && o.word !== 'wrong' && o.word !== 'miss').length } };
  }
  /**
   * Suggested grade for a take (0 again, 2 good, 3 easy): a wrong, missing or extra word is not a pass, whatever the
   * tones; then tone slips; "easy" only when the words were checked and every tone was heard right.
   */
  function suggestGrade(m) {
    const c = m.counts;
    if (c.wrong + c.miss + c.extra > 0) return 0;
    if (c.slips >= 2 && c.slips >= c.n / 2) return 0;
    if (!c.slips && m.checked && !c.doubt && c.unsure <= c.n / 4) return 3;
    return 2;
  }

  global.Tones = { track, segment, evidence, analyse, features, predict, updateRange, reference, targetsOf, withWords, suggestGrade, CLASSES, SEG, VERDICT };
  if (typeof module !== 'undefined') module.exports = global.Tones;
})(typeof window !== 'undefined' ? window : globalThis);
