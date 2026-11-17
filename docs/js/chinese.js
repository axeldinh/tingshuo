/* Chinese text helpers: pinyin of arbitrary text, answer checking, speech comparison. */
(function (global) {
  'use strict';
  const PP = () => global.pinyinPro;
  const isHan = c => /\p{Script=Han}/u.test(c);
  const TONE_GLYPH = { 1: 'ˉ', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 0: '·' };
  const TONE_NAME = { 1: '1st (high level)', 2: '2nd (rising)', 3: '3rd (low dip)', 4: '4th (falling)', 0: 'neutral (light)' };
  const MARKS = { 'ā': 'a1', 'á': 'a2', 'ǎ': 'a3', 'à': 'a4', 'ē': 'e1', 'é': 'e2', 'ě': 'e3', 'è': 'e4', 'ī': 'i1', 'í': 'i2', 'ǐ': 'i3', 'ì': 'i4', 'ō': 'o1', 'ó': 'o2', 'ǒ': 'o3', 'ò': 'o4', 'ū': 'u1', 'ú': 'u2', 'ǔ': 'u3', 'ù': 'u4', 'ǖ': 'ü1', 'ǘ': 'ü2', 'ǚ': 'ü3', 'ǜ': 'ü4' };

  function stripTone(p) { return (p || '').normalize('NFD').replace(/ü/g, 'ü').replace(/[̀-ͯ]/g, '').normalize('NFC'); }

  // --- numbers: speech recognisers often return digits ---
  const D = '零一二三四五六七八九';
  function numToZh(n) {
    n = parseInt(n, 10); if (isNaN(n)) return '';
    if (n < 10) return D[n];
    if (n < 20) return '十' + (n % 10 ? D[n % 10] : '');
    if (n < 100) return D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : '');
    if (n < 1000) { const r = n % 100; return D[Math.floor(n / 100)] + '百' + (r ? (r < 10 ? '零' + D[r] : (r < 20 ? '一' : '') + numToZh(r)) : ''); }
    if (n < 10000) { const r = n % 1000; return D[Math.floor(n / 1000)] + '千' + (r ? (r < 100 ? '零' : '') + numToZh(r) : ''); }
    return String(n).split('').map(d => D[+d]).join('');
  }
  const digitsToZh = s => s.replace(/\d+/g, numToZh);

  /** Syllables of any Chinese text, with dictionary tones. */
  function syllablesOf(text) {
    text = digitsToZh(text || '');
    const chars = [...text].filter(isHan);
    if (!chars.length) return [];
    const s = chars.join('');
    const base = PP().pinyin(s, { type: 'array', toneType: 'none', toneSandhi: false, v: false });
    const num = PP().pinyin(s, { type: 'array', pattern: 'num', toneSandhi: false });
    return chars.map((c, i) => ({ c, b: stripTone(base[i]), t: +num[i] || 0 }));
  }

  // target syllables from prebuilt data (skip erhua 儿)
  const targetSyl = sy => sy.filter(x => x.p && !x.er).map(x => ({ c: x.c, b: stripTone(x.p), t: x.t, s: x.s, ref: x }));

  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const same = (x, y) => x === y || (/[二两]/.test(x) && /[二两]/.test(y)) || (/[他她它]/.test(x) && /[他她它]/.test(y));

  /**
   * Compare what the recogniser heard with the target sentence.
   * Returns one entry per target syllable: ok | tone | wrong | miss.
   */
  function compareSpeech(sy, heardText) {
    const T = targetSyl(sy), H = syllablesOf(heardText);
    const m = T.length, n = H.length;
    const cost = (a, b) => same(a.c, b.c) ? 0 : a.b === b.b ? (a.t === b.t || a.t === 0 || b.t === 0 ? 0.05 : 0.4) : 1;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(T[i - 1], H[j - 1]));
    const res = new Array(m); let i = m, j = n;
    while (i > 0) {
      if (j > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + cost(T[i - 1], H[j - 1]))) < 1e-9) {
        const a = T[i - 1], b = H[j - 1];
        let st = 'wrong';
        if (same(a.c, b.c)) st = 'ok';
        else if (a.b === b.b) st = (a.t === b.t || a.t === 0 || b.t === 0) ? 'ok' : 'tone';
        res[i - 1] = { ...a, st, heard: b }; i--; j--;
      } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) { j--; }
      else { res[i - 1] = { ...T[i - 1], st: 'miss' }; i--; }
    }
    const score = m ? res.filter(r => r.st === 'ok').length / m : 0;
    return { syl: res, score, heard: heardText };
  }

  /** Normalise typed pinyin: returns toneless string and (if determinable) tone list. */
  function parsePinyin(input) {
    let s = input.toLowerCase().normalize('NFC').replace(/u:|v/g, 'ü');
    let marked = false;
    s = s.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, ch => { marked = true; return MARKS[ch]; });
    // move tone digit to end of each syllable for marked input: "wo3" from "wǒ" -> "wo3"? MARKS gives "o3" in place; fine for tone extraction below
    const tokens = s.split(/[\s'’,.，。!?？！-]+/).filter(Boolean);
    let tones = null;
    if (/\d/.test(s)) {
      if (marked) { // one mark per token, tokens separated by spaces
        tones = tokens.map(t => { const m = t.match(/[1-5]/); return m ? +m[0] % 5 : 0; });
      } else {
        const parts = s.replace(/[^a-zü1-5]/g, '').match(/[a-zü]+[1-5]?/g) || [];
        tones = parts.map(p => { const m = p.match(/[1-5]$/); return m ? +m[0] % 5 : 0; });
      }
    }
    const toneless = s.replace(/[^a-zü]/g, '');
    return { toneless, tones };
  }

  function answerForms(sy) {
    const T = sy.filter(x => x.p);
    // erhua can be typed as "r", "er" or left out; each variant lists syllables as [letters, tone or null]
    const mk = mode => T.flatMap(x => x.er ? (mode === 'none' ? [] : [[mode, null]]) : [[stripTone(x.p), x.t]]);
    const sylVariants = [mk('r'), mk('none'), mk('er')];
    return { chars: sy.filter(x => isHan(x.c)).map(x => x.c).join(''), sylVariants, toneless: sylVariants.map(v => v.map(x => x[0]).join('')) };
  }
  /** Walk the user's raw pinyin along the target syllables and read any tone digits/marks per syllable. */
  function readTones(input, syls) {
    let s = input.toLowerCase().normalize('NFC').replace(/u:|v/g, 'ü').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, ch => MARKS[ch]).replace(/[^a-zü1-5]/g, '');
    let k = 0; const out = [];
    for (const [letters] of syls) {
      let tone = null;
      for (const ch of letters) { while (/\d/.test(s[k] || '')) { tone = +s[k] % 5; k++; } if (s[k] !== ch) return null; k++; }
      while (/\d/.test(s[k] || '')) { tone = +s[k] % 5; k++; }
      out.push(tone);
    }
    return out;
  }

  /**
   * Check a typed answer (pinyin or characters) against one or more correct sentences.
   * answers: array of {zh, sy}. Returns best match.
   */
  function checkTyped(input, answers) {
    const hasHan = [...input].some(isHan);
    let best = null;
    for (const a of answers) {
      const f = answerForms(a.sy);
      let ratio, toneErr = null;
      if (hasHan) {
        const u = [...digitsToZh(input)].filter(isHan).join('');
        ratio = 1 - lev([...u], [...f.chars]) / Math.max(f.chars.length, 1);
      } else {
        const p = parsePinyin(input);
        let bestV = 0;
        f.toneless.forEach((t, v) => { const r = 1 - lev(p.toneless, t) / Math.max(t.length, 1); if (r > (ratio || -1)) { ratio = r; bestV = v; } });
        if (/\d|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(input) && ratio > 0.999) {
          const syls = f.sylVariants[bestV], tones = readTones(input, syls);
          if (tones) {
            toneErr = []; let hi = 0;
            syls.forEach((x, i) => { if (x[1] == null) return; if (tones[i] != null && x[1] !== 0 && tones[i] !== 0 && tones[i] !== x[1]) toneErr.push(hi); hi++; });
          }
        }
      }
      if (!best || ratio > best.ratio) best = { ratio, answer: a, hasHan, toneErr };
    }
    best.exact = best.ratio >= 0.999 && !(best.toneErr && best.toneErr.length);
    best.close = !best.exact && best.ratio >= 0.8;
    return best;
  }

  /** Greedy word segmentation with the HSK list (used for hint tiles). */
  function segmentWords(zh, wordSet) {
    const chars = [...zh].filter(isHan), out = []; let i = 0;
    while (i < chars.length) {
      let len = 1;
      for (let L = 4; L > 1; L--) if (wordSet.has(chars.slice(i, i + L).join(''))) { len = L; break; }
      out.push(chars.slice(i, i + len).join('')); i += len;
    }
    return out;
  }


  const TM = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
  function markTone(base, tone) {
    if (!tone) return base;
    let idx = base.search(/[ae]/);
    if (idx < 0) idx = base.indexOf('ou');
    if (idx < 0) { for (let k = base.length - 1; k >= 0; k--) if ('iouü'.includes(base[k])) { idx = k; break; } }
    if (idx < 0) return base;
    return base.slice(0, idx) + TM[base[idx]][tone - 1] + base.slice(idx + 1);
  }
  /** Tones of a single word as actually spoken: 一/不 changes and 3-3 inside the word, neutral = 0. */
  function spokenTones(word) {
    const chars = [...word].filter(isHan); const s = chars.join('');
    const base = PP().pinyin(s, { type: 'array', toneType: 'none', toneSandhi: false }).map(stripTone);
    const dict = PP().pinyin(s, { type: 'array', pattern: 'num', toneSandhi: false }).map(x => +x || 0);
    const sp = PP().pinyin(s, { type: 'array', pattern: 'num' }).map(x => +x || 0);
    for (let i = 0; i < sp.length - 1; i++) if (sp[i] === 3 && sp[i + 1] === 3) sp[i] = 2;
    return chars.map((c, i) => ({ c, b: base[i], t: dict[i], s: sp[i] }));
  }

  global.ZH = { isHan, stripTone, syllablesOf, compareSpeech, checkTyped, parsePinyin, segmentWords, numToZh, lev, markTone, spokenTones, TONE_GLYPH, TONE_NAME };
  if (typeof module !== 'undefined') module.exports = global.ZH;
})(typeof window !== 'undefined' ? window : globalThis);
