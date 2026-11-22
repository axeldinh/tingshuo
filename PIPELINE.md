# Engineering pipeline

How a change gets from an idea to learners' phones. It binds everyone who changes this repo: people and coding agents alike (`CLAUDE.md` points agents here).

The one promise this pipeline exists to keep: **a release never costs a learner their progress.** Progress lives only in the learner's browser (`localStorage`, see ARCHITECTURE.md → Storage). There is no server copy to restore from, so every mistake that reaches `main` is unrecoverable for the people it hits. That is why most gates below are about stored data, not about features.

## Branches

```
feature/*  ──squash PR──▶  dev  ──merge-commit PR──▶  main  ──Pages──▶  https://axeldinh.github.io/tingshuo/
hotfix/*   ─────────────────────────────PR───────────▶  main   (then main is merged back into dev)
```

| Branch | Is | Who writes to it | How |
|---|---|---|---|
| `main` | **The release.** GitHub Pages serves `docs/` from it, so every commit on `main` is live within minutes. | Nobody directly | Only a pull request from `dev` (or `hotfix/*`), after the gates below |
| `dev` | Integration. Always releasable: it is the next release. | Nobody directly | Pull requests from feature branches, squash-merged |
| `feature/<topic>`, `fix/<topic>` | One change. Short-lived (days). | You | Branch from `dev`, delete after merge |
| `hotfix/<topic>` | An emergency fix to what is live. | You | Branch from `main`, PR into `main`, then merge `main` into `dev` |

Agents whose environment fixes a branch name (for example `ccr-…`) work on that branch exactly like a feature branch: PR into `dev`, never `main`.

## The loop

1. **Start**: `git switch dev && git pull && git switch -c feature/short-name`.
2. **Work in small steps.** `npm run serve` → http://localhost:8000 to try it.
3. **Before every push**: `npm run build && npm run verify`. `build` regenerates `docs/data/*.js` and the service-worker version; commit what it changes. `verify` is the same as CI minus the browser test (about 15 s).
4. **Pull request into `dev`**, filling in the template. CI must be green (gate 1). Squash-merge.
5. **Release** when `dev` has something worth shipping and has been tried by hand (see *Release checklist*): PR `dev → main`, titled `Release: <what is new>`. Gates 1 and 2 run. **Merge with "Create a merge commit"** (not squash or rebase: `dev` must stay an ancestor of `main`, or the next release replays old commits).
6. **After merge**: gate 3 tags the release and checks the live site by itself. Watch it go green (Actions → Release).

Do not release on a whim at the end of a long session, on a Friday, or just before you will be away from your phone: a bad release is only found once you look at the live app.

## Gates

A gate is something that **fails the build**, not a guideline. If one fails, fix the cause. Never skip, loosen, or delete a check to get green (an agent or person doing so should say so loudly in the PR instead).

### Gate 1 — every PR into `dev` and `main`, and every push (`ci.yml` → `verify`)

| Check | Protects against |
|---|---|
| `npm test` → `test/unit.js`, `speech-eval.js`, `tone-eval.js --check`, `word-eval.js --check` | Broken logic and **recognition quality dropping**: the evaluations have floors. A floor may be raised with the improvement that earns it. Never lowered to pass. |
| `npm test` → `test/compat.js` | The *Never-break list* below. Details in the next table. |
| `npm run build` leaves `docs/` unchanged | Shipping stale generated data, or a stale service-worker version (installed apps would never update). |
| Fixtures only grow (PRs only) | Weakening the safety nets in the same PR that breaks them: `test/fixtures/*` may only be **added to**; `released-items.json` may only gain entries. |
| `test/e2e-upgrade.js` (Chromium) | The real app, opened on saved data from every earlier release: all screens load without errors, and after a reload not one event or record is lost. |
| `tools/smoke-live.js` on a local server | A file the service worker precaches is missing: one 404 makes the *whole* offline install fail. |

### Gate 2 — PRs into `main` only (`ci.yml` → `promotion`)

| Check | Protects against |
|---|---|
| Head branch is `dev` or `hotfix/*` | Features sneaking into a release unreviewed on `dev`. |
| `main` is an ancestor of the head | A hotfix on `main` being silently undone by the next release. |
| `RELEASE=1 node test/compat.js` | Every item id that is in this release is recorded in the ledger (`node tools/released-items.js --write`, commit it in the release PR). From then on those ids can never change. |
| Branch protection: PR required, `verify` and `promotion` required, up to date with `main`, no force-push, no deletion, also for admins | Anyone, you included, bypassing the above. Set up once with `tools/setup-github.sh`. |

