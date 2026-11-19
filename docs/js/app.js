/* Tīngshuō 听说 — Ink & Paper UI */
(function () {
  'use strict';
  const store = createStore();
  const srs = createSRS(store);
  const { TTS, Recognizer, Pitch } = window.Audio2, Audio2 = window.Audio2;
  const SENT = window.SENTENCES;
  const WORDS = window.WORDS.filter(w => [...w.h].length <= 4);
  const WORDSET = new Set(window.WORDS.map(w => w.h));
  const SCENES = window.DIALOGUES || [];
  const TALK = Dialogue.replyItems(SCENES); // every learner reply in every scene: the items of the `converse` mode
  attachWords(SENT, window.WORDS); attachWords(WORDS, window.WORDS); attachWords(TALK, window.WORDS); // lets sessions track which words you've met
  const view = document.getElementById('view');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- settings & look ----------------
  const DEFAULTS = { pinyin: 'fade', toneMarks: true, ink: 'auto', texture: true, sounds: true, rate: 0.85, voice: '', autoplay: true, hideShadow: true, size: 12, talkInput: 'tap', meaning: false, words: false };
  const setting = k => store.get('settings', k, DEFAULTS[k]);
  const setSetting = (k, v) => { store.put('settings', k, v); applyLook(); };
  const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyLook() {
    const ink = setting('ink');
    const night = ink === 'night' || (ink === 'auto' && darkMQ && darkMQ.matches);
    document.documentElement.dataset.ink = night ? 'night' : 'day';
    document.documentElement.dataset.texture = setting('texture') ? 'on' : 'off';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = night ? '#17140F' : '#F4EFE6';
  }
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applyLook);
  applyLook();
  TTS.pick(setting('voice'));

  /** A segmented control bound to a setting. opts: [[value, label, disabled?], …] */
  const segHTML = (k, opts) => `<span class="seg" data-seg="${k}">${opts.map(([v, l, off]) => `<button data-v="${v}" class="${setting(k) === v ? 'on' : ''}" ${off ? 'disabled' : ''}>${l}</button>`).join('')}</span>`;
  function wireSegs(root, after) {
    $$('[data-seg]', root).forEach(s => $$('button', s).forEach(b => b.onclick = () => { setSetting(s.dataset.seg, b.dataset.v); $$('button', s).forEach(x => x.classList.toggle('on', x === b)); after && after(s.dataset.seg, b.dataset.v); }));
  }
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); }
  const say = (text, slow) => TTS.speak(text, slow ? Math.max(0.5, setting('rate') - 0.3) : setting('rate'));
  const hanOnly = sy => sy.filter(x => x.p && !x.er);

  // ---------------- sound ----------------
  let actx = null;
  function sfx(kind) {
    if (!setting('sounds')) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
      if (kind === 'ok') { // soft paper swish
        const len = Math.floor(actx.sampleRate * 0.3), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
        const src = actx.createBufferSource(); src.buffer = buf;
        const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.25);
        src.connect(bp); bp.connect(g);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        src.start(t); src.stop(t + 0.3);
      } else { // low wooden tock
        const o = actx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.14);
        o.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.start(t); o.stop(t + 0.22);
      }
    } catch (e) { /* audio not available */ }
  }

  // ---------------- character mastery (fading pinyin) ----------------
  const isHan = c => /\p{Script=Han}/u.test(c);
  const charRec = c => store.get('chars', c, null);
  const mastered = c => { const r = charRec(c); return r != null && r >= 4; };
  function creditChars(text, q) {
    const seen = new Set();
    for (const c of text) {
      if (!isHan(c) || seen.has(c)) continue; seen.add(c);
      const r = charRec(c) || 0;
      if (q >= 2) store.put('chars', c, Math.min(12, r + 1));
      else if (q === 0) store.put('chars', c, Math.max(0, r - 2));
      else if (r === 0 && charRec(c) == null) store.put('chars', c, 0);
    }
  }

  // ---------------- drawing helpers ----------------
  const TONE_PATH = { 1: 'M3 4 L27 4', 2: 'M3 13 L27 3', 3: 'M3 5 Q13 17 27 6', 4: 'M3 3 L27 14' };
  function toneSVG(t, w = 30, h = 16, sw = 2) {
    if (!t) return `<svg class="tm" width="${w}" height="${h}" viewBox="0 0 30 16" aria-hidden="true"><circle cx="15" cy="10" r="2.2" fill="currentColor"/></svg>`;
    return `<svg class="tm" width="${w}" height="${h}" viewBox="0 0 30 16" aria-hidden="true"><path d="${TONE_PATH[t]}" stroke="currentColor" stroke-width="${sw}" fill="none" stroke-linecap="round"/></svg>`;
  }
  const BRUSH = { 1: 'M8 12 C30 9 66 9 88 12', 2: 'M10 32 C40 30 66 18 86 6', 3: 'M10 12 C30 40 56 40 86 14', 4: 'M10 6 C34 12 62 24 86 34' };
  const brushSVG = (t, w = 96, h = 40, sw = 7) => `<svg width="${w}" height="${h}" viewBox="0 0 96 40" aria-hidden="true"><path d="${BRUSH[t]}" stroke-width="${sw}" fill="none" stroke-linecap="round"/></svg>`;
  const TONE_WORD = { 1: 'high', 2: 'rising', 3: 'dip', 4: 'falling', 0: 'light' };

  /** Render a sentence. o.pinyin: 'auto' (fade setting) | true | false; o.focus: syllable index; o.status: index→{st,label};
   *  o.glue: keep punctuation on the line of the syllable before it (for narrow boxes) */
  function sentHTML(sy, o = {}) {
    const mode = o.pinyin == null ? 'auto' : o.pinyin;
    const pset = setting('pinyin');
    const hideAll = mode === false || (mode === 'auto' && pset === 'hide');
    const cls = ['sent', o.small ? 'sm' : '', hideAll ? 'nopy' : '', (o.marks ?? setting('toneMarks')) ? '' : 'notm', o.blur ? 'blur' : ''].join(' ');
    const parts = sy.map((x, i) => {
      if (!x.p) return `<span class="syl punct"><span class="tm"></span><span class="py"></span><span class="hz">${esc(x.c)}</span></span>`;
      const st = o.status && o.status[i];
      const faded = mode === 'auto' && pset === 'fade' && !x.er && mastered(x.c);
      const fresh = o.markNew && !x.er && charRec(x.c) == null;
      const py = x.er ? 'r' : (x.ps || x.p);
      return `<span class="syl ${faded ? 'faded' : ''} ${fresh ? 'newword' : ''} ${o.focus === i ? 'focus' : ''} ${st ? 'st-' + st.st : ''}">` +
        (x.er ? '<span class="tm"></span>' : toneSVG(x.s)) + `<span class="py pinyin">${esc(py)}</span><span class="hz">${esc(x.c)}</span>` +
        (o.status ? `<span class="fb">${st ? esc(st.label || '') : ''}</span>` : '') + '</span>';
    });
    if (o.glue) for (let i = parts.length - 1; i > 0; i--) if (!sy[i].p && sy[i - 1].p) parts.splice(i - 1, 2, `<span class="glue">${parts[i - 1]}${parts[i]}</span>`);
    return `<div class="${cls}" data-sent>` + parts.join('') + '</div>';
  }
  view.addEventListener('click', e => {
    const s = e.target.closest('[data-sent]'); if (!s) return;
    if (s.classList.contains('blur')) { s.classList.remove('blur'); return; }
    s.classList.toggle('peek');
  });

  function diffHTML(user, target) {
    const a = [...user], b = [...target], m = a.length, n = b.length;
    const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0, out = '';
    while (i < m && j < n) {
      if (a[i] === b[j]) { out += esc(a[i]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out += `<del>${esc(a[i])}</del>`; i++; }
      else { out += `<ins>${esc(b[j])}</ins>`; j++; }
    }
    while (i < m) out += `<del>${esc(a[i++])}</del>`;
    while (j < n) out += `<ins>${esc(b[j++])}</ins>`;
    return `<div class="diff">${out}</div>`;
  }
  const ICON = {
    close: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3L15 9L5 15Z" fill="currentColor"/></svg>',
    mic: '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="9" y="3" width="8" height="13" rx="4" fill="currentColor"/><path d="M5 12a8 8 0 0 0 16 0M13 20v4" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    stop: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="5" y="5" width="12" height="12" rx="2" fill="currentColor"/></svg>',
    gear: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M14 4L7 11L14 18" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  };

  // ---------------- feedback: ink + seal ----------------
  function celebrate(ev, stage) {
    sfx('ok');
    if (ev && ev.clientX != null) {
      const d = document.createElement('div'); d.className = 'ink-spread';
      d.style.left = ev.clientX + 'px'; d.style.top = ev.clientY + 'px';
      document.body.appendChild(d); setTimeout(() => d.remove(), 800);
    }
    if (stage) { const s = document.createElement('div'); s.className = 'seal-stamp'; s.innerHTML = '<span>对</span>'; s.setAttribute('aria-label', 'Correct'); stage.appendChild(s); }
  }
  const missed = () => sfx('no');

  // ---------------- pitch graph (ink style) ----------------
  // Target shapes (x: time across the syllable, y: 0 low – 1 high). A 3rd tone dips fully only at the end of a phrase;
  // elsewhere it stays low (half-third). A light (neutral) syllable sits relative to the tone before it.
  const TARGET = { 1: [[0, .86], [1, .86]], 2: [[0, .45], [1, .9]], 4: [[0, .95], [1, .15]], 3: [[0, .32], [.55, .06], [1, .14]], '3f': [[0, .35], [.5, .06], [1, .45]] };
  const NEUTRAL_Y = { 1: .45, 2: .55, 3: .72, 4: .22, 0: .4 };
  const MARK = { ok: '✓', slip: '✗', unsure: '?' };
  /**
   * Draws each syllable's target shape in its own slot and, from an analysis (Tones.analyse), the learner's pitch for
   * that syllable inside the same slot, so each part is compared with the right shape. `live` frames: dots while recording.
   * `m` (Tones.withWords): the word check too. A wrong word's character turns red with what was heard above it, a
   * missing one is pale with a dash above, an extra syllable is shown as +的 between two slots; their tone is not judged.
   */
  function drawGraph(canvas, syls, an, live, m) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 300, H = canvas.clientHeight || 150;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
    const words = m && m.checked, top = an ? 20 : 8, bot = H - (words ? 46 : 24), y = v => bot - v * (bot - top);
    const weights = syls.map(x => x.s === 0 ? 0.55 : 1), tw = weights.reduce((a, b) => a + b, 0) || 1;
    let x0 = 6; const xs = weights.map(w => { const a = x0; x0 += w / tw * (W - 12); return [a, x0]; });
    const pad = (a, b) => Math.min(6, (b - a) * 0.15);
    const res = an && an.syls, ws = words ? m.syls : null;
    const offWord = i => ws && (ws[i].word === 'wrong' || ws[i].word === 'miss');
    syls.forEach((s, i) => {
      const [a, b] = xs[i], p = pad(a, b), r = res && res[i], w = ws && ws[i];
      const verdict = w ? w.tone : r && r.verdict;
      const tone = r && r.verdict === 'ok' && s.alt && s.alt.includes(r.heard) ? r.heard : s.s; // a 3rd tone that may change: the form they used
      let shape = tone === 3 && (s.final || i === syls.length - 1) ? TARGET['3f'] : TARGET[tone];
      if (s.s === 0) { const v = NEUTRAL_Y[i ? syls[i - 1].s : 0]; shape = [[0, v], [1, v - .05]]; }
      g.strokeStyle = col('--rule'); g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); shape.forEach(([px, py], k) => { const X = a + p + px * (b - a - 2 * p), Y = y(py); k ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      const cx = (a + b) / 2;
      g.textAlign = 'center';
      g.fillStyle = w && w.word === 'miss' ? col('--ink3') : (w && w.word === 'wrong') || verdict === 'slip' || s.bad ? col('--seal') : col('--ink2');
      g.font = `15px ${col('--serif-zh')}`; g.fillText(s.c, cx, H - 5);
      if (w && w.word === 'wrong' && w.heard) { g.fillStyle = col('--seal'); g.font = `13px ${col('--serif-zh')}`; g.fillText(w.heard, cx, H - 25); }
      if (w && w.word === 'miss') { g.strokeStyle = col('--seal'); g.lineWidth = 1.6; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(cx - 7, H - 30); g.lineTo(cx + 7, H - 30); g.stroke(); g.setLineDash([]); }
      if (r) {
        g.font = `600 12px ${col('--sans')}`;
        if (offWord(i)) { g.fillStyle = col('--ink3'); g.fillText('–', cx, 12); }
        else { g.fillStyle = verdict === 'slip' ? col('--seal') : verdict === 'ok' ? col('--ok') : col('--ink3'); g.fillText(MARK[verdict], cx, 12); }
      }
    });
    if (words) m.extra.forEach(e => {
      const X = e.after < 0 ? xs[0][0] + 4 : e.after >= syls.length - 1 ? xs[syls.length - 1][1] - 4 : xs[e.after][1];
      g.fillStyle = col('--seal'); g.font = `12px ${col('--serif-zh')}`; g.textAlign = e.after < 0 ? 'left' : e.after >= syls.length - 1 ? 'right' : 'center';
      g.fillText('+' + e.c, X, H - 25);
    });
    if (live && live.length) {
      const pts = live.filter(f => f.f0);
      if (pts.length) {
        const t1 = Math.max(2000, live[live.length - 1].t);
        const st = pts.map(f => 12 * Math.log2(f.f0 / 100)); const lo = Math.min(...st) - 1, hi = Math.max(...st) + 1;
        g.fillStyle = col('--seal');
        pts.forEach((f, k) => { g.beginPath(); g.arc(6 + f.t / t1 * (W - 12), y(.08 + .84 * (st[k] - lo) / Math.max(4, hi - lo)), 2, 0, 7); g.fill(); });
      }
    }
    if (res && an.ref) {
      // the speaker's range (this recording and earlier ones) maps onto the targets' low–high scale
      const lo = an.ref.mid - an.ref.span / 2, Y = st => y(Math.max(0, Math.min(1, .08 + .84 * (st - lo) / an.ref.span)));
      g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
      res.forEach((r, i) => {
        const P = r.pts; if (!P || P.length < 2) return;
        const [a, b] = xs[i], p = pad(a, b), t0 = P[0].t, T = Math.max(1, P[P.length - 1].t - t0);
        const verdict = ws ? ws[i].tone : r.verdict;
        g.strokeStyle = offWord(i) ? col('--ink3') : verdict === 'slip' ? col('--seal') : col('--ink');
        g.beginPath(); P.forEach((q, k) => { const X = a + p + (q.t - t0) / T * (b - a - 2 * p); k ? g.lineTo(X, Y(q.st)) : g.moveTo(X, Y(q.st)); }); g.stroke();
      });
    }
  }

  // ---------------- tone feedback in plain words ----------------
  const HEARD = { 1: 'high and level', 2: 'rising', 3: 'low', 4: 'falling' };
  const SHOULD = (s, final) => s.s === 0 ? 'be light and short' : s.s === 3 ? (s.alt ? 'dip or rise' : final ? 'dip low and come back up' : 'stay low') : { 1: 'stay high and level', 2: 'rise', 4: 'fall' }[s.s];
  /**
   * Feedback for one take, in one short paragraph, most important first: wrong words, missing and extra ones, then
   * the tones of the words that were right, then what was unclear. m: Tones.withWords (words may be unchecked).
   */
  function takeFeedback(syls, an, m) {
    const res = an ? an.syls : null, W = m.syls, zh = t => `<span class="zh">${esc(t)}</span>`;
    // neighbouring syllables with the same problem read as one word: 电视 instead of 电脑
    const runs = st => { const out = []; W.forEach((w, i) => { if (w.word !== st) return; const last = out[out.length - 1]; if (last && last.end === i - 1) { last.end = i; last.c += syls[i].c; last.h += w.heard || ''; } else out.push({ start: i, end: i, c: syls[i].c, h: w.heard || '' }); }); return out; };
    const items = [];
    const single = WORDSET.has(syls.map(x => x.c).join('')), word = single && W.some(w => w.word === 'wrong'); // a single word: said whole (电视 instead of 电脑)
    if (word) items.push(`you said ${zh(W.map((w, i) => w.word === 'wrong' ? w.heard : w.word === 'miss' ? '' : syls[i].c).join(''))} instead of ${zh(syls.map(x => x.c).join(''))}`);
    else runs('wrong').forEach(r => items.push(`you said ${zh(r.h)} instead of ${zh(r.c)}`));
    if (!word) runs('miss').forEach(r => items.push(`${zh(r.c)} was missing`));
    m.extra.forEach(e => items.push(`there was an extra ${zh(e.c)}`));
    const wordItems = items.length;
    const slips = [], unsure = [];
    if (res) W.forEach((w, i) => { if (w.tone === 'slip') slips.push(i); else if (w.tone === 'unsure' && w.word !== 'wrong' && w.word !== 'miss') unsure.push(i); });
    slips.forEach(i => {
      const s = syls[i], fin = s.final || i === syls.length - 1, h = W[i].toneHeard;
      const heard = W[i].word === 'tone' && W[i].heard ? `like ${zh(W[i].heard)}` : h === 3 && fin ? 'dipped' : h === 0 ? 'light' : HEARD[h] || 'different';
      const why = s.t != null && s.t !== s.s ? ` (${esc(s.c)} changes tone here)` : '';
      items.push(`${zh(s.c)} sounded ${heard}; it should ${SHOULD(s, fin)}${why}`);
    });
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    let text = '';
    if (items.length) {
      // wrong words read as one sentence, then each tone slip as its own; at most three things, one tone after word problems
      const wordPart = items.slice(0, Math.min(3, wordItems)), tonePart = items.slice(wordItems, wordItems + Math.max(0, Math.min(wordItems ? 1 : 3, 3 - wordPart.length)));
      const more = items.length - wordPart.length - tonePart.length;
      if (wordPart.length) text += cap(wordPart.length > 1 ? wordPart.slice(0, -1).join(', ') + ' and ' + wordPart[wordPart.length - 1] : wordPart[0]) + '.';
      tonePart.forEach(t => { text += (text ? ' ' : '') + cap(t) + '.'; });
      if (more) text += ` And ${more} more ${more > 1 ? 'things' : 'thing'} to look at in the graph.`;
      if (wordItems && !slips.length && res) text += ' The other tones matched.';
      if (!wordItems && m.checked) text = (single ? 'The word was right. ' : 'Every word was right. ') + text;
    } else {
      const okN = W.filter(w => w.tone === 'ok').length;
      const right = single ? 'The word was right.' : 'The words were right.';
      text = !res ? right : !unsure.length ? (m.checked ? (single ? 'The word and its tones matched.' : 'Every word and every tone matched.') : 'Every tone matched.')
        : (m.checked ? right + ' ' : '') + `${okN} of ${res.length} tones matched.`;
    }
    const list = ix => zh(ix.map(i => syls[i].c).join(' '));
    const unheard = unsure.filter(i => !res[i].p), unclearTone = unsure.filter(i => res[i].p); // (empty without a pitch analysis)
    if (!wordItems) text += (unheard.length ? ` I couldn't hear ${list(unheard)} clearly.` : '') + (unclearTone.length ? ` I'm not sure about the tone of ${list(unclearTone)}.` : '');
    const doubt = W.map((w, i) => w.word === 'unsure' ? i : -1).filter(i => i >= 0);
    if (doubt.length && !wordItems) text += ` I'm not sure I heard ${list(doubt)} right.`;
    if (res && unsure.length === res.length && !wordItems) text += ' Try again a little slower, a bit closer to the phone.';
    return { html: `<div class="note fadein"><p>${text}</p></div>`, slips: slips.length, unsure: unsure.length, ok: W.filter(w => w.tone === 'ok').length };
  }

  // ---------------- word check for the pitch recorder ----------------
  // Where a take's transcript comes from, in order: the browser's speech recognition running alongside the pitch capture
  // (where this device can share the microphone; learned per device in `meta` `liveWords`), else the optional
  // on-device model (transcribe.js, Settings) on the audio just recorded, else a separate "Check my words" recording.
  const liveRecord = () => store.get('meta', 'liveWords', null);
  const liveOK = () => Recognizer.supported && (liveRecord() || {}).state !== 'no';
  const TRANSCRIBE_SIZE = { download: 87, stored: 104 }; // MB, as in transcribe.js (not loaded until needed)
  const transcribeOK = () => typeof WebAssembly === 'object' && 'caches' in window && !!(window.OfflineAudioContext || window.webkitOfflineAudioContext);
  const modelOn = () => setting('words') && transcribeOK();
  let transcribeLoad = null;
  function ensureTranscribe() {
    if (!modelOn()) return Promise.resolve(false);
    if (!transcribeLoad) transcribeLoad = (async () => { await loadScript('js/transcribe.js'); return window.Transcribe.load(); })()
      .catch(() => false).then(ok => { if (!ok) transcribeLoad = null; return ok; }); // offline on the first try: try again next time
    return transcribeLoad;
  }
  /** Where a recording's words come from on this device right now, in plain words (Settings). */
  function wordSourceNow() {
    const r = liveRecord() || {};
    if (Recognizer.supported && r.state !== 'no') return r.state === 'yes' ? 'words checked by speech recognition at the same time (works on this device)' : 'words checked by speech recognition at the same time (if this device allows it; it is tried on your first recordings)';
    if (modelOn()) return 'words checked on this phone by the downloaded model';
    if (Recognizer.supported) return 'this device cannot check words while recording, so use “Check my words” after recording (or turn on the download above)';
    return 'tones only (no speech recognition here; the download above can check words)';
  }
  const wordSourceText = () => Recognizer.supported && (liveRecord() || {}).state !== 'no'
    ? 'When you shadow or say a word, speech recognition checks your words during the same recording. Where a phone cannot do that (often iPhone), this small speech model checks them instead.'
    : 'Your phone cannot check words with speech recognition during the same recording. This small speech model checks them instead, on the phone.';
  // the optional models' files sit in the library's own cache; each can be removed alone
  const MEANING_MODEL = 'Xenova/bge-small-zh-v1.5', TRANSCRIBE_MODEL = 'Xenova/whisper-base';
  async function modelStored(model) {
    if (!('caches' in window) || !(await caches.has('transformers-cache'))) return false;
    const c = await caches.open('transformers-cache');
    return (await c.keys()).some(r => r.url.includes('/' + model + '/'));
  }
  async function dropModel(model, keepLibrary) {
    if (!('caches' in window)) return;
    const c = await caches.open('transformers-cache');
    for (const r of await c.keys()) if (r.url.includes('/' + model + '/')) await c.delete(r);
    if (!keepLibrary) { await caches.delete('tingshuo-meaning'); if (!(await c.keys()).length) await caches.delete('transformers-cache'); }
  }
  const allSure = cmp => ({ ...cmp, syl: cmp.syl.map(x => ({ ...x, sure: true })), extra: cmp.extra.map(x => ({ ...x, sure: true })) });
  /** sy: the target's syllable data (sentence `sy`), as compareSpeech expects. */
  const recognised = (sy, text) => allSure(ZH.compareSpeech(sy, ZH.normalizeHeard(text)));
  const bestGuess = sy => alts => alts.map((a, i) => [a, ZH.compareSpeech(sy, a).score - i * 0.01]).sort((a, b) => b[1] - a[1])[0][0];
  /** The recording's speech, with a little margin (frame times are ms from the start of the recording). */
  function speechSpan(frames) {
    const trk = Tones.track(frames); if (!trk) return null;
    return [Math.max(0, trk.sf[0].t - 350), trk.sf[trk.sf.length - 1].t + 400];
  }
  async function modelWords(sy, blob, frames) {
    if (!(await ensureTranscribe())) return null;
    let x = await window.Transcribe.decodeBlob(blob);
    const span = speechSpan(frames); if (span) x = x.subarray(Math.floor(span[0] * 16), Math.min(x.length, Math.ceil(span[1] * 16)));
    return window.Transcribe.check(x, sy, ZH);
  }

  /**
   * Graph + record/play controls. host gets the graph; controls go into ctlHost. `sy` (the target's syllable data)
   * turns on the word check (`item`: its id, for the speech log). onDone(merged, analysis) after each take, and again when a late word check arrives.
   */
  function recorder(graphHost, ctlHost, syls, nativeText, onDone, { sy = null, item = null } = {}) {
    graphHost.innerHTML = `<div class="graphcard"><canvas class="graph${sy ? ' words' : ''}"></canvas>
      <div class="legend"><span><i style="background:var(--rule);height:6px"></i>target</span><span><i style="background:var(--ink)"></i>you</span><span data-msg>Tap the red button and speak.</span></div></div>
      <div data-tfb></div>${sy ? '<p class="center" data-wcheck hidden style="margin:6px 0 0"><button class="linkbtn" data-check>Check my words</button></p>' : ''}`;
    ctlHost.innerHTML = `<div class="controls">
      <button class="round" data-native aria-label="Play the sentence">${ICON.play}</button>
      <button class="round big" data-rec aria-label="Record yourself">${ICON.mic}</button>
      <button class="round" data-mine aria-label="Play your recording" disabled>Me</button></div>`;
    const cv = $('canvas', graphHost), msg = $('[data-msg]', graphHost), fb = $('[data-tfb]', graphHost), rec = $('[data-rec]', ctlHost), mine = $('[data-mine]', ctlHost);
    let audio = null, recording = false, last = null, merged = null, take = 0;
    const redraw = () => drawGraph(cv, syls, last, null, merged);
    requestAnimationFrame(redraw);
    if (window.ResizeObserver) { let w = 0; new ResizeObserver(() => { if (cv.clientWidth !== w && !recording) { w = cv.clientWidth; redraw(); } }).observe(cv); }
    $('[data-native]', ctlHost).onclick = () => say(nativeText);
    mine.onclick = () => { if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); } };
    // the separate check, when no transcript can come with the recording itself
    const wc = $('[data-wcheck]', graphHost);
    // (the on-device model does not check a single syllable: too short for it to tell reliably)
    const modelHere = () => modelOn() && sy && hanOnly(sy).length > 1;
    const showFallback = () => { if (wc) wc.hidden = !(Recognizer.supported && !liveOK() && !modelHere()); };
    showFallback();
    if (wc) $('[data-check]', wc).onclick = e => speechCheck(e.target, sy, r => { show(last, allSure(r), 'fallback'); if (item) logSpeech(item, r); });
    function show(an, words, source) {
      merged = Tones.withWords(syls, an, words); merged.source = source;
      redraw();
      const f = takeFeedback(syls, an, merged); fb.innerHTML = f.html;
      onDone && onDone(merged, an, f);
    }
    async function record(again) {
      const my = ++take, live = sy && liveOK();
      TTS.stop(); recording = true; rec.classList.add('rec'); rec.innerHTML = ICON.stop; rec.setAttribute('aria-label', 'Stop recording');
      msg.textContent = again || 'Listening… pause to finish.'; fb.innerHTML = '';
      let liveP = null, liveT = 0;
      try {
        const res = await Pitch.start({ onFrame: fr => drawGraph(cv, syls, null, fr), maxMs: 2500 + syls.length * 700,
          onStart: t => { if (!live) return; liveT = t; liveP = Recognizer.listen({ pickBest: bestGuess(sy), silenceMs: 6000, quietMs: 15000, maxMs: 20000 }).then(text => ({ text }), e => ({ error: e.message })); } });
        let heard = null;
        if (liveP) {
          Recognizer.stop();
          heard = await Promise.race([liveP, new Promise(r => setTimeout(() => r({ error: 'timeout' }), 3000))]);
          const v = Audio2.sharedVerdict({ frames: res.frames, lost: res.lost, startT: liveT, ...heard });
          store.put('meta', 'liveWords', Audio2.sharedNext(liveRecord(), v));
          if (v === 'fail' && (res.lost || !Tones.track(res.frames))) {
            // the recogniser took the microphone: this take has no melody. Never again on this device; record once more.
            recording = false; showFallback();
            return record("This phone can't check words while it records your melody. Say it again, please.");
          }
          showFallback();
        }
        // the speaker's pitch range from earlier recordings makes "high" and "low" mean something even for one syllable
        const range = store.get('meta', 'pitchRange', null), an = Tones.analyse(res.frames, syls, range);
        last = an.trk ? an : null; merged = null;
        redraw();
        if (res.url) { audio = new Audio(res.url); mine.disabled = false; }
        if (an.trk) {
          store.put('meta', 'pitchRange', Tones.updateRange(range, an.trk));
          msg.textContent = 'Play “Me” to compare.';
          if (heard && heard.text) show(an, recognised(sy, heard.text), 'live');
          else if (modelHere() && res.blob) {
            show(an, null, null);
            msg.textContent = 'Checking your words…';
            let words = null; try { words = await modelWords(sy, res.blob, res.frames); } catch (e) { words = null; }
            if (my !== take) return;
            msg.textContent = words ? 'Play “Me” to compare.' : 'The word check could not run. Play “Me” to compare.';
            if (words) show(an, words, 'model');
          } else show(an, null, null);
        } else {
          msg.textContent = res.peak < 0.003 ? 'I could barely hear you. Hold the phone closer and try again.'
            : res.peak < res.noise * 4 ? 'Too much background noise. Try somewhere quieter.'
            : 'No clear pitch. Say it a little slower, with full vowels.';
          onDone && onDone(null, an, null);
        }
      } catch (e) {
        if (liveP) Recognizer.stop();
        msg.textContent = /Permission|NotAllowed/i.test(e.name + e.message) ? 'Microphone refused — allow it in browser settings.' : 'Microphone error: ' + e.message;
      }
      recording = false; rec.classList.remove('rec'); rec.innerHTML = ICON.mic; rec.setAttribute('aria-label', 'Record again');
    }
    rec.onclick = () => {
      if (recording) { Pitch.stop(); return; }
      if (!Pitch.supported) { msg.textContent = 'This browser cannot record.'; return; }
      if (modelHere()) ensureTranscribe(); // start the download while they speak
      record();
    };
  }

  // ---------------- speech check ----------------
  /**
   * Listen with the recogniser until the speaker is done (it waits through short pauses); `score` ranks its guesses.
   * onPartial gets the words heard so far. Resolves to the text heard, or null. Tapping again stops.
   */
  async function hear(btn, score, busy = on => { if (on) { btn._label = btn.textContent; btn.textContent = 'Listening… tap when done'; } else btn.textContent = btn._label; }, onPartial) {
    if (!Recognizer.supported) { toast('Word checking needs Chrome or Safari.'); return null; }
    if (btn.dataset.busy) { Recognizer.stop(); return null; }
    TTS.stop(); btn.dataset.busy = '1'; busy(true);
    let text = null;
    try {
      // the recogniser's first guess wins ties: a later one is taken only when it answers clearly better
      text = await Recognizer.listen({ onPartial, pickBest: alts => alts.map((a, i) => [a, score(a) - i * 0.01]).sort((a, b) => b[1] - a[1])[0][0] });
    } catch (e) {
      const m = e.message;
      toast(m === 'no-speech' ? "Didn't catch anything — speak right after tapping." : m === 'not-allowed' || m === 'service-not-allowed' ? 'Speech recognition was refused in browser settings.' : m === 'network' ? 'Word checking needs internet.' : 'Speech check failed (' + m + ').', 3600);
    }
    delete btn.dataset.busy; busy(false);
    return text;
  }
  async function speechCheck(btn, sy, onResult) {
    const text = await hear(btn, a => ZH.compareSpeech(sy, a).score);
    if (text != null) onResult(ZH.compareSpeech(sy, ZH.normalizeHeard(text)));
  }
  /** Speech results feed the tone statistics in Progress. */
  function logSpeech(item, r) {
    store.log({ type: 'speech', item, score: r.score });
    for (const s of r.syl) if (s.t && (s.st === 'tone' || s.st === 'ok')) store.log({ type: 'toneSpeech', tone: s.t, said: s.st === 'ok' ? s.t : s.heard.t });
  }
  /** Syllable marks for a speech result, as sentHTML's `status`. */
  function speechStatus(sy, r) {
    const status = {};
    r.syl.forEach(s => { status[sy.indexOf(s.ref)] = { st: s.st, label: s.st === 'ok' ? '✓' : s.st === 'tone' ? TONE_WORD[s.heard.t] : s.st === 'miss' ? '—' : '✗' }; });
    return status;
  }

  // ---------------- sessions ----------------
  let session = null;
  function startSession(title, entries) {
    entries = entries.filter(e => e.it);
    if (!entries.length) { toast('Nothing to practise here right now.'); return; }
    session = { title, entries, i: 0, results: [], modes: new Set(entries.map(e => e.mode)), requeued: new Set() };
    document.body.classList.remove('tabbed');
    nextItem();
  }
  function frame(inner) {
    const s = session;
    view.innerHTML = `<div class="progressbar"><button class="icon-btn" data-quit aria-label="End session">${ICON.close}</button>
      <div class="track"><div style="width:${s.i / s.entries.length * 100}%"></div></div><span class="small muted">${Math.min(s.i + 1, s.entries.length)} / ${s.entries.length}</span></div>
      <div class="stage fadein" data-stage style="flex:1;display:flex;flex-direction:column;padding-top:40px">${inner || ''}</div>`;
    $('[data-quit]').onclick = endSession;
    return $('[data-stage]');
  }
  function nextItem() {
    const s = session; TTS.stop();
    if (s.i >= s.entries.length) return endSession();
    const { mode, it } = s.entries[s.i];
    const host = frame();
    MODES[mode].render(it, host, (q, extra) => {
      if (q == null) return;
      srs.grade(mode, it.id, q, extra);
      creditChars(it.zh || it.h, q);
      s.results.push(q);
      if (q === 0 && !s.requeued.has(mode + it.id)) { s.requeued.add(mode + it.id); s.entries.push({ mode, it }); }
    }, () => { s.i++; nextItem(); window.scrollTo(0, 0); });
    window.scrollTo(0, 0);
  }
  function endSession() {
    const s = session; if (!s) return route();
    TTS.stop(); session = null;
    const ups = [];
    const downs = [];
    for (const m of s.modes) {
      const up = srs.checkLevelUp(m, MODES[m].pool()); if (up) { ups.push([m, up]); continue; }
      const down = srs.checkLevelDown(m, MODES[m].pool()); if (down) downs.push([m, down]);
    }
    if (ups.length) return chapterPage(ups[0][1], ups.map(u => MODES[u[0]].title));
    if (downs.length) toast(`${downs.map(d => MODES[d[0]].title).join(', ')}: back to HSK ${downs[0][1]} for a while. Your reviews stay.`, 5000);
    const ok = s.results.filter(q => q > 0).length, n = s.results.length;
    view.innerHTML = `<div class="stage fadein" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px">
      <p class="eyebrow">${esc(s.title)}</p>
      <p class="title-zh" style="font-size:64px">${ok} / ${n}</p>
      <p class="lede">${n && ok / n >= .8 ? 'A clean page. Well done.' : 'Missed items come back soon; that is how they stick.'}</p>
      <div class="spacer"></div>
      <button class="btn solid block" data-again>Another round</button>
      <a class="btn block" href="#home">Back to today</a></div>`;
    if (n && ok / n >= .8) setTimeout(() => celebrate(null, $('.stage')), 200);
    $('[data-again]').onclick = () => s.again ? s.again() : startMode(s.entries[0].mode);
  }
  function chapterPage(level, titles) {
    const CH = { 2: ['第二章', '进', 'jìn', 'to advance', '二级'], 3: ['第三章', '升', 'shēng', 'to rise', '三级'] }[level] || ['第一章', '始', 'shǐ', 'to begin', '一级'];
    document.body.classList.remove('tabbed');
    view.innerHTML = `<div class="chapter">
      <div class="vert"><span class="zh">${CH[0]}</span><small>Chapter ${level === 2 ? 'two' : 'three'}</small></div>
      <span class="huge">${CH[1]}</span>
      <div class="seal-sq"><span>${CH[4]}</span></div>
      <p class="serif" style="margin:0;font-size:30px;line-height:1.25">HSK ${level} is open.</p>
      <p class="muted" style="margin:0"><span class="zh">${CH[1]}</span> ${CH[2]} means “${CH[3]}”. Unlocked in: ${esc(titles.join(', '))}.</p></div>
      <a class="btn solid block" href="#home" style="margin-top:24px">Turn the page</a>`;
    sfx('ok');
  }
  function startMode(mode) {
    const M = MODES[mode];
    startSession(M.title, srs.session(mode, M.pool(), Math.min(10, setting('size'))).map(it => ({ mode, it })));
    if (session) session.again = () => startMode(mode);
  }
  function startMix() {
    const size = setting('size'), per = Math.ceil(size / 4) + 1;
    const lists = ['listen', 'shadow', 'translate', 'tone'].map(m => srs.session(m, MODES[m].pool(), per, 3).map(it => ({ mode: m, it })));
    const mix = [];
    for (let k = 0; mix.length < size && lists.some(l => l.length); k++) { const l = lists[k % lists.length]; if (l.length) mix.push(l.shift()); }
    startSession("Today's practice", mix);
    if (session) session.again = startMix;
  }

  // shared pieces for exercise screens
  const playRow = () => `<div class="row" style="margin-top:4px"><button class="round" data-play aria-label="Play" style="background:var(--ink);color:var(--paper);border:0">${ICON.play}</button>
    <button class="btn small" data-slow><span class="zh">慢</span>&nbsp;Slower</button></div>`;
  function wirePlay(host, text) {
    const p = $('[data-play]', host), s = $('[data-slow]', host);
    if (p) p.onclick = () => say(text); if (s) s.onclick = () => say(text, true);
  }
  const contBtn = (label = 'Continue') => `<div class="spacer"></div><button class="btn solid block fadein" data-next>${label}</button>`;
  const SANDHI_NOTE = x => {
    if (x.s === x.t) return '';
    if (x.c === '一') return '一 is 1st tone alone, but 4th before tones 1–3 and 2nd before a 4th tone.';
    if (x.c === '不') return '不 is 4th tone, but becomes 2nd before another 4th tone.';
    if (x.t === 3 && x.s === 2) return 'Two 3rd tones in a row: the first one is said as a 2nd.';
    if (x.s === 0) return 'Said light and short here (neutral tone).';
    return '';
  };

  function mcq(it, host, grade, next, { eyebrow, prompt, autoplay, onAnswered }) {
    const opts = shuffle([{ zh: it.zh, sy: it.sy, right: true }, ...it.d]);
    host.innerHTML = `<p class="eyebrow">${eyebrow}</p>${prompt}
      <div class="opts">${opts.map((o, i) => `<button class="opt" data-o="${i}"><span>${sentHTML(o.sy, { small: true })}<span class="why" hidden></span></span><span class="tag"></span></button>`).join('')}</div>
      <div data-after></div>`;
    wirePlay(host, it.zh);
    $$('[data-o]', host).forEach(b => b.onclick = ev => {
      const o = opts[+b.dataset.o];
      $$('[data-o]', host).forEach((bb, k) => { bb.disabled = true; const oo = opts[k]; const w = $('.why', bb); w.hidden = false; w.textContent = oo.right ? it.en : oo.why; if (oo.right) { bb.classList.add('right'); $('.tag', bb).textContent = autoplay ? 'Heard' : 'Correct'; } });
      b.classList.add('picked'); if (!o.right) $('.tag', b).textContent = 'Your pick';
      grade(o.right ? 2 : 0);
      if (o.right) celebrate(ev, host); else missed();
      $('[data-after]', host).innerHTML = `<div class="note fadein"><p>${o.right ? esc(it.en) : esc(o.why)}</p></div>`;
      host.insertAdjacentHTML('beforeend', contBtn());
      $('[data-next]', host).onclick = next;
      onAnswered && onAnswered(o.right);
    });
  }

  /** The learner's typed answer against the closest correct one (checkTyped result r), as a marked-up diff. */
  function typedDiff(r, input) {
    const t = r.answer;
    const targetCmp = r.hasHan ? [...t.zh].filter(isHan).join('') : t.sy.filter(x => x.p).map(x => x.er ? 'r' : ZH.stripTone(x.p)).join('');
    const userCmp = r.hasHan ? [...input].filter(isHan).join('') : ZH.parsePinyin(input).toneless;
    return diffHTML(userCmp, targetCmp);
  }
  function typedResult(el, r, input, it, q, grade, next) {
    const t = r.answer;
    const head = r.exact ? (r.toneErr ? 'Correct, tones too.' : 'Correct.') : r.close ? 'Almost.' : 'Not quite.';
    let tones = '';
    if (r.toneErr && r.toneErr.length) { const T = hanOnly(t.sy); tones = `<p class="small" style="margin:6px 0 0">Tone slips: ${r.toneErr.map(i => `<b class="zh">${esc(T[i].c)}</b> is <span class="pinyin">${esc(T[i].p)}</span>`).join(', ')}</p>`; }
    el.innerHTML = `<div class="result fadein"><p class="head">${head}</p>
      ${!r.exact ? `<p class="tiny muted" style="margin:0 0 4px">Yours against the answer: <del style="color:var(--seal)">extra</del> · <ins style="text-decoration:none;color:var(--ok)">missing</ins></p>${typedDiff(r, input)}` : ''}${tones}
      <div class="card" style="margin-top:14px">${sentHTML(t.sy, { pinyin: true, small: true })}<p class="en" style="font-size:18px">${esc(it.en)}</p></div>
      <div class="row" style="margin-top:8px"><button class="btn small" data-hear>${ICON.play}&nbsp;Hear it</button>${q < 2 ? '<button class="linkbtn" data-ov>My answer was also right</button>' : ''}</div></div>`;
    let done = false; const g = qq => { if (!done) { done = true; grade(qq); } };
    $('[data-hear]', el).onclick = () => say(t.zh);
    const ov = $('[data-ov]', el); if (ov) ov.onclick = () => { g(2); ov.textContent = 'Counted as right'; ov.disabled = true; };
    if (r.exact) celebrate(null, el.closest('[data-stage]')); else missed();
    el.closest('[data-stage]').insertAdjacentHTML('beforeend', contBtn());
    $('[data-next]', el.closest('[data-stage]')).onclick = () => { g(q); next(); };
    say(t.zh);
  }

  // ---------------- modes ----------------
  function renderShadow(it, host, grade, next) {
    const p = srs.get('shadow', it.id);
    const hide = setting('hideShadow') && p && p.reps >= 1;
    const T = Tones.targetsOf(it.sy);
    host.innerHTML = `<p class="eyebrow">Listen, then say it</p>
      <div data-s style="margin-top:14px">${sentHTML(it.sy, { blur: hide, markNew: true })}</div>
      <p class="en">${esc(it.en)}</p>
      <div data-graph></div>
      <div class="row" style="justify-content:center;gap:4px;margin-top:10px"><button class="linkbtn" data-slow2>Slower</button></div>
      <div class="spacer"></div><div data-ctl></div><div data-grades></div>`;
    // the suggested grade follows the last take: a wrong, missing or extra word is not a pass (Tones.suggestGrade)
    let suggest = 2, details = null;
    const drawGrades = () => {
      $('[data-grades]', host).innerHTML = `<div class="grades">${[['Again', 0], ['Good', 2], ['Easy', 3]].map(([l, q]) => `<button data-q="${q}" class="${q === suggest ? 'sug' : ''}">${l}</button>`).join('')}</div>`;
      $$('[data-q]', host).forEach(b => b.onclick = ev => { const q = +b.dataset.q; grade(q, details || undefined); if (q >= 2) sfx('ok'); next(); });
    };
    recorder($('[data-graph]', host), $('[data-ctl]', host), T, it.zh, m => {
      if (!m) return;
      suggest = Tones.suggestGrade(m); details = takeDetails(m);
      drawGrades();
      if (m.checked) $('[data-s]', host).innerHTML = sentHTML(it.sy, { status: wordStatus(it.sy, m), pinyin: true });
      if (m.checked && suggest === 3) celebrate(null, host);
    }, { sy: it.sy, item: it.id });
    $('[data-slow2]', host).onclick = () => say(it.zh, true);
    drawGrades();
    if (setting('autoplay')) say(it.zh);
  }
  /** What a take found, kept with the answer (event log): words wrong, missing or extra, tone slips, and the source. */
  const takeDetails = m => ({ words: m.checked ? m.source : null, wrong: m.counts.wrong, miss: m.counts.miss, extra: m.counts.extra, slips: m.counts.slips });
  /** Syllable marks for a combined check, as sentHTML's `status`: the heard character under a wrong one. */
  function wordStatus(sy, m) {
    const status = {}, idx = sy.map((x, i) => x.p && !x.er ? i : -1).filter(i => i >= 0);
    m.syls.forEach((w, k) => {
      const st = w.word === 'wrong' ? 'wrong' : w.word === 'miss' ? 'miss' : w.tone === 'slip' ? 'tone' : w.tone === 'ok' ? 'ok' : null;
      if (st) status[idx[k]] = { st, label: st === 'ok' ? '✓' : st === 'wrong' ? w.heard || '✗' : st === 'miss' ? '—' : '✗' };
    });
    return status;
  }

  function renderListen(it, host, grade, next) {
    const p = srs.get('listen', it.id);
    if (!p || p.reps < 2) {
      mcq(it, host, grade, next, { eyebrow: 'Which did you hear?', prompt: playRow(), autoplay: true, onAnswered: ok => { if (!ok) say(it.zh, true); } });
    } else {
      host.innerHTML = `<p class="eyebrow">Write what you hear</p>${playRow()}
        <div class="gap"></div><input class="ink-input" data-in autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Characters or pinyin (wo3 mai3…)" aria-label="Your answer">
        <div data-res></div><div class="spacer"></div><button class="btn solid block" data-check>Check</button>`;
      wirePlay(host, it.zh);
      const inp = $('[data-in]', host);
      const check = () => {
        if (!inp.value.trim()) return;
        const r = ZH.checkTyped(inp.value, [{ zh: it.zh, sy: it.sy }, ...it.alt]);
        $('[data-check]', host).remove(); $('.spacer', host).remove(); inp.disabled = true;
        typedResult($('[data-res]', host), r, inp.value, it, r.exact ? (r.toneErr ? 3 : 2) : r.close ? 1 : 0, grade, next);
      };
      $('[data-check]', host).onclick = check; inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    }
    if (setting('autoplay')) say(it.zh);
  }

  function renderTranslate(it, host, grade, next) {
    const p = srs.get('translate', it.id);
    const prompt = `<p class="serif" style="font-size:28px;line-height:1.25;margin:14px 0 0">${esc(it.en)}</p>`;
    if (!p || p.reps < 1) return mcq(it, host, grade, next, { eyebrow: 'Pick the right Chinese', prompt, onAnswered: () => say(it.zh) });
    host.innerHTML = `<p class="eyebrow">Write it in Chinese</p>${prompt}
      <div class="gap"></div><input class="ink-input" data-in autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Characters or pinyin" aria-label="Your translation">
      <div data-tiles></div><div data-res></div><div class="spacer"></div>
      <div class="row" data-btns><button class="btn grow" data-hint>Hint</button><button class="btn solid" style="flex:2" data-check>Check</button></div>`;
    const inp = $('[data-in]', host); let hinted = false;
    $('[data-hint]', host).onclick = e => {
      hinted = true; e.currentTarget.disabled = true;
      const words = ZH.segmentWords(it.zh, WORDSET);
      const decoys = it.d.flatMap(d => ZH.segmentWords(d.zh, WORDSET)).filter(w => !words.includes(w));
      const tiles = shuffle([...words, ...shuffle([...new Set(decoys)]).slice(0, 3)]);
      $('[data-tiles]', host).innerHTML = `<div class="tiles">${tiles.map((w, i) => `<button class="tile" data-t="${i}">${esc(w)}</button>`).join('')}</div><p class="tiny muted" style="margin:0">Some tiles are decoys. A hint counts as “hard”.</p>`;
      $$('[data-t]', host).forEach(b => b.onclick = () => { inp.value += tiles[+b.dataset.t]; b.classList.add('used'); });
    };
    const check = () => {
      if (!inp.value.trim()) return;
      const r = ZH.checkTyped(inp.value, [{ zh: it.zh, sy: it.sy }, ...it.alt]);
      let q = r.exact ? 2 : r.close ? 1 : 0; if (hinted && q > 1) q = 1;
      $('[data-btns]', host).remove(); $('.spacer', host).remove(); inp.disabled = true;
      typedResult($('[data-res]', host), r, inp.value, it, q, grade, next);
    };
    $('[data-check]', host).onclick = check; inp.onkeydown = e => { if (e.key === 'Enter') check(); };
  }

  function renderToneSpot(it, host, grade, next) {
    const cand = it.sy.map((x, i) => [x, i]).filter(([x]) => x.p && !x.er && !x.x && x.s >= 1 && x.s <= 4);
    const changed = cand.filter(([x]) => x.s !== x.t);
    const pool = changed.length && Math.random() < .35 ? changed : cand;
    if (!pool.length) { next(); return; }
    const [x, idx] = pool[Math.floor(Math.random() * pool.length)];
    const line = it.sy.map((y, i) => i === idx ? `<span class="tzg"><span class="zh">${esc(y.c)}</span></span>` : `<span class="zh" style="font-size:36px;color:var(--ink3)">${esc(y.c)}</span>`).join('');
    host.innerHTML = `<p class="eyebrow">How is <span class="zh">${esc(x.c)}</span> said here?</p>
      <div class="row" style="gap:2px;flex-wrap:wrap;margin-top:22px;justify-content:center">${line}</div>
      <p class="en center" style="margin-top:12px">${esc(it.en)}</p>
      <div class="row" style="justify-content:center;margin-top:12px"><button class="round" data-play aria-label="Play">${ICON.play}</button><button class="btn small" data-slow><span class="zh">慢</span>&nbsp;Slower</button></div>
      <div class="brushes">${[1, 2, 3, 4].map(t => `<button class="brush" data-t="${t}">${brushSVG(t)}<span>${t} · ${TONE_WORD[t]}</span></button>`).join('')}
      <button class="brush lightbtn" data-t="0"><span style="font-size:22px;line-height:1">·</span><span>light</span></button></div><div data-res></div>`;
    wirePlay(host, it.zh);
    $$('[data-t]', host).forEach(b => b.onclick = ev => {
      const said = +b.dataset.t, ok = said === x.s;
      $$('[data-t]', host).forEach(bb => { bb.disabled = true; if (+bb.dataset.t === x.s) bb.classList.add('right'); });
      if (!ok) { b.classList.add('wrong'); missed(); } else celebrate(ev, host);
      grade(ok ? 2 : 0, { tone: x.s, said });
      const note = SANDHI_NOTE(x);
      $('[data-res]', host).innerHTML = `<div class="note fadein"><p><span class="zh">${esc(x.c)}</span> <span class="pinyin">${esc(x.ps)}</span>: ${TONE_WORD[x.s]}. ${esc(note)}</p></div>`;
      host.insertAdjacentHTML('beforeend', contBtn()); $('[data-next]', host).onclick = next;
    });
    if (setting('autoplay')) say(it.zh);
  }

  function renderWordTone(w, host, grade, next) {
    const syl = ZH.spokenTones(w.h), pattern = syl.map(s => s.s), key = p => p.join('');
    const fmt = pat => syl.map((s, i) => ZH.markTone(s.b, pat[i])).join(' ');
    const opts = [pattern], CONF = { 1: [4, 2], 2: [3, 1], 3: [2, 4], 4: [1, 3], 0: [4, 1] };
    for (let g = 0; opts.length < 4 && g < 60; g++) {
      const p = pattern.slice(), i = Math.floor(Math.random() * p.length);
      const pl = Math.random() < .7 ? CONF[p[i]] : [1, 2, 3, 4].filter(t => t !== p[i]); p[i] = pl[Math.floor(Math.random() * pl.length)];
      if (!opts.some(o => key(o) === key(p))) opts.push(p);
    }
    const sh = shuffle(opts.slice());
    host.innerHTML = `<p class="eyebrow">Which tones do you hear?</p>
      <div class="row blur" data-sent style="justify-content:center;gap:6px;margin-top:22px">${syl.map(s => `<span class="tzg"><span class="zh">${esc(s.c)}</span></span>`).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="round" data-play aria-label="Play">${ICON.play}</button><button class="btn small" data-slow><span class="zh">慢</span>&nbsp;Slower</button></div>
      <div class="opts">${sh.map((o, i) => `<button class="opt" data-o="${i}"><span class="serif" style="font-size:24px">${esc(fmt(o))}</span><span class="row" style="gap:4px;color:var(--ink2)">${o.map(t => toneSVG(t, 24, 14, 2.2)).join('')}</span></button>`).join('')}</div>
      <div data-res></div>`;
    wirePlay(host, w.h);
    $$('[data-o]', host).forEach(b => b.onclick = ev => {
      const o = sh[+b.dataset.o], ok = key(o) === key(pattern);
      $$('[data-o]', host).forEach((bb, k) => { bb.disabled = true; if (key(sh[k]) === key(pattern)) bb.classList.add('right'); });
      b.classList.add('picked'); $('[data-sent]', host).classList.remove('blur');
      if (ok) celebrate(ev, host); else missed();
      const notes = syl.map(SANDHI_NOTE).filter(Boolean);
      $('[data-res]', host).innerHTML = `<div class="note fadein"><p><span class="zh">${esc(w.h)}</span> ${esc(fmt(pattern))}: ${esc(w.m)}. ${esc(notes[0] || '')}</p></div>
        <p class="eyebrow" style="margin-top:22px">Now say it</p><div data-g></div><div data-c></div>`;
      const T = syl.map((s, i) => ({ c: s.c, s: s.s, t: s.t, final: i === syl.length - 1 }));
      // graded on Continue: tones named right, and when said, said with the right word (a wrong, missing or extra
      // syllable makes it "nearly", 1); the tones as said are shown but do not lower the grade
      let said = null;
      recorder($('[data-g]', host), $('[data-c]', host), T, w.h, m => { if (m) said = m; },
        { sy: syl.map(s => ({ c: s.c, p: ZH.markTone(s.b, s.t), t: s.t, s: s.s })), item: w.id });
      host.insertAdjacentHTML('beforeend', contBtn());
      $('[data-next]', host).onclick = () => {
        const bad = said && said.checked && said.counts.wrong + said.counts.miss + said.counts.extra > 0;
        grade(!ok ? 0 : bad ? 1 : 2, { pattern: key(pattern), said: key(o), ...(said ? takeDetails(said) : {}) });
        next();
      };
    });
    if (setting('autoplay')) say(w.h);
  }

  const MODES = {
    shadow: { title: 'Shadowing', pool: () => SENT, render: renderShadow, sub: 'Listen, repeat, see your melody' },
    listen: { title: 'Listening', pool: () => SENT, render: renderListen, sub: 'Near-identical sentences, then dictation' },
    translate: { title: 'Translation', pool: () => SENT, render: renderTranslate, sub: 'English to Chinese, no word bank' },
    tone: { title: 'Tones in sentences', pool: () => SENT, render: renderToneSpot, sub: 'One syllable, as it is really said' },
    wordtone: { title: 'Word tones', pool: () => WORDS, render: renderWordTone, sub: 'Hear a word, then say it' },
    // Conversation has its own screen (#talk); its items are the learner's replies, graded like any other mode.
    converse: { title: 'Conversation', pool: () => TALK, open: () => { location.hash = '#talk'; }, sub: 'Short scenes: tap, type or say your reply' },
  };

  // ---------------- conversation ----------------
  // A scene is played through a DialogueEngine (dialogue.js): the screen only sees its turns, never the script.
  const engine = new Dialogue.ScriptedEngine();
  let talk = null;
  const INPUTS = () => [['tap', 'Tap'], ['type', 'Type'], ['speak', 'Speak', !Recognizer.supported]];
  const talkInput = () => { const v = setting('talkInput'); return v === 'speak' && !Recognizer.supported ? 'tap' : v; };
  // Learners who were placed before conversations existed start at their best sentence level.
  if (store.get('levels', 'converse', null) == null) srs.setLevel('converse', Math.max(...['listen', 'shadow', 'translate', 'tone'].map(m => srs.level(m))));
  const dueTalk = now => new Set(TALK.filter(it => { const p = srs.get('converse', it.id); return p && p.due <= now; }).map(it => it.id));

  // ---- optional meaning model (meaning.js): off unless turned on in Settings, loaded only here, never precached ----
  const MEANING_SIZE = { download: 30, stored: 47 }; // MB, as in meaning.js (which is not loaded until needed)
  const meaningOK = () => typeof WebAssembly === 'object' && 'caches' in window;
  let meaningLoad = null;
  const loadScript = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = rej; document.head.appendChild(el); });
  function ensureMeaning() {
    if (!setting('meaning') || !meaningOK()) return Promise.resolve(false);
    if (!meaningLoad) meaningLoad = (async () => {
      await loadScript('js/meaning.js'); try { await loadScript('data/reply-vectors.js'); } catch (e) { /* computed on the phone instead */ }
      if (!(await window.Meaning.load())) return false;
      await window.Meaning.prepare(SCENES); Dialogue.useMeaning(window.Meaning); return true;
    })().catch(() => false).then(ok => { if (!ok) meaningLoad = null; return ok; }); // offline on the first try: try again next time
    return meaningLoad;
  }
  const meaningStatus = () => !meaningOK() ? 'not available in this browser' : window.Meaning && window.Meaning.ready ? 'on'
    : window.Meaning && window.Meaning.state === 'failed' ? 'download failed; it will try again next time' : `getting ready (first time: about ${MEANING_SIZE.download} MB)…`;

  function viewTalk() {
    talk = null; TTS.stop();
    const L = srs.level('converse'), due = dueTalk(Date.now());
    const row = sc => {
      const rec = store.get('talk', sc.id, null), pl = Dialogue.pathLengths(sc);
      const n = TALK.filter(it => it.scene === sc.id && due.has(it.id)).length;
      const r = sc.l > L ? `HSK ${sc.l}` : n ? `${n} to review` : rec ? `Played${rec.n > 1 ? ' ×' + rec.n : ''}` : 'New';
      return `<button class="scene" data-scene="${sc.id}" ${sc.l > L ? 'disabled' : ''}><span class="grow"><span class="zh t">${esc(sc.title)}</span>
        <span class="sub">${esc(sc.en)} · ${pl.min === pl.max ? pl.min : pl.min + '–' + pl.max} replies</span></span><span class="r ${n && sc.l <= L ? 'due' : ''}">${r}</span></button>`;
    };
    view.innerHTML = `<div class="topline"><a class="icon-btn" href="#home" aria-label="Back">${ICON.back}</a><p class="title-zh" style="font-size:30px">对话</p><p class="lede" style="margin:0">Conversation</p></div>
      <p class="small muted" style="margin:16px 0 0">Everyday scenes, a few lines each. Listen, then answer in Chinese.</p>
      <div class="setting"><span class="lbl"><span>Answer by</span>${Recognizer.supported ? '' : '<small>Speaking needs Chrome or Safari</small>'}</span>${segHTML('talkInput', INPUTS())}</div>
      ${setting('meaning') ? `<p class="tiny muted" data-mstat style="margin:8px 0 0">Understanding your own words: ${meaningStatus()}</p>` : ''}
      ${[1, 2, 3].map(l => `<p class="eyebrow" style="margin-top:24px${l > L ? ';color:var(--ink3)' : ''}">HSK ${l}${l > L ? ' · not open yet' : ''}</p>
        <div class="rows">${SCENES.filter(sc => sc.l === l).map(row).join('')}</div>`).join('')}
      <p class="tiny muted" style="margin-top:16px">The next level opens once you have played every scene at yours, most replies right. You can also set it in Settings.</p>`;
    wireSegs(view);
    $$('[data-scene]').forEach(b => b.onclick = () => playScene(SCENES.find(sc => sc.id === b.dataset.scene)));
    const ms = $('[data-mstat]');
    if (ms) ensureMeaning().then(() => { if (ms.isConnected) ms.textContent = 'Understanding your own words: ' + meaningStatus(); });
  }

  function playScene(sc, hidden = false) {
    if (!sc) return;
    TTS.stop(); session = null;
    const learner = { level: srs.level('converse'), met: srs.metWords(), due: dueTalk(Date.now()) };
    talk = { sc, hidden, turn: engine.start(sc, learner), results: [] };
    document.body.classList.remove('tabbed');
    view.innerHTML = `<div class="progressbar"><button class="icon-btn" data-quit aria-label="Leave the scene">${ICON.close}</button>
        <div class="track"><div data-track></div></div><span class="small muted" data-count></span></div>
      <div class="stage talk fadein" data-stage>
        <p class="eyebrow">${esc(sc.en)}${hidden ? ' · no pinyin' : ''}</p><p class="title-zh scene-t">${esc(sc.title)}</p>
        <p class="small muted" style="margin:6px 0 0">${esc(sc.intro)}</p>
        <div class="chat" data-chat></div><div data-ans></div></div>`;
    $('[data-quit]').onclick = () => { if (location.hash === '#talk') viewTalk(); else location.hash = '#talk'; };
    window.scrollTo(0, 0);
    talkLine();
  }
  const pyOpt = () => talk.hidden ? false : 'auto';
  function talkProgress() {
    const done = talk.results.length, total = done + talk.turn.left;
    $('[data-track]').style.width = (done / total * 100) + '%';
    $('[data-count]').textContent = `${Math.min(done + 1, total)} / ${total}`;
  }
  function bubble(cls, html) {
    const el = document.createElement('div'); el.className = 'bub fadein ' + cls; el.innerHTML = html;
    $('[data-chat]').appendChild(el); return el;
  }
  const scrollToEl = el => requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 72), behavior: 'smooth' }));

  /** The app says its line; then the learner answers, or the scene ends. */
  function talkLine() {
    const tk = talk, t = tk.turn, line = t.line;
    const el = bubble('app', `<span class="who">${esc(tk.sc.who)}</span>${sentHTML(line.sy, { pinyin: pyOpt(), glue: true })}
      <p class="gl" ${tk.hidden ? 'hidden' : ''}>${esc(line.en)}</p>
      <div class="acts"><button data-say aria-label="Play again">${ICON.play}Hear</button><button data-slow><span class="zh">慢</span>Slower</button>${tk.hidden ? '<button data-gl>English</button>' : ''}</div>`);
    $('[data-say]', el).onclick = () => say(line.zh);
    $('[data-slow]', el).onclick = () => say(line.zh, true);
    const g = $('[data-gl]', el); if (g) g.onclick = () => { $('.gl', el).hidden = false; g.remove(); };
    talkProgress(); scrollToEl(el);
    if (setting('autoplay')) say(line.zh);
    if (!t.end) return talkAnswer();
    $('[data-ans]').innerHTML = `<button class="btn solid block fadein" data-finish style="margin-top:28px">See how it went</button>`;
    $('[data-finish]').onclick = finishScene;
  }

  function talkAnswer(mode = talkInput()) {
    const tk = talk, t = tk.turn, ans = $('[data-ans]');
    ans.innerHTML = `<div class="answer fadein"><div class="row" style="justify-content:space-between"><p class="eyebrow">Your reply</p>${segHTML('talkInput', INPUTS())}</div><div data-panel></div></div>`;
    wireSegs(ans, () => talkAnswer());
    const panel = $('[data-panel]', ans);
    const send = (utt, ev) => talkReplied(engine.reply(t.state, utt), utt, ev);
    if (mode === 'tap') { // the acceptable replies among near-misses (one each from up to two replies)
      const misses = shuffle(t.options.slice()).slice(0, 2).map(r => shuffle(r.d.slice())[0]);
      const opts = shuffle([...t.options, ...misses].filter((o, i, a) => a.findIndex(x => x.zh === o.zh) === i));
      panel.innerHTML = `<div class="opts">${opts.map((o, i) => `<button class="opt" data-o="${i}">${sentHTML(o.sy, { small: true, pinyin: pyOpt(), glue: true })}</button>`).join('')}</div>`;
      $$('[data-o]', panel).forEach(b => b.onclick = ev => { $$('[data-o]', panel).forEach(x => x.disabled = true); b.classList.add('picked'); send({ text: opts[+b.dataset.o].zh, via: 'choice' }, ev); });
      return;
    }
    // typing and speaking: the English of each acceptable reply is the prompt; showing the Chinese counts as help
    let helped = false;
    panel.innerHTML = `<p class="tiny muted" style="margin:14px 0 0">You could say</p>
      <ul class="says">${t.options.map(r => `<li><span class="en">${esc(r.en)}</span><span data-zh hidden>${sentHTML(r.sy, { small: true, pinyin: pyOpt(), glue: true })}</span></li>`).join('')}</ul>
      <button class="linkbtn" data-help>Show the Chinese</button><div data-in-area></div>`;
    $('[data-help]', panel).onclick = e => { helped = true; e.currentTarget.remove(); $$('[data-zh]', panel).forEach(x => x.hidden = false); };
    const area = $('[data-in-area]', panel);
    if (mode === 'type') {
      area.innerHTML = `<input class="ink-input" data-in autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Characters or pinyin" aria-label="Your reply">
        <button class="btn solid block" data-send style="margin-top:16px">Send</button>`;
      const inp = $('[data-in]', area), go = () => { if (!inp.value.trim()) return; inp.disabled = true; $('[data-send]', area).disabled = true; send({ text: inp.value, via: 'typed', helped }); };
      $('[data-send]', area).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      return;
    }
    area.innerHTML = `<div class="controls"><button class="round big" data-mic aria-label="Say your reply">${ICON.mic}</button></div>
      <p class="heard-live zh center" data-live aria-live="polite"></p>
      <p class="small muted center" data-msg style="margin:6px 0 0">Tap the red button and say your reply.</p>
      <p class="center" style="margin:0"><button class="linkbtn" data-tap>Show choices instead</button></p>`;
    const mic = $('[data-mic]', area), msg = $('[data-msg]', area), live = $('[data-live]', area);
    mic.onclick = async () => {
      const text = await hear(mic, a => Dialogue.speechScore(t.options, a), on => {
        mic.classList.toggle('rec', on); mic.innerHTML = on ? ICON.stop : ICON.mic; mic.setAttribute('aria-label', on ? 'Done' : 'Say your reply');
        if (on) live.textContent = '';
        msg.textContent = on ? 'Listening. Take your time; tap when done.' : 'Tap the red button and say your reply.';
      }, partial => { live.textContent = partial; });
      if (text == null || talk !== tk) return;
      live.textContent = '';
      // the meaning model (when on) embeds what was heard first; the match itself stays synchronous
      if (window.Meaning && window.Meaning.ready) try { await Promise.race([window.Meaning.remember(ZH.normalizeHeard(text)), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
      if (talk === tk) send({ text, via: 'speech', helped });
    };
    $('[data-tap]', area).onclick = () => talkAnswer('tap');
  }

  /** Why a spoken reply wasn't taken: what was heard, and the key word that was missing (or the 不 that wasn't wanted). */
  function retryNote(fb) {
    const heard = fb.heard && fb.heard.heard;
    if (!heard || !heard.trim()) return "I didn't catch anything. Try again, or show the choices.";
    const word = w => `<span class="zh">${esc(w)}</span> <span class="pyw">${esc(ZH.syllablesOf(w).map(x => ZH.markTone(x.b, x.t)).join(' '))}</span>`;
    const why = fb.extraNeg ? ' That says <span class="zh">不</span> or <span class="zh">没</span>, and no reply here does.'
      : fb.missing && fb.missing.length ? ` I missed ${word(fb.missing[0])}${fb.missing[1] ? ' and ' + word(fb.missing[1]) : ''}.` : '';
    return `I heard “<span class="zh">${esc(heard)}</span>”.${why} Try again, or show the choices.`;
  }

  /** Grade the reply, show it in the chat (with any correction), then go on. */
  function talkReplied(nt, utt, ev) {
    const tk = talk; if (!tk) return;
    const fb = nt.feedback, ans = $('[data-ans]');
    if (fb.retry) { $('[data-msg]', ans).innerHTML = retryNote(fb); missed(); return; }
    const r = fb.matched, q = fb.q, good = !fb.distractor && (fb.exact || q >= 2);
    srs.grade('converse', r.id, q, { via: fb.via });
    creditChars(r.zh, q);
    if (fb.heard && !fb.distractor) logSpeech(r.id, fb.heard);
    tk.results.push({ reply: r, q });
    tk.turn = nt;
    const small = { small: true, pinyin: pyOpt(), glue: true };
    let said = sentHTML(r.sy, small), note = '';
    if (fb.distractor) {
      said = `<p class="said"><del>${esc(fb.distractor.zh)}</del></p>` + said;
      note = esc(fb.distractor.why) + '.';
    } else if (fb.heard && fb.own && !fb.partial) {
      // understood in the learner's own words: show what they said, then the scene's wording
      said = `<p class="said own">${esc(fb.said || fb.heard.heard)}</p><p class="also">${good ? 'You could also say' : 'Say it like this'}</p>` + sentHTML(fb.form.sy, small);
      if (!good) note = fb.swapped ? 'Nearly. Mind the order: it changes who does what.' : fb.heard.syl.some(s => s.st === 'tone') ? 'Nearly. Some tones slipped: listen, then say it once more.' : 'Nearly. Listen to how the scene says it.';
    } else if (fb.heard) {
      const marks = fb.heard.syl.some(s => s.st !== 'ok');
      said = sentHTML(fb.form.sy, { small: true, glue: true, pinyin: marks || pyOpt(), status: marks ? speechStatus(fb.form.sy, fb.heard) : null });
      if (!good) note = fb.partial ? 'Nearly. The end was cut off: the marked words were not heard. Here is the whole reply.'
        : fb.swapped ? 'Nearly. Mind the order: it changes who does what.' : 'Nearly. The marked syllables slipped: listen, then say it once more.';
    } else if (fb.typed) {
      said = sentHTML(fb.form.sy, small);
      if (!fb.exact) {
        said = `<div class="said">${typedDiff(fb.typed, utt.text)}</div>` + said;
        note = q === 1 ? 'Almost. Green is what was missing, red what was extra.' : 'Not quite. Here is one way to say it.';
      } else if (!good) note = 'Right, with the Chinese shown.';
    } else if (!good) note = 'Right, with the Chinese shown.';
    const me = bubble('me' + (good ? '' : ' fix'), `${said}<p class="gl" ${tk.hidden ? 'hidden' : ''}>${esc(r.en)}</p>`);
    scrollToEl(me);
    if (good) {
      celebrate(ev);
      ans.innerHTML = '';
      (async () => { if (setting('autoplay') && fb.via !== 'speech') await say(r.zh); if (talk === tk) talkLine(); })();
      return;
    }
    if (q === 0) missed();
    ans.innerHTML = `<div class="note fadein"><p>${note}</p></div><button class="btn solid block fadein" data-next style="margin-top:18px">Continue</button>`;
    $('[data-next]', ans).onclick = () => { if (talk === tk) talkLine(); };
    say(r.zh); // the recast
  }

  /** Every scene at the current level played, and most recent replies at that level right: open the next level. */
  function talkLevelUp() {
    const L = srs.level('converse'); if (L >= 3) return null;
    if (!SCENES.filter(sc => sc.l === L).every(sc => store.get('talk', sc.id, null))) return null;
    const ids = new Set(TALK.filter(it => it.l === L).map(it => it.id));
    const recent = store.events(e => e.type === 'answer' && e.mode === 'converse' && ids.has(e.item)).slice(-20);
    if (recent.length < 12 || recent.filter(e => e.q > 0).length / recent.length < 0.8) return null;
    srs.setLevel('converse', L + 1); return L + 1;
  }

  function finishScene() {
    const tk = talk; if (!tk) return;
    talk = null; TTS.stop();
    const n = tk.results.length, ok = tk.results.filter(x => x.q >= 2).length;
    const prev = store.get('talk', tk.sc.id, null) || { n: 0 };
    store.put('talk', tk.sc.id, { n: prev.n + 1, last: Date.now(), ok, of: n, hidden: tk.hidden });
    const up = talkLevelUp(), redo = tk.results.filter(x => x.q < 2);
    view.innerHTML = `<div class="stage fadein" data-stage style="flex:1;display:flex;flex-direction:column;gap:14px;padding-top:28px">
      <p class="eyebrow">Scene complete${tk.hidden ? ' · no pinyin' : ''}</p>
      <p class="title-zh" style="font-size:48px">${esc(tk.sc.title)}</p>
      <p class="lede">${ok} of ${n} replies right first time. ${ok === n ? 'A clean page.' : 'The others come back for review soon.'}</p>
      ${up ? `<div class="note"><p>HSK ${up} scenes are open now.</p></div>` : ''}
      ${redo.length ? `<p class="eyebrow" style="color:var(--ink2);margin-top:8px">Say these once more</p>
        <div class="rows">${redo.map((x, i) => `<button data-hear="${i}"><span>${sentHTML(x.reply.sy, { small: true, pinyin: true, glue: true })}<span class="sub">${esc(x.reply.en)}</span></span><span class="r">${ICON.play}</span></button>`).join('')}</div>` : ''}
      <div class="spacer"></div>
      <button class="btn solid block" data-replay>Play it again without pinyin</button>
      <div class="row"><button class="btn grow" data-scenes>Other scenes</button><a class="btn grow" href="#home">Today</a></div></div>`;
    $$('[data-hear]').forEach(b => b.onclick = () => say(redo[+b.dataset.hear].reply.zh));
    $('[data-replay]').onclick = () => playScene(tk.sc, true);
    $('[data-scenes]').onclick = () => { if (location.hash === '#talk') viewTalk(); else location.hash = '#talk'; };
    window.scrollTo(0, 0);
    if (n && ok / n >= .8) setTimeout(() => celebrate(null, $('[data-stage]')), 200); else sfx('ok');
  }

  // ---------------- placement ----------------
  // Staged and adaptive: four sentences per level, moving up only after 3 of 4 right.
  // A beginner is done after four questions; a veteran answers twelve. "Not sure" stops lucky guesses.
  function startPlacement() {
    const PER = 4, PASS = 3, res = [];
    const pick = l => shuffle(SENT.filter(s => s.l === l)).slice(0, PER);
    let lvl = 1, items = pick(1), i = 0;
    document.body.classList.remove('tabbed');
    const finish = placed => {
      Object.keys(MODES).forEach(m => srs.setLevel(m, placed));
      store.put('meta', 'placement', { done: Date.now(), level: placed });
      view.innerHTML = `<div class="stage fadein" style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px"><p class="eyebrow">Placement</p>
        <p class="title-zh" style="font-size:56px">HSK ${placed}</p><p class="lede">${res.filter(r => r.ok).length} of ${res.length} right.
        ${placed > 1 ? 'Words from earlier levels still come up now and then, so nothing is skipped. If this level is too hard, the app steps back by itself.' : 'The next level unlocks by itself once this one is solid.'}</p>
        <div class="spacer"></div><a class="btn solid block" href="#home">Begin</a></div>`;
    };
    const show = () => {
      if (i >= items.length) {
        const ok = res.filter(r => r.l === lvl && r.ok).length;
        if (ok < PASS || lvl === 3) return finish(ok >= PASS ? 3 : lvl);
        lvl++; items = pick(lvl); i = 0;
      }
      const it = items[i], n = res.length, total = n + (items.length - i) + (3 - lvl) * PER;
      const opts = shuffle([{ zh: it.zh, sy: it.sy, right: true }, ...it.d]);
      view.innerHTML = `<div class="progressbar"><a class="icon-btn" href="#home" aria-label="Leave">${ICON.close}</a><div class="track"><div style="width:${n / total * 100}%"></div></div><span class="small muted">HSK ${lvl}</span></div>
        <div class="stage" style="padding-top:40px"><p class="eyebrow">Find your level · which did you hear?</p>${playRow()}
        <div class="opts">${opts.map((o, k) => `<button class="opt" data-o="${k}">${sentHTML(o.sy, { small: true, pinyin: true })}<span class="tag"></span></button>`).join('')}</div>
        <button class="linkbtn" data-unsure style="margin-top:14px">Not sure</button></div>`;
      wirePlay(view, it.zh);
      const answer = (ok, b) => {
        res.push({ l: it.l, ok }); store.log({ type: 'placement', item: it.id, ok });
        if (b) b.classList.add('picked'); $$('[data-o]').forEach(bb => bb.disabled = true);
        setTimeout(() => { i++; show(); }, 450);
      };
      $$('[data-o]').forEach(b => b.onclick = () => answer(opts[+b.dataset.o].right, b));
      $('[data-unsure]').onclick = () => answer(false);
      say(it.zh);
    };
    show();
  }

  // ---------------- views ----------------
  function viewHome() {
    const st = srs.stats();
    const placement = store.get('meta', 'placement', null);
    const h = new Date().getHours();
    const [greet, en] = h < 12 ? ['早上好', 'Good morning'] : h < 18 ? ['下午好', 'Good afternoon'] : ['晚上好', 'Good evening'];
    const counts = Object.fromEntries(Object.keys(MODES).map(m => [m, srs.counts(m, MODES[m].pool())]));
    const due = ['listen', 'shadow', 'translate', 'tone'].reduce((a, m) => a + counts[m].due, 0);
    const warn = [];
    if (TTS.supported && !TTS.voices.length) warn.push('No Chinese voice on this device yet. iPhone: Settings › Accessibility › Spoken Content › Voices › Chinese. Android: Settings › Text-to-speech › install Chinese.');
    if (!store.persisted) warn.push('Progress can’t be saved here (private browsing?).');
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    view.innerHTML = `<div class="topline"><div class="seal-logo" aria-label="Tīngshuō"><span>听说</span></div>
        <span class="small muted">${day}${st.streak ? ' · Day ' + st.streak : ''}</span>
        <a class="icon-btn" href="#settings" aria-label="Settings">${ICON.gear}</a></div>
      <div style="margin-top:34px"><p class="title-zh">${greet}</p><p class="lede">${en}. ${due ? due + ' items are waiting.' : 'Nothing due — a good day for new sentences.'}</p></div>
      ${warn.map(w => `<p class="notice">${esc(w)}</p>`).join('')}
      ${!placement ? `<div class="note"><p>New here? A few listening questions find your level. <button class="linkbtn" data-place style="color:var(--seal)">Find my level</button> <button class="linkbtn" data-skip>Start at HSK 1</button></p></div>` : ''}
      <button class="begin" data-mix><span class="zh">练</span><b>Begin</b><span class="small muted">${setting('size')} items · all skills</span></button>
      <div class="rows">${Object.entries(MODES).map(([m, M]) => `<button data-mode="${m}"><span>${M.title}<span class="sub">${M.sub}</span></span><span class="r">${counts[m].due ? counts[m].due + ' due · ' : ''}HSK ${counts[m].level}</span></button>`).join('')}</div>`;
    $('[data-mix]').onclick = startMix;
    $$('[data-mode]').forEach(b => b.onclick = () => MODES[b.dataset.mode].open ? MODES[b.dataset.mode].open() : startMode(b.dataset.mode));
    const pl = $('[data-place]'); if (pl) pl.onclick = startPlacement;
    const sk = $('[data-skip]'); if (sk) sk.onclick = () => { store.put('meta', 'placement', { done: Date.now(), level: 1, skipped: true }); viewHome(); };
  }

  function viewProgress() {
    const st = srs.stats();
    const ev = store.events(e => e.type === 'answer');
    const byDay = {}; ev.forEach(e => { const k = new Date(e.t).toDateString(); byDay[k] = (byDay[k] || 0) + 1; });
    const days = []; const today = new Date(); today.setHours(12);
    const start = new Date(today); start.setDate(start.getDate() - 27);
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) { const n = byDay[d.toDateString()] || 0; days.push({ n, l: n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : 3, today: d.toDateString() === today.toDateString(), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }); }
    const chars = Object.entries(store.all('chars')).sort((a, b) => b[1] - a[1]);
    const nMast = chars.filter(c => c[1] >= 4).length;
    view.innerHTML = `<div class="topline"><p class="title-zh" style="font-size:34px">进步</p><p class="lede" style="margin:0">Progress</p></div>
      <p class="eyebrow" style="margin-top:26px;color:var(--ink2)">Last four weeks</p>
      <div class="dots">${days.map(d => `<span class="l${d.l} ${d.today ? 'today' : ''}" title="${d.label}: ${d.n} answers" aria-label="${d.label}: ${d.n} answers"></span>`).join('')}</div>
      <p class="tiny muted" style="margin:0">Darker ink, more practice. ${st.streak ? st.streak + '-day streak · ' : ''}${st.total} answers in all.</p>
      <p class="eyebrow" style="margin-top:28px;color:var(--ink2)">Tones</p>
      <div class="tonebars">${st.toneAcc.map(t => `<div>${brushSVG(t.t, 64, 28, 6)}<b>${t.n ? Math.round(t.ok / t.n * 100) + '%' : '–'}</b><span>${TONE_WORD[t.t]}</span></div>`).join('')}</div>
      <p class="eyebrow" style="margin-top:28px;color:var(--ink2)">Vocabulary</p>
      <div class="rows">${Object.entries(srs.vocab(window.WORDS)).map(([l, v]) => `<div><span>HSK ${l} words met</span><span class="r">${v.met} / ${v.total}</span></div>`).join('')}</div>
      <p class="eyebrow" style="margin-top:28px;color:var(--ink2)">Levels</p>
      <div class="rows">${Object.entries(MODES).map(([m, M]) => { const c = srs.counts(m, M.pool()); return `<div><span>${M.title}</span><span class="r">HSK ${c.level} · ${c.learned} learned</span></div>`; }).join('')}</div>
      <div class="row" style="justify-content:space-between;margin-top:28px"><p class="eyebrow" style="color:var(--ink2)">Characters you read</p><span class="small muted"><b style="color:var(--seal)">${nMast}</b> of ${chars.length} without pinyin</span></div>
      ${chars.length ? `<div class="copybook">${chars.map(([c, s]) => `<span class="tzg ${s < 4 ? 'dim' : ''}" title="${s >= 4 ? 'Read without pinyin' : 'Still learning'}"><span class="zh">${esc(c)}</span>${s >= 4 ? '<span class="mini-seal"></span>' : ''}</span>`).join('')}</div>
      <p class="tiny muted">A red seal marks characters you now read without pinyin; their pinyin fades in exercises.</p>` : '<p class="small muted">Characters appear here as you practise.</p>'}`;
  }

  let wordFilter = { q: '', l: 0 };
  function viewWords() {
    view.innerHTML = `<div class="topline"><p class="title-zh" style="font-size:34px">词</p><p class="lede" style="margin:0">Words</p></div>
      <input class="search" data-q placeholder="Search 喜欢, xihuan, like…" value="${esc(wordFilter.q)}" aria-label="Search words" style="margin-top:20px">
      <div class="seg" style="margin-top:14px">${[0, 1, 2, 3].map(l => `<button data-l="${l}" class="${l === wordFilter.l ? 'on' : ''}">${l ? 'HSK ' + l : 'All'}</button>`).join('')}</div>
      <div class="rows" data-list style="margin-top:14px"></div>`;
    const draw = () => {
      const q = wordFilter.q.trim().toLowerCase().replace(/\s/g, '');
      const list = window.WORDS.filter(w => (!wordFilter.l || w.l === wordFilter.l) && (!q || w.h.includes(q) || ZH.stripTone(w.p).replace(/\s/g, '').includes(q) || w.m.toLowerCase().includes(q))).slice(0, 200);
      $('[data-list]').innerHTML = list.map(w => `<button class="wordrow" data-w="${esc(w.id)}"><span class="hz zh">${esc(w.h)}</span><span class="grow"><b class="pinyin">${esc(w.p)}</b><span class="sub">${esc(w.m)}</span></span><span class="r">${w.l}</span></button>`).join('') || '<p class="muted">No match.</p>';
    };
    $('[data-q]').oninput = e => { wordFilter.q = e.target.value; draw(); };
    $$('[data-l]').forEach(b => b.onclick = () => { wordFilter.l = +b.dataset.l; $$('[data-l]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('[data-list]').onclick = e => { const r = e.target.closest('[data-w]'); if (r) viewWord(window.WORDS.find(w => w.id === r.dataset.w)); };
    draw();
  }
  function viewWord(w) {
    const syl = ZH.spokenTones(w.h), size = syl.length === 1 ? 240 : syl.length === 2 ? 160 : 110;
    view.innerHTML = `<div class="topline"><button class="icon-btn" data-back aria-label="Back to words">${ICON.back}</button><span class="small muted">Words · HSK ${w.l}</span><span style="width:44px"></span></div>
      <div class="row" style="justify-content:center;gap:10px;margin-top:18px;flex-wrap:wrap">${syl.map((s, i) => `<div class="tzg" style="width:${size}px;height:${size}px"><div data-writer="${i}" style="width:${size}px;height:${size}px"></div></div>`).join('')}</div>
      <p class="tiny muted center" data-wmsg style="margin:8px 0 0">Watch the stroke order, then write it yourself.</p>
      <div class="row" style="justify-content:center;margin-top:8px;gap:8px"><button class="btn small" data-anim>Show strokes</button><button class="btn small solid" data-quiz>Write it</button></div>
      <div style="margin-top:26px"><div class="row" style="align-items:baseline;gap:12px"><span class="zh" style="font-size:40px;font-weight:600">${esc(w.h)}</span><span class="pinyin" style="font-size:22px">${esc(w.p)}</span><span class="row" style="gap:2px;color:var(--ink2)">${syl.map(s => toneSVG(s.s, 26, 14, 2)).join('')}</span></div>
      <p class="serif" style="font-size:21px;margin:6px 0 0">${esc(w.m)}</p></div>
      <div class="spacer"></div><button class="btn block" data-hear>${ICON.play}&nbsp;Hear it</button>`;
    $('[data-back]').onclick = viewWords;
    $('[data-hear]').onclick = () => say(w.h);
    const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
    const writers = [];
    if (window.HanziWriter) {
      syl.forEach((s, i) => {
        try {
          writers.push(HanziWriter.create($(`[data-writer="${i}"]`), s.c, {
            width: size, height: size, padding: Math.round(size * .06), showOutline: true, showCharacter: true,
            strokeColor: col('--ink'), outlineColor: col('--rule2'), highlightColor: col('--seal'), drawingColor: col('--ink'), drawingWidth: Math.max(10, size / 14),
            strokeAnimationSpeed: 1.1, delayBetweenStrokes: 220,
            charDataLoader: (c, ok, err) => fetch('data/strokes/' + encodeURIComponent(c) + '.json').then(r => r.json()).then(ok).catch(err),
          }));
        } catch (e) { /* missing data */ }
      });
    }
    const runAnim = async () => { for (const wr of writers) await new Promise(r => wr.animateCharacter({ onComplete: r })); };
    $('[data-anim]').onclick = runAnim;
    $('[data-quiz]').onclick = () => {
      let k = 0; const msg = $('[data-wmsg]');
      const quizNext = () => {
        if (k >= writers.length) { msg.textContent = 'Written. 好！'; celebrate(null, null); creditChars(w.h, 2); return; }
        msg.textContent = `Write ${syl[k].c} — stroke by stroke. A hint appears after three misses.`;
        writers[k].quiz({ showHintAfterMisses: 3, onComplete: () => { k++; quizNext(); } });
      };
      quizNext();
    };
    say(w.h);
  }

  function viewSettings() {
    TTS.loadVoices();
    const seg = segHTML;
    const sw = k => `<button class="switch" role="switch" data-sw="${k}" aria-checked="${!!setting(k)}" aria-label="${k}"></button>`;
    const row = (l, ctl, sub) => `<div class="setting"><span class="lbl"><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</span>${ctl}</div>`;
    view.innerHTML = `<div class="topline"><a class="icon-btn" href="#home" aria-label="Back">${ICON.back}</a><p class="title-zh" style="font-size:30px">设置</p><p class="lede" style="margin:0">Settings</p></div>
      <p class="eyebrow" style="margin-top:22px">Reading</p>
      ${row('Pinyin', seg('pinyin', [['fade', 'Fade'], ['show', 'Always'], ['hide', 'Never']]), 'Fade hides it on characters you know')}
      ${row('Tone marks above characters', sw('toneMarks'))}
      <p class="eyebrow" style="margin-top:22px">Look &amp; feel</p>
      ${row('Ink', seg('ink', [['auto', 'Auto'], ['day', 'Day'], ['night', 'Night']]), 'Auto follows your phone')}
      ${row('Paper texture', sw('texture'))}
      ${row('Brush sounds', sw('sounds'), 'Soft sounds for answers')}
      <p class="eyebrow" style="margin-top:22px">Practice</p>
      ${row("Today's practice", `<select class="plain" data-size>${[8, 12, 16, 20].map(n => `<option ${setting('size') === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`, 'items per round')}
      ${row('Play audio automatically', sw('autoplay'))}
      ${row('Hide text when shadowing again', sw('hideShadow'))}
      ${row('Understand my own words', meaningOK() ? sw('meaning') : '<span class="small muted">Not available here</span>', `In conversations, a spoken reply in other words is matched by meaning on this phone. One download of about ${MEANING_SIZE.download} MB the next time you open Conversation (${MEANING_SIZE.stored} MB stored), then it works offline. <span data-mstored></span>`)}
      ${row('Check my words on this phone', transcribeOK() ? sw('words') : '<span class="small muted">Not available here</span>', `${wordSourceText()} One download of about ${TRANSCRIBE_SIZE.download} MB the first time you record (${TRANSCRIBE_SIZE.stored} MB stored), then it works offline; checking takes a second or two after each recording. <span data-wstored></span>`)}
      ${row(`Voice speed <b data-ratev>${setting('rate')}×</b>`, `<input type="range" min="0.5" max="1.2" step="0.05" value="${setting('rate')}" data-rate style="width:45%">`)}
      ${TTS.voices.length ? row('Voice', `<select class="plain" data-voice style="max-width:55%">${TTS.voices.map(v => `<option ${TTS.voice && TTS.voice.name === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`) : row('Voice', '<span class="small muted">No Chinese voice found</span>')}
      <button class="linkbtn" data-test>Test the voice</button>
      <p class="eyebrow" style="margin-top:22px">Levels</p>
      ${Object.entries(MODES).map(([m, M]) => row(M.title, `<select class="plain" data-lv="${m}">${[1, 2, 3].map(l => `<option value="${l}" ${srs.level(m) === l ? 'selected' : ''}>HSK ${l}</option>`).join('')}</select>`)).join('')}
      <p class="eyebrow" style="margin-top:22px">Backup &amp; move progress</p>
      <p class="small muted">Progress lives on this device. Copy the code, paste it on the other device: it merges, nothing is lost.</p>
      <div class="row"><button class="btn small solid" data-export>Copy backup code</button><button class="btn small" data-dl>Save as file</button></div>
      <div class="gap"></div><textarea data-code placeholder="Paste a backup code here"></textarea>
      <button class="btn small" data-import style="margin-top:8px">Merge pasted code</button>
      <p class="eyebrow" style="margin-top:22px">This device</p>
      <p class="small muted">Chinese voice ${TTS.voices.length ? '✓' : '✗'} · Word checking ${Recognizer.supported ? '✓' : '✗'} · Microphone ${Pitch.supported ? '✓' : '✗'}<br>When you record: ${esc(wordSourceNow())}</p>
      <button class="btn small" data-reset>Reset all progress</button>
      <p class="tiny muted center" style="margin-top:22px">${SENT.length} sentences · ${window.WORDS.length} words · stroke data © Arphic (APL)</p>`;
    wireSegs(view);
    $$('[data-sw]').forEach(b => b.onclick = () => { const v = !setting(b.dataset.sw); setSetting(b.dataset.sw, v); b.setAttribute('aria-checked', v); if (v && b.dataset.sw === 'sounds') sfx('ok'); });
    // each optional model's files, once downloaded, can be removed here (the library they share goes with the last one)
    const removable = (sel, model, off) => modelStored(model).then(has => {
      const el = $(sel); if (!has || !el) return;
      el.innerHTML = '<button class="linkbtn" style="padding:4px 0">Remove the download</button>';
      $('button', el).onclick = async () => { await off(); toast('Removed'); viewSettings(); };
    });
    removable('[data-mstored]', MEANING_MODEL, async () => {
      setSetting('meaning', false); Dialogue.useMeaning(null); meaningLoad = null;
      if (window.Meaning) window.Meaning.remove && (await window.Meaning.remove({ keepLibrary: await modelStored(TRANSCRIBE_MODEL) }));
      else await dropModel(MEANING_MODEL, await modelStored(TRANSCRIBE_MODEL));
    });
    removable('[data-wstored]', TRANSCRIBE_MODEL, async () => {
      setSetting('words', false); transcribeLoad = null;
      if (window.Transcribe) await window.Transcribe.remove({ keepLibrary: await modelStored(MEANING_MODEL) });
      else await dropModel(TRANSCRIBE_MODEL, await modelStored(MEANING_MODEL));
    });
    $('[data-size]').onchange = e => setSetting('size', +e.target.value);
    $$('[data-lv]').forEach(el => el.onchange = () => srs.setLevel(el.dataset.lv, +el.value));
    const vs = $('[data-voice]'); if (vs) vs.onchange = () => { setSetting('voice', vs.value); TTS.pick(vs.value); };
    const rt = $('[data-rate]'); rt.oninput = () => { $('[data-ratev]').textContent = rt.value + '×'; setSetting('rate', +rt.value); };
    $('[data-test]').onclick = () => say('你好，我们一起学习汉语吧。');
    $('[data-export]').onclick = async () => { const code = store.exportCode(); try { await navigator.clipboard.writeText(code); toast('Backup code copied'); } catch (e) { $('[data-code]').value = code; $('[data-code]').select(); toast('Copy the code from the box'); } };
    $('[data-dl]').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(store.snapshot())], { type: 'application/json' })); a.download = 'tingshuo-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); };
    $('[data-import]').onclick = () => { try { const r = store.importCode($('[data-code]').value); toast(`Merged ${r.records} records, ${r.events} answers`); $('[data-code]').value = ''; } catch (e) { toast(e.message); } };
    const rb = $('[data-reset]'); let armed = false;
    rb.onclick = () => { if (!armed) { armed = true; rb.textContent = 'Tap again to erase everything'; rb.classList.add('red'); return; } store.resetAll(); toast('Progress reset'); viewSettings(); };
  }

  // ---------------- routing ----------------
  function route() {
    const tab = location.hash.slice(1) || 'home';
    if (session) { session = null; TTS.stop(); }
    if (talk) { talk = null; TTS.stop(); Recognizer.stop(); }
    const tabbed = ['home', 'words', 'progress'].includes(tab);
    document.body.classList.toggle('tabbed', tabbed);
    $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    ({ home: viewHome, words: viewWords, progress: viewProgress, settings: viewSettings, talk: viewTalk }[tab] || viewHome)();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  // a link to the view you're already on (tabs, "Begin", "Turn the page"…) re-renders it instead of doing nothing
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const h = a.getAttribute('href');
    if (h === location.hash || (h === '#home' && !location.hash)) { e.preventDefault(); route(); }
  });
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
  route();

  window.__app = { store, srs, start: (mode, ids) => { const M = MODES[mode]; startSession(M.title, ids.map(id => ({ mode, it: M.pool().find(x => x.id === id) }))); }, chapter: chapterPage, mix: startMix, word: id => viewWord(window.WORDS.find(w => w.id === id)),
    play: (id, hidden) => playScene(SCENES.find(s => s.id === id), hidden), talk: () => talk && { scene: talk.sc.id, node: talk.turn.state.node, end: talk.turn.end } };
})();
