/* Tīngshuō 听说 — Ink & Paper UI */
(function () {
  'use strict';
  const store = createStore();
  const srs = createSRS(store);
  const { TTS, Recognizer, Pitch, contour, guessTone } = window.Audio2;
  const SENT = window.SENTENCES;
  const WORDS = window.WORDS.filter(w => [...w.h].length <= 4);
  const WORDSET = new Set(window.WORDS.map(w => w.h));
  attachWords(SENT, window.WORDS); attachWords(WORDS, window.WORDS); // lets sessions track which words you've met
  const view = document.getElementById('view');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- settings & look ----------------
  const DEFAULTS = { pinyin: 'fade', toneMarks: true, ink: 'auto', texture: true, sounds: true, rate: 0.85, voice: '', autoplay: true, hideShadow: true, size: 12 };
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

  /** Render a sentence. o.pinyin: 'auto' (fade setting) | true | false; o.focus: syllable index; o.status: index→{st,label} */
  function sentHTML(sy, o = {}) {
    const mode = o.pinyin == null ? 'auto' : o.pinyin;
    const pset = setting('pinyin');
    const hideAll = mode === false || (mode === 'auto' && pset === 'hide');
    const cls = ['sent', o.small ? 'sm' : '', hideAll ? 'nopy' : '', (o.marks ?? setting('toneMarks')) ? '' : 'notm', o.blur ? 'blur' : ''].join(' ');
    return `<div class="${cls}" data-sent>` + sy.map((x, i) => {
      if (!x.p) return `<span class="syl punct"><span class="tm"></span><span class="py"></span><span class="hz">${esc(x.c)}</span></span>`;
      const st = o.status && o.status[i];
      const faded = mode === 'auto' && pset === 'fade' && !x.er && mastered(x.c);
      const fresh = o.markNew && !x.er && charRec(x.c) == null;
      const py = x.er ? 'r' : (x.ps || x.p);
      return `<span class="syl ${faded ? 'faded' : ''} ${fresh ? 'newword' : ''} ${o.focus === i ? 'focus' : ''} ${st ? 'st-' + st.st : ''}">` +
        (x.er ? '<span class="tm"></span>' : toneSVG(x.s)) + `<span class="py pinyin">${esc(py)}</span><span class="hz">${esc(x.c)}</span>` +
        (o.status ? `<span class="fb">${st ? esc(st.label || '') : ''}</span>` : '') + '</span>';
    }).join('') + '</div>';
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
  const TARGET = { 1: [[0, .86], [1, .86]], 2: [[0, .45], [1, .9]], 4: [[0, .95], [1, .15]], 3: [[0, .32], [.55, .06], [1, .14]], '3f': [[0, .35], [.5, .06], [1, .45]] };
  function drawGraph(canvas, syls, cont, live) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 300, H = canvas.clientHeight || 150;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
    const top = 8, bot = H - 24, y = v => bot - v * (bot - top);
    const weights = syls.map(x => x.s === 0 ? 0.55 : 1), tw = weights.reduce((a, b) => a + b, 0) || 1;
    let x0 = 6; const xs = weights.map(w => { const a = x0; x0 += w / tw * (W - 12); return [a, x0]; });
    syls.forEach((s, i) => {
      const [a, b] = xs[i];
      let shape = s.s === 3 && i === syls.length - 1 ? TARGET['3f'] : TARGET[s.s];
      if (s.s === 0) { const prev = i ? syls[i - 1].s : 1; const v = { 1: .45, 2: .55, 3: .72, 4: .22, 0: .4 }[prev]; shape = [[0, v], [1, v - .05]]; }
      g.strokeStyle = col('--rule'); g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); shape.forEach(([px, py], k) => { const X = a + 6 + px * (b - a - 12), Y = y(py); k ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      g.fillStyle = s.bad ? col('--seal') : col('--ink2'); g.font = `15px ${col('--serif-zh')}`; g.textAlign = 'center';
      g.fillText(s.c, (a + b) / 2, H - 5);
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
    if (cont) {
      const all = cont.pts.map(p => p.st).sort((a, b) => a - b);
      const lo = all[Math.floor(all.length * .05)], hi = all[Math.floor(all.length * .95)];
      const span = Math.max(5, hi - lo), mid = (lo + hi) / 2;
      const Y = st => y(Math.max(0, Math.min(1, .5 + (st - mid) / span * .8)));
      const X = t => 6 + (t - cont.t0) / Math.max(1, cont.t1 - cont.t0) * (W - 12);
      g.strokeStyle = col('--ink'); g.lineWidth = 2.4; g.lineCap = 'round';
      cont.segs.forEach(seg => { g.beginPath(); seg.forEach((p, k) => k ? g.lineTo(X(p.t), Y(p.st)) : g.moveTo(X(p.t), Y(p.st))); g.stroke(); });
    }
  }

  /** Graph + record/play controls. host gets the graph; controls go into ctlHost. */
  function recorder(graphHost, ctlHost, syls, nativeText, onDone) {
    graphHost.innerHTML = `<div class="graphcard"><canvas class="graph"></canvas>
      <div class="legend"><span><i style="background:var(--rule);height:6px"></i>target</span><span><i style="background:var(--ink)"></i>you</span><span data-msg>Tap the red button and speak.</span></div></div>`;
    ctlHost.innerHTML = `<div class="controls">
      <button class="round" data-native aria-label="Play the sentence">${ICON.play}</button>
      <button class="round big" data-rec aria-label="Record yourself">${ICON.mic}</button>
      <button class="round" data-mine aria-label="Play your recording" disabled>Me</button></div>`;
    const cv = $('canvas', graphHost), msg = $('[data-msg]', graphHost), rec = $('[data-rec]', ctlHost), mine = $('[data-mine]', ctlHost);
    let audio = null, recording = false;
    requestAnimationFrame(() => drawGraph(cv, syls));
    $('[data-native]', ctlHost).onclick = () => say(nativeText);
    mine.onclick = () => { if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); } };
    rec.onclick = async () => {
      if (recording) { Pitch.stop(); return; }
      if (!Pitch.supported) { msg.textContent = 'This browser cannot record.'; return; }
      TTS.stop(); recording = true; rec.classList.add('rec'); rec.innerHTML = ICON.stop; rec.setAttribute('aria-label', 'Stop recording');
      msg.textContent = 'Listening… pause to finish.';
      try {
        const res = await Pitch.start({ onFrame: fr => drawGraph(cv, syls, null, fr), maxMs: 2500 + syls.length * 700 });
        const c = contour(res.frames);
        drawGraph(cv, syls, c);
        if (res.url) { audio = new Audio(res.url); mine.disabled = false; }
        msg.textContent = c ? 'Compare each shape. Then play “Me”.'
          : res.peak < 0.003 ? 'I could barely hear you. Hold the phone closer and try again.'
          : res.peak < res.noise * 4 ? 'Too much background noise. Try somewhere quieter.'
          : 'No clear pitch. Say it a little slower, with full vowels.';
        onDone && onDone(c, cv);
      } catch (e) {
        msg.textContent = /Permission|NotAllowed/i.test(e.name + e.message) ? 'Microphone refused — allow it in browser settings.' : 'Microphone error: ' + e.message;
      }
      recording = false; rec.classList.remove('rec'); rec.innerHTML = ICON.mic; rec.setAttribute('aria-label', 'Record again');
    };
  }

  // ---------------- speech check ----------------
  async function speechCheck(btn, sy, onResult) {
    if (!Recognizer.supported) { toast('Word checking needs Chrome or Safari.'); return; }
    if (btn.dataset.busy) { Recognizer.stop(); return; }
    TTS.stop(); btn.dataset.busy = '1'; const label = btn.textContent; btn.textContent = 'Listening… tap when done';
    try {
      const text = await Recognizer.listen({ pickBest: alts => alts.map(a => [a, ZH.compareSpeech(sy, a).score]).sort((a, b) => b[1] - a[1])[0][0] });
      onResult(ZH.compareSpeech(sy, text));
    } catch (e) {
      const m = e.message;
      toast(m === 'no-speech' ? "Didn't catch anything — speak right after tapping." : m === 'not-allowed' || m === 'service-not-allowed' ? 'Speech recognition was refused in browser settings.' : m === 'network' ? 'Word checking needs internet.' : 'Speech check failed (' + m + ').', 3600);
    }
    delete btn.dataset.busy; btn.textContent = label;
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

  function typedResult(el, r, input, it, q, grade, next) {
    const t = r.answer;
    const targetCmp = r.hasHan ? [...t.zh].filter(isHan).join('') : t.sy.filter(x => x.p).map(x => x.er ? 'r' : ZH.stripTone(x.p)).join('');
    const userCmp = r.hasHan ? [...input].filter(isHan).join('') : ZH.parsePinyin(input).toneless;
    const head = r.exact ? (r.toneErr ? 'Correct, tones too.' : 'Correct.') : r.close ? 'Almost.' : 'Not quite.';
    let tones = '';
    if (r.toneErr && r.toneErr.length) { const T = hanOnly(t.sy); tones = `<p class="small" style="margin:6px 0 0">Tone slips: ${r.toneErr.map(i => `<b class="zh">${esc(T[i].c)}</b> is <span class="pinyin">${esc(T[i].p)}</span>`).join(', ')}</p>`; }
    el.innerHTML = `<div class="result fadein"><p class="head">${head}</p>
      ${!r.exact ? `<p class="tiny muted" style="margin:0 0 4px">Yours against the answer: <del style="color:var(--seal)">extra</del> · <ins style="text-decoration:none;color:var(--ok)">missing</ins></p>${diffHTML(userCmp, targetCmp)}` : ''}${tones}
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
    const T = hanOnly(it.sy);
    host.innerHTML = `<p class="eyebrow">Listen, then say it</p>
      <div data-s style="margin-top:14px">${sentHTML(it.sy, { blur: hide, markNew: true })}</div>
      <p class="en">${esc(it.en)}</p>
      <div data-graph></div><div data-fb></div>
      <div class="row" style="justify-content:center;gap:4px;margin-top:10px"><button class="linkbtn" data-slow2>Slower</button><span class="muted">·</span><button class="linkbtn" data-check>Check my words</button></div>
      <div class="spacer"></div><div data-ctl></div><div data-grades></div>`;
    let suggest = 2;
    const drawGrades = () => {
      $('[data-grades]', host).innerHTML = `<div class="grades">${[['Again', 0], ['Good', 2], ['Easy', 3]].map(([l, q]) => `<button data-q="${q}" class="${q === suggest ? 'sug' : ''}">${l}</button>`).join('')}</div>`;
      $$('[data-q]', host).forEach(b => b.onclick = ev => { const q = +b.dataset.q; grade(q); if (q >= 2) sfx('ok'); next(); });
    };
    recorder($('[data-graph]', host), $('[data-ctl]', host), T, it.zh);
    $('[data-slow2]', host).onclick = () => say(it.zh, true);
    $('[data-check]', host).onclick = e => speechCheck(e.target, it.sy, r => {
      const status = {};
      r.syl.forEach(s => { status[it.sy.indexOf(s.ref)] = { st: s.st, label: s.st === 'ok' ? '✓' : s.st === 'tone' ? TONE_WORD[s.heard.t] : s.st === 'miss' ? '—' : '✗' }; });
      $('[data-s]', host).innerHTML = sentHTML(it.sy, { status, pinyin: true });
      const te = r.syl.filter(s => s.st === 'tone'), wr = r.syl.filter(s => s.st === 'wrong' || s.st === 'miss');
      $('[data-fb]', host).innerHTML = `<div class="note fadein"><p><b>${Math.round(r.score * 100)}% understood.</b> ${te.map(s => `<span class="zh">${esc(s.c)}</span> came out ${TONE_WORD[s.heard.t]} (${esc(ZH.markTone(s.b, s.heard.t))}); it should ${s.t === 3 ? 'dip' : s.t === 1 ? 'stay high' : s.t === 2 ? 'rise' : s.t === 4 ? 'fall' : 'be light'}.`).join(' ')}${wr.length ? ` Not heard: <span class="zh">${wr.map(s => esc(s.c)).join(' ')}</span>.` : ''}${!te.length && !wr.length ? ' Clean.' : ''}</p></div>`;
      suggest = r.score >= .95 ? 3 : r.score >= .75 ? 2 : 0; drawGrades();
      if (r.score >= .95) celebrate(null, host); else if (r.score < .6) missed();
      store.log({ type: 'speech', item: it.id, score: r.score });
      for (const s of r.syl) if (s.t && (s.st === 'tone' || s.st === 'ok')) store.log({ type: 'toneSpeech', tone: s.t, said: s.st === 'ok' ? s.t : s.heard.t });
    });
    drawGrades();
    if (setting('autoplay')) say(it.zh);
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
      grade(ok ? 2 : 0, { pattern: key(pattern), said: key(o) });
      if (ok) celebrate(ev, host); else missed();
      const notes = syl.map(SANDHI_NOTE).filter(Boolean);
      $('[data-res]', host).innerHTML = `<div class="note fadein"><p><span class="zh">${esc(w.h)}</span> ${esc(fmt(pattern))}: ${esc(w.m)}. ${esc(notes[0] || '')}</p></div>
        <p class="eyebrow" style="margin-top:22px">Now say it</p><div data-g></div><p class="small" data-guess style="margin:6px 0 0"></p><div data-c></div>`;
      const T = syl.map(s => ({ c: s.c, s: s.s, t: s.t }));
      recorder($('[data-g]', host), $('[data-c]', host), T, w.h, cont => {
        if (!cont) return;
        const n = T.length, span = cont.t1 - cont.t0, all = cont.pts.map(p => p.st).sort((a, b) => a - b);
        const range = { lo: all[Math.floor(all.length * .05)], hi: all[Math.floor(all.length * .95)] };
        const gs = T.map((s, i) => guessTone(cont.pts.filter(p => p.t >= cont.t0 + span * i / n && p.t <= cont.t0 + span * (i + 1) / n), range));
        $('[data-guess]', host).innerHTML = 'Your tones, roughly: ' + T.map((s, i) => `<b class="zh">${esc(s.c)}</b> ${gs[i] ? TONE_WORD[gs[i]] : '?'}${s.s && gs[i] && gs[i] !== s.s ? ` <span class="muted">(target ${TONE_WORD[s.s]})</span>` : s.s ? ' ✓' : ''}`).join(' · ');
      });
      host.insertAdjacentHTML('beforeend', contBtn()); $('[data-next]', host).onclick = next;
    });
    if (setting('autoplay')) say(w.h);
  }

  const MODES = {
    shadow: { title: 'Shadowing', pool: () => SENT, render: renderShadow, sub: 'Listen, repeat, see your melody' },
    listen: { title: 'Listening', pool: () => SENT, render: renderListen, sub: 'Near-identical sentences, then dictation' },
    translate: { title: 'Translation', pool: () => SENT, render: renderTranslate, sub: 'English to Chinese, no word bank' },
    tone: { title: 'Tones in sentences', pool: () => SENT, render: renderToneSpot, sub: 'One syllable, as it is really said' },
    wordtone: { title: 'Word tones', pool: () => WORDS, render: renderWordTone, sub: 'Hear a word, then say it' },
  };

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
    $$('[data-mode]').forEach(b => b.onclick = () => startMode(b.dataset.mode));
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
    const seg = (k, opts) => `<span class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${setting(k) === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
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
      <p class="small muted">Chinese voice ${TTS.voices.length ? '✓' : '✗'} · Word checking ${Recognizer.supported ? '✓' : '✗'} · Microphone ${Pitch.supported ? '✓' : '✗'}</p>
      <button class="btn small" data-reset>Reset all progress</button>
      <p class="tiny muted center" style="margin-top:22px">${SENT.length} sentences · ${window.WORDS.length} words · stroke data © Arphic (APL)</p>`;
    $$('[data-seg]').forEach(s => $$('button', s).forEach(b => b.onclick = () => { setSetting(s.dataset.seg, b.dataset.v); $$('button', s).forEach(x => x.classList.toggle('on', x === b)); }));
    $$('[data-sw]').forEach(b => b.onclick = () => { const v = !setting(b.dataset.sw); setSetting(b.dataset.sw, v); b.setAttribute('aria-checked', v); if (v && b.dataset.sw === 'sounds') sfx('ok'); });
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
    const tabbed = ['home', 'words', 'progress'].includes(tab);
    document.body.classList.toggle('tabbed', tabbed);
    $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    ({ home: viewHome, words: viewWords, progress: viewProgress, settings: viewSettings }[tab] || viewHome)();
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

  window.__app = { store, srs, start: (mode, ids) => { const M = MODES[mode]; startSession(M.title, ids.map(id => ({ mode, it: M.pool().find(x => x.id === id) }))); }, chapter: chapterPage, mix: startMix, word: id => viewWord(window.WORDS.find(w => w.id === id)) };
})();
