# Tīngshuō 听说 — Mandarin listening & speaking (HSK 1–3)

An installable web app for Android, iPhone and computers, designed in an "Ink & Paper" style: warm paper, black ink, one red seal colour, serif Chinese characters.

- **Today's practice**: one "练 Begin" button starts a mixed round across every skill (8–20 items, set in Settings).
- **Shadowing**: listen and repeat. Your pitch is drawn over the target tone shapes, you can play yourself against the native voice, and "Check my words" marks each syllable, including tone slips (买 mǎi said as 卖 mài).
- **Listening**: pick what you heard among near-identical sentences, then type it from dictation once you know it.
- **Translation (English → Chinese)**: choose between near-misses first, then write it yourself. Hint tiles include decoys.
- **Tones**: name a syllable's tone inside a sentence with brush-stroke buttons (with 一/不/3+3 changes), and practise word tones, then say them.
- **Fading pinyin**: once you've got a character right several times, its pinyin hides everywhere (tap a sentence to peek). New characters are underlined in red.
- **Seal stamp & ink**: a correct answer spreads ink and presses a red 对 seal. Soft brush sounds (can be turned off).
- **Words with stroke order**: every HSK 1–3 word, with animated stroke order and a "Write it" mode where you trace each character.
- **Copybook progress**: 28 days of ink dots, tone accuracy, levels, and every character you've met in a 田 grid. Red seals mark the ones you read without pinyin.
- **Chapter pages**: reaching a new HSK level opens a full-page chapter (第二章 · 进).
- **Night ink**: a warm dark mode (Auto / Day / Night), and an optional paper texture.
- **Spaced repetition**, a placement test, and levels that unlock at 80% accuracy.

Content: 111 hand-written sentences with 333 near-miss distractors, all 595 HSK 1–3 words, stroke data for 631 characters.

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
| Word & tone check (speech recognition) | ✓ (needs internet) | ✓ (Siri & Dictation must be on) | ✓ | ✗ |

---

## Progress, backup and future sync
Progress is saved on the device. **Settings → Backup** gives you a code to copy and paste on another device. The code merges data, so nothing is overwritten.

The storage layer is built for real sync: see **SYNC.md**.

## Editing content
- Sentences live in `src/sentences.src.js`, one line per sentence:
  `[level, chinese, english, [other correct answers], [[distractor, why it's wrong] ×3], grammar tag]`
- Then run `npm install` and `npm run build`. This regenerates `docs/data/*.js` with pinyin, tone changes and neutral tones.
- Run `npm test` for the logic tests, and `npm run serve` to try the app at http://localhost:8000.
- Before uploading changes, **increase `VERSION` in `docs/sw.js`** (e.g. `tingshuo-v3`) so installed apps pick up the update.

## Credits
- HSK word list: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT), with English meanings from CC-CEDICT (CC BY-SA 4.0).
- Pinyin: [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT).
- Stroke order: [Hanzi Writer](https://hanziwriter.org) (MIT); stroke data from Make Me a Hanzi, © Arphic Technology, under the Arphic Public License (see `docs/data/strokes/LICENSE-ARPHIC.txt`).
- Fonts: Noto Serif SC, EB Garamond and Inter from Google Fonts (the app falls back to the phone's own serif fonts offline).
