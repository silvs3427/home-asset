# HomeAsset

Phone-first home memory for **homeowners only** (iPhone + Android). **Homeowners own the record.** Contractors use LightLift (or a homeowner-sent invite link); there is no in-app contractor mode. Privacy and approve-before-official are product requirements from day one.

This repo includes **Supabase + installable EAS builds** (LightLift-style `app.json` / `app.config.js` / `eas.json`) on top of **EPIC 7** safety recalls (free public lists), **EPIC 6** AI assist, **D18** email/permit intake (approve-before-official), **contractor invite-link submits** (pending → homeowner approve), notifications, reminders, documents, assets, and accounts. Local SQLite demo stays the CI default until you add Supabase secrets. LightLift push remains a later handoff piece.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Phone apps | Expo (React Native) | One codebase for iPhone and Android |
| API | TypeScript + Hono | Small, fast Node API that is easy to deploy |
| Accounts | Email + password → JWT (local API) or **Supabase Auth** when configured | Normal app login; SQLite default for CI/demo; Supabase when env set |
| Homes + assets + docs + reminders + recalls + notices | SQLite (+ optional Supabase Postgres/Storage) | Durable local backup by default; cloud schema + RLS in `supabase/` |
| Phone install | EAS preview **APK** (LightLift layout) | Not Expo Go — real native modules |
| Push | Expo push via edge `send-push` (cloud) or API | Goes live when `EXPO_ACCESS_TOKEN` is set on the edge (or API); stubbed otherwise; in-app center works either way |
| AI assist | Supabase edge `ai-assist` (LightLift) + local mock | Phone: `GEMINI_API_KEY` (or `OPENAI_API_KEY` / `AI_API_KEY`) on **Edge Function secrets**; laptop API can use the same OpenAI names locally; mock otherwise |
| Token storage (phone) | Expo SecureStore | Keeps the session off plain device storage |

## Repo layout

```text
apps/
  mobile/   # Expo app — app.json + app.config.js + eas.json (LightLift layout)
  api/      # Backend API (auth + properties + assets + documents + reminders + recalls + notifications + AI)
supabase/   # SQL migrations + edge functions (ai-assist, invite-submit, send-push) + founder setup README
```

## Prerequisites

- Node.js **22+** (SQLite via `node:sqlite`)
- npm 10+
- For phones: **EAS preview APK** (recommended), or Expo Go SDK 58 as a temporary fallback / Simulator

## Run locally

### 1. Install

From the repo root:

```bash
npm install
```

### 2. API

```bash
cp apps/api/.env.example apps/api/.env
npm run dev:api
```

