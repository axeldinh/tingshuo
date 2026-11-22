set role authenticated;
do $$
declare A text := '11111111-1111-1111-1111-111111111111'; B text := '22222222-2222-2222-2222-222222222222';
  r jsonb; cur bigint; n int;
begin
  perform set_config('request.jwt.claim.sub', A, true);
  -- 1. phone pushes at t=200; laptop pulls and stores the cursor
  perform push('[{"col":"progress","id":"shadow:1","v":{"reps":2},"updatedAt":200,"device":"dev-b"}]',
               '[{"id":"e1","t":200,"device":"dev-b","type":"answer"}]', 1);
  r := pull(0); cur := (r->>'cursor')::bigint;
  assert jsonb_array_length(r->'records') = 1 and jsonb_array_length(r->'events') = 1, 'first pull';

  -- 2. offline tablet comes back with OLDER timestamps: new 好 record, stale shadow:1, old event
  perform push('[{"col":"chars","id":"好","v":3,"updatedAt":100,"device":"dev-a"},
                 {"col":"progress","id":"shadow:1","v":{"reps":1},"updatedAt":100,"device":"dev-a"}]',
               '[{"id":"e0","t":100,"device":"dev-a","type":"answer"}]', 1);
  r := pull(cur);
  assert jsonb_array_length(r->'records') = 1 and r->'records'->0->>'id' = '好', 'late old-timestamp record reaches other devices: ' || r::text;
  assert jsonb_array_length(r->'events') = 1 and r->'events'->0->>'id' = 'e0', 'late old event reaches other devices';
  select (v->>'reps')::int into n from records where id = 'shadow:1';
  assert n = 2, 'stale write must not overwrite newer one';
  cur := (r->>'cursor')::bigint;

  -- 3. tie on updatedAt: higher device id wins, as in store.merge()
  perform push('[{"col":"settings","id":"rate","v":0.8,"updatedAt":300,"device":"dev-a"}]', '[]', 1);
  perform push('[{"col":"settings","id":"rate","v":0.9,"updatedAt":300,"device":"dev-b"}]', '[]', 1);
  perform push('[{"col":"settings","id":"rate","v":0.7,"updatedAt":300,"device":"dev-a"}]', '[]', 1);
  select v::text into r from records where id = 'rate';
  assert r = '0.9', 'tie-break by device: ' || r::text;

  -- 4. idempotent: repeating a push changes nothing and is not re-pulled
  cur := (pull(0)->>'cursor')::bigint;
  perform push('[{"col":"settings","id":"rate","v":0.9,"updatedAt":300,"device":"dev-b"}]',
               '[{"id":"e1","t":200,"device":"dev-b","type":"answer"}]', 1);
  r := pull(cur);
  assert jsonb_array_length(r->'records') = 0 and jsonb_array_length(r->'events') = 0, 'repeat push is a no-op';
  select count(*) into n from events; assert n = 2, 'no duplicate events';

  -- 5. tombstones sync
  perform push('[{"col":"settings","id":"rate","v":null,"updatedAt":400,"device":"dev-a","deleted":true}]', '[]', 1);
  r := pull(cur); assert (r->'records'->0->>'deleted')::boolean, 'tombstone pulled';

  -- 6. another user sees nothing of A, and the same event id does not collide
  perform set_config('request.jwt.claim.sub', B, true);
  r := pull(0);
  assert jsonb_array_length(r->'records') = 0 and jsonb_array_length(r->'events') = 0, 'RLS isolation';
  perform push('[]', '[{"id":"e1","t":1,"device":"x","type":"answer"}]', 1);
  select count(*) into n from events where id = 'e1'; -- B only sees own via RLS
  assert n = 1, 'B has own e1';

  -- 7. reset only erases the caller
  perform reset_all();
  perform set_config('request.jwt.claim.sub', A, true);
  select count(*) into n from records; assert n = 3, 'A untouched by B reset';
  perform reset_all();
  r := pull(0); assert jsonb_array_length(r->'records') = 0, 'A reset';
  raise notice 'sync rules: late uploads, newest wins, tie-break, idempotent, tombstones, per user, reset';
end $$;

-- 8. the app's anonymous key cannot call anything
reset role; set role anon;
do $$ begin perform push('[]', '[]', 1); raise exception 'anon could push';
exception when insufficient_privilege then raise notice 'signed-out callers are refused'; end $$;
do $$ begin perform pull(0); raise exception 'anon could pull';
exception when insufficient_privilege then null; end $$;

-- 9. even with Supabase's default table grants, signed-in users can only write through push(),
--    and cannot touch another user's rows
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \g /dev/null
select push('[{"col":"x","id":"mine","v":1,"updatedAt":1,"device":"d"}]', '[]', 1) \g /dev/null
do $$ declare n int; begin
  begin insert into records (user_id, col, id, updated_at, device, schema) values (auth.uid(), 'x', 'y', 1, 'd', 1); raise exception 'direct insert allowed';
  exception when insufficient_privilege then null; end;
  update records set v = '2' where id = 'mine'; get diagnostics n = row_count; assert n = 0, 'direct update allowed';
  delete from records where id = 'mine'; get diagnostics n = row_count; assert n = 0, 'direct delete allowed';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select count(*) into n from records; assert n = 0, 'another user can read A''s rows';
  perform reset_all();
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select count(*) into n from records; assert n = 1, 'another user''s reset erased A''s rows';
  raise notice 'direct writes blocked; other users cannot read or erase';
end $$;
