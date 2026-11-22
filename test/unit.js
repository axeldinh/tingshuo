const assert = require('assert');
globalThis.pinyinPro = require('pinyin-pro');
globalThis.window = globalThis; require('../docs/data/sentences.js');
const ZH = require('../docs/js/chinese.js');
const { createStore } = require('../docs/js/store.js');
const { createSRS } = require('../docs/js/srs.js');
const S = id => window.SENTENCES.find(s => s.zh === id);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

const buy = S('我买了三本书。');
t('speech: exact', () => assert.strictEqual(ZH.compareSpeech(buy.sy, '我买了三本书').score, 1));
t('speech: digits', () => assert.strictEqual(ZH.compareSpeech(buy.sy, '我买了3本书').score, 1));
t('speech: tone error 买→卖', () => { const r = ZH.compareSpeech(buy.sy, '我卖了三本书'); const e = r.syl.find(s => s.c === '买'); assert.strictEqual(e.st, 'tone'); assert.strictEqual(e.heard.t, 4); });
t('speech: missing word', () => { const r = ZH.compareSpeech(buy.sy, '我买三本书'); assert.strictEqual(r.syl.find(s => s.c === '了').st, 'miss'); });
t('speech: homophone counts ok', () => assert.strictEqual(ZH.compareSpeech(S('他喜欢鱼。').sy, '他喜欢于').score, 1));
t('typed: characters exact', () => assert(ZH.checkTyped('我买了三本书', [buy]).exact));
t('typed: toneless pinyin', () => assert(ZH.checkTyped('wo mai le san ben shu', [buy]).exact));
t('typed: tone numbers ok', () => { const r = ZH.checkTyped('wo3 mai3 le5 san1 ben3 shu1', [buy]); assert(r.exact && r.toneErr && !r.toneErr.length); });
t('typed: tone numbers wrong', () => { const r = ZH.checkTyped('wo3mai4le san1ben3shu1', [buy]); assert(!r.exact && r.toneErr.length === 1); });
t('typed: tone marks', () => assert(ZH.checkTyped('wǒ mǎi le sān běn shū', [buy]).exact));
t('typed: close', () => assert(ZH.checkTyped('我买三本书', [buy]).close));
const yd = S('这件衣服太贵了，有便宜一点儿的吗？');
t('typed: erhua variants', () => ['zhe jian yi fu tai gui le you pian yi yi dianr de ma', 'zhejianyifutaiguileyoupianyiyidianerdema', 'zhe jian yifu tai gui le you pianyi yidian de ma'].forEach(x => assert(ZH.checkTyped(x, [yd]).ratio > .95, x)));
t('typed: alternative answer', () => { const s = S('他是我的中国朋友。'); assert(ZH.checkTyped('他是我中国朋友', [s, ...s.alt]).exact); });
t('ü handling', () => assert(ZH.checkTyped('ta de nv er jin nian ba sui', [S('他的女儿今年八岁。')]).exact));
t('spoken tones 你好 / 不客气 / 一起', () => {
  assert.deepStrictEqual(ZH.spokenTones('你好').map(x => x.s), [2, 3]);
  assert.deepStrictEqual(ZH.spokenTones('一起').map(x => x.s), [4, 3]);
  assert.strictEqual(ZH.spokenTones('不客气')[0].s, 2);
});
t('markTone', () => { assert.strictEqual(ZH.markTone('hao', 3), 'hǎo'); assert.strictEqual(ZH.markTone('gui', 4), 'guì'); assert.strictEqual(ZH.markTone('lü', 4), 'lǜ'); assert.strictEqual(ZH.markTone('dou', 1), 'dōu'); });
t('every sentence has 3 distractors, all different from answer', () => window.SENTENCES.forEach(s => { assert.strictEqual(s.d.length, 3, s.id); s.d.forEach(d => assert.notStrictEqual(d.zh, s.zh, s.id)); }));
t('every sentence has a tone-drill syllable', () => window.SENTENCES.forEach(s => assert(s.sy.some(x => x.p && !x.er && !x.x && x.s >= 1), s.id)));

