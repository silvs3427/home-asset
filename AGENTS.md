# HomeAsset agent notes

See [`.cursorrules`](./.cursorrules) for security, privacy, and LightLift Auth bootstrap rules.

Mobile Expo specifics live in [`apps/mobile/AGENTS.md`](./apps/mobile/AGENTS.md).

## Auth bootstrap (do not regress)

1. Phone cloud path (`apps/mobile/src/lib/cloud.ts`) must call `bootstrap_new_user` after Auth signup/sign-in when a session exists.
2. SQL: `supabase/migrations/20261121000000_bootstrap_new_user.sql` — security definer, `auth.uid()` only, idempotent.
3. Do not reintroduce Auth→profiles triggers as the sole account-creation path.
4. Do not add broad `profiles` INSERT policies for arbitrary user ids.

## Cloud vs local demo

- Prefer cloud Supabase for phone testing (URL + anon key).
- `EXPO_PUBLIC_API_URL` / LAN IP is fallback for SQLite demo without Supabase only.
