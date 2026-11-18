# HomeAsset

Phone-first home memory for homeowners (iPhone + Android), with a path for contractors to submit work into the homeowner’s ledger. **Homeowners own the record.** Privacy and approve-before-official are product requirements from day one.

This repo includes **Supabase + installable EAS builds** (LightLift-style `app.json` / `app.config.js` / `eas.json`) on top of **EPIC 6** AI assist, notifications, reminders, documents, assets, and accounts. Local SQLite demo stays the CI default until you add Supabase secrets. Recalls and full contractor submit → homeowner approve come next.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Phone apps | Expo (React Native) | One codebase for iPhone and Android |
| API | TypeScript + Hono | Small, fast Node API that is easy to deploy |
| Accounts | Email + password → JWT (local API) or **Supabase Auth** when configured | Normal app login; SQLite default for CI/demo; Supabase when env set |
| Homes + assets + docs + reminders + notices | SQLite (+ optional Supabase Postgres/Storage) | Durable local backup by default; cloud schema + RLS in `supabase/` |
| Phone install | EAS preview **APK** (LightLift layout) | Not Expo Go — real native modules |
| Push | Expo push (stub without token) | Goes live when `EXPO_ACCESS_TOKEN` is set; in-app center works either way |
| AI assist | Env key + local mock catalog | Live when `AI_API_KEY` / `OPENAI_API_KEY` is set; mock otherwise (CI-safe) |
| Token storage (phone) | Expo SecureStore | Keeps the session off plain device storage |

## Repo layout

```text
apps/
  mobile/   # Expo app — app.json + app.config.js + eas.json (LightLift layout)
  api/      # Backend API (auth + properties + assets + documents + reminders + notifications + AI)
supabase/   # SQL migrations + founder setup README (Auth / Postgres / Storage / RLS)
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

**Physical phone (Windows) — signup needs the PC LAN IP, not localhost:**

1. Keep `npm run dev:api` running (listens on all interfaces, port **8787**).
2. Command Prompt → `ipconfig` → copy **IPv4 Address** under Wi‑Fi / Ethernet.
3. Create `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787
   ```
   Example: `EXPO_PUBLIC_API_URL=http://192.168.1.42:8787` — never `localhost` on a real phone.
4. Restart Expo: `npx expo start --go -c` (from `apps/mobile` or via `npm run dev:mobile` after the env file exists).
5. Same Wi‑Fi; allow Node through Windows Firewall if asked.

The sign-in screen shows the API URL it will call and labels **network** vs **sign-in** errors. Details: [`apps/mobile/README.md`](./apps/mobile/README.md) and [`apps/mobile/.env.example`](./apps/mobile/.env.example).

### 4. Smoke accounts through AI assist

1. Create an account (choose **homeowner** or **contractor**).
2. On the homeowner face, tap **Add home**, enter name + address, save.
3. Tap **Scan product (AI)** → hint `Generac GP6500` (or take a photo) → review suggested manuals → **Confirm & save**.
4. Open the asset → **Ask how-to (AI)** → ask how to start it safely outdoors; check sources.
5. From home, also try **View assets**, documents, reminders, and **Notifications** as before.
6. Switch to **contractor face** → **Format notes (AI)** → paste job notes → confirm draft wording (nothing is written to a home ledger yet).
7. Add a second home, switch, and confirm assets/docs stay empty there.
8. Sign out / sign in again — session and data should still be there.

### 5. Scheduler (optional)

Cron (or a one-off curl) can hit the due-check job:

```bash
curl -X POST http://localhost:8787/jobs/due-reminders
```

In production set `JOBS_SECRET` and send it as `X-Jobs-Secret` (or `Authorization: Bearer …`). Set `EXPO_ACCESS_TOKEN` to deliver live Expo pushes; without it, pushes are stubbed and the in-app center still fills.

## Supabase (optional)

Local demo needs **no** Supabase. When you want cloud accounts + file storage:

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL in [`supabase/README.md`](./supabase/README.md) (SQL Editor → paste → Run)
3. Copy URL + anon key into `apps/api/.env` and `apps/mobile/.env` (see `.env.example` files)
4. Service-role key stays on the **API only** (never the phone app)

`AUTH_BACKEND=auto` uses Supabase Auth when URL+anon are set; `DATA_BACKEND=sqlite` stays the CI-safe default until you flip it after the schema is applied.

## Android install (EAS) — primary phone path

Same layout as LightLift (`apps/mobile/app.json` + `app.config.js` + `eas.json`):

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build -p android --profile preview
```

Download/install the APK from the Expo build page (**Install**). Expo Go tunnel is temporary testing only — not the production install path. Details: [`apps/mobile/README.md`](./apps/mobile/README.md).

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
- `EXPO_ACCESS_TOKEN` — optional; enables live Expo push
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

- Auth required before any personal, home, asset, document, reminder, notification, or AI endpoint
- Homes, assets, documents, and reminders are **property-scoped**: list/get/update/delete only succeed for homes you own
- Notifications are **account-scoped** and never leak across users; reminder notices include the home id when relevant
- **AI never silently writes** — scan returns a draft; manuals/assets are saved only on explicit confirm; how-to and contractor format are draft/read-only
- Preferences default to product notices only — **no marketing drip**, SMS out of scope
- Passwords hashed (bcrypt) locally, or held by Supabase Auth when configured; API JWTs are short-lived
- No analytics or silent third-party sharing wired in
- Home packet export is owner-only and does not share anything by itself
- Secure HTTP headers on the API; CORS locked down in production via `CORS_ORIGINS`
- Session token on device uses SecureStore
- Job endpoint is secret-gated in production

## What’s next

Founder: create Supabase project + EAS login to produce the downloadable APK. Next product EPICs: recalls (7) and contractor submit → homeowner approve (8).
