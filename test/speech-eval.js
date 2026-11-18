/* Spoken-reply evaluation: runs every case of test/speech-cases.js through the conversation matcher and reports
 * how often a right reply is accepted, how often a wrong one is, and how often the learner is asked to try again.
 *
 *   node test/speech-eval.js              summary; exits 1 if the matcher falls below the floors at the bottom
 *   node test/speech-eval.js --fails      also list every case that went wrong
 *   node test/speech-eval.js --tags       also break the numbers down by kind of case
 *   node test/speech-eval.js --baseline   also score the phase-1 matcher, for comparison
 *   node test/speech-eval.js --hide-fresh leave out the blind cases (use while tuning)
 *   node test/speech-eval.js --meaning    also use the optional on-device meaning model (see docs/js/meaning.js)
 */
globalThis.pinyinPro = require('pinyin-pro');
globalThis.window = globalThis;
require('../docs/data/words.js'); require('../docs/data/dialogues.js');
const DLG = require('../docs/js/dialogue.js');
const CASES = require('./speech-cases.js');
const HELD_OUT = new Set(['fruit', 'plans', 'hotel']);
const arg = a => process.argv.includes(a);

/** What the matcher did: retry | miss (a distractor, with its reason) | ok (q 2+) | near (q 1) | wrong (q 0) */
function outcome(m) {
  if (m.retry) return { kind: 'retry' };
  if (m.distractor) return { kind: 'miss', reply: m.reply.id, why: m.distractor.why };
  return { kind: m.q >= 2 ? 'ok' : m.q === 1 ? 'near' : 'wrong', reply: m.reply.id };
}

function run(match) {
  const scene = id => window.DIALOGUES.find(s => s.id === id);
  return CASES.filter(c => !(c[6] && arg('--hide-fresh'))).map(([sc, node, heard, expect, reply, tag, fresh]) => {
    const n = scene(sc).nodes[node];
    if (!n || n.end) throw new Error(`speech case ${sc}/${node}: no such line`);
    const want = String(reply).split('|').filter(x => +x).map(i => n.replies[i - 1].id);
    if (expect !== 'retry' && !want.length) throw new Error(`speech case ${sc}/${node} "${heard}": needs a reply`);
    const got = outcome(match(n, { text: heard, via: 'speech' }));
    const right = got.reply && want.includes(got.reply);
    let grade; // pass | soft | fail | false-accept
    if (expect === 'ok') grade = got.kind === 'ok' && right ? 'pass' : got.kind === 'ok' ? 'false-accept' : got.kind === 'near' && right ? 'soft' : 'fail';
    else if (expect === 'near') grade = (got.kind === 'near' || got.kind === 'ok') && right ? (got.kind === 'near' ? 'pass' : 'soft') : got.kind === 'ok' ? 'false-accept' : 'fail';
    else if (expect === 'miss') grade = got.kind === 'ok' ? 'false-accept' : got.kind === 'miss' && right ? 'pass' : 'soft';
    else grade = got.kind === 'ok' ? 'false-accept' : got.kind === 'retry' ? 'pass' : 'fail';
    return { sc, node, heard, expect, tag, want, got, grade, held: HELD_OUT.has(sc) || !!fresh, fresh: !!fresh };
  });
}

function metrics(rs) {
  const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : null;
  const ok = rs.filter(r => r.expect === 'ok'), pos = rs.filter(r => r.expect === 'ok' || r.expect === 'near');
  const neg = rs.filter(r => r.expect === 'miss' || r.expect === 'retry'), miss = rs.filter(r => r.expect === 'miss'), none = rs.filter(r => r.expect === 'retry');
  return {
    cases: rs.length,
    acceptCorrect: pct(ok.filter(r => r.grade === 'pass').length, ok.length), // right reply said acceptably -> accepted
    understood: pct(pos.filter(r => r.got.reply && r.want.includes(r.got.reply) && (r.got.kind === 'ok' || r.got.kind === 'near')).length, pos.length),
    retry: pct(pos.filter(r => r.got.kind === 'retry').length, pos.length), // right reply, but asked to say it again
    falseAccept: pct(rs.filter(r => r.grade === 'false-accept').length, neg.length + pos.length) , // anything wrong taken as right, over all cases
    falseAcceptNeg: pct(neg.filter(r => r.got.kind === 'ok').length, neg.length), // a distractor or unrelated speech accepted
    reasonShown: pct(miss.filter(r => r.grade === 'pass').length, miss.length), // a distractor said aloud gets its reason
    noneRetried: pct(none.filter(r => r.got.kind === 'retry').length, none.length),
  };
}

