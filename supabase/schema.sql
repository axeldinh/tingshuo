-- Tīngshuō cloud sync: Supabase schema. Paste into the SQL editor and run; safe to run again after editing.
-- Mirrors docs/js/store.js: records merge last-write-wins per (col, id) with the
-- device id as tie-break; events are an append-only log merged by id.
--
-- Pulls use a server-side cursor (`seq`), not the client's clocks: a device that
-- was offline pushes edits with OLD timestamps, and a pull filtered on
-- updated_at > lastSyncedAt would skip them on every other device for good.

create sequence if not exists sync_seq;

create table if not exists records (
  user_id    uuid    not null default auth.uid() references auth.users on delete cascade,
  col        text    not null,
  id         text    not null,
  v          jsonb,
  updated_at bigint  not null,                    -- client ms (store's updatedAt)
  device     text    not null collate "C",        -- "C" so the tie-break orders like JS string compare
  deleted    boolean not null default false,
  schema     int     not null,                    -- app SCHEMA_VERSION that wrote it
  seq        bigint  not null default nextval('sync_seq'),
  primary key (user_id, col, id)
);
create index if not exists records_user_seq on records (user_id, seq);

create table if not exists events (
  user_id uuid   not null default auth.uid() references auth.users on delete cascade,
  id      text   not null,                        -- text, not uuid: store.js falls back to 'id-…' ids
  t       bigint not null,
  device  text   not null,
  type    text   not null,
  body    jsonb  not null,                        -- the whole event as the app logged it
  schema  int    not null,
  seq     bigint not null default nextval('sync_seq'),
  primary key (user_id, id)
);
create index if not exists events_user_seq on events (user_id, seq);

alter table records enable row level security;
alter table events  enable row level security;
-- Reads go straight to the tables only through these policies; writes only through push().
drop policy if exists "own records" on records;
drop policy if exists "own events" on events;
create policy "own records" on records for select using (user_id = auth.uid());
create policy "own events"  on events  for select using (user_id = auth.uid());
-- pull() reads as the signed-in user, so it needs read access whatever the project's default grants are.
grant select on records, events to authenticated;

-- push(records, events, schema): upsert newer records, insert unseen events.
-- Idempotent, so a retried push is harmless.
create or replace function push(p_records jsonb, p_events jsonb, p_schema int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  -- One push at a time per user, so seq order = commit order and no pull skips a row.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  insert into records (user_id, col, id, v, updated_at, device, deleted, schema)
  select uid, r->>'col', r->>'id', r->'v', (r->>'updatedAt')::bigint, r->>'device',
         coalesce((r->>'deleted')::boolean, false), p_schema
  from jsonb_array_elements(coalesce(p_records, '[]')) r
  on conflict (user_id, col, id) do update set
    v = excluded.v, updated_at = excluded.updated_at, device = excluded.device,
    deleted = excluded.deleted, schema = excluded.schema, seq = nextval('sync_seq')
  where (excluded.updated_at, excluded.device) > (records.updated_at, records.device);

  insert into events (user_id, id, t, device, type, body, schema)
  select uid, e->>'id', (e->>'t')::bigint, e->>'device', e->>'type', e, p_schema
  from jsonb_array_elements(coalesce(p_events, '[]')) e
  on conflict (user_id, id) do nothing;
end $$;

-- pull(since): everything after the cursor, shaped like store.merge() expects,
-- plus the new cursor to remember locally.
create or replace function pull(p_since bigint)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'schema',  coalesce((select max(schema) from records where user_id = auth.uid() and seq > p_since), 1),
    'records', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'col', col, 'v', v, 'updatedAt', updated_at,
                  'device', device, 'deleted', deleted) order by seq)
                from records where user_id = auth.uid() and seq > p_since), '[]'),
    'events',  coalesce((select jsonb_agg(body order by t)
                from events where user_id = auth.uid() and seq > p_since), '[]'),
    'cursor',  greatest(p_since,
                 coalesce((select max(seq) from records where user_id = auth.uid() and seq > p_since), 0),
                 coalesce((select max(seq) from events  where user_id = auth.uid() and seq > p_since), 0))
  )
$$;

-- reset_all(): "erase everything" must also erase the cloud copy, or the next sync
-- brings it all back.
create or replace function reset_all()
returns void language sql security definer set search_path = public as $$
  delete from records where user_id = auth.uid();
  delete from events  where user_id = auth.uid();
$$;

revoke all on function push(jsonb, jsonb, int), pull(bigint), reset_all() from public, anon;
grant execute on function push(jsonb, jsonb, int), pull(bigint), reset_all() to authenticated;
