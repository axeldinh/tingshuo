// Sync module against a fake Supabase that follows supabase/schema.sql's rules:
// pulls by server order (seq), last write wins with the device id as tie-break, data per user.
// (test/supabase/ checks the real SQL against Postgres: npm run test:schema)
const assert = require('assert');
const { createStore } = require('../docs/js/store.js');
const { createSync } = require('../docs/js/sync.js');

const BASE = 'https://fake.supabase.co';
const mem = () => { let v = null; return { load: () => v, save: x => (v = x, true) }; };

function fakeSupabase() {
  let seq = 0, n = 0;
  const users = {}, access = {}, refresh = {}, codes = {};
  const srv = { online: true, ttl: 3600, calls: [], users };
  const res = (status, json) => ({ ok: status < 300, status, text: async () => (json === undefined ? '' : JSON.stringify(json)) });
  const session = email => {
    const a = 'acc' + ++n, r = 'ref' + n;
    access[a] = { email, exp: Date.now() + srv.ttl * 1000 }; refresh[r] = email;
    return { access_token: a, refresh_token: r, expires_in: srv.ttl, user: { email } };
  };
  srv.expireAll = () => { for (const k in access) access[k].exp = 0; };
  srv.revokeAll = () => { for (const k in refresh) delete refresh[k]; srv.expireAll(); };
  srv.fetch = async (url, init) => {
    if (!srv.online) throw new TypeError('Failed to fetch');
    const path = url.slice(BASE.length), body = JSON.parse(init.body || '{}');
    srv.calls.push(path);
    assert.strictEqual(init.headers.apikey, 'anon');
    if (path === '/auth/v1/otp') { codes[body.email] = '123456'; return res(200, {}); }
    if (path === '/auth/v1/verify') return codes[body.email] && body.token === codes[body.email] ? res(200, session(body.email)) : res(403, { msg: 'Token has expired or is invalid' });
    if (path.startsWith('/auth/v1/token')) {
      const email = refresh[body.refresh_token]; if (!email) return res(400, { error_description: 'Invalid Refresh Token' });
      delete refresh[body.refresh_token]; return res(200, session(email)); // refresh tokens rotate
    }
    if (path === '/auth/v1/logout') return res(204);
    const a = access[(init.headers.Authorization || '').replace('Bearer ', '')];
    if (!a || a.exp < Date.now()) return res(401, { message: 'JWT expired' });
    const u = users[a.email] || (users[a.email] = { records: new Map(), events: new Map() });
    if (path === '/rest/v1/rpc/push') {
      for (const r of body.p_records) {
        const k = r.col + '/' + r.id, old = u.records.get(k);
        if (!old || r.updatedAt > old.r.updatedAt || (r.updatedAt === old.r.updatedAt && r.device > old.r.device)) u.records.set(k, { r: { ...r, deleted: !!r.deleted }, seq: ++seq });
      }
      for (const e of body.p_events) if (!u.events.has(e.id)) u.events.set(e.id, { e, seq: ++seq });
      return res(200);
    }
    if (path === '/rest/v1/rpc/pull') {
      const rs = [...u.records.values()].filter(x => x.seq > body.p_since), es = [...u.events.values()].filter(x => x.seq > body.p_since);
      return res(200, { schema: 1, records: rs.map(x => x.r), events: es.map(x => x.e), cursor: Math.max(body.p_since, ...rs.map(x => x.seq), ...es.map(x => x.seq)) });
    }
    if (path === '/rest/v1/rpc/reset_all') { u.records.clear(); u.events.clear(); return res(200); }
    return res(404, { message: 'no route ' + path });
  };
  return srv;
}

function device(srv) {
  const timers = [];
  const store = createStore(mem());
  const sync = createSync(store, {
    config: { url: BASE + '/', anonKey: 'anon' }, fetch: srv.fetch, debounceMs: 5000,
    setTimeout: (f, ms) => { const h = { f, ms }; timers.push(h); return h; },
    clearTimeout: h => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
  });
  const runTimers = async () => { while (timers.length) { const h = timers.shift(); await h.f(); } };
  return { store, sync, timers, runTimers };
}
const signIn = async (d, email = 'me@example.com') => { await d.sync.sendCode(email); return d.sync.verify(email, '123 456'); };
const settle = () => new Promise(r => setImmediate(r));
// a change in the same millisecond a sync starts is (deliberately) sent again next time; real taps are never that close
const later = () => new Promise(r => setTimeout(r, 3));

