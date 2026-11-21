-- Homeowner contractor directory (past pros for this home).
-- Contact + services are homeowner-owned; work history can link approved
-- invite submissions. Safe to re-run. No contractor login.

-- ---------------------------------------------------------------------------
-- Contact fields on invite submissions (optional; copied into directory
-- only after homeowner approve)
-- ---------------------------------------------------------------------------
alter table public.contractor_submissions
  add column if not exists phone text;
alter table public.contractor_submissions
  add column if not exists email text;
alter table public.contractor_submissions
  add column if not exists services_offered text[] not null default '{}'::text[];

-- ---------------------------------------------------------------------------
-- Directory entries (property-scoped; homeowner CRUD via RLS)
-- ---------------------------------------------------------------------------
create table if not exists public.home_contractors (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  display_name text not null,
  company_name text,
  phone text,
  email text,
  website text,
  services_offered text[] not null default '{}'::text[],
  notes text,
  last_worked_at date,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_contractors_display_name_len
    check (char_length(trim(display_name)) >= 1)
);

create index if not exists idx_home_contractors_property
  on public.home_contractors (property_id, lower(display_name));
create index if not exists idx_home_contractors_company
  on public.home_contractors (property_id, lower(coalesce(company_name, '')));
create index if not exists idx_home_contractors_services
  on public.home_contractors using gin (services_offered);

-- ---------------------------------------------------------------------------
-- Work done for this homeowner (searchable history)
-- ---------------------------------------------------------------------------
create table if not exists public.home_contractor_work (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null
    references public.home_contractors (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  submission_id uuid references public.contractor_submissions (id)
    on delete set null,
  summary text not null,
  work_performed text,
  work_date date,
  created_at timestamptz not null default now(),
  constraint home_contractor_work_summary_len
    check (char_length(trim(summary)) >= 1)
);

create index if not exists idx_home_contractor_work_contractor
  on public.home_contractor_work (contractor_id, work_date desc nulls last);
create index if not exists idx_home_contractor_work_property
  on public.home_contractor_work (property_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — homeowners only; no public/pro access
-- ---------------------------------------------------------------------------
alter table public.home_contractors enable row level security;
alter table public.home_contractor_work enable row level security;

drop policy if exists home_contractors_all_own on public.home_contractors;
create policy home_contractors_all_own on public.home_contractors
  for all using (public.owns_property(property_id))
  with check (
    public.owns_property(property_id)
    and created_by = auth.uid()
  );

drop policy if exists home_contractor_work_all_own on public.home_contractor_work;
create policy home_contractor_work_all_own on public.home_contractor_work
  for all using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

grant select, insert, update, delete on table public.home_contractors
  to authenticated;
grant select, insert, update, delete on table public.home_contractor_work
  to authenticated;