API listens on [http://localhost:8787](http://localhost:8787). Accounts, homes, assets, document metadata, reminders, and notifications persist under `apps/api/data/` (gitignored). Uploaded files land in `apps/api/data/files/`. AI defaults to a local mock catalog unless you set `AI_API_KEY` (or `OPENAI_API_KEY`).

Quick checks:

```bash
curl http://localhost:8787/health
```

### 3. Mobile app (Expo SDK 58)

**Install Expo Go for SDK 58 before scanning the Metro QR.** The QR is an `exp://…` deep link — phone cameras show “no usable data” / do nothing if Expo Go is missing. That is different from a browser download QR.

| | URL |
| --- | --- |
| SDK 58 chooser | https://expo.dev/go?sdkVersion=58 |
| Android page | https://expo.dev/go?sdkVersion=58&platform=android |
| Android APK (direct) | https://github.com/expo/expo-go-releases/releases/download/Expo-Go-58.0.5/Expo-Go-58.0.5.apk |
| iOS page | https://expo.dev/go?sdkVersion=58&platform=ios |

More detail: [`apps/mobile/README.md`](./apps/mobile/README.md).

Then start Metro in **Expo Go** mode (default for `dev:mobile`):

```bash
npm run dev:mobile
# same as: npm run start -w @homeasset/mobile
# or from apps/mobile: npx expo start --go -c
```

Scan the QR **with Expo Go** (or the iOS Camera app once Expo Go is installed). Press `a` / `i` for Android emulator / iOS Simulator.

If Expo Go says the project is incompatible, you have the wrong SDK client — use the links above, not the generic Play/App Store listing alone.

**Physical phone — preferred: Supabase only (no laptop API / LAN IP):**

1. Create `apps/mobile/.env` with `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
2. In Supabase (dev/test): Authentication → Providers → Email → **Confirm email OFF**.
3. Restart Expo: `npx expo start --go -c` or `--dev-client` after an installable build.
4. Sign up / sign in on the phone — cloud Auth + ledger + AI; no `EXPO_PUBLIC_API_URL` needed.
5. For **live** AI on that phone: set `GEMINI_API_KEY` (or `OPENAI_API_KEY` / `AI_API_KEY`) as a **Supabase Edge Function secret** and deploy `ai-assist` — see [`supabase/functions/ai-assist/README.md`](./supabase/functions/ai-assist/README.md). Never put the key in Expo / `EXPO_PUBLIC_*`.
6. For **live lock-screen recall push** on that phone: set `EXPO_ACCESS_TOKEN` as an Edge Function secret and deploy `send-push` — see [`supabase/functions/send-push/README.md`](./supabase/functions/send-push/README.md). In-app recall notices work without it.
7. For **monthly automatic whole-home recall scans** (no Check tap): set `RECALL_SCAN_SECRET`, deploy `monthly-recall-scan`, paste the cron SQL + Vault secrets — see [`supabase/functions/monthly-recall-scan/README.md`](./supabase/functions/monthly-recall-scan/README.md). No phone rebuild for that alone.

**Fallback (local SQLite demo without Supabase):** keep `npm run dev:api` running, set `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787` (never `localhost` on a real phone), same Wi‑Fi. Details: [`apps/mobile/README.md`](./apps/mobile/README.md).

### 4. Smoke accounts through AI assist

1. Create an account (homeowner signup only).
2. Tap **Add home**, enter name + address, save.
3. From Home → **Add or Update an Asset** → **Scan a picture** → take a photo of the label/logo (or hint brand + model) → review the draft → **Confirm & save**.
4. Open the asset → confirm a **safety recall** alert appears (or Home → **Notifications**) → **Ack** or **Dismiss**. Needs epic7 SQL on Supabase — see [`supabase/README.md`](./supabase/README.md).
5. **Ask HomeAsset** → **Ask how-to** → ask how to start it safely outdoors; check sources.
6. **Ask HomeAsset** → **Add or update asset** → paste a sample contractor email or notes → draft → confirm (nothing is official until approve).
7. From home, also try **View Assets**, documents, reminders, and **Notifications** as before.
8. Add a second home from Settings, switch, and confirm assets/docs stay empty there.
9. Sign out / sign in again — session and data should still be there.

### 5. Scheduler (optional)

**Cloud phone (preferred):** monthly whole-home recall scan is a Supabase edge cron — see [`supabase/functions/monthly-recall-scan/README.md`](./supabase/functions/monthly-recall-scan/README.md).

**Local API demo:** cron (or a one-off curl) can hit due-check / recalls jobs:

```bash
curl -X POST http://localhost:8787/jobs/due-reminders
curl -X POST http://localhost:8787/jobs/recalls
```

In production set `JOBS_SECRET` and send it as `X-Jobs-Secret` (or `Authorization: Bearer …`). Set `EXPO_ACCESS_TOKEN` to deliver live Expo pushes; without it, pushes are stubbed and the in-app center still fills.

## Supabase (preferred phone path)

Local demo needs **no** Supabase. When you want cloud accounts + file storage on the phone:

1. Create a project at [supabase.com](https://supabase.com) (known HomeAsset URL: `https://iiyhogiwqqotlrsjlqud.supabase.co`)
2. Run the SQL in [`supabase/README.md`](./supabase/README.md) **in order** (SQL Editor → paste → Run) — includes LightLift-style `bootstrap_new_user`
3. Copy URL + anon key into **`apps/mobile/.env` only** for signup/login/ledger (see `.env.example`)
4. Optional: same URL/anon (+ service-role) on `apps/api/.env` for CI or server jobs — never put the service-role key in the phone app
5. Live AI: Supabase → Edge Functions → Secrets → `GEMINI_API_KEY` (LightLift name) → `supabase functions deploy ai-assist`
6. Live recall push: Secrets → `EXPO_ACCESS_TOKEN` → `supabase functions deploy send-push` (no phone rebuild for this alone)
7. Monthly automatic recalls: Secrets → `RECALL_SCAN_SECRET` → `supabase functions deploy monthly-recall-scan` → paste cron SQL + Vault secrets (no phone rebuild for this alone)

With mobile Supabase env set, the phone talks to Auth/Postgres/Storage/AI edge directly (LightLift-style). **No localhost API / LAN IP** for preview signup, core ledger, or AI. `AUTH_BACKEND=auto` on the API still uses Supabase when configured; `DATA_BACKEND=sqlite` stays the CI-safe default.

### Auth bootstrap (LightLift model)

After signup or sign-in **when a session exists**, the phone calls the security-definer RPC `bootstrap_new_user` to create **that user’s** profile (and notification prefs) idempotently. We do **not** rely on an Auth SQL trigger as the only path. Details and trigger choice: [`supabase/README.md`](./supabase/README.md). Agent rules: [`.cursorrules`](./.cursorrules).

## Android install (EAS) — primary phone path

Same layout as LightLift (`apps/mobile/app.json` + `app.config.js` + `eas.json`):

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build -p android --profile preview
```

Download/install the APK from the Expo build page (**Install**). Expo Go tunnel is temporary testing only — not the production install path. Details: [`apps/mobile/README.md`](./apps/mobile/README.md).

**Android lock-screen push:** bake Firebase `google-services.json` via EAS file env `GOOGLE_SERVICES_JSON` (visibility **sensitive**) or local `apps/mobile/google-services.json`. Expo Go / preview / development soft-skip when missing; **production** EAS Android **fails** without it. **New APK install required** after a valid file is added. Steps: [`apps/mobile/README.md`](./apps/mobile/README.md#android-lock-screen-push-fcm).

## Tests & CI

```bash
npm run typecheck
npm run test
```

GitHub Actions runs the same checks on pull requests and pushes to `main`.

## Deploy the API

A `Dockerfile` lives at `apps/api/Dockerfile`. Mount a volume at `/app/data` so SQLite **and** uploaded files survive restarts.

Required production env:

- `JWT_SECRET` — long random secret (required)
- `CORS_ORIGINS` — comma-separated allowed app origins
- `JOBS_SECRET` — required in production for `/jobs/*`
- `DATABASE_PATH` — optional (default `/app/data/homeasset.sqlite` in the image)
- `STORAGE_PATH` — optional (default `./data/files`; set to `/app/data/files` in containers)
- `EXPO_ACCESS_TOKEN` — optional; enables live Expo push (API and/or Supabase edge `send-push`)
- `AI_API_KEY` or `OPENAI_API_KEY` — optional; enables live AI (mock catalog otherwise)
- `AI_BASE_URL` / `AI_MODEL` — optional OpenAI-compatible endpoint overrides
- `AI_FORCE_MOCK=1` — force mock even if a key is present
- `PORT` — optional (default `8787`)
- `NODE_ENV=production`

Example:

```bash
docker build -t homeasset-api ./apps/api
docker run --rm -p 8787:8787 \
  -v homeasset-data:/app/data \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e JOBS_SECRET="$(openssl rand -base64 32)" \
  -e STORAGE_PATH=/app/data/files \
  -e NODE_ENV=production \
  homeasset-api
```

## Privacy & security

- Auth required before any personal, home, asset, document, reminder, recall, notification, or AI endpoint
- **Auth bootstrap:** LightLift-style RPC only creates the signed-in user’s own profile; RLS select/update own; no service-role on device
- Homes, assets, documents, reminders, and recall alerts are **property-scoped**: list/get/update/delete only succeed for homes you own
- Notifications are **account-scoped** and never leak across users; reminder and recall notices include the home id when relevant
- **AI never silently writes** — scan returns a draft; manuals/assets are saved only on explicit confirm; how-to and contractor format are draft/read-only; AI keys stay on edge/server (not `EXPO_PUBLIC_*`)
- **Ask HomeAsset limits** — server-side burst (~10/min) and daily (~40/day) caps per signed-in user; soft reject for clearly off-topic coding / general chat; home ledger help stays allowed
- Preferences default to product notices only — **no marketing drip**, SMS out of scope
- Passwords hashed (bcrypt) locally, or held by Supabase Auth when configured; API JWTs are short-lived
- Homeowner control: least data shared, approve-before-official, no silent auto-adds
- No analytics or silent third-party sharing wired in
- Home packet export is owner-only and does not share anything by itself
- Secure HTTP headers on the API; CORS locked down in production via `CORS_ORIGINS`
- Session token on device uses SecureStore
- Job endpoint is secret-gated in production

## What’s next

Founder: create Supabase project + EAS login to produce the downloadable APK. Next product EPIC: contractor submit → homeowner approve (8). Share-a-home (D19) is **next after Phase 1** (recalls / contractor / stores).
