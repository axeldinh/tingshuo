# Tīngshuō 听说 — Mandarin listening & speaking (HSK 1–3)

An installable web app for Android, iPhone and computers, designed in an "Ink & Paper" style: warm paper, black ink, one red seal colour, serif Chinese characters.

- **Today's practice**: one "练 Begin" button starts a mixed round across every skill (8–20 items, set in Settings).
- **Shadowing**: listen and repeat. The app finds each syllable in your recording and draws your pitch for it right under that syllable's target shape, marked ✓, ✗ (slipped) or ? (unsure), and says in plain words what slipped ("买 sounded falling; it should dip low and come back up"). It compares with the tone as really spoken (一/不 and 3+3 changes, a low half-third inside a phrase, light syllables), learns your voice's pitch range over your recordings, and says "not sure" rather than guess. The same recording also checks your words: each syllable gets a word mark next to its tone mark, a wrong word turns red with what was heard above it, a missing one is shown as missing, an extra one as +的, and the feedback says it first ("You said 四 instead of 三", "了 was missing"). A syllable whose word was wrong is not given a tone verdict, and a wrong, missing or extra word is never a clean pass. You can play yourself against the native voice.
- **Listening**: pick what you heard among near-identical sentences, then type it from dictation once you know it.
- **Translation (English → Chinese)**: choose between near-misses first, then write it yourself. Hint tiles include decoys.
- **Conversation**: twelve everyday scenes (four per HSK level): ordering food, buying a ticket, asking the way, the doctor's, a hotel… The other person speaks (tone shapes, fading pinyin, English underneath); you reply by tapping among near-misses, typing (characters or pinyin), or speaking. Speaking waits through pauses and understands your reply word by word: fillers, a dropped 了, everyday synonyms and another word order are fine, and an answer in your own words shows the scene's wording as "You could also say". A near miss gets a gentle recast: the line said back to you, with the slipped syllables marked; a reply that wasn't understood says what was heard and which word was missing. Optionally (Settings → Understand my own words, a 30 MB download), a small on-device model also matches replies by meaning. Each finished scene can be replayed without pinyin. Scenes open with your level, and every reply is graded and reviewed like any other item.
- **Tones**: name a syllable's tone inside a sentence with brush-stroke buttons (with 一/不/3+3 changes), and practise word tones, then say them (words and tones checked syllable by syllable, as in shadowing).
- **Fading pinyin**: once you've got a character right several times, its pinyin hides everywhere (tap a sentence to peek). New characters are underlined in red.
- **Seal stamp & ink**: a correct answer spreads ink and presses a red 对 seal. Soft brush sounds (can be turned off).
- **Words with stroke order**: every HSK 1–3 word, with animated stroke order and a "Write it" mode where you trace each character.
- **Copybook progress**: 28 days of ink dots, tone accuracy, levels, and every character you've met in a 田 grid. Red seals mark the ones you read without pinyin.
- **Chapter pages**: reaching a new HSK level opens a full-page chapter (第二章 · 进).
- **Night ink**: a warm dark mode (Auto / Day / Night), and an optional paper texture.
- **Levels that fit beginners and veterans**: a short adaptive placement (4 questions for a beginner, up to 12 for a veteran, with a "Not sure" button). Levels unlock at 80% accuracy and step back by themselves if a level turns out too hard.
- **No vocabulary skipped**: new sentences are chosen to bring one or two words you haven't met. Veterans still get a few sentences from earlier levels as quick checks: right once and they go away for three weeks, wrong and they're learned like new. Progress shows how many HSK 1–3 words you've met.

Content: 375 hand-written sentences with near-miss distractors, 12 conversation scenes, all 595 HSK 1–3 words, stroke data for 631 characters.

---

## Online

Live at **https://axeldinh.github.io/tingshuo/**. GitHub Pages serves the `docs` folder of the `main` branch; any push to `main` updates the app within a minute or two.

### Install on your phone
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**. Always open it from the home-screen icon, because iOS can erase data from websites you haven't visited in a while, but not from home-screen apps.
- **Android (Chrome):** open the link, tap **⋮ → Install app** (or *Add to Home screen*).

### Chinese voice
The app uses your phone's built-in Chinese voice.
- **iPhone:** Settings → Accessibility → Spoken Content → Voices → Chinese (China mainland) → download an enhanced voice (e.g. Tingting).
- **Android:** Settings → System → Languages → Text-to-speech → Google → install the Chinese (Mandarin) voice.

