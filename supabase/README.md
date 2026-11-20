# Supabase setup (HomeAsset)

Same founder-friendly pattern as LightLift: create a project, paste SQL in order, put URL + anon key in env. Never put the service-role key in the phone app.

HomeAsset’s cloud project ref (from project docs): `iiyhogiwqqotlrsjlqud` → URL `https://iiyhogiwqqotlrsjlqud.supabase.co`. Repo `.env.example` files keep a `YOUR_PROJECT` placeholder so secrets are never committed.

## Apply the schema

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the Supabase dashboard → **New query**.
3. Paste and run **every** file below **in order** (safe to re-run — uses `if not exists` / `drop policy if exists`):

| # | File | What it adds |
|---|------|----------------|
| 1 | `migrations/20261118000000_init_schema.sql` | Profiles, properties, assets, documents, reminders, notifications; RLS; signup trigger; private `documents` Storage bucket |
| 2 | `migrations/20261120120000_profile_bootstrap.sql` | Re-asserts signup trigger; allows own-profile insert; `ensure_own_profile` RPC so the phone can finish signup if the trigger was missing/late |

That setup creates the homeowner ledger tables, enables RLS so each user only sees their own rows, auto-creates a profile on Auth signup, and adds a private Storage bucket for manuals / photos.

### Exact clicks (first-time)

1. Supabase project → left sidebar **SQL Editor** → **New query**.
2. Open each migration file on GitHub → **Raw** → select all → copy (run **in order**).
3. Paste into the SQL Editor → click **Run**. Confirm no red error.
4. If signup shows **Could not load profile**, run `20261120120000_profile_bootstrap.sql` (even if init already ran).

### Auth tip (product testing)

**Authentication → Sign In / Providers → Email → Confirm email → OFF → Save** on a **dev/test** project only, so sign-up returns a session immediately (no inbox wait).

## App / API env vars

### Phone app (`apps/mobile/.env`)

Copy `apps/mobile/.env.example` to `apps/mobile/.env` (never commit a real `.env`). Either pair works; Expo public names are tried first (same as LightLift):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (local Expo)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` (Cursor/Cloud secrets; `EXPO_PUBLIC_` is reserved in bind-app-secrets)

With those two set, the phone uses **Supabase Auth + Postgres (+ Storage) directly** — no laptop API and **no `EXPO_PUBLIC_API_URL` / LAN IP** for signup, login, homes, and the core ledger.

`EXPO_PUBLIC_API_URL` is optional: only for the local SQLite demo without Supabase, or a hosted API for AI / cron jobs.

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
