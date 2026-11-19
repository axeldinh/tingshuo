# How Tīngshuō is built

A static web app with no framework and no bundler: GitHub Pages serves `docs/` as is. Content is written by hand in `src/`, turned into data files by a Node build, and everything the learner does is kept on the device.

```
src/ (hand-written content) ──npm run build──▶ docs/data/*.js ──▶ docs/js/* (app, in the browser) ──▶ store (localStorage)
                                                                    ▲
test/ + tools/ (evaluation data, model training, checks) ───────────┘
```

## Modules (`docs/js/`)
Each file is a small `'use strict'` module that sets a global and also exports for Node (so tests run the real code).

| File | Role |
|---|---|
| `store.js` | The only place user data is read or written (see *Storage*). Sync-ready: see SYNC.md. |
| `srs.js` | Spaced repetition, session picking, levels, vocabulary coverage (see *Learning rules*). |
| `chinese.js` | Text: pinyin parsing, typed-answer checking (`checkTyped`), speech-to-syllable comparison (`compareSpeech`: per syllable ok / tone / wrong / miss, plus extra syllables), tone changes (`spokenTones`), recogniser text clean-up. |
| `audio.js` | Text-to-speech (`TTS`), speech recognition that waits through pauses (`Recognizer`), microphone pitch frames and the recording itself (`Pitch`, `frameAnalyser`, `detectPitch`), and whether recognition can share the microphone with the pitch capture (`sharedVerdict`, `sharedNext`). |
| `tones.js` | From pitch frames to a verdict per syllable: track, segment, classify with the small tone model (`docs/data/tone-model.js`), learn the speaker's range. Merges a take's tone verdicts with its word check (`withWords`) and suggests a grade (`suggestGrade`). |
| `dialogue.js` | Conversation engine: `DialogueEngine` interface, `ScriptedEngine`, the spoken/typed reply matcher, scene validation. |
| `meaning.js` | Optional meaning matching for conversation replies (opt-in download, loaded only on the Conversation screen). |
| `transcribe.js` | Optional on-device speech-to-text for the pitch recorder (opt-in download, loaded only when a recording is made): transcribes the recorded audio, and scores each difference from the target so doubtful ones are not reported (`check`, `mark`). |
| `app.js` | Screens and modes (`MODES`), sessions, placement, Progress, Words, Settings, routing (`#home`, `#words`, `#progress`, `#settings`, `#talk`). |

Vendored libraries: `docs/vendor/pinyin-pro.js`, `docs/vendor/hanzi-writer.min.js` (stroke data in `docs/data/strokes/`).

## Content and build
- `src/sentences.src.js`: the sentence bank (level, Chinese, English, other accepted answers, three near-miss distractors with a reason, grammar tag). Format in README.
- `src/dialogues.src.js`: conversation scenes. Format in README and CONVERSATIONS.md.
- `src/hsk/{1,2,3}.json`: HSK word lists.
- `tools/build-data.js` (`npm run build`): writes `docs/data/words.js`, `sentences.js` and `dialogues.js` with syllable data for every line: pinyin, dictionary tone `t`, spoken tone `s` after 一/不 and 3+3 changes and neutral tones, `x` when a 3+3 change across words may or may not happen, and a word split `ws` for replies. It refuses broken scenes and warns about characters outside HSK 1–3 (they have no stroke data). Then `tools/stamp-sw.js` sets the service worker's `VERSION` to a hash of the app files.
- `docs/sw.js`: precaches the app files for offline use, network first. The optional models (meaning, speech-to-text) keep their own caches, which the service worker leaves alone: the library they share in `tingshuo-meaning`, the model files in `transformers-cache`; Settings removes each model's files on its own.

## Learning rules (`srs.js`)
- **Grades**: 0 wrong, 1 right with help or nearly, 2 right, 3 easy. Wrong comes back in 10 minutes; right goes out 0.5 / 1 / 3 days the first time, then grows with an ease factor (1.3–3).
- **Session**: due reviews first (any level, so nothing learned is dropped), then new items at the current level, favouring sentences that bring one or two words not met yet, then a few **probes**: unseen items from lower levels. A probe answered right first time is pushed 21 days out; wrong, it is learned like a new item.
- **Level up** (per mode): 60% of the level's items seen, at least 15 recent answers at that level and 80% of the last 30 right. Conversation also needs every scene at the level played.
- **Level down**: at least 12 answers at the current level since the level changed and under half of the last 16 right. Reviews of harder items continue.
- **Placement**: four sentences per level, three of four right to move on, with "Not sure".
- **Words met**: an HSK word counts as met once any item containing it has been answered right, in any mode.
- **Characters**: each right answer adds one to a character's count (max 12), a wrong one takes two away; from 4 its pinyin fades and it gets a red seal in Progress.

