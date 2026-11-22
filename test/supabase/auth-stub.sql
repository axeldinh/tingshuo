-- The parts of Supabase that supabase/schema.sql relies on, for testing it on plain Postgres.
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
-- Supabase reads the user id from the request's JWT; here it comes from a setting.
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase's defaults: everything in public is fully granted to both roles, so only
-- row-level security and the schema's own revokes keep data safe. Test under the same rules.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
