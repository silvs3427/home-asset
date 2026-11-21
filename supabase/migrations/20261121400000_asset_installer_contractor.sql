-- Link assets.installer to home_contractors directory (optional FK).
-- Keeps installer_vendor as searchable display text; directory is source of truth
-- for Past contractors. Safe to re-run. Homeowner-only via existing assets RLS.

alter table public.assets
  add column if not exists installer_contractor_id uuid
  references public.home_contractors (id) on delete set null;

create index if not exists idx_assets_installer_contractor
  on public.assets (installer_contractor_id)
  where installer_contractor_id is not null;

comment on column public.assets.installer_contractor_id is
  'Optional link to this home''s Past contractors directory entry for installer/vendor.';
