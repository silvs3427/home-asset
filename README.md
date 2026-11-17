# HomeAsset

Phone-first home memory for homeowners (iPhone + Android), with a path for contractors to submit work into the homeowner’s ledger. **Homeowners own the record.** Privacy and approve-before-official are product requirements from day one.

This repo is at **EPIC 5**: push + in-app notifications for due reminders (hooks ready for recalls and contractor submissions), on top of thin maintenance reminders (EPIC 4), documents/warranties (EPIC 3), the property-scoped asset registry (EPIC 2), and accounts / thin multi-home (EPIC 1). Recalls, AI, and contractor submit come later.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Phone apps | Expo (React Native) | One codebase for iPhone and Android |
| API | TypeScript + Hono | Small, fast Node API that is easy to deploy |
| Accounts | Email + password → JWT | Normal app login; one login for homeowner + contractor faces |
| Homes + assets + docs + reminders + notices | SQLite + local file store (property-scoped) | Durable local backup; every home’s data is isolated by property id |
| Push | Expo push (stub without token) | Goes live when `EXPO_ACCESS_TOKEN` is set; in-app center works either way |
| Token storage (phone) | Expo SecureStore | Keeps the session off plain device storage |

## Repo layout

```text
apps/
  mobile/   # Expo app (iPhone + Android)
  api/      # Backend API (auth + properties + assets + documents + reminders + notifications)
```

## Prerequisites

- Node.js **22+** (SQLite via `node:sqlite`)
- npm 10+
- For phones: [Expo Go](https://expo.dev/go) on a device, or iOS Simulator / Android emulator

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

API listens on [http://localhost:8787](http://localhost:8787). Accounts, homes, assets, document metadata, reminders, and notifications persist under `apps/api/data/` (gitignored). Uploaded files land in `apps/api/data/files/`.

Quick checks:

```bash
curl http://localhost:8787/health
```

### 3. Mobile app

In another terminal:

```bash
npm run dev:mobile
```

Then open in Expo Go (scan QR), iOS Simulator, or Android emulator.

**Physical device:** the phone cannot reach `localhost` on your computer. Create `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787
```

Restart Expo after changing that value.

### 4. Smoke accounts through notifications

1. Create an account (choose **homeowner** or **contractor**).
2. On the homeowner face, tap **Add home**, enter name + address, save.
3. Tap **View assets** → **Add asset**, include warranty end date / term, save.
4. Open the asset → **Take photo** (or photo library / file) → save the document → **View** to download/share.
5. On the asset (or from home → **Upcoming reminders**), add a reminder due today or soon.
6. From home, open **Notifications** → **Check due reminders** — a notice should appear. Open **Prefs** to set lead days / channels; optionally **Register this phone for push**.
7. From home, open **Home documents** for paperwork not tied to one asset; optionally **Export home packet**.
8. Add a second home, switch, and confirm assets/docs/reminders stay empty there.
9. Sign out / sign in again — session and data should still be there.

### 5. Scheduler (optional)

Cron (or a one-off curl) can hit the due-check job:

```bash
curl -X POST http://localhost:8787/jobs/due-reminders
```

In production set `JOBS_SECRET` and send it as `X-Jobs-Secret` (or `Authorization: Bearer …`). Set `EXPO_ACCESS_TOKEN` to deliver live Expo pushes; without it, pushes are stubbed and the in-app center still fills.

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

- Auth required before any personal, home, asset, document, reminder, or notification endpoint
- Homes, assets, documents, and reminders are **property-scoped**: list/get/update/delete only succeed for homes you own
- Notifications are **account-scoped** and never leak across users; reminder notices include the home id when relevant
- Preferences default to product notices only — **no marketing drip**, SMS out of scope
- Passwords hashed (bcrypt); JWT access tokens are short-lived
- No analytics or silent third-party sharing wired in
- Home packet export is owner-only and does not share anything by itself
- Secure HTTP headers on the API; CORS locked down in production via `CORS_ORIGINS`
- Session token on device uses SecureStore
- Job endpoint is secret-gated in production

## What’s next

EPIC 6–8: AI assist, recalls (using notification hooks), and contractor submit → homeowner approve (using submit notification hooks).
