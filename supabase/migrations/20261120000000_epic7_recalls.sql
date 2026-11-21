-- EPIC 7: free public recall catalog + per-asset alerts (ack/dismiss history).
-- Property-scoped via owns_property RLS. No paid partner feed required.

create table if not exists public.recall_notices (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  source text not null
    check (source in ('cpsc_fixture', 'cpsc_live', 'nhtsa_fixture')),
  title text not null,
  summary text not null,
  hazard text,
  manufacturer text not null,
  model text not null,
  serial_pattern text,
  product_type text,
  recall_date date,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists idx_recall_notices_keys
  on public.recall_notices (manufacturer, model);

create table if not exists public.asset_recall_alerts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  recall_notice_id uuid not null references public.recall_notices (id) on delete cascade,
  status text not null
    check (status in ('open', 'acknowledged', 'dismissed')),
  matched_on text not null
    check (matched_on in ('manufacturer_model', 'manufacturer_model_serial')),
  notified_at timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, recall_notice_id)
);

create index if not exists idx_asset_recall_alerts_property
  on public.asset_recall_alerts (property_id, status);

alter table public.recall_notices enable row level security;
alter table public.asset_recall_alerts enable row level security;

-- Catalog is readable by any signed-in homeowner (public safety lists).
-- Writes happen from match jobs / phone check using the user session.
drop policy if exists recall_notices_select_authenticated on public.recall_notices;
create policy recall_notices_select_authenticated on public.recall_notices
  for select to authenticated
  using (true);

drop policy if exists recall_notices_insert_authenticated on public.recall_notices;
create policy recall_notices_insert_authenticated on public.recall_notices
  for insert to authenticated
  with check (true);

drop policy if exists recall_notices_update_authenticated on public.recall_notices;
create policy recall_notices_update_authenticated on public.recall_notices
  for update to authenticated
  using (true)
  with check (true);

-- Alerts stay home-scoped: only the property owner can see or change them.
drop policy if exists asset_recall_alerts_all_own on public.asset_recall_alerts;
create policy asset_recall_alerts_all_own on public.asset_recall_alerts
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

-- Table privileges (RLS still scopes rows). Without GRANT, phone gets
-- "permission denied for table …" from PostgREST.
grant select, insert, update on table public.recall_notices to authenticated;
grant select, insert, update, delete on table public.asset_recall_alerts
  to authenticated;
