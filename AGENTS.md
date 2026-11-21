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

## How to use / Settings copy (do not regress)

1. In-app guide: `apps/mobile/src/app/settings/how-to-use.tsx` reads `HOW_TO_USE_SECTIONS` from `apps/mobile/src/lib/settingsContent.ts`.
2. Privacy / Security screens use `PRIVACY_SECTIONS` / `SECURITY_SECTIONS` in the same file.
3. **When adding or relocating user-facing features**, update that content in the same PR.
4. Home stays lean (Assets / Documents / Alerts). “Add another home” in Settings. AI scan/how-to via persistent FAB → `/ai/help`. One Alerts surface; delivery prefs under Settings. No long instructional copy on feature screens — How to use owns it. Permits suggest is not a primary CTA.
