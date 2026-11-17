const puppeteer = require('puppeteer-core');
const W = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=/home/claude/voice.wav'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
  const shot = n => p.screenshot({ path: `/home/claude/shots2/${n}.png` });
  const click = async sel => { await p.waitForSelector(sel, { timeout: 5000 }); await p.$eval(sel, el => el.click()); await W(250); };
  await p.goto('http://localhost:8765/#home'); await W(800);
  await p.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove()));
  await shot('01-home');
  // placement
  await click('[data-place]'); for (let i = 0; i < 9; i++) { await click('[data-o="0"]'); await W(500); } await shot('02-placement');
  // daily mix: go through items generically
  await click('a[href="#home"]'); await W(300); await click('[data-mix]');
  for (let k = 0; k < 16; k++) {
    const kind = await p.evaluate(() => document.querySelector('[data-o]') ? 'o' : document.querySelector('.brush') ? 't' : document.querySelector('[data-q]') ? 'q' : document.querySelector('[data-in]') ? 'i' : document.querySelector('[data-again]') ? 'end' : '?');
    if (k === 0 || k === 2) await shot('03-mix-' + k + kind);
    if (kind === 'end' || kind === '?') break;
    if (kind === 'o') { await click('[data-o="0"]'); if (k < 4) await shot('04-mix-ans-' + k); await click('[data-next]'); }
    else if (kind === 't') { await click('[data-t="2"]'); await shot('05-tone-ans'); await click('[data-next]'); }
    else if (kind === 'q') { await shot('06-shadow'); await click('[data-q="2"]'); }
    else if (kind === 'i') { await p.type('[data-in]', 'wo'); await click('[data-check]'); await click('[data-next]'); }
  }
  await shot('07-end');
  // shadow with recording + mocked speech check
  await p.evaluate(() => { window.Audio2.Recognizer.supported = true; window.Audio2.Recognizer.listen = async () => '我卖了三本书'; });
  await p.evaluate(() => window.__app.start('shadow', ['s004'])); await W(300);
  await click('[data-rec]'); await W(4500); await click('[data-check]'); await W(500); await shot('08-shadow-done');
  // tone spot
  await p.evaluate(() => window.__app.start('tone', ['s018'])); await W(300); await shot('09-tonespot');
  // word tone
  await p.evaluate(() => window.__app.start('wordtone', ['w1-北京'])); await W(300); await click('[data-o="0"]'); await shot('10-wordtone');
  // translate typed
  await p.evaluate(() => { const { store } = window.__app; store.put('progress', 'translate:s043', { reps: 1, ok: 1, seen: 1, ease: 2.3, ivl: 1, due: 0 }); window.__app.start('translate', ['s043']); }); await W(300);
  await click('[data-hint]'); await p.type('[data-in]', '今天比昨天很冷'); await shot('11-translate-hint'); await click('[data-check]'); await shot('12-translate-res');
  // words + stroke order
  await p.evaluate(() => location.hash = 'words'); await W(400); await shot('13-words');
  await p.evaluate(() => window.__app.word('w1-买')); await W(1500); await shot('14-word');
  await click('[data-anim]'); await W(2500); await shot('15-word-anim');
  // progress
  await p.evaluate(() => location.hash = 'progress'); await W(400); await shot('16-progress');
  // chapter
  await p.evaluate(() => window.__app.chapter(2, ['Listening'])); await W(1200); await shot('17-chapter');
  // settings + night
  await p.evaluate(() => location.hash = 'settings'); await W(300); await shot('18-settings');
  await click('[data-seg="ink"] [data-v="night"]'); await W(200);
  await p.evaluate(() => window.__app.start('shadow', ['s004'])); await W(400); await shot('19-night-shadow');
  await p.evaluate(() => location.hash = 'home'); await W(300); await p.evaluate(() => document.querySelectorAll('.notice').forEach(n => n.remove())); await shot('20-night-home');
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
