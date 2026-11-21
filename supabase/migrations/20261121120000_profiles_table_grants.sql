-- Fix: "permission denied for table profiles" after signup/bootstrap.
-- Root cause: init + bootstrap migrations enabled RLS and granted EXECUTE on
-- bootstrap_new_user, but never GRANTed table privileges to authenticated.
-- Postgres privilege denial (not RLS) blocks:
--   1) client SELECT/UPDATE on public.profiles
--   2) PostgREST return of bootstrap_new_user (returns public.profiles)
-- Safe to re-run. Paste in Supabase SQL Editor after bootstrap_new_user.sql.

-- ---------------------------------------------------------------------------
-- Schema usage (usually already present on Supabase; idempotent)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: SELECT + UPDATE own only (RLS). No client INSERT — RPC only.
-- SELECT is also required for PostgREST to return bootstrap_new_user rows.
-- ---------------------------------------------------------------------------
grant select, update on table public.profiles to authenticated;
revoke insert, delete, truncate, references, trigger on table public.profiles
  from authenticated;

-- ---------------------------------------------------------------------------
-- Ledger tables the phone reads/writes under RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table public.properties to authenticated;
grant select, insert, update, delete on table public.assets to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.reminders to authenticated;
grant select, insert, update, delete on table public.reminder_completions
  to authenticated;
grant select, insert, update, delete on table public.notification_preferences
  to authenticated;
grant select, insert, update, delete on table public.push_devices to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;

-- EPIC 7 recalls (no-op if tables were never created)
do $$
begin
  if to_regclass('public.recall_notices') is not null then
    execute 'grant select, insert, update on table public.recall_notices to authenticated';
  end if;
  if to_regclass('public.asset_recall_alerts') is not null then
    execute 'grant select, insert, update, delete on table public.asset_recall_alerts to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper + bootstrap RPC execute (re-assert)
-- ---------------------------------------------------------------------------
grant execute on function public.owns_property(uuid) to authenticated;

revoke all on function public.bootstrap_new_user(text, text) from public;
grant execute on function public.bootstrap_new_user(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Re-assert profiles RLS (select/update own; no insert policy)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_insert_own on public.profiles;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
