-- Per-home custom asset categories + document types.
-- Founder preference: no fixed pre-listed enums; homeowners type values;
-- once used on a home, they stay reusable for that home (RLS via owns_property).

create table if not exists public.property_labels (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null
    check (kind in ('asset_category', 'document_type')),
  value text not null
    check (char_length(trim(value)) > 0 and char_length(value) <= 80),
  value_key text generated always as (lower(trim(value))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, kind, value_key)
);

create index if not exists idx_property_labels_property_kind
  on public.property_labels (property_id, kind);

alter table public.property_labels enable row level security;

drop policy if exists property_labels_all_own on public.property_labels;
create policy property_labels_all_own on public.property_labels
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

grant select, insert, update, delete on table public.property_labels
  to authenticated;

-- Soft-migrate: remember categories / doc types already on each home.
insert into public.property_labels (property_id, kind, value)
select distinct a.property_id, 'asset_category', trim(a.category)
from public.assets a
where a.category is not null
  and char_length(trim(a.category)) > 0
on conflict (property_id, kind, value_key) do nothing;

insert into public.property_labels (property_id, kind, value)
select distinct d.property_id, 'document_type', trim(d.doc_type)
from public.documents d
where d.doc_type is not null
  and char_length(trim(d.doc_type)) > 0
on conflict (property_id, kind, value_key) do nothing;
