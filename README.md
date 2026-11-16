# HomeAsset

Phone-first home memory for homeowners (iPhone + Android), with a path for contractors to submit work into the homeowner’s ledger. **Homeowners own the record.** Privacy and approve-before-official are product requirements from day one.

This repo is at **EPIC 1**: accounts, sessions, and thin multi-home (“Add home” + switcher). Ledger content (assets, docs, recalls, AI) comes later.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Phone apps | Expo (React Native) | One codebase for iPhone and Android |
| API | TypeScript + Hono | Small, fast Node API that is easy to deploy |
| Accounts | Email + password → JWT | Normal app login; one login for homeowner + contractor faces |
| Homes | SQLite (property-scoped) | Durable local store; every home’s data is isolated by property id |
| Token storage (phone) | Expo SecureStore | Keeps the session off plain device storage |

## Repo layout

```text
apps/
  mobile/   # Expo app (iPhone + Android)
  api/      # Backend API (auth + properties)
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

API listens on [http://localhost:8787](http://localhost:8787). Accounts and homes persist under `apps/api/data/` (gitignored).

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

### 4. Smoke accounts & homes

1. Create an account (choose **homeowner** or **contractor**).
2. On the homeowner face, tap **Add home**, enter name + address, save.
3. Add a second home and use **Switch** to change the current home.
4. Sign out / sign in again — session and homes should still be there.
5. Optional: **Switch to contractor face** on the same login (CRM tools come later).

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

- Auth required before any personal or home data endpoint (`/me`, `/properties`)
- Homes are **property-scoped**: list/get/select only return homes you own
- Passwords hashed (bcrypt); JWT access tokens are short-lived
- No analytics or silent third-party sharing wired in
- Secure HTTP headers on the API; CORS locked down in production via `CORS_ORIGINS`
- Session token on device uses SecureStore

## What’s next

EPIC 2: asset registry on the current home (still property-scoped).