let count = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('not configured or not signed in: does nothing, works offline', async () => {
  const srv = fakeSupabase(), d = device(srv);
  d.store.put('progress', 'p', 1);
  assert.strictEqual(await d.sync.syncNow(), null);
  assert.strictEqual(srv.calls.length, 0);
  const off = createSync(createStore(mem()));
  assert.strictEqual(off.configured, false); assert.strictEqual(await off.syncNow(), null);
});

t('sign in uploads what this device already has', async () => {
  const srv = fakeSupabase(), d = device(srv);
  d.store.put('progress', 'shadow:1', { reps: 3 }); d.store.log({ type: 'answer', mode: 'shadow', item: 1 }); await later();
  await assert.rejects(d.sync.verify('me@example.com', '000000'), /invalid/);
  await signIn(d);
  const u = srv.users['me@example.com'];
  assert.strictEqual(u.records.size, 1); assert.strictEqual(u.events.size, 1);
  const s = d.sync.status();
  assert.strictEqual(s.signedIn, true); assert.strictEqual(s.email, 'me@example.com'); assert.strictEqual(s.pending, 0); assert.strictEqual(s.state, 'idle'); assert(s.lastOkAt > 0);
});

t('a new phone restores everything', async () => {
  const srv = fakeSupabase(), A = device(srv), B = device(srv);
  await signIn(A);
  A.store.put('progress', 'p1', 'A'); A.store.log({ type: 'answer' }); await A.sync.syncNow();
  const got = await signIn(B);
  assert.deepStrictEqual(got, { records: 1, events: 1 });
  assert.strictEqual(B.store.get('progress', 'p1'), 'A');
});

t('offline: changes wait, upload later, and still reach devices that synced in between', async () => {
  const srv = fakeSupabase(), A = device(srv), B = device(srv);
  await signIn(A); await signIn(B);
  srv.online = false;
  A.store.put('chars', '好', 3); A.store.log({ type: 'answer', item: 'offline' });
  assert.strictEqual(await A.sync.syncNow(), null);
  assert.strictEqual(A.sync.status().state, 'offline'); assert.strictEqual(A.sync.status().pending, 2);
  assert(A.timers.some(h => h.ms === 15000), 'retry scheduled');
  srv.online = true;
  B.store.put('progress', 'b', 1); await B.sync.syncNow(); // B's cursor moves past "now"
  await later(); await A.runTimers();                                     // A uploads its older-timestamped changes
  assert.strictEqual(A.sync.status().pending, 0);
  await B.sync.syncNow();
  assert.strictEqual(B.store.get('chars', '好'), 3, 'late upload with old timestamps reaches B');
  assert(B.store.events().some(e => e.item === 'offline'));
});

t('retries back off and stop growing at 30 minutes', async () => {
  const srv = fakeSupabase(), A = device(srv); await signIn(A);
  srv.online = false; A.store.put('x', '1', 1);
  const waits = [];
  for (let i = 0; i < 10; i++) { A.timers.length = 0; await A.sync.syncNow(); waits.push(A.timers[0].ms); }
  assert.deepStrictEqual(waits.slice(0, 4), [15e3, 30e3, 60e3, 120e3]); assert.strictEqual(waits[9], 30 * 60e3);
  srv.online = true; await A.sync.syncNow(); assert.strictEqual(A.sync.status().state, 'idle');
});

t('changes are uploaded a few seconds later, in one go', async () => {
  const srv = fakeSupabase(), A = device(srv); await signIn(A); A.sync.start(); await settle();
  srv.calls.length = 0;
  for (let i = 0; i < 5; i++) A.store.put('progress', 'p' + i, i);
  assert.strictEqual(A.timers.length, 1); assert.strictEqual(A.timers[0].ms, 5000);
  await A.runTimers();
  assert.deepStrictEqual(srv.calls, ['/rest/v1/rpc/push', '/rest/v1/rpc/pull']);
  assert.strictEqual(srv.users['me@example.com'].records.size, 5);
});

t('large first upload is split into chunks', async () => {
  const srv = fakeSupabase(), A = device(srv);
  for (let i = 0; i < 1200; i++) A.store.log({ type: 'answer', i });
  await signIn(A);
  assert.strictEqual(srv.calls.filter(c => c.endsWith('/push')).length, 3);
  assert.strictEqual(srv.users['me@example.com'].events.size, 1200);
});

t('device-only settings stay on their device', async () => {
  const srv = fakeSupabase(), A = device(srv), B = device(srv);
  A.store.put('settings', 'voice', 'Tingting'); A.store.put('settings', 'words', true); A.store.put('settings', 'rate', .7);
  B.store.put('settings', 'voice', 'Google');
  await signIn(A); await signIn(B);
  assert.strictEqual(B.store.get('settings', 'voice'), 'Google'); assert.strictEqual(B.store.get('settings', 'words'), undefined);
  assert.strictEqual(B.store.get('settings', 'rate'), .7);
});

