/*
 * Synthetic Mandarin-like speech for testing tone recognition (development and tests only, never loaded by the app).
 *
 * A glottal pulse train (with jitter, shimmer, breathiness and optional creak) goes through vowel formant resonators.
 * F0 follows Chao tone targets (55, 35, 214 / 21 half-third, 51, neutral by the previous tone) scaled to a speaker's
 * range, and approaches each syllable's target smoothly (target approximation), so syllables coarticulate.
 * Syllables get voiceless or voiced initials, random durations (neutral short, last syllable long), pauses at commas,
 * declination, background noise and a random mic level.
 *
 * synth(spec, seed) → { sr, samples: Float32Array, truth: [{ t0, t1 }] (ms, the voiced part of each syllable) }
 *   spec = { tones: [spoken tone 0–4 …], finals: [bool …] (phrase-final), pauses: [bool …] (pause after), speaker, snrDb, gain }
 * speaker(kind, seed) → a random speaker of kind 'male' | 'female' | 'child' | 'flat' (a learner with a narrow range).
 */
'use strict';

function rng(seed) {
  let a = seed >>> 0 || 1;
  const next = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.gauss = () => { let u = 0, v = 0; while (!u) u = next(); while (!v) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  next.pick = a => a[Math.floor(next() * a.length)];
  return next;
}

function speaker(kind, seed) {
  const r = rng(seed);
  const base = { male: [78, 115, 9, 14], female: [150, 215, 9, 14], child: [220, 300, 8, 12], flat: [90, 200, 5, 8] }[kind];
  return {
    kind, lo: r.range(base[0], base[1]), span: r.range(base[2], base[3]),
    rate: r.range(0.8, 1.25), jitter: r.range(0.003, 0.015), shimmer: r.range(0.02, 0.08), breath: r.range(0.01, 0.08),
    creak: r.range(0, 0.6), // chance of creak at the bottom of a 3rd tone
    tau: r.range(0.012, 0.025), // seconds: how fast F0 approaches a target
    formantScale: kind === 'male' ? r.range(0.9, 1.0) : kind === 'child' ? r.range(1.15, 1.3) : r.range(1.05, 1.18),
    var: r.range(0.2, 0.5), // per-syllable target variation (Chao levels)
  };
}

// Chao levels (1 low … 5 high) at normalised times within the rhyme
function targets(tone, prev, final, r, v) {
  const j = () => r.gauss() * v;
  switch (tone) {
    case 1: { const l = 5 - Math.abs(j()) * 0.6; return [[0, l], [1, l + j() * 0.3]]; }
    // real speakers vary: a 2nd tone may dip before it rises; a final 3rd tone often barely comes back up
    case 2: { const s = 3 + j(), tp = r.range(0.25, 0.55), d = r() < 0.5 ? r.range(0, 0.4) : r.range(0.4, 1.6); return [[0, s], [tp, s - d], [1, 5.2 - Math.abs(j()) * 0.5]]; }
    case 3: return final ? [[0, 2.2 + j()], [r.range(0.45, 0.75), 1 + Math.abs(j()) * 0.3], [1, r.range(1.3, 3.8)]] : [[0, 2.2 + j()], [0.6, 1 + Math.abs(j()) * 0.3], [1, 1.2 + Math.abs(j()) * 0.4]];
    case 4: { const s = 5 - Math.abs(j()) * 0.4; return final ? [[0, s], [r.range(0.65, 0.95), 1 + Math.abs(j()) * 0.3], [1, 1 + Math.abs(j()) * 0.4]] : [[0, s], [1, 2.2 + j()]]; }
    default: { const l = { 1: 2.5, 2: 3, 3: 4, 4: 1.5, 0: 2.3 }[prev] + j() * 0.6; return [[0, l + 0.2], [1, l - 0.4]]; }
  }
}

const VOWELS = { a: [800, 1250, 2700], i: [300, 2250, 3000], u: [330, 800, 2400], e: [520, 1200, 2600], o: [550, 900, 2500], y: [300, 1900, 2400], er: [500, 1400, 1700] };
const SR = 48000;

function synth(spec, seed) {
  const r = rng(seed), sp = spec.speaker, n = spec.tones.length;
  const sec = s => Math.round(s * SR);
  // ---- plan the timeline
  const plan = []; let t = r.range(0.12, 0.5);
  for (let i = 0; i < n; i++) {
    const tone = spec.tones[i], final = !!(spec.finals && spec.finals[i]) || i === n - 1;
    const kind = r.pick(['none', 'son', 'son', 'stop', 'stop', 'asp', 'fric', 'fric']);
    const cons = kind === 'none' ? 0 : kind === 'son' ? r.range(0.04, 0.08) : kind === 'stop' ? r.range(0.015, 0.035) : kind === 'asp' ? r.range(0.06, 0.11) : r.range(0.08, 0.15);
    let dur = r.range(0.15, 0.25) / sp.rate;
    if (tone === 0) dur *= r.range(0.4, 0.6); if (final) dur *= r.range(1.25, 1.6); if (tone === 3 && final) dur *= 1.15; if (tone === 4) dur *= 0.92;
    const vowel = r.pick(Object.keys(VOWELS)), nasal = r() < 0.35;
    const voicedCons = kind === 'son' || kind === 'none';
    const cs = t; t += cons; const v0 = t; t += dur; const v1 = t;
    plan.push({ tone, final, kind, cs, v0, v1, vowel, nasal, voicedCons });
    if (spec.pauses && spec.pauses[i] && i < n - 1) t += r.range(0.15, 0.4);
    else if (i < n - 1 && r() < 0.15) t += r.range(0.01, 0.05); // a small break between words
  }
  const total = t + r.range(0.3, 0.6), N = sec(total);
  // ---- F0 target trajectory (Hz), with declination; targets run from the syllable start (consonant included)
  const level = l => sp.lo * Math.pow(2, (l - 1) / 4 * sp.span / 12);
  const tgt = new Float32Array(N), voiced = new Uint8Array(N), amp = new Float32Array(N), creak = new Uint8Array(N);
  const F = [new Float32Array(N), new Float32Array(N), new Float32Array(N)], noiseAmp = new Float32Array(N), noiseHi = new Uint8Array(N);
  const decl = r.range(0.5, 2.5); // semitones of declination over the utterance
  for (let i = 0; i < n; i++) {
    const p = plan[i], prev = i ? plan[i - 1].tone : 0, tg = targets(p.tone, prev, p.final, r, sp.var);
    const end = i < n - 1 ? plan[i + 1].cs : N / SR, a0 = sec(p.cs), a1 = sec(end);
    const dip = p.tone === 3 && r() < sp.creak;
    const loud = (p.tone === 0 ? r.range(0.45, 0.7) : r.range(0.8, 1.1)) * (p.final ? 0.9 : 1);
    const vw = VOWELS[p.vowel].map(f => f * sp.formantScale * r.range(0.95, 1.05));
    for (let k = a0; k < a1; k++) {
      const ts = k / SR, x = Math.max(0, Math.min(1, (ts - p.v0) / (p.v1 - p.v0)));
      let l = tg[0][1];
      for (let m = 1; m < tg.length; m++) if (x <= tg[m][0]) { const [x0, y0] = tg[m - 1], [x1, y1] = tg[m]; l = y0 + (y1 - y0) * (x - x0) / (x1 - x0); break; } else l = tg[m][1];
      tgt[k] = level(l) * Math.pow(2, -decl * ts / total / 12);
      const inRhyme = ts >= p.v0 && ts < p.v1, inCons = ts >= p.cs && ts < p.v0;
      if (inRhyme || (inCons && p.voicedCons)) {
        voiced[k] = 1;
        const on = Math.min(1, (ts - (p.voicedCons ? p.cs : p.v0)) / 0.025), off = Math.min(1, (p.v1 - ts) / (p.final ? 0.08 : 0.03));
        let a = loud * on * off * (inCons ? 0.45 : 1) * (p.nasal && x > 0.7 ? 0.5 : 1);
        if (p.tone === 3 && x > 0.3 && x < 0.75) a *= 0.7;
        amp[k] = Math.max(0, a);
        if (dip && x > 0.35 && x < 0.7) creak[k] = 1;
        const nas = p.nasal && x > 0.7, con = inCons;
        F[0][k] = nas || con ? 280 : vw[0]; F[1][k] = nas || con ? 1100 : vw[1]; F[2][k] = vw[2];
      } else if (inCons) {
        noiseAmp[k] = (p.kind === 'fric' ? 0.25 : p.kind === 'asp' ? 0.15 : (ts - p.cs < 0.012 ? 0.5 : 0.05)) * loud; noiseHi[k] = p.kind === 'fric' ? 1 : 0;
        F[0][k] = vw[0]; F[1][k] = vw[1]; F[2][k] = vw[2];
      } else { F[0][k] = vw[0]; F[1][k] = vw[1]; F[2][k] = vw[2]; }
    }
  }
  // ---- F0 approaches its target (critically damped), plus a little microprosody after voiceless consonants
  const f0 = new Float32Array(N); let x = Math.log(tgt[0] || sp.lo * 1.3), vel = 0; const w = 1 / sp.tau, dt = 1 / SR;
  for (let k = 0; k < N; k++) { const g = Math.log(tgt[k] || Math.exp(x)); const acc = w * w * (g - x) - 2 * w * vel; vel += acc * dt; x += vel * dt; f0[k] = Math.exp(x); }
  // ---- source
  const out = new Float32Array(N); let ph = 0, per = 1, pAmp = 1, creakFlip = 1;
  const res = F.map(() => ({ y1: 0, y2: 0 })), bw = [90, 120, 180];
  let lp = 0, hp = 0;
  for (let k = 0; k < N; k++) {
    let s = 0;
    if (voiced[k]) {
      ph += f0[k] * per / SR;
      if (ph >= 1) { ph -= 1; per = 1 + r.gauss() * sp.jitter; pAmp = 1 + r.gauss() * sp.shimmer; if (creak[k]) { creakFlip = -creakFlip; per *= 1 + 0.35 * creakFlip; pAmp *= creakFlip > 0 ? 1 : 0.35; } }
      // derivative of a Rosenberg pulse: open phase 0–0.6
      const q = ph; const g = q < 0.4 ? Math.sin(Math.PI * q / 0.4) * 0.5 : q < 0.6 ? -Math.sin(Math.PI * (q - 0.4) / 0.2) : 0;
      s = g * pAmp * amp[k] + (r() * 2 - 1) * sp.breath * amp[k];
    }
    if (noiseAmp[k]) { const z = r() * 2 - 1; hp = noiseHi[k] ? z - lp : z; lp = 0.6 * lp + 0.4 * z; s += hp * noiseAmp[k]; }
    // formant cascade
    let y = s;
    for (let m = 0; m < 3; m++) {
      const fr = F[m][k] || 500, R = Math.exp(-Math.PI * bw[m] / SR), c = 2 * R * Math.cos(2 * Math.PI * fr / SR), gain = 1 - R;
      const o = gain * y + c * res[m].y1 - R * R * res[m].y2; res[m].y2 = res[m].y1; res[m].y1 = o; y = o;
    }
    out[k] = y;
  }
  // ---- level, noise, mic
  let peak = 0; for (let k = 0; k < N; k++) peak = Math.max(peak, Math.abs(out[k]));
  const gain = (spec.gain || 0.2) / (peak || 1);
  let pw = 0, nv = 0; for (let k = 0; k < N; k++) { out[k] *= gain; if (voiced[k]) { pw += out[k] * out[k]; nv++; } }
  const sigRms = Math.sqrt(pw / Math.max(1, nv)), noiseRms = sigRms * Math.pow(10, -(spec.snrDb == null ? 30 : spec.snrDb) / 20);
  const hum = r() < 0.3 ? noiseRms * 0.7 : 0, hz = r() < 0.5 ? 50 : 60;
  for (let k = 0; k < N; k++) out[k] += noiseRms * 1.73 * (r() * 2 - 1) + hum * Math.sin(2 * Math.PI * hz * k / SR);
  // truth: voiced part of each syllable (ms)
  const truth = plan.map(p => ({ t0: (p.voicedCons ? p.cs : p.v0) * 1000, t1: p.v1 * 1000 }));
  return { sr: SR, samples: out, truth };
}

module.exports = { synth, speaker, rng };
