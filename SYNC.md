# Adding sync

All user data goes through `docs/js/store.js`. No other file reads or writes storage, so sync only needs a small new module plus a backend.

## Data model
- **Records**: `{ id, col, v, updatedAt, device, deleted }` in the collections `progress` (one per mode:item), `levels`, `settings`, `chars` (the character copybook) and `meta` (placement, level-change dates, the learned pitch range); see ARCHITECTURE.md → Storage. Conflicts resolve as last write wins per record, with the device id as a tie-break. Deletes are tombstones (`deleted: true`), so they sync too.
- **Events**: an append-only log of answers `{ id, t, device, type, mode, item, q, ... }`. Every id is a UUID, so merging is a union.
- `schema`: bump `SCHEMA_VERSION` and add a function to `MIGRATIONS` whenever the shape changes. `merge()` refuses data from a newer schema.

## Primitives already in the store
```js
store.changesSince(ts)   // { schema, records: [...], events: [...] } changed after ts → push these
store.merge(remote)      // apply records/events from the server (idempotent, safe to repeat)
store.markSynced(ts)     // remember the last successful sync
store.lastSyncedAt
store.onChange(fn)       // fires on put/remove/log/merge → use it to schedule a sync
store.snapshot()         // everything (first upload / full backup)
```
`window.__app.store` exposes the instance.

## A sync module in ~30 lines (sketch)
```js
// js/sync.js — load after store.js and app.js
async function sync(store, api) {             // api = your backend client
  const since = store.lastSyncedAt;
  const startedAt = Date.now();
  await api.push(store.changesSince(since));  // upsert records by (col,id) if newer; insert events by id
  const remote = await api.pull(since);       // records with updatedAt > since, events with t > since
  store.merge(remote);
  store.markSynced(startedAt);
}
// Run on app open, when the app regains focus, and ~5 s after changes:
let t; store.onChange(c => { if (c.type !== 'merge') { clearTimeout(t); t = setTimeout(() => sync(store, api), 5000); } });
```

## Backend options
- **Supabase** (free tier, Postgres + login): tables `records(user_id, col, id, v jsonb, updated_at bigint, device, deleted, primary key(user_id,col,id))` and `events(user_id, id primary key, t bigint, body jsonb)`. Use an upsert with `where excluded.updated_at > records.updated_at`, and row-level security on `user_id`.
- **Firebase Firestore**: one document per record and per event under `users/{uid}/...`.
- **Your own server**: two endpoints, `POST /push` and `GET /pull?since=`, with the same rules.

The server applies the same rule as `merge()`: keep the record with the larger `updatedAt`, and insert events whose id it hasn't seen.