## Speech and tones
- **Spoken replies in conversations** (`audio.js` → `dialogue.js` → optional `meaning.js`): continuous recognition that stops 1.8 s after the last word; the reply is matched word by word (weighted words, synonyms, free order except people and numbers, never a stray 不/没, a wrong number or a swapped content word); near-misses are compared strictly so their reason can be shown. Details and measurements: CONVERSATIONS.md, Phase 2.
- **Word check** (shadowing and word tones): every take gets a transcript of the same recording, from the first source available: (a) the browser's speech recognition running alongside the pitch capture, where the device can share the microphone (judged take by take; a device that cannot is remembered in `meta` `liveWords` and not tried again); (b) the optional on-device model (`transcribe.js`) on the recorded audio (decoded, 16 kHz mono, trimmed to the speech the pitch track found); (c) otherwise a separate "Check my words" recording through speech recognition. The transcript is compared syllable by syllable (`compareSpeech`), each difference from the model is kept only when the model itself finds it at least as likely as the target there (`Transcribe.mark`), and `Tones.withWords` merges words and tones: a wrong or missing syllable's tone is not judged. A wrong, missing or extra word is not a pass (`Tones.suggestGrade`).
- **Word check, measured** (`test/word-eval.js`; the optional model on 1,279 recorded attempts, 16 kHz after Opus at 32 kbit/s with noise, as a phone records them). Before, a take in shadowing or word tones caught no wrong word at all (0%); only a separate recording could.

  | Attempts | right ones passed clean | false "wrong word" on right ones | wrong ones caught |
  |---|---|---|---|
  | sentences, natural synthetic voices (480) | 93.8% | 6.3% | 88.0% (other word 84.6%, missing 93.8%, extra 92.5%) |
  | HSK words of 2+ syllables, real speaker (346) | 89.8% | 5.9% | 72.5% |
  | HSK words of 1 syllable (273) | not judged by the model (it would flag 48% of right ones) | – | – |
  | sentences, rough 8 kHz voice / espeak-ng (180) | 43–48% | 48–57% | 63–85% |

  Reporting every difference instead (no confidence check) catches 98% of wrong sentences but flags 15% of right ones (30% of right two-syllable words). The model chosen is the base size: on the same clips the tiny one misread twice as many characters of sentences (28% vs 14%) and the small one (250 MB) caught fewer wrong sentences with the same check (76% vs 91%) at 2.5× the time. Time per clip in Node: about 2.7 s on one CPU thread (encoder, transcript and scores; 2.4 s of speech); a phone's browser is slower. The browser's recogniser cannot be measured here: on recogniser-style written outputs of the same attempts (digits, homophones, fillers) the comparison passes 100% of right attempts and catches 97.6% of wrong ones (the rest sound the same, e.g. 他/她). Unclear speech raises false alarms: the rough voices show it.
- **Tone graph** (shadowing and word tones): `Pitch` records frames, `tones.js` finds each syllable (silences, consonant onsets, loudness dips and pitch jumps aligned to expected lengths) and classifies its tone against the tone as really spoken in context, with a confidence; low confidence shows "?" instead of a verdict. The speaker's pitch range is learned across recordings. The graph draws each syllable's pitch under its own target shape.

## Storage (`store.js`)
Records `{ id, col, v, updatedAt, device, deleted }` plus an append-only event log; see SYNC.md for merging.

| Collection | Keys | Value |
|---|---|---|
| `progress` | `<mode>:<item id>` | SRS state: reps, lapses, ease, interval, due, seen, ok |
| `levels` | mode name | unlocked HSK level 1–3 |
| `settings` | setting name | user settings (pinyin, tone marks, ink, sounds, rate, voice, session size, `meaning` and `words` for the optional models…) |
| `chars` | character | count of right answers (0–12) |
| `meta` | `placement` | placement result and date |
| `meta` | `levelAt:<mode>` | when that mode's level last changed (level-down only counts answers since) |
| `meta` | `pitchRange` | the speaker's learned pitch range |
| `meta` | `liveWords` | whether speech recognition can run alongside the pitch recording on this device: `state` yes / no / unknown, takes that worked (`ok`), empty takes in a row (`empty`), `why` |

Events: `answer` (mode, item, grade, optional tone/said details and, for shadowing and word tones, what the last take's word check found: `words` source, `wrong`, `miss`, `extra`, `slips`; `probe`), `placement`, `speech`/`toneSpeech` (separate word checks).

## Tests and checks
- `npm test`: `test/unit.js` (logic, data validity, learning rules, synthetic pitch, the word check's merge and microphone-sharing rules), `test/speech-eval.js` (523 recogniser outputs, with accuracy floors), `test/tone-eval.js --check` (tone recognition on recorded, espeak and synthetic voices, with floors), `test/word-eval.js --check` (the word check: the on-device model's transcripts and scores of recorded right and wrong attempts, `test/word-transcripts.json.gz`, and recogniser-style written outputs, with floors). About 12 s.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test`, then rebuilds and fails if `docs/` differs from what is committed.
- `npm run coverage`: HSK words without an example sentence. `npm run check:sw`: service-worker version up to date.
- Dev tools: `tools/embed-replies.js` (meaning-model reply vectors), `tools/tone-data.js` + `tools/tone-espeak.py` (tone evaluation data), `tools/train-tones.js` (tone model, tuning speakers only), `tools/word-data.js` (word-check evaluation: audio outside the repo, transcripts in).

## Plans
- CONVERSATIONS.md: conversation phases (scripted scenes and speech done; reply probabilities and open conversation with a model still to do).
- SYNC.md: adding cloud sync.
