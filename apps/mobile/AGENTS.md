This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

Repo-wide Auth/security rules: [`../../.cursorrules`](../../.cursorrules) and [`../../AGENTS.md`](../../AGENTS.md). Cloud signup must call LightLift-style `bootstrap_new_user` (see `src/lib/cloud.ts`) — never Auth-trigger-only profile creation.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md
- **Settings / How to use:** when shipping user-facing features, update `src/lib/settingsContent.ts`. Home: HomeAsset → View Assets → Add or Update an Asset → Notifications → Settings. Entry label HomeAsset (not Ask); empty prompt “What do you want to do?”; Talk or Text. Add or Update is scan / PDF / free-text. Contractors under Settings. Colors from `src/lib/theme.ts` only. No long instructional copy on feature screens.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

**Android FCM:** `app.config.js` sets `android.googleServicesFile` from EAS file env `GOOGLE_SERVICES_JSON` (visibility **sensitive**, not secret) or local `google-services.json`. Expo Go / local Metro soft-omits when missing. EAS Android builds **hard-require** a usable file (escape: `ALLOW_MISSING_GOOGLE_SERVICES=1`). Founder steps: [README.md](./README.md#android-lock-screen-push-fcm). Never put the FCM service-account private key in the app. Do not invent or commit a fake `google-services.json`.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
