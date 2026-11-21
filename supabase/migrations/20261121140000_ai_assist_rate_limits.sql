-- Ask HomeAsset usage caps (per signed-in user).
-- Enforced by edge ai-assist via security-definer RPC — durable across cold starts.
-- Caps protect founder AI spend and stop “unlimited assistant” abuse.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Usage counters (no direct client access — RPC only)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_assist_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  burst_window_started_at timestamptz not null default timezone('utc', now()),
  burst_count integer not null default 0
    check (burst_count >= 0),
  day_key date not null default ((timezone('utc', now()))::date),
  day_count integer not null default 0
    check (day_count >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.ai_assist_usage is
  'Per-user Ask HomeAsset burst + daily counters. Written only by consume_ai_assist_quota.';

alter table public.ai_assist_usage enable row level security;

revoke all on table public.ai_assist_usage from public, anon, authenticated;
grant all on table public.ai_assist_usage to service_role;

-- ---------------------------------------------------------------------------
-- consume_ai_assist_quota — auth.uid() only; increments when allowed
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_assist_quota(
  p_burst_limit integer default 10,
  p_burst_window_seconds integer default 60,
  p_daily_cap integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  now_ts timestamptz := timezone('utc', now());
  today date := (timezone('utc', now()))::date;
  burst_limit integer := greatest(coalesce(p_burst_limit, 10), 1);
  burst_window integer := greatest(coalesce(p_burst_window_seconds, 60), 1);
  daily_cap integer := greatest(coalesce(p_daily_cap, 40), 1);
  row_rec public.ai_assist_usage%rowtype;
  window_age_seconds double precision;
begin
  if uid is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'unauthorized',
      'message', 'Sign in to use Ask HomeAsset.',
      'retry_after_seconds', null,
      'burst_remaining', 0,
      'daily_remaining', 0,
      'daily_cap', daily_cap,
      'burst_limit', burst_limit
    );
  end if;

  insert into public.ai_assist_usage as u (
    user_id,
    burst_window_started_at,
    burst_count,
    day_key,
    day_count,
    updated_at
  )
  values (uid, now_ts, 0, today, 0, now_ts)
  on conflict (user_id) do nothing;

  select * into row_rec
  from public.ai_assist_usage
  where user_id = uid
  for update;

  -- Roll UTC day
  if row_rec.day_key <> today then
    row_rec.day_key := today;
    row_rec.day_count := 0;
  end if;

  -- Roll burst window
  window_age_seconds := extract(
    epoch from (now_ts - row_rec.burst_window_started_at)
  );
  if window_age_seconds >= burst_window then
    row_rec.burst_window_started_at := now_ts;
    row_rec.burst_count := 0;
    window_age_seconds := 0;
  end if;

  if row_rec.day_count >= daily_cap then
    update public.ai_assist_usage
    set
      day_key = row_rec.day_key,
      day_count = row_rec.day_count,
      burst_window_started_at = row_rec.burst_window_started_at,
      burst_count = row_rec.burst_count,
      updated_at = now_ts
    where user_id = uid;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_cap',
      'message',
        'You''ve reached today''s Ask HomeAsset limit (' || daily_cap ||
        ' asks). It resets tomorrow (UTC). Ask HomeAsset is for home help only — not unlimited AI.',
      'retry_after_seconds', null,
      'burst_remaining', greatest(burst_limit - row_rec.burst_count, 0),
      'daily_remaining', 0,
      'daily_cap', daily_cap,
      'burst_limit', burst_limit
    );
  end if;

  if row_rec.burst_count >= burst_limit then
    update public.ai_assist_usage
    set
      day_key = row_rec.day_key,
      day_count = row_rec.day_count,
      burst_window_started_at = row_rec.burst_window_started_at,
      burst_count = row_rec.burst_count,
      updated_at = now_ts
    where user_id = uid;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'burst',
      'message',
        'Ask HomeAsset needs a short pause — too many asks in a minute. Try again in a moment.',
      'retry_after_seconds',
        greatest(burst_window - floor(window_age_seconds)::integer, 1),
      'burst_remaining', 0,
      'daily_remaining', greatest(daily_cap - row_rec.day_count, 0),
      'daily_cap', daily_cap,
      'burst_limit', burst_limit
    );
  end if;

  row_rec.burst_count := row_rec.burst_count + 1;
  row_rec.day_count := row_rec.day_count + 1;

  update public.ai_assist_usage
  set
    day_key = row_rec.day_key,
    day_count = row_rec.day_count,
    burst_window_started_at = row_rec.burst_window_started_at,
    burst_count = row_rec.burst_count,
    updated_at = now_ts
  where user_id = uid;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'message', null,
    'retry_after_seconds', null,
    'burst_remaining', greatest(burst_limit - row_rec.burst_count, 0),
    'daily_remaining', greatest(daily_cap - row_rec.day_count, 0),
    'daily_cap', daily_cap,
    'burst_limit', burst_limit
  );
end;
$$;

revoke all on function public.consume_ai_assist_quota(integer, integer, integer)
  from public, anon;
grant execute on function public.consume_ai_assist_quota(integer, integer, integer)
  to authenticated;
grant execute on function public.consume_ai_assist_quota(integer, integer, integer)
  to service_role;

comment on function public.consume_ai_assist_quota(integer, integer, integer) is
  'Atomically check + consume one Ask HomeAsset ask for auth.uid(). Defaults: 10/min burst, 40/day.';
