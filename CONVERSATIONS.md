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
- **Build:** `tools/build-data.js` also emits `docs/data/dialogues.js` with the same syllable data (pinyin, tone changes, neutral tones) as sentences. The build fails if a scene uses characters above its level, has an unreachable node, or a dead end.
- **Engine:** `ScriptedEngine` implements the interface.
- **Screen:** chat-style, Ink & Paper look. The app line is spoken and shown with tone shapes (pinyin fades as elsewhere). The learner answers by tapping (beginner), typing, or speaking; speech is matched to the acceptable replies with `compareSpeech`, and a near match gets a gentle recast. Each finished scene offers a replay with pinyin hidden.
- **Progress:** each scene line is an item in a `converse` mode, so it is graded and scheduled; words met and characters are credited.
- **Quality bar:** natural spoken Mandarin (no textbook-isms), every scene playable end to end on a 390 px screen, unit tests for data validity and the engine, a Playwright run through one scene per level.

## Phase 2: understand free speech (later)
- When a spoken reply matches none of the options, find the closest acceptable reply by meaning with a small multilingual sentence-embedding model on the device (about 30–100 MB, opt-in), so learners can answer in their own words.
- Precompute, at build time, reply probabilities between bank sentences with an open model that exposes token log-probabilities (e.g. a Qwen model scored with transformers or llama.cpp). Claude's API does not return log-probabilities. This lets scripted scenes offer more natural alternative replies and seeds phase 3's evaluation.

## Phase 3: open conversation (later)
- **`ModelEngine`** with two back ends behind one interface: in the browser (WebLLM or transformers.js on WebGPU, small Qwen model, opt-in download, not in the service-worker cache) and a desktop option pointing at a local Ollama server.
- **Kept on rails:** the scene card gives the model a role, a goal and a turn limit; replies come back as constrained JSON `{reply, correction, hints[3]}`; every reply is checked against the learner's level and met words, simplified or regenerated when it fails, and replaced by the scripted engine after two failures.
- **Evaluation before shipping:** a fixed set of learner turns per scene, run through the model; measured: share of characters above level, JSON validity, latency on a mid-range phone, and a native-speaker review of a sample. It ships only when it beats agreed thresholds.

## Status
- [ ] Phase 1: scripted scenes
- [ ] Phase 2: free-speech matching, reply probabilities
- [ ] Phase 3: open conversation with a model
