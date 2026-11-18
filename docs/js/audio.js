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
  const flat = s => String(s || '').replace(/[\s\p{P}]/gu, '');
  /** Finished stretches of speech, without the repeats some engines send (Android and iOS can resend earlier text, or all of it so far, as a new result). */
  function dedupe(segs) {
    const out = [];
    for (const s of segs) {
      const t = flat(s[0]); if (!t) continue;
      const prev = out.length ? flat(out[out.length - 1][0]) : null;
      if (prev != null && t.startsWith(prev)) out[out.length - 1] = s; // the new result repeats and extends the last one
      else if (prev != null && prev.endsWith(t)) continue; // already heard
      else out.push(s);
    }
    return out;
  }
  /** Whole-utterance guesses: the best guess for every stretch, then each stretch's other guesses in turn. */
  function candidates(segs) {
    const top = segs.map(s => s[0]), out = [top.join('')];
    segs.forEach((s, i) => s.slice(1).forEach(a => { if (out.length < 16) out.push(top.map((t, k) => k === i ? a : t).join('')); }));
    return [...new Set(out)];
  }
  const Recognizer = {
    supported: !!SR,
    current: null,
    /**
     * Listen until the speaker is done. Recognition runs through short pauses: it stops `silenceMs` after the last
     * word once something was heard, when stop() is called (a tap), after `quietMs` with nothing heard, or at `maxMs`.
     * Engines that end at a pause anyway (some phones ignore continuous mode) are started again while the speaker
     * may still be going. onPartial(text) gets everything heard so far; pickBest(guesses) chooses among whole-utterance
     * guesses (each the recogniser's alternatives, stretch by stretch).
     */
    listen({ onPartial, pickBest, maxMs = 15000, silenceMs = 1800, quietMs = 8000 } = {}) {
      return new Promise((resolve, reject) => {
        if (!SR) return reject(new Error('unsupported'));
        const t0 = Date.now(), kept = [];
        let segs = [], interim = '', last = 0, stopping = false, finished = false, restarts = 0, error = null, rec = null;
        const all = () => dedupe([...kept, ...segs, ...(interim ? [[interim]] : [])]);
        const heardText = () => all().map(s => s[0]).join('');
        const finish = () => {
          if (finished) return; finished = true; clearInterval(tick); if (this.current === rec) this.current = null;
          const segsNow = all();
          if (!segsNow.length) return reject(new Error(restarts && /not-allowed/.test(error || '') ? 'no-speech' : error || 'no-speech'));
          const alts = candidates(segsNow);
          resolve(pickBest ? pickBest(alts) : alts[0]);
        };
        const start = () => {
          const r = rec = new SR();
          r.lang = 'zh-CN'; r.interimResults = true; r.maxAlternatives = 5;
          try { r.continuous = true; } catch (e) {}
          r.onresult = ev => {
            // rebuilt from the whole list each time: engines may rewrite earlier results
            const fin = [], int = [];
            for (let i = 0; i < ev.results.length; i++) { const res = ev.results[i]; if (res.isFinal) fin.push(Array.from(res).map(a => a.transcript)); else int.push(res[0] ? res[0].transcript : ''); }
            segs = fin; interim = int.join(''); last = Date.now();
            onPartial && onPartial(heardText());
          };
          r.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') error = e.error; };
          r.onend = () => {
            if (r !== rec) return;
            kept.push(...segs, ...(interim ? [[interim]] : [])); segs = []; interim = '';
            const now = Date.now(), any = all().length > 0;
            const goOn = !stopping && !error && restarts < 4 && now - t0 < maxMs && (any ? now - last < silenceMs : now - t0 < quietMs);
            if (goOn) { restarts++; try { start(); return; } catch (e) { /* this engine won't restart without a tap */ } }
            finish();
          };
          this.current = r;
          r.start();
        };
        const tick = setInterval(() => {
          const now = Date.now(), any = !!heardText();
          if (now - t0 > maxMs || (any && last && now - last > silenceMs) || (!any && now - t0 > quietMs)) this.stop();
        }, 150);
        this._stop = () => { stopping = true; try { rec && rec.stop(); } catch (e) { finish(); } setTimeout(finish, 1500); }; // some engines never fire onend after stop
        try { start(); } catch (e) { clearInterval(tick); finished = true; reject(e); }
      });
    },
    stop() { if (this._stop) { const s = this._stop; this._stop = null; s(); } else if (this.current) try { this.current.stop(); } catch (e) {} },
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
    if (maxV < 0.35) return { f0: null, rms };
    // first peak above 85% of the max (avoids octave errors)
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (nsdf[lag] >= 0.85 * maxV && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
        const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
        const shift = (a - c) / (2 * (a - 2 * b + c) || 1), f = sr / (lag + (isFinite(shift) ? shift : 0));
        // below 0.55 the pitch is only a weak guess (fast pitch changes, creak): kept apart, for the tone analysis
        return maxV < 0.55 ? { f0: null, rms, clarity: b, weak: f } : { f0: f, rms, clarity: b };
      }
    }
    return { f0: null, rms };
  }

  /**
   * Frame-by-frame pitch analysis of a live signal at sample rate `sr`. `frame(raw, t)` takes the latest samples
   * (at least `need` of them, newest last) and returns { t, f0, rms, cl, w } (cl: clarity 0–1, f0 null when unvoiced;
   * w: a weak pitch guess where the clarity was too low to call it voiced).
   * The background level is tracked as a slowly rising minimum and sets the silence gate.
   * The recorder and the tests (which feed recordings through it) share this exact path.
   */
  function frameAnalyser(sr) {
    const step = sr > 32000 ? 2 : 1, dsr = sr / step;
    const win = new Float32Array(Math.floor(Math.min(4096 / step, dsr * 0.045)));
    const need = win.length * step;
    let noise = 0.002;
    const gate = () => Math.min(0.004, Math.max(0.0006, noise * 2.5));
    return {
      need, get noise() { return noise; },
      frame(raw, t) {
        const off = raw.length - need;
        for (let i = 0; i < win.length; i++) win[i] = raw[off + i * step] || 0;
        const p = detectPitch(win, dsr, gate());
        noise = Math.min(Math.max(p.rms, 0.0002), noise * 1.01);
        return { t, f0: p.f0, rms: p.rms, cl: p.clarity || 0, w: p.weak || null };
      },
    };
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
      const raw = new Float32Array(an.fftSize), fa = frameAnalyser(this.ctx.sampleRate);
      const frames = []; const t0 = performance.now();
      let rec = null, chunks = [];
      try {
        if (global.MediaRecorder) { rec = new MediaRecorder(this.stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(); }
      } catch (e) { rec = null; }
      let voicedSeen = false, lastVoice = 0, stopped = false;
      return new Promise(resolve => {
        const finish = () => {
          if (stopped) return; stopped = true; clearInterval(iv);
          const done = url => { this.stream.getTracks().forEach(t => t.stop()); resolve({ frames, url, peak: Math.max(0, ...frames.map(f => f.rms)), noise: fa.noise }); };
          if (rec && rec.state !== 'inactive') { rec.onstop = () => done(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) : null); rec.stop(); }
          else done(null);
        };
        this._finish = finish;
        const iv = setInterval(() => {
          an.getFloatTimeDomainData(raw);
          const f = fa.frame(raw, performance.now() - t0);
          frames.push(f);
          if (f.f0) { voicedSeen = true; lastVoice = f.t; }
          onFrame && onFrame(frames);
          if (f.t > maxMs || (autoStop && voicedSeen && f.t - lastVoice > 1300)) finish();
        }, 33);
      });
    },
    stop() { this._finish && this._finish(); },
  };

  global.Audio2 = { TTS, Recognizer, Pitch, detectPitch, frameAnalyser, _dedupe: dedupe, _candidates: candidates };
  if (typeof module !== 'undefined') module.exports = global.Audio2;
})(typeof window !== 'undefined' ? window : globalThis);
