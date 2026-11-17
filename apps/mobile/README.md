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

Physical phone: set `EXPO_PUBLIC_API_URL` in `.env` to your computer’s LAN IP (see `.env.example`), then restart with `-c`.