t('erase everything also erases the cloud, and old data does not come back', async () => {
  const srv = fakeSupabase(), A = device(srv), C = device(srv);
  await signIn(A); A.store.put('progress', 'old', 1); A.store.log({ type: 'answer' }); await A.sync.syncNow();
  A.store.resetAll(); A.store.put('progress', 'new', 1);
  await A.sync.syncNow();
  assert.strictEqual(A.store.get('progress', 'old'), undefined);
  assert.deepStrictEqual([...srv.users['me@example.com'].records.keys()], ['progress/new']);
  await signIn(C); assert.strictEqual(C.store.get('progress', 'old'), undefined); assert.strictEqual(C.store.events().length, 0);
});

t('erasing before signing in only erases this device', async () => {
  const srv = fakeSupabase(), A = device(srv), B = device(srv);
  await signIn(A); A.store.put('progress', 'keep', 1); await A.sync.syncNow();
  B.store.resetAll(); await signIn(B);
  assert.strictEqual(srv.users['me@example.com'].records.size, 1); assert.strictEqual(B.store.get('progress', 'keep'), 1);
});

t('erasing while a sync is on its way does not bring old data back', async () => {
  const srv = fakeSupabase(), A = device(srv), B = device(srv);
  await signIn(B); B.store.put('progress', 'b', 1); await B.sync.syncNow();
  await signIn(A);
  const realFetch = srv.fetch; let erased = false;
  A.store.put('progress', 'a', 1);
  const syncing = createSync(A.store, { config: { url: BASE, anonKey: 'anon' }, setTimeout: () => 0, clearTimeout: () => {},
    fetch: async (url, init) => { const r = await realFetch(url, init); if (url.endsWith('/pull') && !erased) { erased = true; A.store.resetAll(); } return r; } });
  await syncing.syncNow();
  assert(erased);
  assert.strictEqual(A.store.get('progress', 'a'), undefined, 'the pull answered after the erase must not bring erased data back');
  assert.strictEqual(A.store.events().length, 0);
});

t('expired sign-in is refreshed; a revoked one signs out and keeps data', async () => {
  const srv = fakeSupabase(), A = device(srv); await signIn(A);
  srv.expireAll(); A.store.put('x', '1', 1); await later();
  await A.sync.syncNow();
  assert(srv.calls.some(c => c.startsWith('/auth/v1/token')), 'refreshed'); assert.strictEqual(A.sync.status().pending, 0);
  srv.revokeAll(); A.store.put('x', '2', 2);
  assert.strictEqual(await A.sync.syncNow(), null);
  const s = A.sync.status();
  assert.strictEqual(s.signedIn, false); assert.strictEqual(s.state, 'signedOut'); assert.strictEqual(s.email, 'me@example.com');
  assert.strictEqual(A.store.get('x', '2'), 2); assert.strictEqual(s.pending, 1);
  assert.strictEqual(A.timers.length, 0, 'no retries while signed out');
});

t('sign out stops uploading and keeps progress', async () => {
  const srv = fakeSupabase(), A = device(srv); await signIn(A);
  A.sync.signOut(); A.store.put('x', '1', 1); srv.calls.length = 0;
  assert.strictEqual(await A.sync.syncNow(), null); assert.strictEqual(srv.calls.length, 0); assert.strictEqual(A.store.get('x', '1'), 1);
  assert(!A.store.exportCode().includes('acc'), 'tokens never in a backup code');
});

t('a second sync request while one runs is folded into a follow-up', async () => {
  const srv = fakeSupabase(), A = device(srv); await signIn(A);
  A.store.put('x', '1', 1);
  const p1 = A.sync.syncNow(), p2 = A.sync.syncNow();
  assert.strictEqual(p1, p2);
  await p1; assert.strictEqual(A.timers.length, 1); assert.strictEqual(A.timers[0].ms, 0);
});

t('bad email is refused before any request', async () => {
  const srv = fakeSupabase(), A = device(srv);
  await assert.rejects(A.sync.sendCode('not-an-email'), /email/); assert.strictEqual(srv.calls.length, 0);
});

(async () => {
  for (const [name, fn] of tests) { await fn(); count++; console.log('✓', name); }
  console.log(`\n${count} sync tests passed`);
})().catch(e => { console.error(e); process.exit(1); });
