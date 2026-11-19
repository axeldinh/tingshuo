/* Optional on-device speech-to-text for the pitch recorder (shadowing, word tones): a small multilingual
 * speech-recognition model, run in the browser on the audio the recorder has just captured, so the words of a take
 * can be checked where the browser's own recognition cannot run alongside the pitch capture (often iPhone, some
 * Android phones) or is missing. See app.js, "word check for the pitch recorder".
 *
 * Off by default. Turned on in Settings (a one-time download, then offline); loaded the first time a take is checked.
 * Not in the service-worker precache: the library sits in the cache it shares with meaning.js, the model files in the
 * library's own cache, and Settings can remove them.
 *
 *   Transcribe.load()                      -> Promise<boolean>        browser: fetch the library and model (cached)
 *   Transcribe.loadForNode(dir, lib, o)    -> Promise<boolean>        Node (evaluation): a local copy of the model
 *   Transcribe.decodeBlob(blob)            -> Promise<Float32Array>   a recording, as 16 kHz mono
 *   Transcribe.check(samples, sy, ZH)      -> Promise<comparison>     ZH.compareSpeech of what was heard against the
 *                                                                     target, each difference marked `sure` or not
 *   Transcribe.hear(samples, target)       -> Promise<{ raw, ms, score(texts) }>   the transcript alone
 * Output is forced to Chinese: a simplified-Chinese prompt, no Latin letters; the app's clean-up (traditional
 * characters, digits) runs on it as on any recogniser's text. The target never steers what is heard: it is only used
 * afterwards, to score the differences.
 */
