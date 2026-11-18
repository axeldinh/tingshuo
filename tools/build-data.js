// Builds docs/data/*.js from the sentence source and HSK word lists.
const fs = require('fs'), path = require('path');
const { pinyin } = require('pinyin-pro');
const SRC = require('../src/sentences.src.js');
const out = path.join(__dirname, '../docs/data'); fs.mkdirSync(out, { recursive: true });

// --- words ---
const words = [];
for (const l of [1, 2, 3]) {
  const d = JSON.parse(fs.readFileSync(`${__dirname}/../src/hsk/${l}.json`, 'utf8'));
  for (const w of d) {
    const f = w.forms[0];
    words.push({ id: 'w' + l + '-' + w.simplified, h: w.simplified, p: f.transcriptions.pinyin, n: f.transcriptions.numeric, m: f.meanings.slice(0, 3).join('; '), l });
  }
}
const vocabChars = new Set(words.flatMap(w => [...w.h]));

// --- syllables with tones ---
// 一/不 tone changes come from pinyin-pro. Neutral tones and erhua are corrected here.
// 3-3 tone change is applied only INSIDE a word (certain); across word boundaries it depends on phrasing,
// so those syllables are flagged x:1 ("may change") and skipped in tone-identification drills.
const isHan = c => /\p{Script=Han}/u.test(c);
const NEUTRAL2 = ['朋友','主意','没关系','不客气','妻子','东西','时候','晚上','早上','下面','上面','外面','里面','右边','左边','回来','出来','关上','穿上','知道','衣服','认识','告诉','先生','漂亮','便宜','觉得','喜欢','意思','眼睛','名字','休息','钥匙','怎么','什么','我们','你们','他们','她们','咱们','这个','那个','哪个','妈妈','爸爸','哥哥','姐姐','妹妹','弟弟','奶奶','爷爷','谢谢','桌子','椅子','杯子','孩子','儿子','句子','房子','多少','地方','清楚','舒服','聪明','明白','事情','学生','打算','关系','客气','头发','月亮','太阳','耳朵','个子','裤子','帽子','鼻子','盘子','筷子','行李','护照','葡萄','西瓜','窗户','包子','饺子','水饺','照顾','觉得','干净','热闹','马虎','麻烦','部分','暖和','凉快','漂亮','认真','脑子','东边','西边','南边','北边','旁边','前边','后边','里边','外边'];
const NEUTRAL_WORDS = new Set(NEUTRAL2);
// characters that are always neutral when they follow a verb/adjective in these sentences
const ALWAYS_NEUTRAL = new Set(['了','的','吗','吧','呢','着','过','得','们']);
const WORDSET = new Set(words.map(w => w.h).concat(NEUTRAL2, ['北京','上海','烤鸭','号码','小王','小李','一会儿','一点儿','有点儿','这儿','那儿','哪儿','差点儿','出租车','自行车','公共汽车','洗手间','火车站','电子邮件','中国人','怎么样','为什么']));
function segment(chars) { // greedy longest match over Han runs
  const seg = []; let i = 0;
  while (i < chars.length) {
    if (!isHan(chars[i])) { seg.push([i, 1]); i++; continue; }
    let len = 1;
    for (let L = 4; L > 1; L--) { const w = chars.slice(i, i + L).join(''); if (w.length === L && WORDSET.has(w)) { len = L; break; } }
    seg.push([i, len]); i += len;
  }
  return seg;
}
const TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
function stripTone(p) { return p.normalize('NFD').replace(/u\u0308/g, '\u00fc').replace(/[\u0300-\u036f]/g, '').normalize('NFC'); }
function OVERRIDE(zh) {
  const o = {};
  if (/还[我了]/.test(zh) && /借|钱|词典/.test(zh) && !/还是|还没/.test(zh)) o['还'] = ['huán', 2];
  return o;
}
function syllables(zh) {
  const chars = [...zh];
  const mark = pinyin(zh, { type: 'array', toneSandhi: false });
  const dict = pinyin(zh, { type: 'array', pattern: 'num', toneSandhi: false });
  const spoken = pinyin(zh, { type: 'array', pattern: 'num' });
  const ov = OVERRIDE(zh);
  const res = chars.map((c, i) => {
    if (!isHan(c)) return { c };
    let p = mark[i], t = +dict[i] || 0, s = +spoken[i] || 0;
    if (ov[c]) { [p, t] = ov[c]; s = t; }
    return { c, p, t, s };
  });
  const seg = segment(chars);
  seg.forEach(([st, len], k) => {
    const w = chars.slice(st, st + len).join('');
    // erhua: 儿 merges into the previous syllable

    if (NEUTRAL_WORDS.has(w)) { const r = res[st + len - 1]; r.p = stripTone(r.p); r.s = 0; } // keep dictionary tone in t
    if (len === 1 && ALWAYS_NEUTRAL.has(w) && st > 0) { const r = res[st]; if (!(w === '得' && /得到|觉得/.test(zh) && false)) { r.p = stripTone(r.p).replace(/^dé$/, 'de'); r.s = 0; if (w === '得') { r.p = 'de'; r.t = 0; } } }
  });
  // erhua: 儿 merges into the previous syllable unless it is 儿子 / 女儿
  chars.forEach((c, i) => { if (c === '儿' && i > 0 && chars[i - 1] !== '女' && chars[i + 1] !== '子') { const r = res[i]; r.p = 'r'; r.t = 0; r.s = 0; r.er = 1; } });
  // 不 inside potential complements / 对不起 is neutral
  const reBu = /(?:对|[听看说找做学吃买记想]{1})不(?:起|懂|到|出|见|完|会|了)/g; let m;
  while ((m = reBu.exec(zh))) { const i = [...zh.slice(0, m.index)].length + 1; res[i].p = 'bu'; res[i].s = 0; }
  // 3-3 inside a word: all but the last 3rd tone of a run become 2nd
  for (const [st, len] of seg) {
    let run = [];
    for (let i = st; i < st + len; i++) {
      if (res[i].p && res[i].s === 3) run.push(i);
      else { run.slice(0, -1).forEach(j => res[j].s = 2); run = []; }
    }
    run.slice(0, -1).forEach(j => res[j].s = 2);
  }
  // across word boundaries: flag 3 + 3 as "may change"
  const han = res.map((r, i) => r.p && !r.er ? i : -1).filter(i => i >= 0);
  for (let k = 0; k < han.length - 1; k++) {
    const a = res[han[k]], b = res[han[k + 1]];
    if (han[k + 1] !== han[k] + 1 && !res[han[k] + 1].er) continue; // punctuation between
    if (a.s === 3 && (b.s === 3 || b.t === 3 && b.s === 0)) { a.x = 1; }
  }
  // re-mark pinyin with the spoken tone for display
  res.forEach(r => { if (r.p && !r.er) r.ps = markTone(stripTone(r.p), r.s); });
  return res;
}
function markTone(base, tone) {
  if (!tone) return base;
  const v = base.match(/[ae]/) ? base.match(/[ae]/)[0] : base.includes('ou') ? 'o' : [...base].reverse().find(ch => 'aeiouü'.includes(ch));
  if (!v) return base;
  const idx = v === 'o' && base.includes('ou') ? base.indexOf('o') : (base.match(/[ae]/) ? base.search(/[ae]/) : base.lastIndexOf(v));
  return base.slice(0, idx) + TONE_MARKS[v][tone - 1] + base.slice(idx + 1);
}

