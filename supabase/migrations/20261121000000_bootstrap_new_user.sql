-- LightLift-style Auth → profile bootstrap (HomeAsset).
-- Safe to re-run. Preferred path: client calls bootstrap_new_user after
-- signUp/signIn when a session exists. Do NOT rely on an Auth SQL trigger
-- as the only way to create profiles.
--
-- Apply in Supabase SQL Editor after 20261118000000_init_schema.sql
-- (and after epic7 recalls if you use that migration).
--
-- Trigger choice: DROP Auth→profiles trigger if present. LightLift has no
-- Auth trigger for account rows; the phone owns bootstrap via this RPC.
-- Idempotent inserts + advisory lock mean a leftover trigger would not
-- corrupt data, but we remove it so signup never depends on silent DB hooks.

-- ---------------------------------------------------------------------------
-- Remove Auth trigger path (if installed from earlier init / PR #17 style)
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

-- Keep handle_new_user as a no-op stub so any leftover references do not
-- create profiles behind the client's back. Prefer bootstrap_new_user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Intentionally empty: profile + prefs are created by bootstrap_new_user.
  return new;
end;
$$;

-- No client INSERT on profiles — only the security-definer RPC may create
-- the caller's row. Drop any insert policy from older bootstrap attempts.
drop policy if exists profiles_insert_own on public.profiles;

-- Profiles: select + update own only (re-assert least privilege).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Drop older ensure_own_profile name if a prior PR applied it.
drop function if exists public.ensure_own_profile(text, text);

-- ---------------------------------------------------------------------------
-- RPC: bootstrap_new_user — create the caller's profile (+ prefs) only.
-- Mirrors LightLift bootstrap_new_user (auth.uid(), SECURITY DEFINER,
-- idempotent, advisory lock). HomeAsset has no separate homeowners table;
-- homeowner/contractor is active_face on profiles.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_new_user(
  p_email text default null,
  p_starting_face text default 'homeowner'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_face text;
  v_faces jsonb;
  v_profile public.profiles;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize bootstrap per auth user (prevents double-insert races).
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_profile from public.profiles where id = v_user_id;
  if found then
    return v_profile;
  end if;

  v_face := coalesce(nullif(trim(p_starting_face), ''), 'homeowner');
  if v_face not in ('homeowner', 'contractor') then
    v_face := 'homeowner';
  end if;
  v_faces := jsonb_build_array(v_face);

  v_email := lower(coalesce(nullif(trim(p_email), ''), ''));
  if v_email = '' then
    select lower(coalesce(u.email, ''))
      into v_email
      from auth.users u
     where u.id = v_user_id;
  end if;

  insert into public.profiles (id, email, faces_json, active_face)
  values (v_user_id, coalesce(v_email, ''), v_faces, v_face)
  returning * into v_profile;

  insert into public.notification_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return v_profile;
end;
$$;

revoke all on function public.bootstrap_new_user(text, text) from public;
grant execute on function public.bootstrap_new_user(text, text) to authenticated;

-- PostgREST may resolve defaults; also grant the zero-arg overload if created.
-- Explicit two-arg form is what the phone calls.
