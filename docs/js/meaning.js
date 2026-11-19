/* Optional meaning matching for spoken replies: a small Chinese sentence-embedding model, run on the device.
 *
 * Off by default. Turned on in Settings (a one-time download, then offline). Loaded only on the Conversation screen.
 * It is asked only when the word matcher (dialogue.js) could not take a reply and found no hard reason against it
 * (a near-miss of the scene, a 不 no reply has, a wrong number): then the reply whose meaning is closest is accepted
 * if it is clearly closest and closer than any reply to another line of the scene. A reply's own sentence with one
 * word swapped for another (咖啡 for 茶) must be closer still: such sentences look alike even when they mean otherwise.
 *
 *   Meaning.load()              -> Promise<boolean>   browser: fetch the library and model (cached by the browser)
 *   Meaning.loadForNode(dir)    -> Promise<boolean>   Node (evaluation and build): a local copy of the model files
 *   Meaning.prepare(scenes)     -> Promise            vectors for every reply (precomputed file, checked, or computed)
 *   Meaning.remember(text)      -> Promise            embed what was heard, so judge() can answer synchronously
 *   Meaning.judge(node, text)   -> { reply, form, sim, margin, other } | null
 */
(function (global) {
  'use strict';
  // The library is loaded from the CDN at an exact version; the model files come from its default model hub.
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';
  const MODEL = 'Xenova/bge-small-zh-v1.5';
  // library 0.9 + runtime 21.6 + model 24.0 + tokenizer 0.4 MB on the device; the runtime travels compressed (5 MB)
  const SIZE = { download: 30, stored: 47 };
  const CACHES = ['transformers-cache', 'tingshuo-meaning'];
  // Tuned on the scenes not held out in test/speech-cases.js
  const T = { sim: 0.75, frame: 0.85, margin: 0.02, other: 0 };

  let extractor = null, state = 'off';
  const vec = new Map(); // text -> Float32Array (unit length)
  const forms = new Map(); // node id -> [{ reply, zh }]; scene id -> [{ node, reply, zh }]
  const clean = s => String(s || '').replace(/[\s\p{P}]/gu, '');

  async function embed(texts) {
    const todo = [...new Set(texts.map(clean))].filter(t => t && !vec.has(t));
    for (let i = 0; i < todo.length; i += 32) {
      const part = todo.slice(i, i + 32), out = await extractor(part, { pooling: 'cls', normalize: true });
      const dim = out.dims[1], data = out.data;
      part.forEach((t, k) => vec.set(t, Float32Array.from(data.subarray(k * dim, (k + 1) * dim))));
    }
  }
  const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  /** Reply vectors stored at build time (int8, one scale per vector), if they match the model as loaded here. */
  async function usePrecomputed() {
    const P = global.REPLY_VECTORS; if (!P || P.model !== MODEL) return false;
    const raw = typeof atob === 'function' ? Uint8Array.from(atob(P.data), c => c.charCodeAt(0)) : new Uint8Array(Buffer.from(P.data, 'base64'));
    const q = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength), stored = new Map();
    P.texts.forEach((t, i) => { const v = new Float32Array(P.dim); for (let k = 0; k < P.dim; k++) v[k] = q[i * P.dim + k] * P.scale[i]; stored.set(t, v); });
    // the model files can change upstream: check a few against the model as loaded here before trusting them
    const probe = P.texts.filter((_, i) => i % Math.ceil(P.texts.length / 4) === 0);
    await embed(probe);
    if (!probe.every(t => cos(vec.get(t), stored.get(t)) > 0.98)) return false;
    for (const [t, v] of stored) if (!vec.has(t)) vec.set(t, v);
    return true;
  }

  const Meaning = {
    MODEL, LIB, SIZE, T,
    get state() { return state; },
    get ready() { return state === 'ready'; },
    supported: () => typeof WebAssembly === 'object' && typeof global.caches !== 'undefined' && typeof global.fetch === 'function',

    async load() {
      if (extractor) return true;
      if (!Meaning.supported()) { state = 'unsupported'; return false; }
      state = 'loading';
      try {
        const lib = await import(/* webpackIgnore: true */ LIB);
        lib.env.allowLocalModels = false; lib.env.useBrowserCache = true;
        extractor = await lib.pipeline('feature-extraction', MODEL, { dtype: 'q8', device: 'wasm' });
        state = 'loaded'; return true;
      } catch (e) { state = 'failed'; Meaning.error = e; return false; }
    },
    async loadForNode(dir, libPath = process.env.TRANSFORMERS_PATH || '@huggingface/transformers') {
      if (extractor) return true;
      if (!dir) return false;
      try {
        const lib = await import(libPath.startsWith('/') ? 'file://' + libPath : libPath);
        lib.env.allowRemoteModels = false; lib.env.localModelPath = dir;
        extractor = await lib.pipeline('feature-extraction', MODEL.split('/').pop(), { dtype: 'q8' });
        state = 'loaded'; return true;
      } catch (e) { state = 'failed'; Meaning.error = e; return false; }
    },
    /** Index the replies of every scene and make sure each has a vector. */
    async prepare(scenes) {
      for (const sc of scenes) {
        const all = [];
        for (const n of Object.values(sc.nodes)) {
          const list = n.end ? [] : n.replies.flatMap(r => [r.zh, ...(r.alt || []).map(a => a.zh)].map(zh => ({ node: n.id, reply: r, zh: clean(zh) })));
          forms.set(n.id, list); all.push(...list);
        }
        forms.set(sc.id, all);
      }
      const texts = [...new Set([...forms.values()].flat().map(f => f.zh))];
      Meaning.precomputed = await usePrecomputed();
      await embed(texts);
      if (state === 'loaded') state = 'ready';
    },
    remember: text => embed([text]),
    /** The reply closest in meaning to `text` at `node`, with how clearly it wins. Null when `text` was not remembered. */
    judge(node, text) {
      const h = vec.get(clean(text)), here = forms.get(node.id);
      if (!h || !here || !here.length) return null;
      const scene = forms.get(node.id.replace(/^c-([^-]+)-.*$/, '$1')) || here;
      const best = new Map(); // reply id -> best form
      for (const f of here) { const s = cos(h, vec.get(f.zh)); const b = best.get(f.reply.id); if (!b || s > b.sim) best.set(f.reply.id, { reply: f.reply, form: f, sim: s }); }
      const ranked = [...best.values()].sort((a, b) => b.sim - a.sim);
      const other = Math.max(-1, ...scene.filter(f => f.node !== node.id).map(f => cos(h, vec.get(f.zh))));
      const top = ranked[0];
      return { reply: top.reply, zh: top.form.zh, sim: top.sim, margin: top.sim - (ranked[1] ? ranked[1].sim : -1), other: top.sim - other };
    },
    /** Would judge() accept this? `swapped`: the heard text is a reply with a word swapped, so it must be closer still. */
    accepts(j, swapped) { return !!j && j.sim >= (swapped ? T.frame : T.sim) && j.margin >= T.margin && j.other >= T.other; },
    /** Forget the downloaded model files (Settings); the library, shared with transcribe.js, only with `keepLibrary` false. */
    async remove({ keepLibrary = false } = {}) {
      extractor = null; state = 'off'; vec.clear();
      if (!global.caches) return;
      try {
        const c = await caches.open(CACHES[0]);
        for (const req of await c.keys()) if (req.url.includes('/' + MODEL + '/')) await c.delete(req);
        if (!keepLibrary) await caches.delete(CACHES[1]);
      } catch (e) {}
    },
    /** Rough size of what is stored on this device, in MB (null when unknown). */
    async storedMB() {
      if (!global.caches) return null;
      let bytes = 0, any = false;
      for (const k of CACHES) {
        if (!(await caches.has(k))) continue; any = true;
        const c = await caches.open(k);
        for (const req of await c.keys()) { const r = await c.match(req); const n = +(r && r.headers.get('content-length')); if (n) bytes += n; }
      }
      return any ? Math.round(bytes / 1e6) : null;
    },
    _vectors: vec,
  };

  global.Meaning = Meaning;
  if (typeof module !== 'undefined') module.exports = Meaning;
})(typeof window !== 'undefined' ? window : globalThis);