const sentences = []; const warnings = [];
let n = 0;
for (const [l, zh, en, alt, d, g] of SRC) {
  n++;
  const id = 's' + String(n).padStart(3, '0');
  if (d.length < 3) warnings.push(id + ' has <3 distractors');
  for (const c of zh) if (isHan(c) && !vocabChars.has(c)) warnings.push(`${id} char outside HSK1-3: ${c} in ${zh}`);
  sentences.push({ id, l, zh, en, alt: alt.map(z => ({ zh: z, sy: syllables(z) })), d: d.map(([z, why]) => ({ zh: z, why, sy: syllables(z) })), g, sy: syllables(zh) });
}
// --- conversation scenes: same syllable data as sentences, checked as graphs ---
const { validateScene } = require('../docs/js/dialogue.js');
const levelChars = { 1: 1, 2: 2, 3: 3 }; for (const l in levelChars) levelChars[l] = new Set(words.filter(w => w.l <= l).flatMap(w => [...w.h]));
const withSy = zh => ({ zh, sy: syllables(zh) });
const dialogues = require('../src/dialogues.src.js').map(sc => ({
  id: sc.id, l: sc.l, title: sc.title, en: sc.en, who: sc.who, intro: sc.intro, start: sc.start, tsy: syllables(sc.title || ''),
  nodes: Object.fromEntries(Object.entries(sc.nodes).map(([k, [zh, en, rs]]) => [k, rs === 'end'
    ? { id: `c-${sc.id}-${k}`, zh, en, sy: syllables(zh || ''), end: true, replies: [] }
    : { id: `c-${sc.id}-${k}`, zh, en, sy: syllables(zh || ''), replies: (rs || []).map(([zh, en, next, d = [], alt = []], i) => ({
        id: `c-${sc.id}-${k}-${i + 1}`, l: sc.l, zh, en, next, sy: syllables(zh || ''), alt: alt.map(withSy), d: d.map(([z, why]) => ({ ...withSy(z || ''), why })) })) }])),
}));
const dlgErrors = [], dlgLengths = [];
if (new Set(dialogues.map(s => s.id)).size !== dialogues.length) dlgErrors.push('two scenes share an id');
for (const sc of dialogues) {
  const r = validateScene(sc, { chars: levelChars });
  dlgErrors.push(...r.errors); warnings.push(...r.warnings);
  if (!r.errors.length) dlgLengths.push(`${sc.id} ${r.min === r.max ? r.min : r.min + '-' + r.max}`);
}
if (dlgErrors.length) { console.error('Scene errors:\n' + dlgErrors.join('\n')); process.exit(1); }

fs.writeFileSync(path.join(out, 'words.js'), 'window.WORDS=' + JSON.stringify(words) + ';\n');
fs.writeFileSync(path.join(out, 'sentences.js'), 'window.SENTENCES=' + JSON.stringify(sentences) + ';\n');
fs.writeFileSync(path.join(out, 'dialogues.js'), 'window.DIALOGUES=' + JSON.stringify(dialogues) + ';\n');
console.log('words', words.length, 'sentences', sentences.length, 'by level', [1,2,3].map(l => sentences.filter(s => s.l === l).length));
console.log('scenes', dialogues.length, 'by level', [1,2,3].map(l => dialogues.filter(s => s.l === l).length), 'replies per route:', dlgLengths.join(', '));
console.log(warnings.join('\n'));
const dumpSy = sy => sy.map(x => x.p ? (x.er?'r':x.ps) + (x.x?'*':'') : x.c).join(' ');
if (process.argv[2] === 'dump') for (const s of sentences) console.log(s.id, dumpSy(s.sy));
if (process.argv[2] === 'dump-dialogues') for (const sc of dialogues) for (const n of Object.values(sc.nodes)) { console.log(n.id, n.zh, dumpSy(n.sy)); for (const r of n.replies) console.log('  ', r.zh, dumpSy(r.sy)); }
