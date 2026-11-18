/* Conversations: the DialogueEngine interface, the scripted engine, and scene checks. Pure logic, no DOM.
 *
 * DialogueEngine
 *   engine.start(scene, learner)    -> Turn
 *   engine.reply(state, utterance)  -> Turn      utterance = { text, via: 'choice' | 'typed' | 'speech', helped? }
 *   Turn = { state, line, options, distractors, end, left, feedback? }
 *     line: what the app says ({ id, zh, en, sy }); on the last line `end` is true and options are empty
 *     options: acceptable learner replies ({ id, zh, en, sy, alt, d, next }); distractors: near-misses with `why` and `of` (reply id)
 *     left: fewest replies still needed to finish the scene
 *     feedback: { via, matched, form, q, score, exact, correction, distractor, heard, typed, retry }
 *       matched is the reply understood, form the wording compared (the reply or one of its alternatives).
 *       q is the grade for `matched` (0 wrong, 1 almost or helped, 2 right, 3 easy); with `retry` nothing advanced.
 *   learner = { level, met: Set of words met, due: Set of reply ids due } lets an engine favour useful replies.
 */
(function (global) {
  'use strict';
  const ZH = () => global.ZH || (typeof require !== 'undefined' ? require('./chinese.js') : null);
  const isHan = c => /\p{Script=Han}/u.test(c);
  /** Text reduced to letters and digits, for comparing sentences regardless of punctuation. */
  const norm = s => [...String(s || '')].filter(c => /[\p{L}\p{N}]/u.test(c)).join('').toLowerCase();

  // ---------------- scene graph ----------------
  const LEFT = new WeakMap();
  /** Fewest learner replies from node `key` to the end of the scene. */
  function stepsLeft(scene, key) {
    let memo = LEFT.get(scene); if (!memo) LEFT.set(scene, memo = {});
    const go = (k, seen) => {
      if (k in memo) return memo[k];
      const n = scene.nodes[k]; if (!n || seen.has(k)) return Infinity;
      if (n.end) return memo[k] = 0;
      seen.add(k); const v = 1 + Math.min(...n.replies.map(r => go(r.next, seen))); seen.delete(k);
      return memo[k] = v;
    };
    return go(key, new Set());
  }
  /** Shortest and longest number of learner replies from start to end. */
  function pathLengths(scene) {
    const lo = {}, hi = {};
    const go = k => {
      if (k in lo) return; const n = scene.nodes[k];
      if (n.end) { lo[k] = hi[k] = 0; return; }
      n.replies.forEach(r => go(r.next));
      lo[k] = 1 + Math.min(...n.replies.map(r => lo[r.next])); hi[k] = 1 + Math.max(...n.replies.map(r => hi[r.next]));
    };
    go(scene.start);
    return { min: lo[scene.start], max: hi[scene.start] };
  }
  /** Every complete route through a scene, as lists of reply ids (for tests and checks). */
  function paths(scene, k = scene.start) {
    const n = scene.nodes[k];
    if (n.end) return [[]];
    return n.replies.flatMap(r => paths(scene, r.next).map(p => [r.id, ...p]));
  }

  /**
   * Check a built scene. errors: anything that would break a conversation (missing gloss, dead end,
   * unreachable node, loop, a distractor that is really an accepted reply). warnings: characters above
   * the scene's level when `chars` (level -> Set of allowed characters) is given.
   */
  function validateScene(sc, { chars } = {}) {
    const errors = [], warnings = [], E = m => errors.push(`${sc.id || '?'}: ${m}`);
    if (!sc.id) E('scene has no id');
    if (![1, 2, 3].includes(sc.l)) E('level must be 1, 2 or 3');
    for (const f of ['title', 'en', 'who', 'intro']) if (!sc[f]) E(`missing ${f}`);
    const nodes = sc.nodes || {};
    if (!nodes[sc.start]) { E(`start node "${sc.start}" does not exist`); return { errors, warnings }; }
    const texts = [sc.title];
    for (const [k, n] of Object.entries(nodes)) {
      if (!n.zh || !n.en) E(`node ${k} needs Chinese and English`);
      texts.push(n.zh);
      if (n.end) continue;
      if (!n.replies || !n.replies.length) { E(`node ${k} is a dead end (no replies and not marked 'end')`); continue; }
      if (n.replies.length < 2) E(`node ${k} needs at least 2 acceptable replies`);
      const ok = new Set(n.replies.flatMap(r => [r.zh, ...(r.alt || []).map(a => a.zh)]).map(norm));
      n.replies.forEach((r, i) => {
        const at = `node ${k} reply ${i + 1}`;
        if (!r.zh || !r.en) E(`${at} needs Chinese and English`);
        if (!nodes[r.next]) E(`${at} leads to missing node "${r.next}"`);
        if (!r.d || r.d.length !== 3) E(`${at} needs exactly 3 distractors`);
        texts.push(r.zh, ...(r.alt || []).map(a => a.zh));
        const seen = new Set();
        (r.d || []).forEach(d => {
          if (!d.zh || !d.why) E(`${at}: distractor needs Chinese and a reason`);
          if (ok.has(norm(d.zh))) E(`${at}: distractor "${d.zh}" is an accepted reply`);
          if (seen.has(norm(d.zh))) E(`${at}: distractor "${d.zh}" appears twice`);
          seen.add(norm(d.zh)); texts.push(d.zh);
        });
      });
    }
    if (errors.length) return { errors, warnings };
    // reachable from start, no loops
    const state = {}, order = [];
    const visit = k => {
      if (state[k] === 2) return; if (state[k] === 1) { E(`loop through node ${k}`); return; }
      state[k] = 1; nodes[k].end || nodes[k].replies.forEach(r => visit(r.next)); state[k] = 2; order.push(k);
    };
    visit(sc.start);
    for (const k of Object.keys(nodes)) if (!state[k]) E(`node ${k} can't be reached from "${sc.start}"`);
    if (errors.length) return { errors, warnings };
    if (chars && chars[sc.l]) {
      const above = new Map();
      for (const t of texts) for (const c of t) if (isHan(c) && !chars[sc.l].has(c) && !above.has(c)) above.set(c, t);
      for (const [c, t] of above) warnings.push(`${sc.id}: ${c} is above HSK ${sc.l} (in ${t})`);
    }
    return { errors, warnings, ...pathLengths(sc) };
  }

  /** All learner replies of all scenes: these are the items graded in the `converse` mode. */
  const replyItems = scenes => scenes.flatMap(sc => Object.values(sc.nodes).flatMap(n => n.end ? [] : n.replies.map(r => Object.assign(r, { scene: sc.id, l: sc.l }))));

  // ---------------- matching ----------------
  const formsOf = node => node.replies.flatMap(r => [{ r, zh: r.zh, sy: r.sy }, ...(r.alt || []).map(a => ({ r, zh: a.zh, sy: a.sy }))]);
  const missesOf = node => node.replies.flatMap(r => r.d.map(d => ({ r, d, zh: d.zh, sy: d.sy })));
  /** Best speech-recognition score of `text` against any accepted reply (to choose among recogniser guesses). */
  const speechScore = (options, text) => Math.max(0, ...options.flatMap(r => [r, ...(r.alt || [])]).map(f => ZH().compareSpeech(f.sy, text).score));

  const SPEECH_OK = 0.9, SPEECH_NEAR = 0.6;
  function match(node, { text, via, helped }) {
    const forms = formsOf(node), misses = missesOf(node);
    let m = null;
    if (via === 'choice') {
      const n = norm(text), f = forms.find(f => norm(f.zh) === n), d = !f && misses.find(x => norm(x.zh) === n);
      if (f) m = { reply: f.r, form: f, q: 2, score: 1, exact: true };
      else if (d) m = { reply: d.r, form: d.r, q: 0, score: 0, exact: false, distractor: d.d };
    }
    if (!m && via === 'speech') {
      const best = (list) => list.map(f => [f, ZH().compareSpeech(f.sy, text)]).sort((a, b) => b[1].score - a[1].score)[0];
      const [f, heard] = best(forms), [mf, mheard] = best(misses);
      if (mheard.score >= SPEECH_OK && mheard.score > heard.score) m = { reply: mf.r, form: mf.r, q: 0, score: heard.score, exact: false, distractor: mf.d, heard: mheard };
      else if (heard.score >= SPEECH_OK) m = { reply: f.r, form: f, q: 2, score: heard.score, exact: heard.score === 1, heard };
      else if (heard.score >= SPEECH_NEAR) m = { reply: f.r, form: f, q: 1, score: heard.score, exact: false, heard };
      else m = { reply: f.r, form: f, q: null, score: heard.score, exact: false, heard, retry: true };
    }
    if (!m) { // typed, or a choice that matches nothing on the list
      const t = ZH().checkTyped(text, forms), td = ZH().checkTyped(text, misses);
      if (td.exact && !t.exact) m = { reply: td.answer.r, form: td.answer.r, q: 0, score: t.ratio, exact: false, distractor: td.answer.d, typed: t };
      else m = { reply: t.answer.r, form: t.answer, q: t.exact ? (t.toneErr ? 3 : 2) : t.close ? 1 : 0, score: t.ratio, exact: t.exact, typed: t };
    }
    if (helped && m.q > 1) m.q = 1;
    return m;
  }

  // ---------------- the scripted engine ----------------
  class ScriptedEngine {
    start(scene, learner = {}) { return this.turn({ scene, node: scene.start, learner, history: [] }); }
    reply(state, utt) {
      const node = state.scene.nodes[state.node];
      if (node.end) throw new Error('The scene has ended');
      const m = match(node, utt);
      const feedback = { via: utt.via, matched: m.reply, form: { zh: m.form.zh, sy: m.form.sy }, q: m.q, score: m.score, exact: m.exact, correction: m.exact ? null : m.reply,
        distractor: m.distractor || null, heard: m.heard || null, typed: m.typed || null, retry: !!m.retry };
      if (m.retry) return this.turn(state, feedback);
      return this.turn({ ...state, node: m.reply.next, history: [...state.history, { node: state.node, reply: m.reply.id, via: utt.via, q: m.q, text: utt.text }] }, feedback);
    }
    turn(state, feedback) {
      const node = state.scene.nodes[state.node], L = state.learner || {};
      const pri = r => (L.due && L.due.has(r.id) ? 0 : 2) + (L.met && r.w && r.w.some(w => !L.met.has(w)) ? 0 : 1);
      const options = node.end ? [] : node.replies.map((r, i) => [pri(r), i, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
      return { state, line: node, options, distractors: options.flatMap(r => r.d.map(d => ({ ...d, of: r.id }))),
        end: !!node.end, left: stepsLeft(state.scene, state.node), feedback };
    }
  }

  const api = { ScriptedEngine, validateScene, pathLengths, paths, stepsLeft, replyItems, speechScore, match, norm };
  global.Dialogue = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
