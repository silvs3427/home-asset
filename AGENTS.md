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
- Recall lock-screen push on cloud: edge `send-push` + secret `EXPO_ACCESS_TOKEN` (never `EXPO_PUBLIC_*`). Phone still matches fixtures and writes in-app notices via RLS; edge only sends Expo.
- Android push registration needs Firebase `google-services.json` via `android.googleServicesFile` (`GOOGLE_SERVICES_JSON` EAS file env or local file). FCM V1 service account goes to Expo Credentials (not the phone). New APK after first wiring — see `apps/mobile/README.md`.

## Homeowner-only product (do not regress)

1. Signup never offers a contractor role. No face switch / contractor-only screens in the phone app.
2. Contractors belong in LightLift; non-LightLift pros use a homeowner-sent invite link (browser submit — voice + photos + text) → pending draft → homeowner approve. Not dual-role enrollment in HomeAsset.

## How to use / Settings copy (do not regress)

1. In-app guide: `apps/mobile/src/app/settings/how-to-use.tsx` reads `HOW_TO_USE_SECTIONS` from `apps/mobile/src/lib/settingsContent.ts`.
2. Privacy / Security screens use `PRIVACY_SECTIONS` / `SECURITY_SECTIONS` in the same file.
3. **When adding or relocating user-facing features**, update that content in the same PR.
4. Home CTAs: Ask HomeAsset → View Assets → Add or Update an Asset → Notifications → Settings. Ask HomeAsset (`/ai/help`) is Talk or Text (typed or voice note → how-to). Add or Update (`/ai/add-update`): Scan a picture, Upload a PDF, Free text → Format with Ask HomeAsset; approve-before-official. One Notifications surface; delivery prefs under Settings. Colors from `apps/mobile/src/lib/theme.ts`. No long instructional copy on feature screens — How to use owns it. Permits suggest is not a primary CTA.
5. Invite link: Settings → Invite a contractor / Review contractor submits; public edge `invite-submit`; How to use must stay accurate. Do not ship a fake contractor face.
