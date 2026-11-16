# HomeAsset

Phone-first home memory for homeowners (iPhone + Android), with a path for contractors to submit work into the homeowner’s ledger. **Homeowners own the record.** Privacy and approve-before-official are product requirements from day one.

This repo is at **EPIC 2**: property-scoped **asset registry** (create / list / detail / edit / delete) on top of accounts and thin multi-home from EPIC 1. Documents, recalls, AI, and contractor submit come later.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Phone apps | Expo (React Native) | One codebase for iPhone and Android |
| API | TypeScript + Hono | Small, fast Node API that is easy to deploy |
| Accounts | Email + password → JWT | Normal app login; one login for homeowner + contractor faces |
| Homes + assets | SQLite (property-scoped) | Durable local store; every home’s data is isolated by property id |
| Token storage (phone) | Expo SecureStore | Keeps the session off plain device storage |

## Repo layout

```text
apps/
  mobile/   # Expo app (iPhone + Android)
  api/      # Backend API (auth + properties + assets)
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

API listens on [http://localhost:8787](http://localhost:8787). Accounts, homes, and assets persist under `apps/api/data/` (gitignored).

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

### 4. Smoke accounts, homes, and assets

1. Create an account (choose **homeowner** or **contractor**).
2. On the homeowner face, tap **Add home**, enter name + address, save.
3. Tap **View assets** → **Add asset** (name, category, manufacturer/model/serial, dates, vendor, location/notes).
4. Open the asset, edit, then confirm it still shows only on that home.
5. Add a second home, switch, and confirm the asset list is empty there.
6. Sign out / sign in again — session, homes, and assets should still be there.

## Tests & CI

```bash
npm run typecheck
npm run test
```

GitHub Actions runs the same checks on pull requests and pushes to `main`.

## Deploy the API

A `Dockerfile` lives at `apps/api/Dockerfile`. Mount a volume at `/app/data` so SQLite survives restarts.

Required production env:

- `JWT_SECRET` — long random secret (required)
- `CORS_ORIGINS` — comma-separated allowed app origins
- `DATABASE_PATH` — optional (default `/app/data/homeasset.sqlite` in the image)
- `PORT` — optional (default `8787`)
- `NODE_ENV=production`

Example:

```bash
docker build -t homeasset-api ./apps/api
docker run --rm -p 8787:8787 \
  -v homeasset-data:/app/data \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e NODE_ENV=production \
  homeasset-api
```

## Privacy & security

- Auth required before any personal, home, or asset endpoint (`/me`, `/properties`, `/properties/:id/assets`)
- Homes and assets are **property-scoped**: list/get/update/delete only succeed for homes you own
- Assets never leak across homes — even for the same account
- Passwords hashed (bcrypt); JWT access tokens are short-lived
- No analytics or silent third-party sharing wired in
- Secure HTTP headers on the API; CORS locked down in production via `CORS_ORIGINS`
- Session token on device uses SecureStore

## What’s next

EPIC 3: documents & warranties linked to assets (still property-scoped).
