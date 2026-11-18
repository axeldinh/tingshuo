# Conversations: plan

Goal: open spoken conversations in Mandarin, at the learner's level, that still feel like Tīngshuō (checked Chinese, tones, pinyin that fades, progress that counts). We get there in three phases. Each phase ships on its own and the next one plugs into the same screen and engine interface.

## Principles
- **One conversation screen, swappable engines.** The UI talks to a `DialogueEngine`; phase 1 is scripted, phase 3 is a language model. Nothing in the UI knows which.
- **Every line the app says is at the learner's level.** Scripted lines are checked at build time; model lines are checked at run time (see phase 3) and fall back to scripted lines when they fail.
- **Conversation is practice.** Lines heard and said are graded and feed the SRS, the words-met count and the character copybook, like any other mode.
- **Works offline, on any phone.** Anything heavier (an on-device model) is an opt-in download, never required.

## Engine interface (`docs/js/dialogue.js`)
```js
engine.start(scene, learner)      // -> Turn
engine.reply(state, utterance)    // utterance = { text, via: 'choice' | 'speech' | 'typed' } -> Turn
// Turn = { line: Sentence | null,          // what the app says (zh, en, sy …), null when the scene ends
//          options: Sentence[],            // acceptable learner replies (for hints / multiple choice)
//          distractors: Sentence[],        // near-misses, with `why`
//          feedback?: { matched, score, correction } }
```
`learner` carries level, met words and due items, so an engine can steer toward useful sentences.

## Phase 1: scripted scenes (now)
- **Content:** `src/dialogues.src.js`, about 12 scenes (4 per HSK level), 6–8 exchanges each: ordering food, buying a ticket, asking the way, meeting someone, at the doctor's, making plans… Each app line has 2–3 acceptable learner replies, each reply leads to the next app line (light branching, rejoining), and each reply has near-miss distractors with a reason, like the sentence bank.
- **Build:** `tools/build-data.js` also emits `docs/data/dialogues.js` with the same syllable data (pinyin, tone changes, neutral tones) as sentences. The build fails on an unreachable node, a dead end, a loop, a missing gloss or a distractor equal to an accepted reply; characters above the scene's level are a build warning and a failing unit test.
- **Engine:** `ScriptedEngine` implements the interface.
- **Screen:** chat-style, Ink & Paper look. The app line is spoken and shown with tone shapes (pinyin fades as elsewhere). The learner answers by tapping (beginner), typing, or speaking; speech was matched to the acceptable replies with `compareSpeech` (replaced in phase 2), and a near match gets a gentle recast. Each finished scene offers a replay with pinyin hidden.
- **Progress:** each scene line is an item in a `converse` mode, so it is graded and scheduled; words met and characters are credited.
- **Quality bar:** natural spoken Mandarin (no textbook-isms), every scene playable end to end on a 390 px screen, unit tests for data validity and the engine, a Playwright run through one scene per level.

## Phase 2: understand free speech (now)
Spoken replies used to be compared syllable by syllable with the scripted wording, and recognition stopped at the first pause, so on a phone many right answers were asked again. Phase 2 makes speech reliable first, then adds meaning.

**Listening** (`audio.js`, `Recognizer.listen`): continuous recognition that waits through pauses. It stops 1.8 s after the last word, on a tap, after 8 s of nothing, or at 15 s. Engines that end at a pause anyway (some phones ignore continuous mode) are restarted while the speaker may still be going; repeated or cumulative results (Android, iOS) are merged; every stretch's alternatives are offered to the matcher. The words heard so far show under the button.

**Word matcher** (`dialogue.js`, no model, offline): the build cuts every reply into words (`ws`). A spoken reply is compared word by word: words weigh by meaning (particles and fillers little, numbers and negation most), a short list of everyday synonyms counts (要/想, 可以/能, 不用/不要, 后边/后面…), extra words cost little, order is free except for people and numbers (我请你 ≠ 你请我). Never accepted: a 不/没 no reply has (A-not-A questions like 好不好 excepted), a wrong or missing number or negation in a clause that was said, a content word swapped for another (咖啡 for 茶). A reply cut off at a pause is recast. Scene near-misses are compared strictly (in order, with tones), so one said aloud, even with a filler or an extra word, shows its reason. Recogniser text is cleaned first: traditional characters, digits and clock times (9:30 → 九点半; 806 read digit by digit when the reply does), OK/bye.

