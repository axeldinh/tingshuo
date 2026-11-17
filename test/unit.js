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
console.log(n, 'tests passed');
