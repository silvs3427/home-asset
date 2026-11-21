-- Invite-submit edge needs service_role table access + a security-definer
-- token lookup (avoids PostgREST embed / schema-cache join failures).
-- Safe to re-run. Requires contractor_invites + properties from earlier migrations.

-- ---------------------------------------------------------------------------
-- Explicit service_role grants (public edge uses service key, not auth.uid())
-- ---------------------------------------------------------------------------
grant all on table public.contractor_invites to service_role;
grant all on table public.contractor_submissions to service_role;
grant all on table public.contractor_submission_media to service_role;

-- ---------------------------------------------------------------------------
-- Public invite metadata by token (no ledger leak — home label only)
-- ---------------------------------------------------------------------------
create or replace function public.lookup_contractor_invite_public(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  prop record;
  trimmed text := trim(coalesce(p_token, ''));
begin
  if char_length(trimmed) < 32 then
    return jsonb_build_object(
      'ok', false,
      'code', 'missing_token',
      'message', 'Missing invite link.'
    );
  end if;

  select
    i.id,
    i.property_id,
    i.label,
    i.expires_at,
    i.revoked_at
  into inv
  from public.contractor_invites i
  where i.token = trimmed
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'This invite link is invalid or was removed.'
    );
  end if;

  if inv.revoked_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'revoked',
      'message', 'This invite link was revoked by the homeowner.'
    );
  end if;

  if inv.expires_at is not null and inv.expires_at < now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'expired',
      'message', 'This invite link has expired. Ask the homeowner for a new one.'
    );
  end if;

  select
    p.name,
    p.address_line1,
    p.city,
    p.owner_user_id
  into prop
  from public.properties p
  where p.id = inv.property_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'This invite link is invalid or was removed.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'inviteId', inv.id,
    'propertyId', inv.property_id,
    'ownerUserId', prop.owner_user_id,
    'homeLabel', prop.name || ' · ' || prop.address_line1 || ', ' || prop.city,
    'inviteLabel', inv.label
  );
end;
$$;

comment on function public.lookup_contractor_invite_public(text) is
  'Token-gated invite metadata for invite-submit edge. service_role only.';

revoke all on function public.lookup_contractor_invite_public(text) from public;
revoke all on function public.lookup_contractor_invite_public(text)
  from anon, authenticated;
grant execute on function public.lookup_contractor_invite_public(text)
  to service_role;
