-- HomeAsset Postgres schema (Supabase)
-- Run in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run).
-- Privacy: RLS so each homeowner only sees their own rows. No silent cross-user reads.

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). App faces + active home live here.
-- Password lives only in auth.users — never duplicate secrets in this table.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  faces_json jsonb not null default '["homeowner"]'::jsonb,
  active_face text not null default 'homeowner'
    check (active_face in ('homeowner', 'contractor')),
  active_property_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Properties (homes). Solo owner in v1.
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  region text not null,
  postal_code text not null,
  country text not null default 'US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_properties_owner
  on public.properties (owner_user_id);

alter table public.profiles
  drop constraint if exists profiles_active_property_id_fkey;

alter table public.profiles
  add constraint profiles_active_property_id_fkey
  foreign key (active_property_id) references public.properties (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Assets (property-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null,
  category text not null,
  manufacturer text,
  model text,
  serial text,
  purchase_date date,
  install_date date,
  installer_vendor text,
  location text,
  notes text,
  warranty_end_date date,
  warranty_term text,
  provenance text not null default 'homeowner'
    check (provenance in ('homeowner', 'contractor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assets_property on public.assets (property_id);
create index if not exists idx_assets_recall_keys
  on public.assets (manufacturer, model, serial);

-- ---------------------------------------------------------------------------
-- Documents (metadata). Bytes live in Storage bucket "documents".
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete cascade,
  title text not null,
  doc_type text not null,
  document_date date,
  source text not null default 'user'
    check (source in ('user', 'ai_fetched', 'contractor')),
  mime_type text not null,
  original_filename text not null,
  storage_key text not null,
  byte_size integer not null check (byte_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_property on public.documents (property_id);
create index if not exists idx_documents_asset on public.documents (asset_id);

-- ---------------------------------------------------------------------------
-- Reminders + completions
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  title text not null,
  notes text,
  due_date date not null,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'monthly', 'quarterly', 'yearly')),
  status text not null default 'active'
    check (status in ('active', 'completed')),
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reminders_property_due
  on public.reminders (property_id, due_date);
create index if not exists idx_reminders_asset on public.reminders (asset_id);

create table if not exists public.reminder_completions (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  completed_at timestamptz not null default now(),
  due_date_at_completion date not null,
  note text
);

create index if not exists idx_reminder_completions_reminder
  on public.reminder_completions (reminder_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reminders_enabled boolean not null default true,
  recalls_enabled boolean not null default true,
  contractor_submits_enabled boolean not null default true,
  reminder_lead_days integer not null default 3,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_devices_user on public.push_devices (user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  kind text not null
    check (kind in ('reminder_due', 'recall_alert', 'contractor_submit')),
  title text not null,
  body text not null,
  related_reminder_id uuid,
  related_asset_id uuid,
  related_entity_id text,
  dedupe_key text not null,
  read_at timestamptz,
  push_status text not null default 'pending',
  push_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auth → profile: LightLift model (explicit RPC), not an Auth SQL trigger.
-- Run migrations/20261121000000_bootstrap_new_user.sql after this file.
-- That migration defines public.bootstrap_new_user and drops any Auth trigger.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

-- ---------------------------------------------------------------------------
-- Helpers for RLS: does auth.uid() own this property?
-- ---------------------------------------------------------------------------
create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties
    where id = p_property_id
      and owner_user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — least data shared; homeowner only sees own ledger
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.assets enable row level security;
alter table public.documents enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_completions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;
alter table public.notifications enable row level security;

-- Profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Properties
drop policy if exists properties_select_own on public.properties;
create policy properties_select_own on public.properties
  for select using (owner_user_id = auth.uid());

drop policy if exists properties_insert_own on public.properties;
create policy properties_insert_own on public.properties
  for insert with check (owner_user_id = auth.uid());

drop policy if exists properties_update_own on public.properties;
create policy properties_update_own on public.properties
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists properties_delete_own on public.properties;
create policy properties_delete_own on public.properties
  for delete using (owner_user_id = auth.uid());

-- Assets
drop policy if exists assets_all_own on public.assets;
create policy assets_all_own on public.assets
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

-- Documents
drop policy if exists documents_all_own on public.documents;
create policy documents_all_own on public.documents
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

-- Reminders
drop policy if exists reminders_all_own on public.reminders;
create policy reminders_all_own on public.reminders
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists reminder_completions_all_own on public.reminder_completions;
create policy reminder_completions_all_own on public.reminder_completions
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

-- Notification prefs / devices / center
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket for manuals / photos / install paperwork
-- Path convention: {property_id}/{document_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 15728640)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.owns_property((storage.foldername(name))[1]::uuid)
  );

drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.owns_property((storage.foldername(name))[1]::uuid)
  );

drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects
  for update using (
    bucket_id = 'documents'
    and public.owns_property((storage.foldername(name))[1]::uuid)
  );

drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.owns_property((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- Table privileges for the authenticated role (RLS still filters rows).
-- Without these GRANTs, PostgREST returns "permission denied for table …"
-- even when RLS policies exist. Profiles: SELECT/UPDATE only — INSERT
-- is via security-definer bootstrap_new_user (see next migration).
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant execute on function public.owns_property(uuid) to authenticated;

grant select, update on table public.profiles to authenticated;
revoke insert, delete, truncate, references, trigger on table public.profiles
  from authenticated;

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
