// Precomputes the meaning vector of every scene reply for the optional meaning model (docs/js/meaning.js), so a
// phone only has to embed what the learner said. Needs a local copy of the model files and the library:
//   MEANING_MODEL_DIR=/path/to/models TRANSFORMERS_PATH=/path/to/transformers.node.mjs node tools/embed-replies.js
// Writes docs/data/reply-vectors.js (int8, one scale per vector). The app checks a few against the model it loads
// and computes them itself if they don't match.
const fs = require('fs'), path = require('path');
globalThis.window = globalThis;
require('../docs/data/dialogues.js');
const M = require('../docs/js/meaning.js');
(async () => {
  if (!(await M.loadForNode(process.env.MEANING_MODEL_DIR))) { console.error('Meaning model not available: set MEANING_MODEL_DIR and TRANSFORMERS_PATH.', M.error ? M.error.message : ''); process.exit(1); }
  await M.prepare(window.DIALOGUES);
  const texts = [...M._vectors.keys()].sort(), dim = M._vectors.get(texts[0]).length;
  const q = new Int8Array(texts.length * dim), scale = [];
  texts.forEach((t, i) => {
    const v = M._vectors.get(t), s = Math.max(...v.map(Math.abs)) / 127;
    scale.push(+s.toPrecision(6)); v.forEach((x, k) => { q[i * dim + k] = Math.round(x / s); });
  });
  const out = { model: M.MODEL, dim, texts, scale, data: Buffer.from(q.buffer).toString('base64') };
  const file = path.join(__dirname, '../docs/data/reply-vectors.js');
  fs.writeFileSync(file, 'window.REPLY_VECTORS=' + JSON.stringify(out) + ';\n');
  // how much the int8 copy differs from the model's own vectors
  let worst = 1; texts.forEach((t, i) => { const v = M._vectors.get(t); let d = 0; for (let k = 0; k < dim; k++) d += v[k] * q[i * dim + k] * scale[i]; worst = Math.min(worst, d); });
  console.log(`reply vectors: ${texts.length} x ${dim}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB, worst cosine to the model's own ${worst.toFixed(4)}`);
})();