### Gate 3 — after merge into `main` (`release.yml`)

1. `RELEASE=1 npm test` and `check:sw` once more on the exact commit being published.
2. Tags `vYYYY.MM.DD-N` and creates a GitHub release with notes. **The tag is the rollback point.**
3. `tools/smoke-live.js` polls the real site until `sw.js` shows this release's version (Pages takes 1–3 min), then checks every precached file is served. If Pages never catches up or serves a broken file, the workflow fails and GitHub emails you: roll back at once.

## The Never-break list (what `test/compat.js` enforces)

Each item is a way a release could silently erase or orphan a learner's progress, or leave them with an app that does not start.

| # | Rule | Why | Check |
|---|---|---|---|
| 1 | **Stored data of every released schema loads and nothing is lost.** Fixtures `test/fixtures/store-v*.json` are frozen copies of what real releases saved. | A migration bug or a changed shape wipes progress. | Loads each fixture; no event or record lost; counts of right answers, seen items, characters, levels never go down. |
| 2 | **The storage key stays `tingshuo.v1`.** The schema number inside the data changes through migrations, the key does not. | A new key means the app starts empty and the old data is orphaned. | The real `localStorage` adapter reads the fixture under that key. |
| 3 | **Bumping `SCHEMA_VERSION` needs a migration in `MIGRATIONS` and a new fixture `store-vN.json`** (keep the old ones). | An old device would load data in a shape the code does not understand. | Schema bump without a migration, or without a fixture, fails. |
| 4 | **Item ids keep their meaning.** Progress is stored as `<mode>:<item id>`. Sentence ids are by *position* (`s001`…); reply ids are by position inside a scene node. Add sentences at the **end** of `src/sentences.src.js`; never insert, reorder, rename or delete. Same for scenes, nodes and replies in `dialogues.src.js`. | Inserting one sentence at the top shifts every id: each learner's history would be attached to the wrong sentences. | `test/fixtures/released-items.json` lists every released id with its text; the test fails if any id disappeared or changed text. |
| 5 | **Backup codes from any release still import** (`backup-v*.txt`). Merges refuse data from a *newer* schema instead of damaging it. | The backup code is the only way to move data between phones. | Imports the fixture code. |
| 6 | **Only `store.js` touches browser storage.** | Data written elsewhere is invisible to backup, merge and migration. | Greps the app files. |
| 7 | **Every file `index.html` loads is precached, and every precached file exists.** | Offline start breaks, or the service worker fails to install, and the learner is stuck on the old version. | Parses `sw.js` and `index.html`. |
| 8 | **The optional model caches survive updates**, and both models and `sw.js` use the same pinned library version. | An update would re-download 87 MB models, or the offline cache and the loader would disagree. | Reads `sw.js`, `meaning.js`, `transcribe.js`. |
| 9 | **The app's address and scope never change** (`https://axeldinh.github.io/tingshuo/`, manifest `scope` and `start_url`). | `localStorage` belongs to the *origin*. Renaming the repo, moving to a custom domain or another path gives every learner an empty app; installed home-screen apps stop updating. | `scope` / `start_url` checked. Address change: see *Moving the site* below. |

Things the tests cannot see, so a human (or agent) must check them in review:

- **Do not rename or reinterpret a stored field** (`progress.ease`, `chars` counts, `levels`, `settings.*`) without a migration. Adding a new field with a default is safe; the code must read old records that lack it.
- **Expand, then contract.** A schema change ships in two releases: first one that reads both the old and the new shape and writes the new one; only later, once the old shape is gone from the wild, one that stops reading the old shape. This is what makes rollback possible: an older app loading data written by the newer one must not break it. (`merge` refuses newer data; a plain load does not, so never write something an older release would misread.)
- **Level rules and spaced-repetition numbers** (`srs.js`) change what "due" means for everyone at once: a change that pushes thousands of items due (or demotes levels) on release day is a data-loss in the learner's eyes. Check what the change does to a copy of real saved data: load a fixture, compare what is due before and after.
- **Never raise a level requirement retroactively** so that an unlocked level locks again.
- **Removing a setting or mode**: keep reading its stored value or ignore it quietly; never throw.

## Release checklist (the `dev → main` PR)

