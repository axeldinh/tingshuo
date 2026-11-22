<!-- Into dev: a feature. Into main: a release (dev → main). Full rules: PIPELINE.md -->

## What and why

## Learner data safety (tick or write "n/a")
- [ ] No sentence, scene node or reply was inserted, reordered, renamed or deleted (new ones go at the END)
- [ ] No change to what is stored (keys, shapes, `SCHEMA_VERSION`), or: a migration and a new `test/fixtures/store-vN.json` are included
- [ ] Nothing changes the site's address, scope, or storage key
- [ ] Evaluation floors (`test/*-eval.js`) were not lowered

## Checked
- [ ] `npm run verify` passes locally, `npm run build` was run and committed
- [ ] Tried in the browser (`npm run serve`), on a phone if it touches audio or the microphone
