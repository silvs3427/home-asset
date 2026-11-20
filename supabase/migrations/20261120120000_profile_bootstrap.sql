-- Profile bootstrap hardening (signup → load profile).
-- Safe to re-run. Fixes "Could not continue / Could not load profile" when the
-- Auth trigger is missing/late, or the phone needs a client-side ensure path.
--
-- Apply in Supabase SQL Editor after 20261118000000_init_schema.sql.

-- ---------------------------------------------------------------------------
-- Re-assert Auth → profiles trigger (security definer; bypasses RLS)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, faces_json, active_face)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data -> 'faces', '["homeowner"]'::jsonb),
    coalesce(new.raw_user_meta_data ->> 'starting_face', 'homeowner')
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Allow a signed-in user to insert *their own* profile row (client fallback).
-- Trigger still preferred; this covers missing/late trigger without service role.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: ensure the caller's profile exists (security definer).
-- Phone calls this after Auth signup/sign-in when the row is missing.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_own_profile(
  p_email text,
  p_starting_face text default 'homeowner'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  face text := coalesce(nullif(trim(p_starting_face), ''), 'homeowner');
  faces jsonb;
  row_out public.profiles;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if face not in ('homeowner', 'contractor') then
    face := 'homeowner';
  end if;
  faces := jsonb_build_array(face);

  insert into public.profiles (id, email, faces_json, active_face)
  values (uid, lower(coalesce(nullif(trim(p_email), ''), '')), faces, face)
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select * into row_out from public.profiles where id = uid;
  if not found then
    raise exception 'profile bootstrap failed';
  end if;
  return row_out;
end;
$$;

revoke all on function public.ensure_own_profile(text, text) from public;
grant execute on function public.ensure_own_profile(text, text) to authenticated;
