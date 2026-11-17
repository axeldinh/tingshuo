/* Audio: text-to-speech, speech recognition, and pitch (tone contour) recording. */
(function (global) {
  'use strict';

  // ---------------- Text to speech ----------------
  const TTS = {
    voice: null, voices: [],
    supported: 'speechSynthesis' in global,
    loadVoices() {
      if (!this.supported) return [];
      const all = speechSynthesis.getVoices();
      this.voices = all.filter(v => /^(zh|cmn)[-_](CN|Hans)/i.test(v.lang) || /^zh$/i.test(v.lang) || /普通话|Mandarin|Tingting|Ting-Ting|Li-?mu|Yu-?shu|Xiaoxiao|Yunxi/i.test(v.name));
      if (!this.voices.length) this.voices = all.filter(v => /^zh/i.test(v.lang));
      return this.voices;
    },
    pick(name) {
      this.loadVoices();
      const pref = [/Google.*普通话|Google.*Mandarin/i, /Xiaoxiao|Yunxi|Natural/i, /Tingting|Ting-Ting/i, /Li-?mu|Yu-?shu/i];
      this.voice = this.voices.find(v => v.name === name) || pref.map(r => this.voices.find(v => r.test(v.name) && /CN|Hans/i.test(v.lang))).find(Boolean)
        || this.voices.find(v => /CN|Hans/i.test(v.lang)) || this.voices[0] || null;
      return this.voice;
    },
    speak(text, rate = 0.85) {
      return new Promise(resolve => {
        if (!this.supported) return resolve(false);
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN'; if (this.voice) u.voice = this.voice;
        u.rate = rate; u.pitch = 1;
        let done = false; const end = ok => { if (!done) { done = true; resolve(ok); } };
        u.onend = () => end(true); u.onerror = () => end(false);
        speechSynthesis.speak(u);
        setTimeout(() => end(true), 2500 + text.length * 700 / rate); // safety net for engines that never fire onend
      });
    },
    stop() { if (this.supported) speechSynthesis.cancel(); },
  };
  if (TTS.supported) { TTS.loadVoices(); speechSynthesis.onvoiceschanged = () => { TTS.loadVoices(); if (!TTS.voice) TTS.pick(); }; }

  // ---------------- Speech recognition ----------------
  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  const Recognizer = {
    supported: !!SR,
    current: null,
    /** Listen once. pickBest(alternatives) chooses among the recogniser's guesses. */
    listen({ onPartial, pickBest, maxMs = 12000 } = {}) {
      return new Promise((resolve, reject) => {
        if (!SR) return reject(new Error('unsupported'));
        const r = new SR();
        r.lang = 'zh-CN'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
        let finalAlts = null, partial = '';
        r.onresult = ev => {
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) { finalAlts = Array.from(res).map(a => a.transcript); }
            else interim += res[0].transcript;
          }
          partial = interim || (finalAlts && finalAlts[0]) || partial;
          onPartial && onPartial(partial);
        };
        r.onerror = e => { this.current = null; reject(new Error(e.error || 'error')); };
        r.onend = () => {
          this.current = null; clearTimeout(timer);
          const alts = finalAlts || (partial ? [partial] : []);
          if (!alts.length) return reject(new Error('no-speech'));
          resolve(pickBest ? pickBest(alts) : alts[0]);
        };
        const timer = setTimeout(() => { try { r.stop(); } catch (e) {} }, maxMs);
        this.current = r;
        try { r.start(); } catch (e) { reject(e); }
      });
    },
    stop() { if (this.current) try { this.current.stop(); } catch (e) {} },
  };

  // ---------------- Pitch recording ----------------
  // Normalised autocorrelation (McLeod-style) on a downsampled signal. ~30 frames per second.
  // minRms skips silence. The clarity test below (not loudness) is what rejects noise,
  // so the gate can sit low: phone mics often deliver speech at an RMS of 0.001–0.004.
  function detectPitch(buf, sr, minRms = 0.0006) {
    let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < minRms) return { f0: null, rms };
    const minLag = Math.floor(sr / 520), maxLag = Math.min(Math.floor(sr / 65), buf.length >> 1);
    const n = buf.length - maxLag;
    const nsdf = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let ac = 0, m = 0;
      for (let i = 0; i < n; i++) { const a = buf[i], b = buf[i + lag]; ac += a * b; m += a * a + b * b; }
      nsdf[lag] = m ? 2 * ac / m : 0;
    }
    let maxV = 0; for (let lag = minLag; lag <= maxLag; lag++) if (nsdf[lag] > maxV) maxV = nsdf[lag];
    if (maxV < 0.55) return { f0: null, rms };
    // first peak above 85% of the max (avoids octave errors)
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (nsdf[lag] >= 0.85 * maxV && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
        const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
        const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
        return { f0: sr / (lag + (isFinite(shift) ? shift : 0)), rms, clarity: b };
      }
    }
    return { f0: null, rms };
  }

  const Pitch = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (global.AudioContext || global.webkitAudioContext)),
    ctx: null, stream: null,
    async start({ onFrame, maxMs = 9000, autoStop = true } = {}) {
      this.ctx = this.ctx || new (global.AudioContext || global.webkitAudioContext)();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      // Automatic gain keeps quiet phone mics usable; it changes loudness slowly, so the pitch is unaffected.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      const src = this.ctx.createMediaStreamSource(this.stream);
      const an = this.ctx.createAnalyser(); an.fftSize = 4096; src.connect(an);
      const raw = new Float32Array(an.fftSize);
      const sr = this.ctx.sampleRate, step = sr > 32000 ? 2 : 1, dsr = sr / step;
      const win = new Float32Array(Math.floor(Math.min(raw.length / step, dsr * 0.045)));
      const frames = []; const t0 = performance.now();
      let rec = null, chunks = [];
      try {
        if (global.MediaRecorder) { rec = new MediaRecorder(this.stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(); }
      } catch (e) { rec = null; }
      let voicedSeen = false, lastVoice = 0, stopped = false;
      let noise = 0.002; // background level, tracked as a slowly rising minimum
      const gate = () => Math.min(0.004, Math.max(0.0006, noise * 2.5));
      return new Promise(resolve => {
        const finish = () => {
          if (stopped) return; stopped = true; clearInterval(iv);
          const done = url => { this.stream.getTracks().forEach(t => t.stop()); resolve({ frames, url, peak: Math.max(0, ...frames.map(f => f.rms)), noise }); };
          if (rec && rec.state !== 'inactive') { rec.onstop = () => done(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) : null); rec.stop(); }
          else done(null);
        };
        this._finish = finish;
        const iv = setInterval(() => {
          an.getFloatTimeDomainData(raw);
          const off = raw.length - win.length * step;
          for (let i = 0; i < win.length; i++) win[i] = raw[off + i * step];
          const t = performance.now() - t0, p = detectPitch(win, dsr, gate());
          noise = Math.min(Math.max(p.rms, 0.0002), noise * 1.01);
          frames.push({ t, f0: p.f0, rms: p.rms });
          if (p.f0) { voicedSeen = true; lastVoice = t; }
          onFrame && onFrame(frames);
          if (t > maxMs || (autoStop && voicedSeen && t - lastVoice > 1300)) finish();
        }, 33);
      });
    },
    stop() { this._finish && this._finish(); },
  };

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

  global.Audio2 = { TTS, Recognizer, Pitch, contour, guessTone, detectPitch };
  if (typeof module !== 'undefined') module.exports = global.Audio2;
})(typeof window !== 'undefined' ? window : globalThis);
