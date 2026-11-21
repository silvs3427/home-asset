-- Distinct homeowner / contractor role enrollment (HomeAsset).
-- Safe to re-run. Paste in Supabase SQL Editor after bootstrap_new_user
-- (+ profiles_table_grants if you use that fix).
--
-- Product rule:
--   - Signup chooses ONE starting face (bootstrap_new_user).
--   - You cannot unlock the other face by flipping active_face alone.
--   - Explicit enroll_face RPC adds the second role on the same login.
--   - set_active_face switches only among already-enrolled faces.
--
-- LightLift style: security definer, auth.uid() only, no service-role on phone.

-- ---------------------------------------------------------------------------
-- Guard: clients with profiles UPDATE must not rewrite faces_json.
-- Enrollment RPCs set a transaction-local flag before updating.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_protect_faces_json()
returns trigger
language plpgsql
as $$
begin
  -- Phone/anon clients must use enroll_face. Service-role (server API) may
  -- update faces_json directly; security-definer RPCs set the local flag.
  if tg_op = 'UPDATE'
     and new.faces_json is distinct from old.faces_json
     and coalesce(current_setting('homeasset.allow_faces_enroll', true), '') <> '1'
     and coalesce(auth.role(), '') is distinct from 'service_role'
  then
    raise exception
      'Role enrollment required. Call enroll_face to add homeowner or contractor.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_faces_json on public.profiles;
create trigger profiles_protect_faces_json
  before update on public.profiles
  for each row
  execute function public.profiles_protect_faces_json();

-- ---------------------------------------------------------------------------
-- RPC: enroll_face — add a role the caller did not sign up with.
-- Idempotent if already enrolled. Sets active_face to the enrolled face.
-- ---------------------------------------------------------------------------
create or replace function public.enroll_face(
  p_face text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_face text;
  v_profile public.profiles;
  v_faces jsonb;
  v_has boolean := false;
  v_elem text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_face := lower(trim(coalesce(p_face, '')));
  if v_face not in ('homeowner', 'contractor') then
    raise exception 'Choose homeowner or contractor.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 1));

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then
    raise exception 'Profile missing. Call bootstrap_new_user first.';
  end if;

  v_faces := coalesce(v_profile.faces_json, '[]'::jsonb);
  for v_elem in select jsonb_array_elements_text(v_faces)
  loop
    if v_elem = v_face then
      v_has := true;
      exit;
    end if;
  end loop;

  if not v_has then
    v_faces := v_faces || jsonb_build_array(v_face);
  end if;

  perform set_config('homeasset.allow_faces_enroll', '1', true);

  update public.profiles
     set faces_json = v_faces,
         active_face = v_face
   where id = v_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.enroll_face(text) from public;
grant execute on function public.enroll_face(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: set_active_face — switch among enrolled faces only (no unlock).
-- ---------------------------------------------------------------------------
create or replace function public.set_active_face(
  p_face text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_face text;
  v_profile public.profiles;
  v_has boolean := false;
  v_elem text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_face := lower(trim(coalesce(p_face, '')));
  if v_face not in ('homeowner', 'contractor') then
    raise exception 'Choose homeowner or contractor.';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then
    raise exception 'Profile missing. Call bootstrap_new_user first.';
  end if;

  for v_elem in
    select jsonb_array_elements_text(coalesce(v_profile.faces_json, '[]'::jsonb))
  loop
    if v_elem = v_face then
      v_has := true;
      exit;
    end if;
  end loop;

  if not v_has then
    raise exception
      'That role is not enrolled on this account. Enroll first.';
  end if;

  update public.profiles
     set active_face = v_face
   where id = v_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.set_active_face(text) from public;
grant execute on function public.set_active_face(text) to authenticated;
