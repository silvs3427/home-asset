# Supabase setup (HomeAsset)

Same founder-friendly pattern as LightLift: create a project, paste SQL in order, put URL + anon key in env. Never put the service-role key in the phone app.

**Auth → profile = LightLift model:** after signup/sign-in (when a session exists), the phone calls the security-definer RPC `bootstrap_new_user`. Do **not** rely on an Auth SQL trigger as the only path. There is no localhost API required for phone preview once URL + anon key are set.

HomeAsset’s cloud project ref (from project docs): `iiyhogiwqqotlrsjlqud` → URL `https://iiyhogiwqqotlrsjlqud.supabase.co`. Repo `.env.example` files keep a `YOUR_PROJECT` placeholder so secrets are never committed.

## Apply the schema

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the Supabase dashboard → **New query**.
3. Paste and run **every** file below **in order** (safe to re-run — uses `if not exists` / `drop policy if exists`):

| # | File | What it adds |
|---|------|----------------|
| 1 | `migrations/20261118000000_init_schema.sql` | Profiles, properties, assets, documents, reminders, notifications; RLS; **table GRANTs** for `authenticated`; private `documents` Storage bucket (no Auth→profiles trigger) |
| 2 | `migrations/20261120000000_epic7_recalls.sql` | **Required for phone safety recalls** — `recall_notices` + `asset_recall_alerts` + RLS (safe to re-run) |
| 3 | `migrations/20261121000000_bootstrap_new_user.sql` | LightLift-style `bootstrap_new_user` RPC; drops Auth trigger / insert-own policy if present |
| 4 | `migrations/20261121120000_profiles_table_grants.sql` | **Paste now if signup says permission denied for table profiles** — GRANTs + re-assert select/update policies (safe re-run; no app rebuild) |
| 5 | `migrations/20261121140000_ai_assist_rate_limits.sql` | Ask HomeAsset rate / daily caps (server-side) |
| 6 | `migrations/20261121160000_property_custom_labels.sql` | **Custom reusable categories + document types per home** — open lists (no fixed enums); seeds from existing assets/docs; RLS via `owns_property` |
| 7 | `migrations/20261121180000_contractor_invite_submissions.sql` | **Contractor invite links** — invites, pending submissions, media bucket (required for Settings → Invite a contractor) |

That setup creates the homeowner ledger tables, enables RLS so each user only sees their own rows, grants `authenticated` the table privileges PostgREST needs, lets the signed-in user bootstrap **their own** profile via RPC, and adds private Storage buckets for manuals / photos and invite media. **Phone recall alerts need migration #2** — without it, Check safety recalls fails with a “tables missing” message. **Custom category / document-type reuse needs migration #6.** **Invite links need migration #7** plus deploying the `invite-submit` edge function.

### Exact clicks (first-time)

1. Supabase project → left sidebar **SQL Editor** → **New query**.
2. Open each migration file on GitHub → **Raw** → select all → copy (run **in order**).
3. Paste into the SQL Editor → click **Run**. Confirm no red error.
4. If signup shows **permission denied for table profiles**, paste and run **only** `20261121120000_profiles_table_grants.sql` (**no app rebuild**).
5. If signup shows **Could not load profile** / bootstrap failed (function missing), re-run `20261121000000_bootstrap_new_user.sql`, then the grants file if needed.
6. If **Check safety recalls** says tables are missing, re-run `20261120000000_epic7_recalls.sql`.

### Trigger choice (documented)

- **Dropped / disabled:** Auth `on_auth_user_created` trigger is **not** the account-creation path (same as LightLift).
- **Why:** silent triggers are easy to miss on a live project and hide failures; the phone must call an explicit RPC so errors are visible and idempotent.
- **Safe if leftover:** `bootstrap_new_user` is idempotent (returns existing profile). The migration removes the trigger so duplicates cannot race.

### Auth tip (product testing)

**Authentication → Sign In / Providers → Email → Confirm email → OFF → Save** on a **dev/test** project only, so sign-up returns a session immediately (no inbox wait). If Confirm email stays on, bootstrap runs on the first successful sign-in (metadata carries starting face).

## App / API env vars

### Phone app (`apps/mobile/.env`)