- [ ] CI green on the PR; `dev` has no open "fix later" known to affect saved data.
- [ ] `node tools/released-items.js --write` was run and committed if sentences or scenes were added. (`git diff` shows only new entries.)
- [ ] **Upgrade by hand**: on a phone or browser that has the *current live* app with real progress, open this version (`npm run serve`, or use the backup code: Settings → Backup, then import into a fresh profile). Progress, level and Words screen look the same.
- [ ] If `store.js`, `srs.js` or the item data changed: read the diff twice, against the *Never-break list*.
- [ ] If audio or microphone code changed: record once on an iPhone and an Android phone (these differ).
- [ ] PR description says what learners will notice.
- [ ] Merged with **Create a merge commit**.
- [ ] After merge: the Release workflow is green, and the live app, opened from the home screen, shows the new version and keeps its progress.

## Rollback

Symptoms: the Release workflow failed, or the live app is broken, or progress looks wrong.

1. **Stop releasing.** Do not merge anything else into `main`.
2. **Revert, don't rewrite.** Never force-push `main`. Find the release merge commit and revert it on a `hotfix/revert-<tag>` branch: `git revert -m 1 <merge-commit>`, run `npm run build`, PR into `main`. Gates still apply, so it takes minutes, not hours. The service worker version is a hash of the files, so installed apps pick the revert up on their next open, as for any update.
3. **Merge `main` back into `dev`** (a PR `main → dev`, merge commit) so the revert is not undone later.
4. **If saved data was damaged**, a revert alone does not restore it. Learners can only recover from a **backup code** they made earlier; tell them to import it (Settings → Backup merges, so nothing is overwritten). This is why the schema rules above are strict: after a data-damaging release there is no good rollback.
5. Write down what the gate missed and **add the check that would have caught it** (a fixture, a test), in the same PR as the fix.

## Hotfix

A defect in what is live that cannot wait for the next release:

1. `git switch main && git pull && git switch -c hotfix/short-name`. Fix with a test. `npm run build && npm run verify`.
2. PR into `main`: gate 1 runs; gate 2 allows `hotfix/*`. Merge with a merge commit.
3. **Immediately** PR `main → dev` (merge commit). Until you do, the next release is blocked by gate 2 ("main has commits this branch lacks"), so a fix cannot be forgotten.

## Rules for generated files

`docs/data/*.js` and the `VERSION` line in `docs/sw.js` are build output, committed because Pages serves `docs/` as it is. They conflict between branches every time. **Never resolve them by hand**: take either side, run `npm run build`, commit. If two PRs touch `src/`, the second one rebuilds after merging `dev` into it.

## Documentation and `docs/`

`docs/` is the published site, and `tools/stamp-sw.js` hashes every file in it. A Markdown file there would be published *and* would force every installed app to re-download. Keep documentation at the repository root (`README.md`, `ARCHITECTURE.md`, `PIPELINE.md`, …).

## Moving the site (new domain, renamed repo)

This is the one change that cannot be made safe by a test, because the learner's data belongs to the address. Do not do it casually. Plan: ship a release that shows a banner and an export of the backup code, keep the old site running with a "we moved, import your backup here" notice for a long time, and make the new site accept the code (rule 5). Never delete the old site.

## One-time setup (repository owner)

1. Merge this pipeline into `main`.
2. `bash tools/setup-github.sh` (needs `gh` with admin rights): creates `dev` from `main`, protects `dev` and `main` (required checks, no direct pushes, no force-push, also for admins), allows squash and merge-commit merges, and makes `dev` the default branch so new PRs target it. Or do the same by hand in Settings → Branches.
3. Settings → Pages: keep **Deploy from branch → `main` → `/docs`**.
4. Settings → Notifications: have failed workflow runs emailed.

## Reference

| Thing | Where |
|---|---|
| CI | `.github/workflows/ci.yml` |
| Release, tag, live check | `.github/workflows/release.yml` |
| Release gates | `test/compat.js`, `test/e2e-upgrade.js`, `test/fixtures/`, `tools/released-items.js`, `tools/smoke-live.js` |
| PR template | `.github/pull_request_template.md` |
| Dependency updates (monthly, into `dev`) | `.github/dependabot.yml` |
| Commands | `npm run build` · `npm run verify` · `npm run test:e2e` · `npm run check:items` · `npm run serve` |

To add a new safety net after an incident: write the failing test first in `test/compat.js`, add its row to the *Never-break list*, and put the fixture it needs in `test/fixtures/`.
