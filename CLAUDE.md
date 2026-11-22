# Instructions for Claude (and any coding agent)

Follow **PIPELINE.md**. It is the contract for how code gets from an idea to learners. The short version:

1. Branch from `dev`, never commit to `main`. (If your session fixes a branch name, work there and open the PR against `dev`.)
2. Before you push: `npm run build && npm run verify`. Commit the regenerated `docs/` files too.
3. Open pull requests into `dev`, never into `main`. Open a PR only when asked.
4. **Never lose learner progress.** Read the "Never-break list" in PIPELINE.md before touching `docs/js/store.js`, `src/sentences.src.js`, `src/dialogues.src.js`, `docs/sw.js`, `docs/manifest.webmanifest`.
   - New sentences go at the **end** of `src/sentences.src.js`. Never insert, reorder, or delete one.
   - Never edit or delete anything in `test/fixtures/`; only add. Never lower a floor in `test/*-eval.js` to make a test pass.
   - If a gate fails, fix the cause. Do not skip, loosen or delete the test.
5. Do not hand-merge generated files (`docs/data/*.js`, `docs/sw.js`): take either side, run `npm run build`.
6. Do not put documentation inside `docs/` (it is the published site and its files change the service-worker version). Docs live at the repo root.