**Meaning model** (`meaning.js`, optional): a small Chinese sentence-embedding model run in the browser with transformers.js (pinned on jsDelivr; model files from its model hub, int8, 24 MB). Off by default; Settings → "Understand my own words" (about 30 MB to download, 47 MB stored). It is loaded only on the Conversation screen, is not in the service-worker precache, and survives app updates (library in `tingshuo-meaning`, model files in the library's own `transformers-cache`); Settings can remove it. It is asked only when the word matcher could not take a reply and had no hard reason against it, and accepts the closest reply when it is clearly closest and closer than any reply to another line of the scene; a reply's own sentence with one word swapped must be closer still (0.85 instead of 0.75), because such sentences look alike even when they mean otherwise. Reply vectors are precomputed (`tools/embed-replies.js` → `docs/data/reply-vectors.js`, 212 × 512 int8, 149 KB); the app checks a few against the model it loads and embeds the replies itself if they differ.

**Feedback**: a reply accepted in the learner's own words shows what they said and "You could also say" with the scene's wording; a cut-off reply is recast with the unheard words marked; a retry says what was heard and which key word was missing (or that it said 不 where no reply does).

**Evaluation** (`test/speech-cases.js`, `test/speech-eval.js`, part of `npm test` with floors): 523 recogniser outputs for lines of all 12 scenes with the expected reply and outcome (accept, recast, near-miss, retry): exact, homophones, dropped particles, fillers, cut off at a pause, paraphrases (easy and hard), extra polite words, digits, traditional characters, tone slips, near-misses said aloud (also with fillers), other lines' replies, swapped content words, unrelated speech, silence. Thresholds were tuned on 9 scenes; `fruit`, `plans` and `hotel` are held out, plus 79 cases written later as a blind set.

| | right replies accepted | wrong replies accepted | right replies asked again | near-miss reason shown |
|---|---|---|---|---|
| Phase 1 matcher, all 523 | 69.4% | 11.0% | 5.6% | 82.6% |
| Word matcher, all 523 | 91.0% | 0% | 5.3% | 100% |
| … tuning scenes / held-out scenes / blind | 90.5% / 91.8% / 92.3% | 0 / 0 / 0 | 6.5% / 3.1% / 3.1% | 100% |
| Word matcher + meaning model, all 523 | 95.7% | 0% | 2.8% | 100% |

The blind set was clean for the word matcher's first measurement (95.4% of its right replies accepted, none of its wrong ones); later changes were made after seeing some of its cases, so its later numbers are no longer blind. The model rescued 16 cases and turned none into a wrong accept (one reply cut off at a pause was accepted instead of recast); on the held-out scenes it added nothing. Run with the model: `MEANING_MODEL_DIR=<dir with the model folder> TRANSFORMERS_PATH=<transformers.node.mjs> node test/speech-eval.js --meaning`.

Still open:
- Precompute, at build time, reply probabilities between bank sentences with an open model that exposes token log-probabilities (e.g. scored with transformers or llama.cpp). Claude's API does not return log-probabilities. This lets scripted scenes offer more natural alternative replies and seeds phase 3's evaluation.
- Real-phone data: the evaluation uses written recogniser outputs, not recordings. A log of anonymous heard texts (opt-in) would show what phones really return.
- Paraphrases that change a number (30 分钟 for 半个小时) or replace a negation (忘了 for 不记得了) are still asked again: the matcher never lets the model override a number or a negation.

## Phase 3: open conversation (later)
- **`ModelEngine`** with two back ends behind one interface: in the browser (WebLLM or transformers.js on WebGPU, small Qwen model, opt-in download, not in the service-worker cache) and a desktop option pointing at a local Ollama server.
- **Kept on rails:** the scene card gives the model a role, a goal and a turn limit; replies come back as constrained JSON `{reply, correction, hints[3]}`; every reply is checked against the learner's level and met words, simplified or regenerated when it fails, and replaced by the scripted engine after two failures.
- **Evaluation before shipping:** a fixed set of learner turns per scene, run through the model; measured: share of characters above level, JSON validity, latency on a mid-range phone, and a native-speaker review of a sample. It ships only when it beats agreed thresholds.

## Status
- [x] Phase 1: scripted scenes (12 scenes, `converse` mode, screen at `#talk`)
- [x] Phase 2: speech that waits through pauses, word-by-word matching, optional meaning model, evaluation set
- [ ] Phase 2, still open: reply probabilities from an open model
- [ ] Phase 3: open conversation with a model
