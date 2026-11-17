/*
 * Store — the ONLY place the app reads or writes user data.
 *
 * Designed so cloud sync can be added later without touching the rest of the app:
 *  - Records live in collections (progress, settings, meta). Each record carries
 *    { id, col, v, updatedAt, device, deleted } so two devices merge by
 *    "last write wins" per record (tie-break on device id).
 *  - Practice history is an append-only event log; every event has a unique id,
 *    so merging two devices is a simple union.
 *  - snapshot() / merge(snapshot) / changesSince(ts) are everything a sync
 *    backend needs. See SYNC.md.
 *
 * The persistence adapter (localStorage here) can be swapped for IndexedDB
 * or anything with get/set of a string.
 */
(function (global) {
  'use strict';
  const SCHEMA_VERSION = 1;
  const KEY = 'tingshuo.v1';

  const localAdapter = {
    load() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    save(str) { try { localStorage.setItem(KEY, str); return true; } catch (e) { return false; } },
  };

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  const rkey = (col, id) => col + '/' + id;

  // Migrations run on load when an older schema is found. Add one per version bump.
  const MIGRATIONS = {
    // 2: data => { ...transform...; return data; },
  };

  function emptyData() {
    return { schema: SCHEMA_VERSION, device: uid(), records: {}, events: [], lastSyncedAt: 0 };
  }

  function createStore(adapter = localAdapter) {
    let data = emptyData();
    let persisted = true;
    const listeners = new Set();

    const raw = adapter.load();
    if (raw) {
      try {
        let d = JSON.parse(raw);
        while (d.schema < SCHEMA_VERSION && MIGRATIONS[d.schema + 1]) { d = MIGRATIONS[d.schema + 1](d); d.schema++; }
        data = Object.assign(emptyData(), d);
      } catch (e) { console.warn('Store: could not read saved data', e); }
    }

    let saveTimer = null;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { persisted = adapter.save(JSON.stringify(data)); }, 150);
    }
    function flush() { clearTimeout(saveTimer); persisted = adapter.save(JSON.stringify(data)); }
    function emit(change) { listeners.forEach(fn => { try { fn(change); } catch (e) { console.error(e); } }); }

    const api = {
      SCHEMA_VERSION,
      get device() { return data.device; },
      get persisted() { return persisted; },

      get(col, id, fallback) {
        const r = data.records[rkey(col, id)];
        return r && !r.deleted ? r.v : fallback;
      },
      put(col, id, value) {
        const r = { id, col, v: value, updatedAt: Date.now(), device: data.device, deleted: false };
        data.records[rkey(col, id)] = r; save(); emit({ type: 'put', record: r });
        return value;
      },
      remove(col, id) {
        const r = { id, col, v: null, updatedAt: Date.now(), device: data.device, deleted: true };
        data.records[rkey(col, id)] = r; save(); emit({ type: 'remove', record: r });
      },
      all(col) {
        const out = {};
        for (const k in data.records) { const r = data.records[k]; if (r.col === col && !r.deleted) out[r.id] = r.v; }
        return out;
      },

      // Append-only practice log
      log(event) {
        const e = Object.assign({ id: uid(), t: Date.now(), device: data.device }, event);
        data.events.push(e); save(); emit({ type: 'event', event: e });
        return e;
      },
      events(filter) { return filter ? data.events.filter(filter) : data.events.slice(); },

      // ---- sync primitives ----
      snapshot() { return JSON.parse(JSON.stringify({ schema: data.schema, device: data.device, records: data.records, events: data.events })); },
      changesSince(ts) {
        const records = Object.values(data.records).filter(r => r.updatedAt > ts);
        const events = data.events.filter(e => e.t > ts);
        return { schema: data.schema, records, events };
      },
      /** Merge another device's snapshot or change set. Returns counts. */
      merge(remote) {
        if (!remote || (remote.schema || 1) > SCHEMA_VERSION) throw new Error('Data is from a newer app version. Update the app first.');
        let rec = 0, ev = 0;
        const recs = Array.isArray(remote.records) ? remote.records : Object.values(remote.records || {});
        for (const r of recs) {
          const k = rkey(r.col, r.id), mine = data.records[k];
          if (!mine || r.updatedAt > mine.updatedAt || (r.updatedAt === mine.updatedAt && r.device > mine.device)) {
            data.records[k] = r; rec++;
          }
        }
        const seen = new Set(data.events.map(e => e.id));
        for (const e of remote.events || []) if (!seen.has(e.id)) { data.events.push(e); ev++; }
        data.events.sort((a, b) => a.t - b.t);
        flush(); emit({ type: 'merge', records: rec, events: ev });
        return { records: rec, events: ev };
      },
      markSynced(ts = Date.now()) { data.lastSyncedAt = ts; save(); },
      get lastSyncedAt() { return data.lastSyncedAt; },

      // ---- backup code (manual sync between devices until real sync exists) ----
      exportCode() {
        const json = JSON.stringify(api.snapshot());
        const bytes = new TextEncoder().encode(json);
        let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
        return 'TS1:' + btoa(bin);
      },
      importCode(code) {
        code = (code || '').trim();
        if (code.startsWith('{')) return api.merge(JSON.parse(code));
        if (!code.startsWith('TS1:')) throw new Error('This does not look like a Tīngshuō backup code.');
        const bin = atob(code.slice(4));
        const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
        return api.merge(JSON.parse(json));
      },
      resetAll() { const dev = data.device; data = emptyData(); data.device = dev; flush(); emit({ type: 'reset' }); },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      flush,
    };
    return api;
  }

  global.createStore = createStore;
  if (typeof module !== 'undefined') module.exports = { createStore };
})(typeof window !== 'undefined' ? window : globalThis);
