/* Conversations: the DialogueEngine interface, the scripted engine, and scene checks. Pure logic, no DOM.
 *
 * DialogueEngine
 *   engine.start(scene, learner)    -> Turn
 *   engine.reply(state, utterance)  -> Turn      utterance = { text, via: 'choice' | 'typed' | 'speech', helped? }
 *   Turn = { state, line, options, distractors, end, left, feedback? }
 *     line: what the app says ({ id, zh, en, sy }); on the last line `end` is true and options are empty
 *     options: acceptable learner replies ({ id, zh, en, sy, alt, d, next }); distractors: near-misses with `why` and `of` (reply id)
 *     left: fewest replies still needed to finish the scene
 *     feedback: { via, matched, form, q, score, exact, correction, distractor, heard, typed, retry, own, missing, extraNeg, partial, swapped, said, meaning }
 *       matched is the reply understood, form the wording compared (the reply or one of its alternatives).
 *       For speech: own means the learner used their own wording (show the scripted one as another way to say it);
 *       missing lists the key words not heard (with retry: what to add); extraNeg: a 不/没 the reply doesn't have;
 *       partial: cut off before the end; swapped: people or numbers in the wrong order; meaning: matched by the
 *       optional meaning model (see meaning.js) rather than by words.
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
  const formsOf = node => node.replies.flatMap(r => [{ r, zh: r.zh, sy: r.sy, ws: r.ws }, ...(r.alt || []).map(a => ({ r, zh: a.zh, sy: a.sy, ws: a.ws }))]);
  const missesOf = node => node.replies.flatMap(r => r.d.map(d => ({ r, d, zh: d.zh, sy: d.sy, ws: d.ws })));

  // ---------------- understanding a spoken reply ----------------
  // The recogniser gives text, not sounds: a homophone, a dropped particle, a filler or a word said in another place
  // is normal. A spoken reply is compared word by word with each acceptable wording: words weigh by how much meaning
  // they carry, a few everyday synonyms count, extra words cost little (unless they say 不), and word order is free
  // except where it changes who does what. Near-misses written for the scene are compared strictly (in order, with
  // tones), so a learner who says one of them cleanly hears why it is wrong.
  const PARTICLE = new Set('了吗呢吧的啊呀着过嘛啦得地哦哇');
  const FILLER = new Set('嗯呃额唉诶欸噢喔哎嘿啊');
  const FILLER_WORDS = ['那个', '这个', '就是', '然后', '那么', '怎么说'];
  const NEG = new Set('不没别');
  const NEG_FREE = ['对不起', '不客气', '差不多', '没关系', '不错', '没问题', '不好意思', '了不起', '不用谢'];
  const PRONOUN = new Set(['我', '你', '您', '他', '她', '它', '我们', '你们', '他们', '她们', '咱们']);
  const LIGHT = { 谢谢: .4, 请: .3, 请问: .3, 喂: .3, 你好: .4, 您好: .4, 是: .6, 在: .7, 和: .6, 就: .4, 也: .5, 个: .5, 都: .7, 还: .7, 那: .4,
    很: .35, 太: .35, 真: .35, 挺: .35, 非常: .35, 特别: .35, 有点儿: .5, 一点儿: .6, 一下: .4, 好的: .5, 可能: .6, 应该: .6 };
  const TIME = /^(今天|明天|昨天|后天|前天|上午|下午|中午|晚上|早上|现在|刚才|以后|以前|去年|明年|今年|星期.|一会儿)$/;
  const NUM = /^[零一二三四五六七八九十百千万两半几]+$/;
  // Everyday ways to say the same word (all within reach of HSK 1-3 learners). Applied only when the wording lacks the word.
  const SYN = { 是: ['对'], 想: ['要'], 要: ['想'], 能: ['可以'], 可以: ['能', '行'], 喜欢: ['爱'], 好的: ['好啊', '好吧', '行', '可以', '没问题', '好'], 对: ['是的', '对的', '没错', '是'],
    谢谢: ['多谢', '谢了'], 再见: ['拜拜'], 您: ['你'], 您好: ['你好'], 不要: ['不用'], 后面: ['后边'], 前面: ['前边'], 里面: ['里边'], 外面: ['外边'],
    旁边: ['边上'], 左边: ['左面'], 右边: ['右面'], 有点儿: ['有一点儿', '有一点', '有点'], 一点儿: ['一点', '点儿', '点'], 很: ['非常', '特别', '真', '挺', '太'], 太: ['非常', '特别', '真', '很'],
    我们: ['咱们'], 星期: ['礼拜', '周'], 星期六: ['礼拜六', '周六'], 星期天: ['星期日', '礼拜天', '礼拜日', '周日'], 但是: ['可是', '不过'], 可是: ['但是', '不过'],
    妻子: ['太太', '爱人', '老婆'], 妈妈: ['妈'], 爸爸: ['爸'], 知道: ['明白'], 没有: ['没'], 工作: ['上班'], 上班: ['工作'], 公共汽车: ['公交车', '公交'],
    走路: ['走着'], 向: ['往'], 对不起: ['不好意思', '抱歉'], 一会儿: ['待会儿', '等会儿', '一会'], 块: ['元'], 这儿: ['这里'], 那儿: ['那里'], 哪儿: ['哪里'] };
  const SAME = [new Set('二两'), new Set('他她它'), new Set('您你')];
  const sameChar = (a, b) => a === b || SAME.some(s => s.has(a) && s.has(b));

  const PREP = new WeakMap();
  /** A wording cut into weighted words, each with its target syllables (cached per form). */
  function prepare(form) {
    let p = PREP.get(form); if (p) return p;
    const Z = ZH(), sy = form.sy.filter(x => x.p);
    // words from the build (ws); numbers said together are one word
    const raw = form.ws && form.ws.length ? form.ws : [...form.zh];
    const ws = []; for (const w of raw) { if (NUM.test(w) && ws.length && NUM.test(ws[ws.length - 1])) ws[ws.length - 1] += w; else ws.push(w); }
    const T = [], units = []; let k = 0, clause = 0;
    for (const w of ws) {
      const han = [...w].filter(Z.isHan);
      if (!han.length) { if (/[，。！？；,.!?;…]/.test(w)) clause++; continue; }
      const u = { text: w, syl: [], clause, cls: NEG.has(w) || /^(不是|没有|不要|别)$/.test(w) ? 'neg' : NUM.test(w) ? 'num' : PRONOUN.has(w) ? 'pron' : PARTICLE.has(w) ? 'part' : TIME.test(w) ? 'time' : 'word' };
      u.w = u.cls === 'neg' ? 2 / [...w].length : u.cls === 'num' ? 1.5 : u.cls === 'pron' ? .5 : u.cls === 'part' ? .25 : LIGHT[w] != null ? LIGHT[w] : 1;
      for (const c of han) {
        while (k < sy.length && sy[k].c !== c) k++;
        if (k >= sy.length) break;
        const x = sy[k++]; if (x.er) continue;
        u.syl.push(T.length); T.push({ c: x.c, b: Z.stripTone(x.p), t: x.t, s: x.s, ref: x, w: u.w });
      }
      if (u.syl.length) units.push(u);
    }
    p = { T, units, W: T.reduce((a, x) => a + x.w, 0), negs: negCount(form.zh) };
    PREP.set(form, p); return p;
  }
  const negCount = s => { for (const f of NEG_FREE) s = s.split(f).join(''); s = s.replace(/(\p{Script=Han})[不没]\1/gu, '$1'); return [...s].filter(c => NEG.has(c)).length; };

  /** How much a heard syllable weighs when it is not part of the reply. */
  const extraWeight = h => h.filler ? 0 : NEG.has(h.c) ? 2 : PARTICLE.has(h.c) ? .25 : 1;
  /** The heard text as syllables, fillers marked (a filler word only counts as one when the wording doesn't use it). */
  function heardSyllables(text, zh) {
    // 806 is a room number said digit by digit unless the wording counts in hundreds
    let s = text.replace(/\d+/g, d => (d.length >= 3 && !/[百千]/.test(zh)) || (d.length > 1 && d[0] === '0') ? [...d].map(x => '零一二三四五六七八九'[x]).join('') : ZH().numToZh(d)); const fill = [];
    for (const f of FILLER_WORDS) if (!zh.includes(f)) { let i = s.indexOf(f); while (i >= 0) { fill.push([i, f.length]); i = s.indexOf(f, i + f.length); } }
    const H = []; let pos = 0;
    for (const ch of s) {
      if (ZH().isHan(ch)) {
        for (const x of ZH().syllablesOf(ch)) H.push({ ...x, filler: FILLER.has(ch) && !zh.includes(ch) || fill.some(([a, n]) => pos >= a && pos < a + n) });
      }
      pos += ch.length;
    }
    return H;
  }
  /** The heard text with this wording's synonyms swapped in, and whether any were. */
  function withSynonyms(text, p) {
    let s = text, used = false;
    for (const u of p.units) {
      const alts = SYN[u.text]; if (!alts || s.includes(u.text)) continue;
      const a = alts.find(a => s.includes(a)); if (a) { s = s.replace(a, u.text); used = true; }
    }
    return { s, used };
  }
  const sylMatch = (t, h) => sameChar(t.c, h.c) ? 'ok' : t.b === h.b ? (t.t === h.t || !t.t || !h.t ? 'ok' : 'tone') : null;

  /**
   * Compare heard text with one wording, word by word in any order.
   * recall: weighted share of the wording understood; prec: weighted share of what was said that the wording explains;
   * tone: weighted share heard with another tone; flags for a 不/没 that isn't in the wording, a missing number or
   * negation, and swapped people or numbers (我请你 / 你请我).
   */
  function understand(form, text) {
    const p = prepare(form), syn = withSynonyms(text, p), H = heardSyllables(syn.s, form.zh), used = new Array(H.length).fill(false);
    const st = p.T.map(() => null), at = p.T.map(() => -1);
    const order = p.units.slice().sort((a, b) => b.syl.length - a.syl.length || b.w - a.w);
    let got = 0, tone = 0; const missing = [], placed = [];
    for (const u of order) {
      const L = u.syl.length; let best = null;
      for (let s = 0; s + L <= H.length; s++) {
        let n = 0, ok = true; const res = [];
        for (let j = 0; j < L; j++) { const h = H[s + j], m = !used[s + j] && !h.filler ? sylMatch(p.T[u.syl[j]], h) : null; res.push(m); if (m) n++; }
        if (n && (!best || n > best.n)) best = { s, n, res };
        if (best && best.n === L) break;
      }
      if (!best || best.n * 2 < L) { missing.push(u); continue; }
      const part = best.n === L ? 1 : 0.6;
      best.res.forEach((m, j) => {
        const i = u.syl[j];
        if (m) { used[best.s + j] = true; st[i] = m; at[i] = best.s + j; got += p.T[i].w * part; if (m === 'tone') tone += p.T[i].w; }
      });
      if (best.n < L) missing.push(u);
      placed.push({ u, pos: best.s });
    }
    let usedW = 0, extraW = 0;
    H.forEach((h, j) => { if (used[j]) usedW += extraWeight(h); else extraW += extraWeight(h); });
    const heardNegs = negCount(syn.s);
    // people and numbers must keep their order within a clause
    let swapped = false;
    for (const a of placed) for (const b of placed) if (a.u.clause === b.u.clause && a.u.text !== b.u.text && a.u.syl[0] < b.u.syl[0] && a.pos > b.pos
      && ((a.u.cls === 'pron' && b.u.cls === 'pron') || (a.u.cls === 'num' && b.u.cls === 'num'))) swapped = true;
    const syl = p.T.map((x, i) => ({ ...x, st: st[i] || 'miss', heard: at[i] >= 0 ? H[at[i]] : undefined }));
    // a missing number or negation is a wrong answer when the rest of its clause was said (not when the clause was cut off)
    const saidClause = new Set(placed.filter(x => !missing.includes(x.u)).map(x => x.u.clause));
    return { recall: p.W ? got / p.W : 0, prec: usedW + extraW ? usedW / (usedW + extraW) : 0, tone: p.W ? tone / p.W : 0, syn: syn.used,
      negExtra: heardNegs > p.negs, critical: missing.filter(u => (u.cls === 'num' || u.cls === 'neg') && saidClause.has(u.clause)), missing, swapped, syl, said: H.filter(h => !h.filler).length };
  }

  /** Strict, in-order similarity (tones count): how a near-miss is told apart from the reply it imitates. */
  function strictSim(form, text) {
    const p = prepare(form), H = heardSyllables(withSynonyms(text, p).s, form.zh).filter(h => !h.filler), T = p.T;
    if (!T.length || !H.length) return 0;
    const m = T.length, n = H.length, dp = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
    const hit = (t, h) => sameChar(t.c, h.c) || (t.b === h.b && (t.t === h.t || !t.t || !h.t));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + (hit(T[i - 1], H[j - 1]) ? T[i - 1].w : 0));
    // walk back to weigh the heard syllables that matched
    let i = m, j = n, hw = 0;
    while (i > 0 && j > 0) {
      if (dp[i][j] === dp[i - 1][j]) i--; else if (dp[i][j] === dp[i][j - 1]) j--; else { hw += extraWeight(H[j - 1]); i--; j--; }
    }
    const R = dp[m][n] / p.W, Hw = H.reduce((a, h) => a + extraWeight(h), 0), P = Hw ? hw / Hw : 0;
    return R + P ? 2 * R * P / (R + P) : 0;
  }

  /** Recall-leaning F-score: what was said should cover the reply; extra words matter less. */
  const fbeta = (R, P) => R + P ? 5 * P * R / (4 * P + R) : 0;
  // Thresholds, tuned on the scenes not held out in test/speech-cases.js
  const SPEECH = { ok: 0.75, near: 0.55, tone: 0.12, prec: 0.35, miss: 0.8, clause: 1.5 };

  /** Understand a spoken reply at `node`. Returns the match the engine grades (see match()). */
  function matchSpeech(node, raw) {
    const text = ZH().normalizeHeard(raw), forms = formsOf(node), misses = missesOf(node);
    const said = heardSyllables(text, '').filter(h => !h.filler).length;
    const scored = forms.map(f => ({ f, u: understand(f, text) }))
      .map(x => ({ ...x, rank: fbeta(x.u.recall, x.u.prec) - (x.u.negExtra || x.u.critical.length ? 0.5 : 0) }))
      .sort((a, b) => b.rank - a.rank);
    const { f, u } = scored[0];
    const heard = { syl: u.syl, score: u.recall, heard: raw };
    const base = { reply: f.r, form: f, score: u.recall, heard, said: text };
    if (!said) return { ...base, q: null, exact: false, retry: true, missing: [] };
    // a near-miss said cleanly, closer than any acceptable wording
    const sf = Math.max(...forms.map(x => strictSim(x, text)));
    const dm = misses.map(x => ({ x, s: strictSim(x, text) })).sort((a, b) => b.s - a.s)[0];
    if (dm && dm.s >= SPEECH.miss && dm.s > sf + 0.01)
      return { reply: dm.x.r, form: dm.x.r, q: 0, score: u.recall, exact: false, distractor: dm.x.d, heard: { syl: understand(dm.x.r, text).syl, score: dm.s, heard: raw }, said: text };
    const keyMissing = u.missing.filter(m => m.w >= 1).sort((a, b) => b.w - a.w).map(m => m.text);
    const retry = extra => ({ ...base, q: null, exact: false, retry: true, missing: keyMissing, ...extra });
    if (u.negExtra) return retry({ extraNeg: true });
    if (u.critical.length) return retry({ missing: [...new Set([...u.critical.map(m => m.text), ...keyMissing])] });
    const exact = sf >= 0.999 && u.recall >= 0.999 && !u.syn;
    const own = !exact && (u.syn || u.prec < 0.9 || strictSim(f, text) < 0.85);
    if (u.recall >= SPEECH.ok) {
      const q = u.tone > SPEECH.tone || u.swapped || u.prec < SPEECH.prec ? 1 : 2;
      return { ...base, q, exact, own, swapped: u.swapped };
    }
    // cut off at a pause: a whole clause that carries meaning was said, and nothing else
    const p = prepare(f), clauses = [...new Set(p.units.map(x => x.clause))];
    const whole = clauses.some(c => { const us = p.units.filter(x => x.clause === c); return us.reduce((a, x) => a + x.w * x.syl.length, 0) >= SPEECH.clause && us.every(x => !u.missing.includes(x)); });
    if ((u.recall >= SPEECH.near && u.prec >= 0.5) || (whole && u.prec >= 0.75)) return { ...base, q: 1, exact: false, own, partial: true, missing: keyMissing };
    return retry();
  }

  /** How well `text` answers one of these replies (to choose among the recogniser's guesses). */
  function speechScore(options, text) {
    const m = matchSpeech({ replies: options }, text);
    return (m.retry ? 0 : m.distractor ? 1 : m.q === 1 ? 2 : 3) + (m.score || 0);
  }

  function match(node, { text, via, helped }) {
    const forms = formsOf(node), misses = missesOf(node);
    let m = null;
    if (via === 'choice') {
      const n = norm(text), f = forms.find(f => norm(f.zh) === n), d = !f && misses.find(x => norm(x.zh) === n);
      if (f) m = { reply: f.r, form: f, q: 2, score: 1, exact: true };
      else if (d) m = { reply: d.r, form: d.r, q: 0, score: 0, exact: false, distractor: d.d };
    }
    if (!m && via === 'speech') m = matchSpeech(node, text);
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
        distractor: m.distractor || null, heard: m.heard || null, typed: m.typed || null, retry: !!m.retry,
        own: !!m.own, missing: m.missing || [], extraNeg: !!m.extraNeg, partial: !!m.partial, swapped: !!m.swapped, said: m.said || null, meaning: m.meaning || null };
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