### What works where
| Feature | Android Chrome | iPhone Safari | Computer Chrome/Edge | Firefox |
|---|---|---|---|---|
| Audio, exercises | ✓ | ✓ | ✓ | ✓ |
| Tone graph (pitch) | ✓ | ✓ | ✓ | ✓ |
| Word check in the same recording (speech recognition alongside the pitch) | ✓ on most phones (needs internet); the app finds out on your first recordings | usually ✗ (iOS gives the microphone to one at a time): use the download below | ✓ | ✗ |
| Word check on the phone (optional download, 87 MB) | ✓ | ✓ (recent iOS) | ✓ | ✓ |
| "Check my words" as a second recording (when neither of the above) | ✓ (needs internet) | ✓ (Siri & Dictation must be on) | ✓ | ✗ |
| Conversation by voice (speech recognition) | ✓ (needs internet) | ✓ (Siri & Dictation must be on) | ✓ | ✗ |
| Understand my own words (optional download) | ✓ | ✓ (recent iOS) | ✓ | – (no speech recognition) |

**Which word check you get.** When you record in shadowing or word tones, the app tries, in order: (1) the phone's own speech recognition listening to the same recording as the tone graph. Some phones cannot give the microphone to both at once (iPhones usually, some Android phones); the app notices it on the first recordings (the melody goes silent, or recognition hears nothing while you clearly spoke), asks you to say it once more, and does not try again on that phone. (2) If you turned on **Settings → Check my words on this phone**, a small speech model on the phone transcribes the recording itself (one download of about 87 MB, 104 MB stored, then offline; a second or more of checking after each recording, longer on older phones). It does not judge single syllables (too short for it to tell); a word or sentence is only marked wrong where the model is sure. (3) Otherwise a **Check my words** link below the graph checks your words in a second recording. Settings → This device says which one this phone uses.

