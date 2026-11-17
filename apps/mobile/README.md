# HomeAsset mobile (Expo SDK 58)

## Install Expo Go for SDK 58 first

The Metro QR encodes an `exp://…` deep link. Phone cameras **do nothing** with that URL unless Expo Go is already installed. Store builds can lag behind SDK 58 — install the matching client before scanning.

| Platform | Install page | Direct build |
| --- | --- | --- |
| Chooser | [expo.dev/go?sdkVersion=58](https://expo.dev/go?sdkVersion=58) | — |
| Android | [expo.dev/go?sdkVersion=58&platform=android](https://expo.dev/go?sdkVersion=58&platform=android) | [Expo-Go-58.0.5.apk](https://github.com/expo/expo-go-releases/releases/download/Expo-Go-58.0.5/Expo-Go-58.0.5.apk) |
| iOS | [expo.dev/go?sdkVersion=58&platform=ios](https://expo.dev/go?sdkVersion=58&platform=ios) | App Store / Simulator (or `eas go` for a physical TestFlight build when the store lags) |

Mismatch help: [Expo Go version mismatch](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

## Start (recommended)

From the **repo root** (workspaces):

```bash
npm run dev:mobile
```

Or from this folder (clears cache; forces Expo Go QR, not a development-build `exp+` link):

```bash
npx expo start --go -c
```

Then open the project **inside Expo Go** (scan the QR, or press `a` / `i` for emulator/simulator).

## Phone → API (signup / sign-in)

There is **no Supabase**. Accounts live in the local **SQLite** API (`npm run dev:api` on your PC).

**Env var:** `EXPO_PUBLIC_API_URL`

### Windows (physical phone)

1. Start the API in one terminal from the repo root: `npm run dev:api` (must stay running).
2. Open **Command Prompt** and run: `ipconfig`
3. Under **Wireless LAN adapter Wi-Fi** (or Ethernet), copy **IPv4 Address** (e.g. `192.168.1.42`).
4. Create `apps/mobile/.env` with exactly:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.42:8787
   ```
   (use your IPv4; do **not** use `localhost` or `127.0.0.1` on a phone)
5. Restart Expo from `apps/mobile`: `npx expo start --go -c`
6. Phone and PC on the same Wi‑Fi. If Windows Firewall prompts for Node.js, allow it.
7. Open the app → create account. The sign-in screen shows the API target URL; a network error means the phone still cannot reach that address.

Same-machine simulator: omit `EXPO_PUBLIC_API_URL` (defaults to `http://localhost:8787`).