Copy `apps/mobile/.env.example` to `apps/mobile/.env` (never commit a real `.env`). Either pair works; Expo public names are tried first (same as LightLift):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (local Expo)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` (Cursor/Cloud secrets; `EXPO_PUBLIC_` is reserved in bind-app-secrets)

With those two set, the phone uses **Supabase Auth + Postgres (+ Storage) directly** — no laptop API and **no `EXPO_PUBLIC_API_URL` / LAN IP** for signup, login, homes, the core ledger, **safety recalls** (in-app + lock-screen push via edge), **and AI assist**.

`EXPO_PUBLIC_API_URL` is optional: only for the local SQLite demo without Supabase, or a hosted API for cron / jobs.

## AI assist edge function (LightLift pattern)

`functions/ai-assist` holds the AI key server-side — same idea as LightLift `parse-voice-invoice` / `find-truck-part`.

**Never** put these in the Expo app, EAS env, or any `EXPO_PUBLIC_*` variable:

| Secret | Notes |
| --- | --- |
| `GEMINI_API_KEY` | Preferred — **same name LightLift uses** |
| `OPENAI_API_KEY` or `AI_API_KEY` | Alternate OpenAI-compatible live path |
| `GEMINI_MODEL` | Optional (default `gemini-2.5-flash`) |
| `AI_ASSIST_LIVE` | Optional; default on when a key is set |

```bash
supabase secrets set GEMINI_API_KEY=your-gemini-key
supabase functions deploy ai-assist
```

Without a key, the function returns **mock** catalog drafts so demos still work. Confirm / approve writes stay on the phone via RLS (homeowner must tap confirm). See `functions/ai-assist/README.md`.

## Contractor invite submit (`invite-submit`)

Public path for **non-LightLift** pros: homeowner shares a link from Settings → Invite a contractor; the pro opens the **GitHub Pages** landing (`apps/invite-landing`) in a browser (voice + photos + text); the page calls this edge function; Ask HomeAsset formats a **pending** draft; homeowner approves in the app.

Supabase project hosts cannot serve HTML on GET (rewritten to plain text). Do not point contractors at the raw `/functions/v1/invite-submit` URL for viewing — the phone builds a Pages URL; browser hits on the edge URL `302` to Pages.

1. Paste SQL migration `20261121180000_contractor_invite_submissions.sql` (if not already applied).
2. Enable **GitHub Pages** once: repo **Settings → Pages → Build and deployment → GitHub Actions**. Merge to `main` (or run **Deploy invite landing**) so `https://silvs3427.github.io/home-asset/` is live.
3. Deploy the edge function (JWT verification off — token gates access):

```bash
npx supabase functions deploy invite-submit
```

Same AI secrets as `ai-assist` (optional; mock drafts work without a key). See `functions/invite-submit/README.md`.

## Recall lock-screen push (`send-push`)

`functions/send-push` delivers Expo push after the phone matches a safety recall on the cloud path. Prefs (`Safety recall alerts` + `Push`) and the user’s own `push_devices` are checked under RLS.

| Secret | Notes |
| --- | --- |
| `EXPO_ACCESS_TOKEN` | Required for **live** lock-screen delivery; without it, push is stubbed/logged and in-app notices still work |

```bash
supabase secrets set EXPO_ACCESS_TOKEN=your-expo-token
supabase functions deploy send-push
```

See `functions/send-push/README.md`. **No phone rebuild** for this alone if the install already can register push tokens.

**Windows:** name the file exactly `.env` (not `.env.txt`). After changes, restart with `npx expo start -c` (or `npm run start:dev-client` for an installable build).

### API (`apps/api/.env`)

Copy `apps/api/.env.example`. Local demo / CI stays on SQLite until you opt in:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Publishable / anon key (Auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — needed for Storage admin uploads and `DATA_BACKEND=supabase` |
| `AUTH_BACKEND=auto` | `auto` = Supabase Auth when URL+anon set; `local` forces SQLite bcrypt |
| `DATA_BACKEND=sqlite` | Keep `sqlite` for CI/demo; set `supabase` only after schema + service role |
| `STORAGE_BACKEND=auto` | Uses Supabase Storage when service role is present |

Never put the service role key in the mobile app. Missing Supabase env keeps the local SQLite demo path working.

## Installable Android APK (not Expo Go)

Expo Go lacks some native modules (push / `ExpoApplication` crashes). Use EAS like LightLift:

```bash
cd apps/mobile
npx eas-cli@latest login          # one founder step if not logged in
npx eas-cli@latest init           # writes extra.eas.projectId into app.json — do not invent a UUID
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, open the Expo build page → **Install** / download the **APK**. That is the durable install path (no QR / tunnel required).

iOS: `npx eas-cli@latest build -p ios --profile preview` (needs Apple Developer for device installs; Simulator builds can use the `development` profile).
