-- Monthly automatic whole-home recall scan (cloud cron).
-- Invokes edge function monthly-recall-scan via pg_cron + pg_net.
-- Safe to re-run. Does not invent assets/docs — alerts/notices only.
--
-- Founder (after deploying the edge function + setting RECALL_SCAN_SECRET):
--   1. Paste/run this file in SQL Editor
--   2. Store Vault secrets (once):
--        select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
--        select vault.create_secret('same-as-RECALL_SCAN_SECRET', 'recall_scan_secret');
--   3. Optional: select public.invoke_monthly_recall_scan();

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Helper: POST to monthly-recall-scan using Vault secrets.
-- Returns null request_id when secrets are missing (no hard fail for demos).
create or replace function public.invoke_monthly_recall_scan()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  project_url text;
  scan_secret text;
  request_id bigint;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into scan_secret
  from vault.decrypted_secrets
  where name = 'recall_scan_secret'
  limit 1;

  if project_url is null or length(trim(project_url)) = 0 then
    raise notice 'invoke_monthly_recall_scan: vault secret project_url missing — skip';
    return null;
  end if;

  if scan_secret is null or length(trim(scan_secret)) = 0 then
    raise notice 'invoke_monthly_recall_scan: vault secret recall_scan_secret missing — skip';
    return null;
  end if;

  -- Trim trailing slash so path joins cleanly.
  project_url := rtrim(project_url, '/');

  select net.http_post(
    url := project_url || '/functions/v1/monthly-recall-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || scan_secret,
      'apikey', scan_secret
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'job', 'monthly-recall-scan',
      'triggered_at', now()
    ),
    timeout_milliseconds := 60000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_monthly_recall_scan() from public;
grant execute on function public.invoke_monthly_recall_scan() to postgres;

-- Schedule: 1st of each month at 12:00 UTC.
-- Unschedule prior job with the same name so re-runs stay idempotent.
do $$
begin
  perform cron.unschedule('monthly-recall-scan');
exception
  when others then
    -- Job may not exist yet.
    null;
end;
$$;

select cron.schedule(
  'monthly-recall-scan',
  '0 12 1 * *',
  $$select public.invoke_monthly_recall_scan();$$
);