// store + sync merge
const mem = () => { let v = null; return { load: () => v, save: x => (v = x, true) }; };
t('store: put/get/remove', () => { const s = createStore(mem()); s.put('progress', 'a', { x: 1 }); assert.deepStrictEqual(s.get('progress', 'a'), { x: 1 }); s.remove('progress', 'a'); assert.strictEqual(s.get('progress', 'a'), undefined); });
t('store: merge two devices (LWW + event union)', () => {
  const A = createStore(mem()), B = createStore(mem());
  A.put('progress', 'p1', 'A-old'); A.log({ type: 'answer', q: 2 });
  B.put('progress', 'p2', 'B'); B.log({ type: 'answer', q: 0 });
  const later = B.snapshot(); later.records['progress/p1'] = { id: 'p1', col: 'progress', v: 'B-new', updatedAt: Date.now() + 1000, device: B.device };
  A.merge(later); B.merge(A.snapshot());
  assert.strictEqual(A.get('progress', 'p1'), 'B-new'); assert.strictEqual(B.get('progress', 'p1'), 'B-new');
  assert.strictEqual(A.events().length, 2); assert.strictEqual(B.events().length, 2);
  A.merge(B.snapshot()); assert.strictEqual(A.events().length, 2, 'idempotent');
});
t('store: backup code round trip', () => { const A = createStore(mem()); A.put('settings', 'rate', .7); const B = createStore(mem()); B.importCode(A.exportCode()); assert.strictEqual(B.get('settings', 'rate'), .7); });
t('store: changesSince', () => { const A = createStore(mem()); const t0 = Date.now() - 1; A.put('x', '1', 1); assert.strictEqual(A.changesSince(t0).records.length, 1); });
t('store: device-only records are never sent or taken', () => {
  const A = createStore(mem()), B = createStore(mem());
  A.put('settings', 'voice', 'Tingting'); A.put('settings', 'words', true); A.put('meta', 'liveWords', { state: 'no' }); A.put('settings', 'rate', .7);
  assert.deepStrictEqual(A.changesSince(0).records.map(r => r.id), ['rate']);
  B.put('settings', 'voice', 'Google'); B.merge(A.snapshot());
  assert.strictEqual(B.get('settings', 'voice'), 'Google'); assert.strictEqual(B.get('settings', 'words'), undefined); assert.strictEqual(B.get('settings', 'rate'), .7);
});
t('store: local() is saved but not synced or exported', () => {
  const ad = mem(), A = createStore(ad); A.local('sync', { token: 'secret' });
  assert.deepStrictEqual(createStore(ad).local('sync'), { token: 'secret' });
  assert(!A.exportCode().includes('secret') && !JSON.stringify(A.changesSince(0)).includes('secret'));
});
t('store: reset keeps the device and its local state, and records when', () => {
  const A = createStore(mem()), dev = A.device; A.put('progress', 'p', 1); A.local('sync', { s: 1 });
  A.resetAll(); assert.strictEqual(A.device, dev); assert.deepStrictEqual(A.local('sync'), { s: 1 }); assert(A.resetAt > 0); assert.strictEqual(A.get('progress', 'p'), undefined);
});
t('store: merge refuses newer data, accepts records as array or map', () => {
  const A = createStore(mem());
  assert.throws(() => A.merge({ schema: A.SCHEMA_VERSION + 1, records: [] }), /newer/);
  assert.deepStrictEqual(A.merge({ schema: 1, records: [{ id: 'a', col: 'x', v: 1, updatedAt: 5, device: 'd' }], events: [{ id: 'e', t: 1 }, { id: 'e', t: 1 }] }), { records: 1, events: 1 });
});
t('store: persists across reloads', () => { const ad = mem(); const A = createStore(ad); A.put('progress', 'z', 5); A.flush(); assert.strictEqual(createStore(ad).get('progress', 'z'), 5); });
t('srs: wrong answer comes back in 10 min, right in a day', () => {
  const st = createStore(mem()), srs = createSRS(st);
  const a = srs.grade('listen', 's001', 0); assert(a.due - Date.now() < 11 * 60e3);
  const b = srs.grade('listen', 's002', 2); assert(b.due - Date.now() > 0.9 * 864e5);
});
t('srs: session respects level & due', () => {
  const st = createStore(mem()), srs = createSRS(st);
  const s1 = srs.session('listen', window.SENTENCES, 10); assert.strictEqual(s1.length, 10); assert(s1.every(x => x.l === 1));
});
t('srs: level up', () => {
  const st = createStore(mem()), srs = createSRS(st);
  window.SENTENCES.filter(s => s.l === 1).forEach(s => srs.grade('listen', s.id, 2));
  assert.strictEqual(srs.checkLevelUp('listen', window.SENTENCES), 2);
});
const A2 = require('../docs/js/audio.js');
const tone = (f0, amp, sr = 24000, n = 1080) => Float32Array.from({ length: n }, (_, i) => amp * [1, 2, 3, 4, 5, 6].reduce((v, h) => v + Math.sin(2 * Math.PI * f0 * h * i / sr) / h, 0) / 2);
t('pitch: quiet phone-level voice is detected', () => { const r = A2.detectPitch(tone(180, 0.003), 24000); assert(r.f0 && Math.abs(r.f0 - 180) < 5, String(r.f0)); });
t('pitch: noise is not mistaken for voice', () => { for (let k = 0; k < 50; k++) assert(!A2.detectPitch(Float32Array.from({ length: 1080 }, () => 0.02 * (Math.random() * 2 - 1)), 24000).f0); });
// ---- levels & vocabulary: newbies and veterans ----
const { attachWords } = require('../docs/js/srs.js');
require('../docs/data/words.js');
attachWords(window.SENTENCES, window.WORDS);
const fresh = () => { const st = createStore(mem()); return { st, srs: createSRS(st) }; };
t('newbie: first session is HSK 1, each item brings a word not met yet', () => {
  const { srs } = fresh(); const s = srs.session('listen', window.SENTENCES, 10);
  assert(s.every(x => x.l === 1)); assert(s.every(x => x.w.length > 0));
});
t('veteran placed at HSK 3 gets HSK 3 from the first session, plus a few probes', () => {
  const { srs } = fresh(); srs.setLevel('listen', 3);
  const s = srs.session('listen', window.SENTENCES, 10);
  const l3 = s.filter(x => x.l === 3).length; assert(l3 >= 6 && l3 < 10, 'HSK3 items: ' + l3);
});
t('probe answered right is pushed three weeks out; wrong comes back soon', () => {
  const { srs } = fresh(); srs.setLevel('listen', 3);
  const s = srs.session('listen', window.SENTENCES, 10), probes = s.filter(x => x.l < 3);
  const right = srs.grade('listen', probes[0].id, 2), wrong = srs.grade('listen', probes[1].id, 0);
  assert(right.due - Date.now() > 20 * 864e5); assert(wrong.due - Date.now() < 864e5);
});
t('placed too high: steps back a level, keeps reviews of harder items', () => {
  const { srs } = fresh(); srs.setLevel('listen', 3);
  const hard = window.SENTENCES.filter(x => x.l === 3).slice(0, 12);
  hard.forEach(x => srs.grade('listen', x.id, 0));
  assert.strictEqual(srs.checkLevelDown('listen', window.SENTENCES), 2);
  assert.strictEqual(srs.level('listen'), 2);
  const realNow = Date.now; Date.now = () => realNow() + 20 * 60e3; // 20 minutes later: the misses are due
  try { assert(srs.session('listen', window.SENTENCES, 10).some(x => x.l === 3)); } finally { Date.now = realNow; }
});
t('doing well at a level does not step back', () => {
  const { srs } = fresh(); srs.setLevel('listen', 2);
  window.SENTENCES.filter(x => x.l === 2).slice(0, 16).forEach((x, i) => srs.grade('listen', x.id, i % 4 ? 2 : 0));
  assert.strictEqual(srs.checkLevelDown('listen', window.SENTENCES), null);
});
t('a learner who keeps practising meets every HSK 1-3 word', () => {
  const { srs } = fresh();
  for (let k = 0; k < 120; k++) {
    srs.session('listen', window.SENTENCES, 10).forEach(x => srs.grade('listen', x.id, 2));
    srs.checkLevelUp('listen', window.SENTENCES);
  }
  const v = srs.vocab(window.WORDS);
  [1, 2, 3].forEach(l => assert.strictEqual(v[l].met, v[l].total, `HSK ${l}: ${v[l].met}/${v[l].total}`));
});
t('a veteran placed at HSK 3 also meets every lower-level word', () => {
  const { srs } = fresh(); srs.setLevel('listen', 3);
  for (let k = 0; k < 120; k++) srs.session('listen', window.SENTENCES, 10).forEach(x => srs.grade('listen', x.id, 2));
  const v = srs.vocab(window.WORDS);
  [1, 2].forEach(l => assert.strictEqual(v[l].met, v[l].total, `HSK ${l}: ${v[l].met}/${v[l].total}`));
});
// ---- conversations: scene data and the scripted engine ----
require('../docs/data/dialogues.js');
const DLG = require('../docs/js/dialogue.js');
const SC = window.DIALOGUES, scene = id => SC.find(s => s.id === id);
const levelChars = l => new Set(window.WORDS.filter(w => w.l <= l).flatMap(w => [...w.h]));
t('scenes: 4 per HSK level, every one valid (reachable, no dead ends or loops)', () => {
  [1, 2, 3].forEach(l => assert.strictEqual(SC.filter(s => s.l === l).length, 4, 'HSK ' + l));
  SC.forEach(s => assert.deepStrictEqual(DLG.validateScene(s).errors, [], s.id));
});
t('scenes: only characters of their HSK level', () => {
  const chars = { 1: levelChars(1), 2: levelChars(2), 3: levelChars(3) };
  SC.forEach(s => assert.deepStrictEqual(DLG.validateScene(s, { chars }).warnings, [], s.id));
});
t('scenes: every route ends after 6-8 replies', () => SC.forEach(s => {
  const ps = DLG.paths(s); assert(ps.length >= 2, s.id + ' branches');
  ps.forEach(p => assert(p.length >= 6 && p.length <= 8, `${s.id}: ${p.length} replies`));
}));
t('scenes: 2+ replies per line, 3 distractors each, all glossed', () => SC.forEach(s => Object.values(s.nodes).forEach(n => {
  assert(n.zh && n.en, n.id);
  if (n.end) return;
  assert(n.replies.length >= 2, n.id);
  n.replies.forEach(r => { assert(r.en && r.sy.length, r.id); assert.strictEqual(r.d.length, 3, r.id); r.d.forEach(d => assert(d.why && DLG.norm(d.zh) !== DLG.norm(r.zh), r.id)); });
})));
t('scenes: reply ids are unique and carry their level', () => {
  const items = DLG.replyItems(SC); assert.strictEqual(new Set(items.map(r => r.id)).size, items.length);
  items.forEach(r => assert.strictEqual(r.l, scene(r.scene).l));
});
t('validateScene catches dead ends, unreachable nodes, loops, missing glosses, distractor = reply', () => {
  const r = (zh, next, d = [['错一', 'x'], ['错二', 'x'], ['错三', 'x']]) => ({ id: zh, zh, en: 'e', next, sy: [], alt: [], d: d.map(([zh, why]) => ({ zh, why, sy: [] })) });
  const base = () => ({ id: 't', l: 1, title: '好', en: 'e', who: 'w', intro: 'i', start: 'a', nodes: {
    a: { zh: '你好', en: 'hi', replies: [r('好一', 'b'), r('好二', 'b')] }, b: { zh: '再见', en: 'bye', end: true, replies: [] } } });
  assert.deepStrictEqual(DLG.validateScene(base()).errors, []);
  const dead = base(); dead.nodes.b = { zh: '再见', en: 'bye', replies: [] };
  assert(/dead end/.test(DLG.validateScene(dead).errors.join()));
  const lost = base(); lost.nodes.c = { zh: '谁', en: 'who', end: true, replies: [] };
  assert(/can't be reached/.test(DLG.validateScene(lost).errors.join()));
  const loop = base(); loop.nodes.a.replies[0].next = 'a';
  assert(/loop/.test(DLG.validateScene(loop).errors.join()));
  const nogloss = base(); nogloss.nodes.a.replies[1].en = '';
  assert(/English/.test(DLG.validateScene(nogloss).errors.join()));
  const same = base(); same.nodes.a.replies[0].d[0] = { zh: '好二！', why: 'x', sy: [] };
  assert(/is an accepted reply/.test(DLG.validateScene(same).errors.join()));
  const missing = base(); missing.nodes.a.replies[0].next = 'zz';
  assert(/missing node/.test(DLG.validateScene(missing).errors.join()));
});
const E = new DLG.ScriptedEngine(), food = scene('food');
t('engine: start gives the first line, its replies and their distractors', () => {
  const tn = E.start(food, {});
  assert.strictEqual(tn.line.zh, food.nodes[food.start].zh); assert(!tn.end);
  assert.strictEqual(tn.options.length, food.nodes.hi.replies.length);
  assert.strictEqual(tn.distractors.length, tn.options.length * 3); assert(tn.distractors.every(d => d.why && d.of));
  assert.strictEqual(tn.left, 6);
});
t('engine: options the learner has due come first', () => {
  const second = food.nodes.hi.replies[1];
  assert.strictEqual(E.start(food, { due: new Set([second.id]) }).options[0].id, second.id);
});
t('engine: a tapped reply moves the scene on', () => {
  const r = food.nodes.sit.replies[1];
  const tn = E.reply(E.start(food, {}).state, { text: food.nodes.hi.replies[0].zh, via: 'choice' });
  assert.strictEqual(tn.feedback.q, 2); assert.strictEqual(tn.state.node, 'sit'); assert.strictEqual(tn.left, 5);
  const t2 = E.reply(tn.state, { text: r.zh, via: 'choice' });
  assert.strictEqual(t2.state.node, r.next); assert.strictEqual(t2.state.history.length, 2);
});
t('engine: a tapped distractor is graded 0 and corrected to its reply', () => {
  const r = food.nodes.hi.replies[1], d = r.d[0];
  const tn = E.reply(E.start(food, {}).state, { text: d.zh, via: 'choice' });
  assert.strictEqual(tn.feedback.q, 0); assert.strictEqual(tn.feedback.distractor.zh, d.zh);
  assert.strictEqual(tn.feedback.correction.id, r.id); assert.strictEqual(tn.state.node, r.next);
});
t('engine: typed characters, pinyin and alternatives are matched', () => {
  const st = E.start(food, {}).state;
  assert.strictEqual(E.reply(st, { text: '三个人', via: 'typed' }).feedback.matched.zh, '三个人。');
  const py = E.reply(st, { text: 'san1 ge4 ren2', via: 'typed' }).feedback; assert(py.exact); assert.strictEqual(py.q, 3);
  const alt = E.reply(st, { text: '我们三个人', via: 'typed' }).feedback; assert(alt.exact); assert.strictEqual(alt.matched.zh, '三个人。'); assert.strictEqual(alt.form.zh, '我们三个人。');
});
t('engine: a typed near miss gets q 1 and a correction; a typed distractor gets its reason', () => {
  const st = E.start(scene('fruit'), {}).state;
  const near = E.reply(st, { text: '我想买苹', via: 'typed' }).feedback; assert.strictEqual(near.q, 1); assert(near.correction);
  const miss = E.reply(st, { text: '我买想苹果', via: 'typed' }).feedback; assert.strictEqual(miss.q, 0); assert(/想 goes before/.test(miss.distractor.why));
  assert.strictEqual(E.reply(st, { text: '我想买苹果', via: 'typed', helped: true }).feedback.q, 1);
});
t('engine: speech is matched word by word; a tone slip is recast, noise is retried', () => {
  const st = E.start(scene('ticket'), {}).state;
  const ok = E.reply(st, { text: '您好我去北京', via: 'speech' }).feedback; assert.strictEqual(ok.q, 2); assert(ok.exact);
  const near = E.reply(st, { text: '您好我去背景', via: 'speech' }); // 北京 běijīng heard as 背景 bèijǐng
  assert.strictEqual(near.feedback.q, 1); assert(near.feedback.correction); assert.strictEqual(near.state.node, 'when');
  assert(near.feedback.heard.syl.some(s => s.st === 'tone'));
  const noise = E.reply(st, { text: '天气很好', via: 'speech' });
  assert(noise.feedback.retry); assert.strictEqual(noise.feedback.q, null); assert.strictEqual(noise.state, st);
  const wrong = E.reply(st, { text: '您好我来北京', via: 'speech' }).feedback; // the 来/去 distractor, said cleanly
  assert.strictEqual(wrong.q, 0); assert(/来 = come/.test(wrong.distractor.why));
});
const said = (sc, node, text) => DLG.match(scene(sc).nodes[node], { text, via: 'speech' });
t('speech: fillers, dropped particles, homophones and extra polite words are fine', () => {
  ['嗯我叫大明', '我叫大鸣', '那个，我叫大明啊'].forEach(x => assert.strictEqual(said('meet', 'hi', x).q, 2, x));
  const r = said('ticket', 'hi', '我要买一张去北京的火车票'); assert.strictEqual(r.q, 2); assert(r.own); assert.strictEqual(r.reply.zh, '我要一张去北京的票。');
  assert(!said('meet', 'hi', '我叫大明').own);
});
t('speech: word order is free, except who does what', () => {
  assert.strictEqual(said('meet', 'job', '我在医院工作，我是医生').q, 2);
  assert.strictEqual(said('call', 'me', '我们明天去看电影好不好').q, 2); // 好不好 is a question, not a 不
  const sw = said('plans', 'after', '好你请我吃饭'); assert(sw.q < 2 || sw.distractor);
});
t('speech: a 不 the reply lacks, or a wrong number, is never accepted', () => {
  const neg = said('meet', 'like', '我不喜欢北京'); assert(neg.retry || neg.distractor); assert(!neg.q);
  const num = said('call', 'four', '五点很好'); assert(num.retry); assert(num.missing.includes('四'));
});
t('speech: everyday synonyms and a reply cut off at a pause', () => {
  assert.strictEqual(said('way', 'far', '可以坐公交车吗').q, 2);
  assert.strictEqual(said('clothes', 'else', '不用了，谢谢').q, 2);
  const cut = said('meet', 'hy', '谢谢是我在这儿学习'); assert.strictEqual(cut.q, 1); assert(!cut.retry);
});
t('speech: digits, clock times, room numbers and traditional characters', () => {
  assert.strictEqual(ZH.normalizeHeard('9:30以前'), '九点半以前');
  assert.strictEqual(ZH.normalizeHeard('對不起我還在地鐵上'), '对不起我还在地铁上');
  assert.strictEqual(said('late', 'eta', '9:30以前应该能到').q, 2);
  assert.strictEqual(said('hotel', 'floor', '806好的早饭几点开始').q, 2);
  assert.strictEqual(said('clothes', 'deal', '好就300吧').q, 2);
});
t('speech: a near-miss said with a filler or an extra word still gets its reason', () => {
  assert(/在家 goes before/.test(said('call', 'doing', '我看电视在家里你呢').distractor.why));
  assert(said('food', 'rec', '好的我不想吃这个').distractor);
  assert.strictEqual(said('meet', 'hi', '').retry, true);
});
t('speech: the recogniser guess that answers best is chosen', () => {
  const opts = scene('ticket').nodes.hi.replies;
  assert(DLG.speechScore(opts, '您好我去北京') > DLG.speechScore(opts, '您好我去背景'));
  assert(DLG.speechScore(opts, '您好我去背景') > DLG.speechScore(opts, '天气很好'));
});
// the optional meaning model, stood in for by a judge that always answers: it may only take what the word matcher could not
const MEAN = require('../docs/js/meaning.js');
const standIn = (reply, sim) => ({ ready: true, accepts: MEAN.accepts, judge: () => ({ reply, zh: DLG.norm(reply.zh), sim, margin: 0.2, other: 0.2 }) });
t('meaning model: takes a paraphrase the words missed, never a near-miss, a 不 or a wrong number', () => {
  const taste = scene('food').nodes.taste, four = scene('call').nodes.four, like = scene('meet').nodes.like;
  try {
    DLG.useMeaning(standIn(taste.replies[0], 0.83));
    const p = said('food', 'taste', '味道很好'); assert.strictEqual(p.q, 2); assert(p.own && p.meaning); assert.strictEqual(p.reply.id, taste.replies[0].id);
    assert(said('food', 'taste', '很好吃吗').distractor);
    DLG.useMeaning(standIn(like.replies[0], 0.95)); assert(said('meet', 'like', '我不喜欢北京').retry || said('meet', 'like', '我不喜欢北京').distractor);
    DLG.useMeaning(standIn(four.replies[0], 0.97)); assert(said('call', 'four', '五点很好').retry);
    // one word swapped into the reply's own sentence needs a closer match
    DLG.useMeaning(standIn(scene('food').nodes.drink.replies[0], 0.8)); assert(said('food', 'drink', '我想喝咖啡').retry);
    DLG.useMeaning(standIn(scene('food').nodes.drink.replies[0], 0.9)); assert.strictEqual(said('food', 'drink', '我想喝咖啡').q, 2);
    DLG.useMeaning({ ready: false, accepts: MEAN.accepts, judge: () => null }); assert(said('food', 'taste', '味道很好').retry);
  } finally { DLG.useMeaning(null); }
});
t('meaning model: optional, never precached; its library pinned and cached apart', () => {
  const fs = require('fs'), sw = fs.readFileSync(__dirname + '/../docs/sw.js', 'utf8'), html = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
  const files = sw.match(/const FILES = \[([^\]]*)\]/)[1];
  assert(!/meaning|reply-vectors|transformers/.test(files)); assert(!/meaning\.js|reply-vectors/.test(html));
  assert(/@\d+\.\d+\.\d+\//.test(MEAN.LIB) && MEAN.LIB.startsWith(sw.match(/MEANING_LIB = '([^']+)'/)[1]));
  assert(/k\.startsWith\('tingshuo-'\)/.test(sw), 'app updates must not delete the model caches');
});
t('meaning model: precomputed reply vectors are well formed', () => {
  try { require('../docs/data/reply-vectors.js'); } catch (e) { return; }
  const V = window.REPLY_VECTORS; assert.strictEqual(V.model, MEAN.MODEL);
  assert.strictEqual(Buffer.from(V.data, 'base64').length, V.texts.length * V.dim); assert.strictEqual(V.scale.length, V.texts.length);
  const have = new Set(V.texts), clean = s => s.replace(/[\s\p{P}]/gu, '');
  const missing = DLG.replyItems(SC).flatMap(r => [r.zh, ...r.alt.map(a => a.zh)]).map(clean).filter(z => !have.has(z));
  if (missing.length) console.log(`  (reply vectors miss ${missing.length} replies; the app embeds those itself. Refresh with tools/embed-replies.js)`);
});
t('engine: every route of every scene plays to the end', () => SC.forEach(s => DLG.paths(s).forEach(p => {
  let tn = E.start(s, {});
  for (const id of p) { const r = tn.options.find(o => o.id === id); tn = E.reply(tn.state, { text: r.zh, via: 'choice' }); }
  assert(tn.end, s.id); assert.strictEqual(tn.left, 0); assert.strictEqual(tn.options.length, 0);
  assert.throws(() => E.reply(tn.state, { text: '好', via: 'typed' }));
})));
t('converse mode: graded replies count as words met, without touching other modes', () => {
  const { srs } = fresh(); const items = attachWords(DLG.replyItems(SC), window.WORDS);
  const r = scene('doctor').nodes.hi.replies[0]; assert(r.w.includes('发烧'));
  srs.grade('converse', r.id, 2);
  assert(srs.metWords().has('发烧'));
  assert.strictEqual(srs.counts('listen', window.SENTENCES).due, 0);
  assert.strictEqual(srs.counts('converse', items).level, 1);
});

// ---- tone recognition: synthetic voices through the app's own pitch path ----
require('../docs/data/tone-model.js');
const TN = require('../docs/js/tones.js'), { synth, speaker: synSpeaker } = require('./tone-synth.js'), toneSim = require('./tone-sim.js');
const say3 = (tones, kind, seed, extra = {}) => { const o = synth({ tones, finals: tones.map((_, i) => i === tones.length - 1), speaker: synSpeaker(kind, seed), snrDb: 35, gain: 0.2, ...extra }, seed); return { frames: toneSim.record(o.samples, o.sr, { seed }), truth: o.truth }; };
const sylsOf = tones => tones.map((s, i) => ({ c: 'x', s, final: i === tones.length - 1 }));
t('tones: segmentation finds each syllable of a word and a sentence', () => {
  for (const [tones, kind, seed] of [[[4, 3, 1], 'female', 11], [[1, 2, 0, 4, 3, 1, 2], 'male', 12], [[3, 4, 0, 1, 1, 2], 'child', 13]]) {
    const { frames, truth } = say3(tones, kind, seed), trk = TN.track(frames), seg = TN.segment(trk, sylsOf(tones));
    let ok = 0;
    seg.forEach((sg, k) => { if (!sg) return; const mid = (trk.pts[sg[0]].t + trk.pts[sg[1]].t) / 2 - 22; if (mid >= truth[k].t0 && mid <= truth[k].t1) ok++; });
    assert(ok >= tones.length - 1, `${tones.join('')}: ${ok}/${tones.length} syllables found`);
  }
});
t('tones: too few or too many syllables degrade gracefully', () => {
  const one = say3([4], 'female', 21);
  const r = TN.analyse(one.frames, sylsOf([2, 4, 1]), null).syls;
  assert.strictEqual(r.length, 3); assert(r.filter(x => x.verdict !== 'ok').length >= 2, 'two of three syllables were never said');
  const three = say3([1, 4, 2], 'male', 22);
  assert.strictEqual(TN.analyse(three.frames, sylsOf([4]), null).syls.length, 1);
  assert(TN.analyse([], sylsOf([1, 2]), null).syls.every(x => x.verdict === 'unsure'));
});
t('tones: each tone said alone is recognised, and a different target is not passed', () => {
  let ok = 0, n = 0, passedWrong = 0;
  for (const kind of ['female', 'male', 'child']) for (const tone of [1, 2, 3, 4]) {
    const seed = 100 + tone * 7 + kind.length, { frames } = say3([tone], kind, seed), hist = TN.updateRange(TN.updateRange(null, TN.track(say3([1, 4, 2, 3], kind, seed + 1).frames)), TN.track(say3([4, 1, 3], kind, seed + 2).frames));
    const r = TN.analyse(frames, sylsOf([tone]), hist).syls[0]; n++; if (r.verdict === 'ok' && r.heard === tone) ok++;
    const w = TN.analyse(frames, sylsOf([tone === 4 ? 1 : 4]), hist).syls[0]; if (w.verdict === 'ok') passedWrong++;
  }
  assert(ok >= n - 2, `${ok}/${n} recognised`); assert(passedWrong <= 1, `${passedWrong} wrong targets passed`);
});
t('tones: a learned pitch range settles on the speaker', () => {
  let h = null; for (let i = 0; i < 6; i++) h = TN.updateRange(h, TN.track(say3([1, 4, 2, 3, 1], 'male', 300 + i).frames));
  let f = null; for (let i = 0; i < 6; i++) f = TN.updateRange(f, TN.track(say3([1, 4, 2, 3, 1], 'female', 300 + i).frames));
  assert(f.mid - h.mid > 6, `female ${f.mid.toFixed(1)} vs male ${h.mid.toFixed(1)} semitones`); assert(h.k === 6 && h.span >= 5 && h.span <= 16);
});
t('tones: sentence targets mark phrase ends and 3rd tones that may change', () => {
  const T = TN.targetsOf(S('这件衣服太贵了，有便宜一点儿的吗？').sy);
  assert.strictEqual(T.filter(x => x.final).length, 2); assert(T[T.findIndex(x => x.c === '了')].final);
  assert(TN.targetsOf(S('这儿有很多人。').sy).find(x => x.c === '有').alt.includes(2));
});
// word check: one recording, two checks
t('speech: extra syllables are reported, fillers are not', () => {
  const r = ZH.compareSpeech(buy.sy, '嗯我也买了三本书');
  assert.deepStrictEqual(r.extra.map(e => [e.c, e.after]), [['也', 0]]);
  assert.strictEqual(r.score, 1);
  assert.deepStrictEqual(ZH.compareSpeech(buy.sy, '我买了三本书的').extra.map(e => [e.c, e.after]), [['的', 5]]);
});
t('speech: a different word is wrong, with what was heard', () => {
  const r = ZH.compareSpeech(buy.sy, '我买了三本画'); const e = r.syl[5];
  assert.strictEqual(e.st, 'wrong'); assert.strictEqual(e.heard.c, '画');
});
const fr = (n, f) => Array.from({ length: n }, (_, i) => ({ t: i * 33, ...f(i) }));
t('word check: recognition alongside the pitch recording is judged per take', () => {
  const voiced = fr(60, i => ({ rms: 0.02, f0: i > 10 && i < 40 ? 200 : null }));
  assert.strictEqual(A2.sharedVerdict({ frames: voiced, startT: 50, text: '我买了三本书' }), 'ok');
  assert.strictEqual(A2.sharedVerdict({ frames: voiced, startT: 50, lost: true, text: '我' }), 'fail');
  assert.strictEqual(A2.sharedVerdict({ frames: voiced, startT: 50, error: 'audio-capture' }), 'fail');
  // the recorder goes digitally silent once recognition starts: the microphone was taken
  const dead = fr(60, i => ({ rms: i < 5 ? 0.01 : 0, f0: null }));
  assert.strictEqual(A2.sharedVerdict({ frames: dead, startT: 100, text: null, error: 'no-speech' }), 'fail');
  assert.strictEqual(A2.sharedVerdict({ frames: voiced, startT: 50, text: '', error: 'no-speech' }), 'empty');
  assert.strictEqual(A2.sharedVerdict({ frames: fr(60, () => ({ rms: 0.001, f0: null })), startT: 50, error: 'no-speech' }), 'unknown');
  assert.strictEqual(A2.sharedVerdict({ frames: voiced, startT: 50, error: 'network' }), 'unknown');
});
t('word check: the device stops trying after a failure or repeated empty results', () => {
  const run = vs => vs.reduce((r, v) => A2.sharedNext(r, v), null);
  assert.strictEqual(run(['ok']).state, 'yes');
  assert.strictEqual(run(['fail']).state, 'no');
  assert.strictEqual(run(['ok', 'fail', 'ok']).state, 'no');
  assert.strictEqual(run(['empty']).state, 'unknown');
  assert.strictEqual(run(['empty', 'empty']).state, 'no');
  assert.strictEqual(run(['ok', 'empty', 'empty']).state, 'yes');
  assert.strictEqual(run(['ok', 'empty', 'empty', 'empty']).state, 'no');
  assert.strictEqual(run(['ok', 'empty', 'ok', 'empty', 'empty']).state, 'yes');
});
t('word check: merged with the tones, a wrong word is not a pass and its tone is not trusted', () => {
  const T = TN.targetsOf(buy.sy), an = { syls: T.map(() => ({ verdict: 'ok', heard: 1 })) };
  an.syls[1] = { verdict: 'slip', heard: 4 };
  const sure = c => ({ ...c, syl: c.syl.map(s => ({ ...s, sure: true })), extra: c.extra.map(e => ({ ...e, sure: true })) });
  let m = TN.withWords(T, an, sure(ZH.compareSpeech(buy.sy, '我卖了三本书')));
  assert.strictEqual(m.syls[1].word, 'tone'); assert.strictEqual(m.syls[1].tone, 'slip');
  m = TN.withWords(T, { syls: T.map(() => ({ verdict: 'ok', heard: 1 })) }, sure(ZH.compareSpeech(buy.sy, '我卖了三本书')));
  assert.strictEqual(m.syls[1].word, 'ok', 'the pitch said the tone was right: it wins');
  m = TN.withWords(T, an, sure(ZH.compareSpeech(buy.sy, '我看了三本书')));
  assert.strictEqual(m.syls[1].word, 'wrong'); assert.strictEqual(m.syls[1].heard, '看'); assert.strictEqual(m.syls[1].tone, 'unsure');
  assert.strictEqual(TN.suggestGrade(m), 0);
  m = TN.withWords(T, an, sure(ZH.compareSpeech(buy.sy, '我买三本书')));
  assert.strictEqual(m.syls[2].word, 'miss'); assert.strictEqual(TN.suggestGrade(m), 0);
  const unsure = ZH.compareSpeech(buy.sy, '我看了三本书'); unsure.syl[1].sure = false;
  m = TN.withWords(T, { syls: T.map(() => ({ verdict: 'ok', heard: 1 })) }, unsure);
  assert.strictEqual(m.syls[1].word, 'unsure'); assert.strictEqual(TN.suggestGrade(m), 2, 'a doubtful word: good, not easy');
  m = TN.withWords(T, { syls: T.map(() => ({ verdict: 'ok', heard: 1 })) }, sure(ZH.compareSpeech(buy.sy, '我买了三本书')));
  assert.strictEqual(TN.suggestGrade(m), 3);
  assert.strictEqual(TN.suggestGrade(TN.withWords(T, { syls: T.map(() => ({ verdict: 'ok', heard: 1 })) }, null)), 2, 'no word check: never "easy"');
});
t('speech: fillers and an erhua 儿 are not extra words', () => {
  assert.deepStrictEqual(ZH.compareSpeech(buy.sy, '嗯我买了三本书啊').extra, []);
  const r = ZH.compareSpeech(S('这儿有很多人。').sy, '这儿有很多人'); assert.deepStrictEqual(r.extra, []); assert.strictEqual(r.score, 1);
  assert.strictEqual(ZH.compareSpeech(buy.sy, '嗯').syl[0].st, 'miss');
});
const Tr = require('../docs/js/transcribe.js');
t('word check: a difference counts only when the model prefers it to the target, never for one syllable', () => {
  const c = ZH.compareSpeech(buy.sy, '我买了四本书'), sc = { '我买了三本书': -3, '我买了四本书': -2.5 };
  assert(Tr.mark(c, sc).syl[3].sure);
  const d = ZH.compareSpeech(buy.sy, '我买了四本书'); assert(!Tr.mark(d, { '我买了三本书': -2, '我买了四本书': -3 }).syl[3].sure);
  const w = [{ c: '买', p: 'mǎi', t: 3, s: 3 }], e = ZH.compareSpeech(w, '卖');
  assert(!Tr.mark(e, { '买': -5, '卖': -1 }).syl[0].sure);
  assert.deepStrictEqual(Tr.variants(ZH.compareSpeech(buy.sy, '我买三本书的')), ['我买了三本书', '我买三本书', '我买了三本书的']);
});
console.log(n, 'tests passed');