function report(rs, label) {
  const row = (name, m) => console.log(`${name.padEnd(12)} ${String(m.cases).padStart(4)}  accept-correct ${String(m.acceptCorrect).padStart(5)}%  understood ${String(m.understood).padStart(5)}%  retry ${String(m.retry).padStart(5)}%  false-accept ${String(m.falseAcceptNeg).padStart(5)}% of wrong (${m.falseAccept}% of all)  reason shown ${m.reasonShown}%  unrelated retried ${m.noneRetried}%`);
  console.log(`\n${label}`);
  row('all', metrics(rs)); row('tuning', metrics(rs.filter(r => !r.held))); row('held out', metrics(rs.filter(r => r.held)));
  if (rs.some(r => r.fresh)) row(' blind', metrics(rs.filter(r => r.fresh)));
  if (arg('--tags')) for (const tag of [...new Set(rs.map(r => r.tag))].sort()) {
    const t = rs.filter(r => r.tag === tag), g = k => t.filter(r => r.grade === k).length;
    console.log(`  ${tag.padEnd(11)} ${String(t.length).padStart(3)}  pass ${g('pass')}  soft ${g('soft')}  fail ${g('fail')}  false-accept ${g('false-accept')}`);
  }
  if (arg('--fails')) for (const r of rs.filter(r => r.grade !== 'pass'))
    console.log(`  ${r.grade.padEnd(12)} ${(r.sc + '/' + r.node).padEnd(16)} ${r.expect.padEnd(5)} ${r.tag.padEnd(10)} “${r.heard}” -> ${r.got.kind}${r.got.reply ? ' ' + r.got.reply.split('-').pop() : ''}${r.got.why ? ' (' + r.got.why + ')' : ''}`);
  return metrics(rs);
}

/** The phase-1 speech matcher (fraction of the reply's syllables heard, in order), kept to measure against. */
function baselineMatch(node, { text }) {
  const ZH = require('../docs/js/chinese.js');
  const forms = node.replies.flatMap(r => [{ r, sy: r.sy }, ...(r.alt || []).map(a => ({ r, sy: a.sy }))]), misses = node.replies.flatMap(r => r.d.map(d => ({ r, d, sy: d.sy })));
  const best = list => list.map(f => [f, ZH.compareSpeech(f.sy, text)]).sort((a, b) => b[1].score - a[1].score)[0];
  const [f, heard] = best(forms), [mf, mheard] = best(misses);
  if (mheard.score >= 0.9 && mheard.score > heard.score) return { reply: mf.r, q: 0, distractor: mf.d };
  return heard.score >= 0.9 ? { reply: f.r, q: 2 } : heard.score >= 0.6 ? { reply: f.r, q: 1 } : { reply: f.r, q: null, retry: true };
}

module.exports = { run, metrics, report, baselineMatch, CASES };

if (require.main === module) (async () => {
  if (arg('--baseline')) report(run(baselineMatch), 'Spoken replies: phase-1 matcher (before)');
  const rs = run(DLG.match);
  const all = report(rs, 'Spoken replies: offline matcher');
  const held = metrics(rs.filter(r => r.held));
  if (arg('--meaning')) {
    const M = require('../docs/js/meaning.js');
    const ok = await M.loadForNode(process.env.MEANING_MODEL_DIR);
    if (!ok) console.log('\nMeaning model not available (set MEANING_MODEL_DIR to a local copy of the model files).');
    else {
      const meaningMatch = DLG.withMeaning(DLG.match, M);
      const rows = [];
      for (const c of CASES) rows.push(c); // warm up embeddings of every heard string, then match synchronously
      await M.prepare(window.DIALOGUES, CASES.map(c => c[2]));
      report(run(meaningMatch), 'Spoken replies: offline matcher + meaning model');
    }
  }
  // Floors: a change to the matcher must not make speech worse than this (held-out numbers are checked too).
  const floors = [['acceptCorrect', 85, 1], ['falseAcceptNeg', 3, -1], ['retry', 10, -1]];
  const bad = [];
  for (const [k, v, dir] of floors) for (const [name, m] of [['all', all], ['held out', held]]) if ((m[k] - v) * dir < 0) bad.push(`${name} ${k} ${m[k]} (floor ${v})`);
  if (bad.length && !arg('--no-floors')) { console.error('\nSpeech matching fell below its floors: ' + bad.join(', ')); process.exit(1); }
})();
