/* Spaced repetition + level progression. Pure logic on top of Store. */
(function (global) {
  'use strict';
  const MIN = 60e3, DAY = 864e5;

  // id -> item, filled by attachWords(); lets progress records be traced back to their words.
  const ITEMS = new Map();
  /** Tag every item with the HSK words it contains (it.w) and register it. Words are tagged with themselves. */
  function attachWords(items, words) {
    const list = words.map(w => w.h).sort((a, b) => b.length - a.length);
    for (const it of items) {
      if (!it.w) it.w = it.zh ? [...new Set(list.filter(h => it.zh.includes(h)))] : [it.h];
      ITEMS.set(it.id, it);
    }
    return items;
  }

  function createSRS(store) {
    const key = (mode, id) => mode + ':' + id;
    const get = (mode, id) => store.get('progress', key(mode, id), null);

    /** quality: 0 = wrong, 1 = right with help / almost, 2 = right, 3 = easy */
    function grade(mode, id, quality, extra = {}) {
      const now = Date.now();
      const p = Object.assign({ reps: 0, lapses: 0, ease: 2.3, ivl: 0, seen: 0, ok: 0, due: 0 }, get(mode, id) || {});
      const probe = probes.delete(key(mode, id)) && p.seen === 0;
      p.seen++; p.last = now;
      if (probe && quality >= 2) { // already known from an earlier level
        p.ok++; p.reps = 2; p.ivl = PROBE_DAYS; p.due = now + PROBE_DAYS * DAY;
      } else if (quality === 0) {
        p.lapses++; p.reps = 0; p.ivl = 0; p.ease = Math.max(1.3, p.ease - 0.2); p.due = now + 10 * MIN;
      } else {
        p.ok++;
        if (p.reps === 0) p.ivl = [0, 0.5, 1, 3][quality];
        else p.ivl = Math.max(1, p.ivl * [0, 1.2, p.ease, p.ease * 1.3][quality]);
        if (quality === 1) p.ease = Math.max(1.3, p.ease - 0.15);
        if (quality === 3) p.ease = Math.min(3, p.ease + 0.15);
        p.reps++; p.due = now + p.ivl * DAY;
      }
      store.put('progress', key(mode, id), p);
      store.log(Object.assign({ type: 'answer', mode, item: id, q: quality }, probe ? { probe: true } : {}, extra));
      return p;
    }

    function level(mode) { return store.get('levels', mode, 1); }
    function setLevel(mode, l) { store.put('levels', mode, Math.max(1, Math.min(3, l))); store.put('meta', 'levelAt:' + mode, Date.now()); }

    // ---- vocabulary: which HSK words has the learner already met (answered right, any mode)? ----
    function metWords() {
      const met = new Set(), all = store.all('progress');
      for (const k in all) {
        const p = all[k]; if (!p || !p.ok) continue;
        const it = ITEMS.get(k.slice(k.indexOf(':') + 1));
        if (it && it.w) it.w.forEach(w => met.add(w));
      }
      return met;
    }
    /** Words met per HSK level: { 1: { met, total }, ... } */
    function vocab(words) {
      const met = metWords(), out = {};
      for (const w of words) { const o = out[w.l] = out[w.l] || { met: 0, total: 0 }; o.total++; if (met.has(w.h)) o.met++; }
      return out;
    }

    // Items below the learner's level that they have never seen are "probes": checked lightly, once,
    // and pushed three weeks out if right. A veteran skips the basics without the basics being skipped.
    const probes = new Set();
    const PROBE_DAYS = 21;

    /**
     * Pick a session:
     *  1. due reviews (any level, so nothing learned is dropped after a level change);
     *  2. new items at the current level, favouring sentences that bring one or two words not met yet;
     *  3. a few probes from lower levels, favouring those with the most unmet words.
     */
    function session(mode, items, n = 10, maxNew = 5) {
      const now = Date.now(), L = level(mode);
      const due = [], cur = [], below = [];
      for (const it of items) {
        const p = get(mode, it.id);
        if (p) { if (p.due <= now) due.push([p.due, it]); }
        else if (it.l === L) cur.push(it);
        else if (it.l < L) below.push(it);
      }
      due.sort((a, b) => a[0] - b[0]);
      const out = due.slice(0, n).map(x => x[1]);
      const slots = out.length === 0 ? n : Math.min(maxNew, n - out.length);
      const met = metWords();
      const unmet = it => (it.w || []).filter(w => !met.has(w)).length;
      // i+1: one or two new words is ideal, none is consolidation, many is better left for later
      const tier = u => u === 0 ? 2 : u <= 2 ? 0 : 1;
      const byNewWords = arr => shuffle(arr.slice()).map(it => [unmet(it), it]).sort((a, b) => tier(a[0]) - tier(b[0]) || a[0] - b[0]).map(x => x[1]);
      const byCoverage = arr => shuffle(arr.slice()).map(it => [unmet(it), it]).sort((a, b) => b[0] - a[0] || a[1].l - b[1].l).map(x => x[1]);
      const nProbe = !below.length ? 0 : !cur.length ? slots : Math.min(below.length, Math.max(1, Math.floor(slots / 3)));
      const picksProbe = byCoverage(below).slice(0, nProbe);
      const picksCur = byNewWords(cur).slice(0, slots - picksProbe.length);
      picksProbe.forEach(it => probes.add(mode + ':' + it.id));
      out.push(...picksCur, ...picksProbe);
      if (out.length < n) { // nothing due & no new: practise the weakest ones early
        const weak = items.filter(it => it.l <= L && !out.includes(it)).map(it => [get(mode, it.id), it]).filter(x => x[0])
          .sort((a, b) => (a[0].ok / a[0].seen) - (b[0].ok / b[0].seen) || a[0].due - b[0].due).map(x => x[1]);
        out.push(...weak.slice(0, n - out.length));
      }
      return shuffle(out);
    }

    /** After answers: unlock the next level when the current one is solid. */
    function checkLevelUp(mode, items) {
      const L = level(mode); if (L >= 3) return null;
      const atL = items.filter(it => it.l === L);
      const seen = atL.filter(it => get(mode, it.id)).length;
      const ids = new Set(atL.map(it => it.id));
      const recent = store.events(e => e.type === 'answer' && e.mode === mode && ids.has(e.item)).slice(-30);
      const acc = recent.length ? recent.filter(e => e.q > 0).length / recent.length : 0;
      if (seen >= Math.ceil(atL.length * 0.6) && recent.length >= 15 && acc >= 0.8) { setLevel(mode, L + 1); return L + 1; }
      return null;
    }

    /** Placed too high? Step back one level when the current level keeps going wrong. Reviews are kept. */
    function checkLevelDown(mode, items) {
      const L = level(mode); if (L <= 1) return null;
      const ids = new Set(items.filter(it => it.l === L).map(it => it.id));
      const since = store.get('meta', 'levelAt:' + mode, 0);
      const recent = store.events(e => e.type === 'answer' && e.mode === mode && ids.has(e.item) && e.t >= since).slice(-16);
      if (recent.length < 12) return null;
      const acc = recent.filter(e => e.q > 0).length / recent.length;
      if (acc < 0.5) { setLevel(mode, L - 1); return L - 1; }
      return null;
    }

    function counts(mode, items) {
      const now = Date.now(), L = level(mode); let due = 0, fresh = 0, learned = 0;
      for (const it of items) {
        if (it.l > L) continue;
        const p = get(mode, it.id);
        if (!p) fresh++; else { if (p.due <= now) due++; if (p.reps >= 2) learned++; }
      }
      return { due, fresh, learned, level: L };
    }

    function stats() {
      const ev = store.events(e => e.type === 'answer');
      const days = new Set(ev.map(e => new Date(e.t).toDateString()));
      let streak = 0; const d = new Date();
      if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // streak still alive until tonight
      while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
      const today = ev.filter(e => new Date(e.t).toDateString() === new Date().toDateString());
      const byMode = {};
      for (const e of ev.slice(-400)) { const m = byMode[e.mode] = byMode[e.mode] || { n: 0, ok: 0 }; m.n++; if (e.q > 0) m.ok++; }
      // tone confusion from tone drills and speech checks: expected > heard/said
      const tev = store.events(e => e.tone != null && e.said != null && typeof e.said === 'number');
      const conf = {};
      for (const e of tev) { const k = e.tone + '>' + e.said; conf[k] = (conf[k] || 0) + 1; }
      const toneAcc = [1, 2, 3, 4].map(t => {
        const rel = tev.filter(e => e.tone === t);
        return { t, n: rel.length, ok: rel.filter(e => e.said === t).length };
      });
      return { streak, today: today.length, total: ev.length, byMode, conf, toneAcc };
    }

    return { grade, session, level, setLevel, checkLevelUp, checkLevelDown, counts, stats, get, vocab, metWords };
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  global.createSRS = createSRS; global.shuffle = shuffle; global.attachWords = attachWords;
  if (typeof module !== 'undefined') module.exports = { createSRS, shuffle, attachWords };
})(typeof window !== 'undefined' ? window : globalThis);