(function (global) {
  'use strict';
  // Same library as meaning.js (one download serves both); model files from its default model hub.
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';
  const MODEL = 'Xenova/whisper-base';
  // library 0.9 + runtime 21.6 + model 76.9 (int8) + tokenizer and config 4.4 MB; the runtime travels compressed (5 MB)
  const SIZE = { download: 87, stored: 104 };
  const PROMPT = '以下是普通话的句子。'; // a short simplified-Chinese context: the model then writes simplified characters

  let lib = null, processor = null, tokenizer = null, model = null, state = 'off', SPECIAL = null, LATIN = null;

  async function init(L, id, { prompt = PROMPT, ...opts } = {}) {
    lib = L;
    processor = await L.AutoProcessor.from_pretrained(id);
    tokenizer = await L.AutoTokenizer.from_pretrained(id);
    model = await L.WhisperForConditionalGeneration.from_pretrained(id, { dtype: 'q8', ...opts });
    const ids = tokenizer.model.tokens_to_ids, sp = s => ids.get(s);
    SPECIAL = { prev: sp('<|startofprev|>'), sot: sp('<|startoftranscript|>'), zh: sp('<|zh|>'), task: sp('<|transcribe|>'), nots: sp('<|notimestamps|>'), eot: sp('<|endoftext|>') };
    // never write Latin letters: a short Chinese word is otherwise often heard as English ("bye" for 卖)
    LATIN = []; for (const [tok, i] of ids) if (/[A-Za-z]/.test(tok) && !/^<\|.*\|>$/.test(tok)) LATIN.push([i]);
    SPECIAL.prompt = [...(prompt ? [SPECIAL.prev] : []), ...(prompt ? tokenizer.encode(' ' + prompt, { add_special_tokens: false }) : []), SPECIAL.sot, SPECIAL.zh, SPECIAL.task, SPECIAL.nots];
  }

  /** Log-probability of each text (characters only) after the prompt, from one decoder pass each. */
  async function score(enc, texts) {
    const out = [];
    for (const t of texts) {
      const ids = [...SPECIAL.prompt, ...tokenizer.encode(t, { add_special_tokens: false }), SPECIAL.eot];
      const r = await model.forward({ encoder_outputs: enc, decoder_input_ids: new lib.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]) });
      const L = r.logits, V = L.dims[2], d = L.data; let lp = 0;
      for (let k = SPECIAL.prompt.length; k < ids.length; k++) {
        const off = (k - 1) * V; let m = -Infinity; for (let v = 0; v < V; v++) if (d[off + v] > m) m = d[off + v];
        let s = 0; for (let v = 0; v < V; v++) s += Math.exp(d[off + v] - m);
        lp += d[off + ids[k]] - m - Math.log(s);
      }
      out.push(lp);
    }
    return out;
  }

  /**
   * Texts to score for a comparison: the target first, then for each difference the target with that one difference
   * taken from what was heard (a different character, a syllable left out, an extra one put in).
   */
  function variants(cmp) {
    const T = cmp.syl.map(s => s.c), out = [T.join('')];
    cmp.syl.forEach((s, i) => { if (s.st === 'ok') return; const t = T.slice(); t[i] = s.st === 'miss' ? '' : s.heard.c; out.push(t.join('')); });
    cmp.extra.forEach(e => { const t = T.slice(); t.splice(e.after + 1, 0, e.c); out.push(t.join('')); });
    return [...new Set(out)];
  }
  /**
   * A difference is `sure` when the model, reading the same audio, finds the sentence with that difference at least
   * e^THETA times as likely as the target itself. Otherwise the audio fits the target about as well, and the difference
   * is more likely the model's own slip (short words, unusual sentences) than the learner's. Tuned on the evaluation
   * set (tools/word-data.js, test/word-eval.js).
   */
  const THETA = 0;
  function mark(cmp, scores, theta = THETA, single = false) {
    const T = cmp.syl.map(s => s.c), base = scores[T.join('')];
    // a single syllable is too short to tell: the model mishears a third of right ones as another word
    const sure = t => (T.length > 1 || single) && base != null && scores[t] != null && scores[t] - base >= theta;
    cmp.syl.forEach((s, i) => { if (s.st === 'ok') return; const t = T.slice(); t[i] = s.st === 'miss' ? '' : s.heard.c; s.sure = sure(t.join('')); });
    cmp.extra.forEach(e => { const t = T.slice(); t.splice(e.after + 1, 0, e.c); e.sure = sure(t.join('')); });
    return cmp;
  }

  const Transcribe = {
    MODEL, LIB, SIZE,
    get state() { return state; },
    get ready() { return state === 'ready'; },
    supported: () => typeof WebAssembly === 'object' && typeof global.caches !== 'undefined' && typeof global.fetch === 'function' && !!(global.OfflineAudioContext || global.webkitOfflineAudioContext),

    async load() {
      if (model) return true;
      if (!Transcribe.supported()) { state = 'unsupported'; return false; }
      state = 'loading';
      try {
        const L = await import(/* webpackIgnore: true */ LIB);
        L.env.allowLocalModels = false; L.env.useBrowserCache = true;
        await init(L, MODEL, { device: 'wasm' });
        state = 'ready'; return true;
      } catch (e) { state = 'failed'; Transcribe.error = e; model = null; return false; }
    },
    async loadForNode(dir, libPath = process.env.TRANSFORMERS_PATH || '@huggingface/transformers', opts = {}) {
      if (model) return true;
      if (!dir) return false;
      try {
        const L = await import(libPath.startsWith('/') ? 'file://' + libPath : libPath);
        L.env.allowRemoteModels = false; L.env.localModelPath = dir;
        const { model: id = MODEL, ...rest } = opts; // another size of the model, for measurements
        await init(L, id, rest);
        state = 'ready'; return true;
      } catch (e) { state = 'failed'; Transcribe.error = e; return false; }
    },

    /** A recorded blob (webm/opus, mp4/aac…) as 16 kHz mono samples. */
    async decodeBlob(blob) {
      const AC = global.AudioContext || global.webkitAudioContext, OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      const buf = await blob.arrayBuffer(), ctx = new AC();
      try {
        const audio = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
        const n = Math.ceil(audio.duration * 16000), off = new OAC(1, Math.max(1, n), 16000);
        const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
        return (await off.startRendering()).getChannelData(0);
      } finally { try { ctx.close(); } catch (e) {} }
    },

    /**
     * What was said in `samples` (16 kHz mono, ideally trimmed to the speech with a little margin): the transcript, and
     * score(texts) for the log-probability of other readings of the same audio. `target` only bounds the length.
     */
    async hear(samples, target) {
      if (!model) throw new Error('not loaded');
      const t0 = Date.now();
      const { input_features } = await processor(samples);
      // the encoder runs once; its output serves the transcript and every score
      const r0 = await model.sessions.model.run({ input_features: input_features.ort_tensor });
      const enc = new lib.Tensor(r0.last_hidden_state);
      const n = target ? [...target].length : 12;
      const out = await model.generate({ inputs: input_features, encoder_outputs: enc, decoder_input_ids: SPECIAL.prompt, bad_words_ids: LATIN, max_new_tokens: Math.min(80, 3 * n + 12) });
      const raw = tokenizer.decode(out.tolist()[0].map(Number).slice(SPECIAL.prompt.length), { skip_special_tokens: true });
      return { raw, t0, ms: Date.now() - t0, score: texts => score(enc, texts) };
    },

    /**
     * The word check of one recording: transcribe, compare with the target (ZH.compareSpeech), then score each
     * difference (see mark). sy: the target's syllable data. -> compareSpeech's result, each difference with `sure`,
     * plus `text` (as heard) and `ms`.
     */
    async check(samples, sy, ZH) {
      const T = sy.filter(x => x.p && !x.er).map(x => x.c).join('');
      const r = await Transcribe.hear(samples, T);
      const cmp = ZH.compareSpeech(sy, ZH.normalizeHeard(r.raw));
      const texts = variants(cmp);
      if (texts.length > 1 && T.length > 1) { const lp = await r.score(texts); cmp.scores = Object.fromEntries(texts.map((t, i) => [t, lp[i]])); }
      mark(cmp, cmp.scores || {});
      cmp.ms = Date.now() - r.t0; cmp.text = r.raw;
      return cmp;
    },
    variants, mark, THETA,

    /** Forget the downloaded model files (the shared library is kept while the other optional model uses it). */
    async remove({ keepLibrary = false } = {}) {
      model = null; state = 'off';
      await dropFiles(MODEL, keepLibrary);
    },
    storedMB: () => storedMB(MODEL),
  };

  // ---- the files of one model in the library's cache ('transformers-cache'); the library itself in 'tingshuo-meaning'
  async function dropFiles(model, keepLibrary) {
    if (!global.caches) return;
    try {
      const c = await caches.open('transformers-cache');
      for (const req of await c.keys()) if (req.url.includes('/' + model + '/')) await c.delete(req);
      if (!keepLibrary) await caches.delete('tingshuo-meaning');
    } catch (e) {}
  }
  async function storedMB(model) {
    if (!global.caches || !(await caches.has('transformers-cache'))) return null;
    let bytes = 0, any = false;
    const c = await caches.open('transformers-cache');
    for (const req of await c.keys()) {
      if (!req.url.includes('/' + model + '/')) continue; any = true;
      const r = await c.match(req), n = +(r && r.headers.get('content-length')); if (n) bytes += n;
    }
    return any ? Math.round(bytes / 1e6) : null;
  }
  Transcribe._dropFiles = dropFiles; Transcribe._storedMB = storedMB;

  global.Transcribe = Transcribe;
  if (typeof module !== 'undefined') module.exports = Transcribe;
})(typeof window !== 'undefined' ? window : globalThis);
