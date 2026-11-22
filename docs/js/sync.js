/*
 * Sync — local first, uploaded later.
 *
 * The app only ever reads and writes the store, on the device. This module runs in
 * the background: a few seconds after changes, when the app opens or comes back to
 * the front, and when the connection returns, it uploads what changed and brings in
 * other devices' changes. Offline, it waits and retries; nothing is lost and
 * practice never waits for it.
 *
 * Backend: Supabase (supabase/schema.sql), reached with plain fetch, no library.
 * Sign-in: a 6-digit code sent by email. (A magic link would open in the browser,
 * which on iPhone does not share storage with the home-screen app.)
 */
(function (global) {
  'use strict';
  // Fill these in to turn cloud backup on (Supabase → Project Settings → API). The anon key is meant to be
  // public: row-level security in supabase/schema.sql is what keeps each person's data to themselves.
  const CONFIG = { url: '', anonKey: '' };
  const KEY = 'sync';     // in store.local(): { session, email, cursor, resetDone, lastOkAt }
  const CHUNK = 500;      // records/events per upload request

  function createSync(store, opts = {}) {
    const cfg = Object.assign({}, CONFIG, opts.config);
    const base = (cfg.url || '').replace(/\/+$/, '');
    const fetchFn = opts.fetch || ((...a) => global.fetch(...a));
    const setT = opts.setTimeout || ((f, ms) => setTimeout(f, ms)), clearT = opts.clearTimeout || (h => clearTimeout(h));
    const DEBOUNCE = opts.debounceMs != null ? opts.debounceMs : 5000;
    const configured = !!(base && cfg.anonKey);
    const listeners = new Set();
    let running = null, again = false, timer = null, failures = 0, started = false;
    let state = 'idle', error = null;

    const st = () => store.local(KEY) || {};
    const setSt = patch => store.local(KEY, Object.assign({}, st(), patch));
    const signedIn = () => !!st().session;

    function emit(s, err) {
      if (s) state = s;
      error = err === undefined ? error : err;
      const now = api.status();
      listeners.forEach(fn => { try { fn(now); } catch (e) { console.error(e); } });
    }

    async function call(path, body, token) {
      const headers = { 'Content-Type': 'application/json', apikey: cfg.anonKey };
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetchFn(base + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
      const text = await res.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
      if (!res.ok) {
        const err = new Error((json && (json.msg || json.message || json.error_description || json.error)) || 'Server error ' + res.status);
        err.status = res.status; throw err;
      }
      return json;
    }

    function saveSession(j, email) {
      const old = st().session || {};
      setSt({ session: {
        access: j.access_token, refresh: j.refresh_token,
        exp: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000,
        email: (j.user && j.user.email) || email || old.email,
      } });
    }
    async function token(force) {
      const s = st().session;
      if (!s) { const e = new Error('Not signed in'); e.status = 401; throw e; }
      if (!force && s.exp - 60e3 > Date.now()) return s.access;
      try { saveSession(await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh })); }
      catch (e) {
        // The sign-in is no longer valid (expired, revoked): keep everything local, ask to sign in again.
        if (e.status === 400 || e.status === 401 || e.status === 403) setSt({ session: null, email: s.email });
        throw e;
      }
      return st().session.access;
    }
    async function rpc(name, args) {
      try { return await call('/rest/v1/rpc/' + name, args, await token()); }
      catch (e) { if (e.status !== 401) throw e; return call('/rest/v1/rpc/' + name, args, await token(true)); }
    }

    async function syncOnce() {
      const resetAt = store.resetAt;
      // "Erase everything" on this device erases the cloud copy too, before anything new goes up.
      if (resetAt > (st().resetDone || 0)) { await rpc('reset_all', {}); setSt({ resetDone: resetAt, cursor: 0 }); }

      const startedAt = Date.now() - 1; // a change in this very millisecond is sent next time rather than missed
      const ch = store.changesSince(store.lastSyncedAt);
      for (let i = 0; i < Math.max(ch.records.length, ch.events.length); i += CHUNK) {
        await rpc('push', { p_records: ch.records.slice(i, i + CHUNK), p_events: ch.events.slice(i, i + CHUNK), p_schema: ch.schema });
      }
      // Pull by the server's own order (cursor), not by timestamps: changes a device uploads late,
      // after being offline, carry old timestamps but still arrive here.
      const remote = await rpc('pull', { p_since: st().cursor || 0 });
      if (store.resetAt !== resetAt) { again = true; return { records: 0, events: 0 }; } // erased meanwhile: don't bring old data back
      const got = remote.records.length || remote.events.length ? store.merge(remote) : { records: 0, events: 0 };
      store.markSynced(startedAt);
      setSt({ cursor: remote.cursor, lastOkAt: Date.now() });
      return got;
    }

    function schedule(ms) { clearT(timer); timer = setT(() => { timer = null; return api.syncNow(); }, ms); }

    const api = {
      configured,
      get signedIn() { return signedIn(); },
      status() {
        const s = st(), ch = store.changesSince(store.lastSyncedAt);
        return { configured, signedIn: !!s.session, email: (s.session && s.session.email) || s.email || '',
          state: s.session ? state : 'signedOut', error, lastOkAt: s.lastOkAt || 0, pending: ch.records.length + ch.events.length };
      },
      onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },

      /** Upload and download now. Resolves to the merge counts, or null if it could not sync (it retries by itself). */
      syncNow() {
        if (!configured || !signedIn()) return Promise.resolve(null);
        if (running) { again = true; return running; }
        emit('syncing');
        running = (async () => {
          try { const got = await syncOnce(); failures = 0; emit('idle', null); return got; }
          catch (e) {
            failures++;
            // no HTTP status = the request never reached the server (offline, blocked, timed out)
            emit(!signedIn() ? 'signedOut' : e.status ? 'error' : 'offline', e.message);
            if (signedIn()) schedule(Math.min(30 * 60e3, 15e3 * 2 ** (failures - 1)));
            return null;
          } finally {
            running = null;
            if (again) { again = false; if (!failures) schedule(0); }
          }
        })();
        return running;
      },

      /** Sign-in, step 1: email a 6-digit code. */
      async sendCode(email) {
        email = String(email || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That does not look like an email address.');
        await call('/auth/v1/otp', { email, create_user: true });
        setSt({ email });
      },
      /** Sign-in, step 2: the code from the email. Then uploads this device's progress and brings in the account's. */
      async verify(email, code) {
        email = String(email || '').trim();
        saveSession(await call('/auth/v1/verify', { type: 'email', email, token: String(code || '').replace(/\s/g, '') }), email);
        // Everything on this device goes up to this account; erasing done before signing in stays on this device.
        store.markSynced(0); setSt({ cursor: 0, resetDone: store.resetAt });
        emit('idle', null);
        return api.syncNow();
      },
      /** Stops uploading. Progress stays on this device. */
      signOut() {
        const s = st().session;
        if (s) call('/auth/v1/logout', {}, s.access).catch(() => {});
        setSt({ session: null, email: (s && s.email) || st().email });
        clearT(timer); timer = null; emit('signedOut', null);
      },

      /** Wire the triggers: changes (debounced), app back in front, connection back, app going to the background. */
      start() {
        if (started || !configured) return;
        started = true;
        store.onChange(c => { if (c.type !== 'merge') schedule(DEBOUNCE); });
        if (global.addEventListener) global.addEventListener('online', () => api.syncNow());
        if (global.document) global.document.addEventListener('visibilitychange', () => {
          // coming back: catch up; leaving with changes waiting: try now, the phone may close the app
          if (!global.document.hidden || timer) api.syncNow();
        });
        api.syncNow();
      },
    };
    return api;
  }

  global.Sync = { createSync, CONFIG };
  if (typeof module !== 'undefined') module.exports = { createSync, CONFIG };
})(typeof window !== 'undefined' ? window : globalThis);
