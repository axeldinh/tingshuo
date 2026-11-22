# Cloud backup and sync

Progress is **local first**: the app reads and writes only the store on the device (`docs/js/store.js`), so it works the same offline and never waits for the network. Once you sign in, `docs/js/sync.js` uploads changes in the background and brings in the changes made on your other devices. A new phone gets everything back on sign-in.

Cloud backup is **off** until `CONFIG` in `docs/js/sync.js` is filled in. Until then the Settings screen shows no Cloud backup section, and the backup code works as before.

## Turn it on (Supabase, free plan)
1. Create a project at supabase.com.
2. **SQL editor**: paste `supabase/schema.sql` and run it. It is safe to run again after you edit it.
3. **Authentication → Sign In / Providers → Email**: keep it on.
4. **Authentication → Emails → Magic Link** template: put the code in the email, e.g. `Your Tīngshuō code: {{ .Token }}`. The app signs in with this 6-digit code, not the link: on iPhone a link opens in Safari, whose storage is separate from the home-screen app.
5. **Project Settings → API**: copy the project URL and the `anon` public key into `CONFIG` in `docs/js/sync.js`, then `npm run build` (re-stamps the service worker) and push. The anon key is meant to be public; row-level security in the schema is what keeps each person's data to themselves.
6. In the app: **Settings → Cloud backup**, enter your email, then the code from the email.

The free plan has two catches. A project with no activity for about a week is paused; unpause it from the dashboard. While it is paused the app keeps working and uploads once it is back. The free plan also has no automatic backups: **Settings → Save as file** saves a full copy any time.

## When it syncs
- About 5 s after a change (several changes in a row go up together).
- When the app opens, comes back to the front, or the connection returns.
- When the app goes to the background with changes waiting.
- After a failure it retries after 15 s, 30 s, 1 min… up to every 30 min. Settings shows "Offline: N changes will upload when you're back online".

## Data model
- **Records** `{ id, col, v, updatedAt, device, deleted }` in `progress`, `levels`, `settings`, `chars`, `meta`. Conflicts: the latest `updatedAt` wins, with the device id as tie-break. Deletes are tombstones (`deleted: true`), so they sync too.
- **Events**: an append-only log of answers. Every id is unique, so merging is a union.
- **Device-only records** (`LOCAL_ONLY` in store.js) are never sent or taken: `settings/voice` (that phone's voice), `settings/words` and `settings/meaning` (whether that phone downloaded the models), `meta/liveWords` (whether that phone can share its microphone). Add to this list anything that describes the device rather than the learner.
- **`store.local()`**: the device's own bookkeeping (sign-in tokens, pull cursor). Saved, never synced, never in a backup code.

## How a sync works (`sync.js`)
1. If "Reset all progress" ran since the last sync, erase the cloud copy first (`reset_all`). Erasing before signing in only erases that device.
2. **Push** `store.changesSince(lastSyncedAt)`, in chunks of 500. The server keeps a record only if it is newer than the one it has, and adds unseen events. Pushing the same thing twice changes nothing.
3. **Pull** everything after the device's cursor. The cursor is the **server's** own sequence number, not a timestamp: a phone that was offline uploads changes with old timestamps, and a pull by timestamp would skip them on every other device.
4. `store.merge()` the result, remember the new cursor and `lastSyncedAt`.

## Server (`supabase/schema.sql`)
- Tables `records` (primary key user, col, id) and `events` (primary key user, id), each row stamped with the app's `SCHEMA_VERSION` and a server `seq`.
- Functions `push(p_records, p_events, p_schema)`, `pull(p_since)` and `reset_all()`, callable only when signed in. Writes go only through `push()`. Row-level security limits reads to your own rows.
- A per-user lock makes pushes run one at a time, so `seq` order is commit order and no pull can skip a row.

## Changing the data shape later
Bump `SCHEMA_VERSION` in store.js and add a function to `MIGRATIONS`. Migrations run on load **and** on `merge()`, so older data arriving from another device or the cloud is upgraded too. A device running an older app refuses newer data ("Update the app first") instead of misreading it. The server stores values as JSON and needs no change.

## Tests
- `test/sync.js` (in `npm test`): the sync module against a fake Supabase with the same rules. Covers sign-in, restoring a new phone, offline then late upload, retries, device-only settings, erase (and erasing during a sync), expired and revoked sign-ins, and chunked uploads.
- `npm run test:schema` (also in CI): runs `supabase/schema.sql` twice on a throwaway Postgres with Supabase's default grants, then checks the sync rules, that signed-out callers are refused, and that no one can write directly or touch another user's rows.

## Other backends
`sync.js` talks to three remote functions (`push`, `pull`, `reset_all`) plus Supabase's email-code sign-in. Another backend needs the same three operations with the same rules: keep the newer record, insert unseen events, pull by a server-side cursor.
