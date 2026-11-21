-- Contractor invite-link submissions (Path B — non-LightLift pros).
-- Homeowner creates a link; pro submits voice/photos/text on a public page;
-- Ask HomeAsset formats a draft; homeowner approve-before-official.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Invites (homeowner-owned; token is the only public credential)
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_invites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  label text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_invites_token_len check (char_length(token) >= 32)
);

create index if not exists idx_contractor_invites_property
  on public.contractor_invites (property_id);
create index if not exists idx_contractor_invites_token
  on public.contractor_invites (token);

-- ---------------------------------------------------------------------------
-- Submissions (pending until homeowner approves / declines)
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_submissions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.contractor_invites (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  contractor_name text,
  company_name text,
  notes_text text,
  draft_json jsonb not null default '{}'::jsonb,
  ai_mode text not null default 'mock'
    check (ai_mode in ('mock', 'live')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contractor_submissions_property_status
  on public.contractor_submissions (property_id, status, created_at desc);
create index if not exists idx_contractor_submissions_invite
  on public.contractor_submissions (invite_id);

-- ---------------------------------------------------------------------------
-- Media metadata (bytes in Storage bucket invite-media)
-- Path: {property_id}/{submission_id}/{filename}
-- ---------------------------------------------------------------------------
create table if not exists public.contractor_submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.contractor_submissions (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null check (kind in ('photo', 'audio', 'other')),
  mime_type text not null,
  original_filename text not null,
  storage_key text not null,
  byte_size integer not null check (byte_size >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_contractor_submission_media_submission
  on public.contractor_submission_media (submission_id);

-- ---------------------------------------------------------------------------
-- RLS — homeowners see own property rows; public writes go through edge
-- (service role). Authenticated users cannot insert submissions/media.
-- ---------------------------------------------------------------------------
alter table public.contractor_invites enable row level security;
alter table public.contractor_submissions enable row level security;
alter table public.contractor_submission_media enable row level security;

drop policy if exists contractor_invites_all_own on public.contractor_invites;
create policy contractor_invites_all_own on public.contractor_invites
  for all using (public.owns_property(property_id))
  with check (
    public.owns_property(property_id)
    and created_by = auth.uid()
  );

drop policy if exists contractor_submissions_select_own
  on public.contractor_submissions;
create policy contractor_submissions_select_own
  on public.contractor_submissions
  for select using (public.owns_property(property_id));

drop policy if exists contractor_submissions_update_own
  on public.contractor_submissions;
create policy contractor_submissions_update_own
  on public.contractor_submissions
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists contractor_submission_media_select_own
  on public.contractor_submission_media;
create policy contractor_submission_media_select_own
  on public.contractor_submission_media
  for select using (public.owns_property(property_id));

-- ---------------------------------------------------------------------------
-- Storage bucket for invite media (private; homeowner read via owns_property)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('invite-media', 'invite-media', false, 20971520)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists invite_media_storage_select on storage.objects;
create policy invite_media_storage_select on storage.objects
  for select using (
    bucket_id = 'invite-media'
    and public.owns_property((storage.foldername(name))[1]::uuid)
  );

-- Edge (service role) uploads; no authenticated insert policy on purpose.

-- ---------------------------------------------------------------------------
-- Table privileges (RLS still filters). No INSERT on submissions/media for
-- authenticated — only the invite-submit edge (service role) creates those.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table public.contractor_invites
  to authenticated;
grant select, update on table public.contractor_submissions to authenticated;
revoke insert, delete, truncate, references, trigger
  on table public.contractor_submissions from authenticated;
grant select on table public.contractor_submission_media to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.contractor_submission_media from authenticated;