## Android and iOS apps (store builds)
The same code also ships as native apps through [Capacitor](https://capacitorjs.com): the `android/` and `ios/` projects wrap `docs/` (the bundled copy works fully offline; the service worker is skipped inside the apps). The web app and PWA install above are unchanged.

- `npm run cap:sync` builds the data and copies `docs/` into both projects. `npm run cap:android` / `npm run cap:ios` do that and open Android Studio / Xcode (Xcode needs a Mac).
- **Android:** in Android Studio, *Build → Generate Signed Bundle* (AAB) and upload it to Google Play Console (a one-off $25 developer account). Microphone permission is already declared.
- **iOS:** open `ios/App` in Xcode, set your Team under *Signing & Capabilities*, then *Product → Archive → Distribute* to App Store Connect / TestFlight (Apple Developer Program, $99/year). Microphone and speech-recognition usage texts are already in `Info.plist`.
- Application id `com.axeldinh.tingshuo` (in `capacitor.config.json`, `android/app/build.gradle`, and the Xcode project): change it before publishing if you want another one.
- **Actions → Mobile builds** compiles an unsigned debug APK and an iOS simulator build on every `v*` tag or manual run, to catch breakage; it does not publish.
- Not yet checked on real devices: browser speech recognition (the "word check" and voice conversation) is not provided by Android WebView or iOS's embedded web view, so in the store apps those fall back to the on-device word-check download or the typing options. Test shadowing on a phone before submitting.

---

## Progress, backup and sync
Progress is saved on the device first, so the app works the same offline. **Settings → Backup** gives you a code to copy and paste on another device. The code merges data, so nothing is overwritten.

**Cloud backup** (optional): once set up, **Settings → Cloud backup** signs in with a code sent by email. Changes then upload in the background when you're online, and a new phone gets everything back on sign-in. It needs a free Supabase project; setup is in **SYNC.md**.

## How it's built
See **ARCHITECTURE.md** for the modules, the build, the learning rules, speech and tone processing, what is stored, and the tests. Plans: **CONVERSATIONS.md** (conversations) and **SYNC.md** (cloud backup).

## Editing content
- Sentences live in `src/sentences.src.js`, one line per sentence:
  `[level, chinese, english, [other correct answers], [[distractor, why it's wrong] ×3], grammar tag]`
- Conversation scenes live in `src/dialogues.src.js`, one object per scene (format at the top of the file). Each line the other person says lists 2–3 acceptable replies; each reply names the next line and has 3 near-miss distractors with a reason, plus optional other accepted wordings: `[chinese, english, next, [[distractor, why] ×3], [other wordings]]`. The last line has `'end'` instead of replies. Keep node names stable: progress is stored per reply.
- The build refuses scenes with unreachable lines, dead ends, loops, missing English, or a distractor that is really an accepted reply, and warns about characters above the scene's HSK level (`npm test` fails on those too). It prints how many replies each route takes (aim for 6–8).
- Then run `npm install` and `npm run build`. This regenerates `docs/data/*.js` with pinyin, tone changes and neutral tones.
- Run `npm test` for the logic tests and the spoken-reply evaluation (`test/speech-cases.js`: what a recogniser might return, and what the conversation should do with it; `node test/speech-eval.js --fails --tags` shows the details), and `npm run serve` to try the app at http://localhost:8000.
- After editing scene replies, refresh the optional meaning model's reply vectors if you have the model files: `MEANING_MODEL_DIR=… TRANSFORMERS_PATH=… node tools/embed-replies.js` (see CONVERSATIONS.md). If you don't, the app embeds the new replies on the phone.
- `npm run build` also stamps `VERSION` in `docs/sw.js` with a hash of the app files, so installed apps pick up updates automatically. CI fails if `docs/` is out of date.
- Tone recognition (`docs/js/tones.js`, model in `docs/data/tone-model.js`) is measured by `node test/tone-eval.js` (part of `npm test`, with accuracy floors; `--baseline` shows the old method, `--split held` only speakers and voices never used for tuning, `--nohist` a first recording). Its data, `test/tone-frames.bin.gz`, holds only pitch frames, made by running recordings through the app's own pitch code: real syllables and HSK words from [audio-cmn](https://github.com/hugolpz/audio-cmn), espeak-ng voices, and synthetic voices (`test/tone-synth.js`). To rebuild it: install ffmpeg and espeak-ng, check out audio-cmn, then `AUDIO_CMN=…/audio-cmn/64k node tools/tone-data.js`; to retrain: `node tools/train-tones.js` (it learns only from the tuning speakers).
- The word check (`compareSpeech`, `Tones.withWords`, `transcribe.js`) is measured by `node test/word-eval.js` (part of `npm test`, with floors; `--fails` lists the attempts it gets wrong). Its data, `test/word-transcripts.json.gz`, holds only what the optional model heard and its scores, for recordings of right and wrong attempts (real HSK word recordings and synthetic voices; see `tools/word-data.js` to rebuild it). Numbers in ARCHITECTURE.md, *Speech and tones*.
- `npm run coverage` lists which HSK words have no example sentence yet (`node tools/coverage.js --list` for the words).

## Credits
- HSK word list: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT), with English meanings from CC-CEDICT (CC BY-SA 4.0).
- Pinyin: [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT).
- Traditional → simplified table generated with [OpenCC](https://github.com/BYVoid/OpenCC) data (Apache-2.0).
- Optional meaning matching: [transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) with a small Chinese sentence-embedding model from BAAI (MIT), loaded only if you turn it on.
- Optional on-device word check: OpenAI's Whisper (base, MIT) as converted for transformers.js (Xenova/whisper-base, int8), loaded only if you turn it on.
- Word-check evaluation (`test/word-transcripts.json.gz`, transcripts only): HSK word recordings from [audio-cmn](https://github.com/hugolpz/audio-cmn) (Yue Tan / Shtooka, CC BY-SA), espeak-ng, and text-to-speech voices from the [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) model releases (MeloTTS zh_en, Matcha zh-baker with the Vocos vocoder, VITS AISHELL-3); the model files for measuring were taken from an npm mirror of the same int8 files, for measurement only.
- Tone evaluation data (`test/tone-frames.bin.gz`, pitch frames only, CC BY-SA 4.0): derived from [audio-cmn](https://github.com/hugolpz/audio-cmn) recordings by Chen Wang (syllables) and Yue Tan / Shtooka (words), CC BY-SA.
- Stroke order: [Hanzi Writer](https://hanziwriter.org) (MIT); stroke data from Make Me a Hanzi, © Arphic Technology, under the Arphic Public License (see `docs/data/strokes/LICENSE-ARPHIC.txt`).
- Fonts: Noto Serif SC, EB Garamond and Inter from Google Fonts (the app falls back to the phone's own serif fonts offline).
