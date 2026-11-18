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

## Phone → API + optional Supabase

| Env | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | API on your PC/LAN (required on a physical phone) |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Optional; Cloud secrets `SUPABASE_URL` / `SUPABASE_ANON_KEY` also work via `app.config.js` |

See [`.env.example`](./.env.example) and [`../../supabase/README.md`](../../supabase/README.md).
