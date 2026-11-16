# HomeAsset

Phone-first home memory for homeowners (iPhone + Android), with a path for contractors to submit work into the homeowner’s ledger. **Homeowners own the record.** Privacy and approve-before-official are product requirements from day one.

This repo is at **EPIC 0**: runnable foundation only (empty authenticated shell). Product features come later.

## Stack (EPIC 0)

| Piece | Choice | Why |
| --- | --- | --- |
| Phone apps | Expo (React Native) | One codebase for iPhone and Android; camera/push later are well supported |
| API | TypeScript + Hono | Small, fast Node API that is easy to deploy |
| Sign-in stub | Email + password → JWT | Normal app login shape; swap storage for a real database in EPIC 1 |
| Token storage (phone) | Expo SecureStore | Keeps the session off plain device storage |

## Repo layout

```text
apps/
  mobile/   # Expo app (iPhone + Android)
  api/      # Backend API shell
```

## Prerequisites

- Node.js 20+
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

API listens on [http://localhost:8787](http://localhost:8787).

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

### 4. Smoke the auth stub

1. Create an account on the sign-in screen (homeowner face by default).
2. You land on an empty homeowner home shell.
3. Sign out / sign in again to confirm the session persists.

## Tests & CI

```bash
npm run typecheck
npm run test
```

GitHub Actions runs the same checks on pull requests and pushes to `main`.

## Deploy the API shell

A `Dockerfile` lives at `apps/api/Dockerfile`. Any container host works (Fly, Railway, Render, etc.).

Required production env:

- `JWT_SECRET` — long random secret (required)
- `CORS_ORIGINS` — comma-separated allowed app origins
- `PORT` — optional (default `8787`)
- `NODE_ENV=production`

Example:

```bash
docker build -t homeasset-api ./apps/api
docker run --rm -p 8787:8787 \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e NODE_ENV=production \
  homeasset-api
```

## Privacy & security (foundation defaults)

- Auth required before any personal data endpoint (`/me`)
- Passwords hashed (bcrypt); JWT access tokens are short-lived
- No analytics or silent third-party sharing wired in
- Secure HTTP headers on the API; CORS locked down in production via `CORS_ORIGINS`
- Session token on device uses SecureStore

## What’s next

EPIC 1: real accounts & properties, face choice (homeowner / contractor) on one login, thin “add home.”
