-- Last serviced date + contractor confirmation audit mark on assets.
-- Homeowner-owned ledger only: values are written by the homeowner (Edit)
-- or when the homeowner approves an invite-link / LightLift-style draft.
-- No contractor login; approve-before-official unchanged.

alter table public.assets
  add column if not exists last_serviced_at date;

alter table public.assets
  add column if not exists confirmed_by_contractor_name text;

comment on column public.assets.last_serviced_at is
  'Most recent service date (YYYY-MM-DD). Homeowner-set or filled on approve of a contractor draft.';

comment on column public.assets.confirmed_by_contractor_name is
  'Audit mark: when set, home-sale/report confidence that a named pro confirmed the work. Homeowner records the name (invite / LightLift / self-entry); never silent auto-write without approve.';
