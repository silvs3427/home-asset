# HomeAsset mobile (Expo SDK 58)

Layout matches **LightLift**: `app.json` (static) + `app.config.js` (env mapping) + `eas.json` (installable builds). Prefer an **EAS APK**, not Expo Go, for real phone installs.

## Installable Android APK (primary)

Expo Go is missing native modules this app needs (push / `ExpoApplication` can crash). Build a real APK:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init          # writes extra.eas.projectId — do not invent a UUID
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, open the link Expo prints (or [expo.dev](https://expo.dev) → your project → Builds) → **Install** / download the **APK**.

Then talk to Metro with the installed app:

```bash
npx expo start --dev-client
# or from repo root after install: npm run start:dev-client -w @homeasset/mobile
```

**iOS:** `npx eas-cli@latest build -p ios --profile preview` (Apple Developer account for device installs). Simulator: `development` profile.

## Temporary Expo Go (fallback only)

If you only need a quick UI peek and accept soft-disabled push:

| Platform | Install page |
| --- | --- |
| Chooser | [expo.dev/go?sdkVersion=58](https://expo.dev/go?sdkVersion=58) |
| Android APK | [Expo-Go-58.0.5.apk](https://github.com/expo/expo-go-releases/releases/download/Expo-Go-58.0.5/Expo-Go-58.0.5.apk) |

```bash
npm run dev:mobile
# or: npx expo start --go -c
```

**Windows LAN/QR fails:** same LightLift fix — `npx expo login` then `npx expo start --tunnel`, or phone hotspot.

## Phone → Supabase (preferred) + optional API

| Env | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Preferred.** Cloud signup/login + ledger + AI edge; no LAN IP |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Same values via Cursor/Cloud secrets (`app.config.js` maps them) |
| `EXPO_PUBLIC_API_URL` | Optional — **local SQLite demo only**. Never set to `localhost` for preview |
| `GEMINI_API_KEY` (Supabase Edge secret) | Live AI — **not** an Expo env; same LightLift pattern |

### EAS preview environment (standalone APK)

Preview builds do **not** read your PC `apps/mobile/.env`. Set Supabase on Expo’s **preview** env, then rebuild:

```powershell
cd apps/mobile
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --environment preview --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --environment preview --visibility sensitive
```

Do **not** set `EXPO_PUBLIC_API_URL` for preview (that caused phones to try `localhost:8787`).

Dev/test: turn **Confirm email OFF** in Supabase Auth so sign-up returns a session immediately.

See [`.env.example`](./.env.example) and [`../../supabase/README.md`](../../supabase/README.md).

## Android lock-screen push (FCM)

Android preview / production installs need a small Firebase config file baked
into the APK before **Register this phone for push** works. Without it you see:
“This Android install was built without Firebase Messaging… google-services”.

**Behavior:**

| Where | Missing `google-services.json` |
| --- | --- |
| **Expo Go / local Metro** | Soft-skip — app opens; push soft-disables; in-app notices still work |
| **EAS Android `preview` / `development`** | Soft-skip + warn — APK builds; Register for push stays unavailable until a usable file is baked in |
| **EAS Android `production`** | **Build fails** until a usable file is provided (so we do not ship a store build without FCM) |

**New phone install required** after a valid file is baked in (native FCM
config). In-app Notifications still work on the old install.

Do **not** commit a fake `google-services.json`. Use the real download from
Firebase (or the EAS file env). The FCM **service-account private key** is a
different file — never put that in the app or in GitHub.

### If the preview APK opens then immediately closes

That is a phone install / native crash, not “Register for push.” Try in order:

1. **Clear app data** — Android Settings → Apps → HomeAsset → Storage →
   Clear data (or Clear storage), then open again.
2. **Uninstall and reinstall the last APK that worked** — delete HomeAsset,
   install the older preview APK from your Expo builds page (not a brand-new
   build). Confirm it stays open.
3. **Preview without FCM is already allowed** — rebuild preview; app should
   open; Register for push stays unavailable until steps A–D. For a
   **production** recovery only, set EAS env `ALLOW_MISSING_GOOGLE_SERVICES=1`.
4. Only after the app opens reliably, finish Firebase steps A–D below and
   rebuild once more for lock-screen push.

There are **two** Firebase pieces (easy to mix up):

| Piece | What it does | Where it goes |
| --- | --- | --- |
| `google-services.json` | Lets **this phone** get a push token | Inside the APK (via app config) |
| FCM V1 **service account** JSON | Lets **Expo’s servers** deliver Android pushes | Expo project → Credentials (never in the phone app) |

Package name for HomeAsset Android: **`com.homeasset.app`**.

`eas.json` already maps profiles → environments (`preview` → preview, etc.).
`app.config.js` reads `GOOGLE_SERVICES_JSON` (alias `GOOGLE_SERVICES_FILE`),
copies it to `./google-services.json` on the builder, and sets
`android.googleServicesFile`.

### A. Create the Firebase Android app (browser)

1. Open [Firebase Console](https://console.firebase.google.com/) → create or pick a project (name it HomeAsset is fine).
2. Add an **Android** app. Android package name: `com.homeasset.app` (must match exactly).
3. Download **`google-services.json`**.
4. (For delivery later) Project settings → **Service accounts** → **Generate new private key**. Save that JSON somewhere private (Downloads is fine). This file is a **secret** — do not put it in GitHub.

### B. Give the phone build `google-services.json` (pick one)

**Option 1 — EAS file env (preferred; file stays off GitHub)**

Visibility must be **sensitive** (not **secret**). Secret vars are invisible
when EAS CLI resolves `app.config.js`, so the APK would still ship without
Firebase. Sensitive is correct for this client config file.

From PowerShell (replace the path with where the download landed). If you
already created the var as **secret**, delete it on expo.dev and recreate:

```powershell
cd apps\mobile
npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value "C:\Users\YOU\Downloads\google-services.json" --environment development --visibility sensitive
npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value "C:\Users\YOU\Downloads\google-services.json" --environment preview --visibility sensitive
npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value "C:\Users\YOU\Downloads\google-services.json" --environment production --visibility sensitive
```

Or on the Expo website: Project → **Environment variables** → **Add** → type
**File**, name `GOOGLE_SERVICES_JSON`, visibility **Sensitive**, environments
`development` / `preview` / `production`, upload the same `google-services.json`.

Confirm it is present:

```powershell
cd apps\mobile
npx eas-cli@latest env:list --environment preview
```

**Option 2 — Local file next to the app**

Copy the download to `apps/mobile/google-services.json`. That path is gitignored
by default. Cloud EAS builds still need Option 1 (gitignored files are not
uploaded) unless you force-add public Firebase client IDs
(`git add -f apps/mobile/google-services.json`).

### C. Upload the FCM V1 service account to Expo (delivery)

Needed so Expo can **send** Android lock-screen pushes (separate from registering the token on the phone).

**UI:** [expo.dev](https://expo.dev) → HomeAsset project → **Credentials** → Android → `com.homeasset.app` → **FCM V1 service account key** → upload the private-key JSON from step A.4.

**Or CLI:**

```powershell
cd apps\mobile
npx eas-cli@latest credentials
```

Choose Android → your build profile / `com.homeasset.app` → Google Service Account → **FCM V1** → upload the private-key JSON.

### D. Rebuild and reinstall the preview APK

```powershell
cd apps\mobile
npx eas-cli@latest build -p android --profile preview
```

If a **production** build fails with “requires a usable google-services.json”,
fix step B (sensitive file env for **production**) and run again. Preview
builds without the file still succeed; push stays off until you rebuild with
step B.

When the build finishes, install the **new** APK (uninstall the old HomeAsset
preview first if the phone keeps the old one). Then:

Settings → **Push & in-app** → turn Push on → **Register this phone for push**.

Live lock-screen delivery still needs the cloud sender secret `EXPO_ACCESS_TOKEN` on Supabase edge `send-push` — see [`../../supabase/functions/send-push/README.md`](../../supabase/functions/send-push/README.md). That part does **not** need another phone rebuild once registration works.
