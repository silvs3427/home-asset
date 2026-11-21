# send-push

Server-side Expo push for HomeAsset (cloud phone path).

Same secret pattern as `ai-assist`: credentials live **only** as Supabase Edge Function secrets. The phone never gets `EXPO_ACCESS_TOKEN`.

## Secrets

| Name | Required | Notes |
| --- | --- | --- |
| `EXPO_ACCESS_TOKEN` | For live lock-screen delivery | Expo access token; without it, pushes are **stubbed** (logged) and in-app notices still work |

```bash
supabase secrets set EXPO_ACCESS_TOKEN=your-expo-token
supabase functions deploy send-push
```

## Contract

**Request:** JSON with Bearer JWT (signed-in homeowner).

| Field | Notes |
| --- | --- |
| `kind` | `recall_alert` \| `reminder_due` \| `contractor_submit` |
| `title` / `body` | Lock-screen copy |
| `notificationId?` | Own notification row to update `push_status` |
| `propertyId?` / `relatedAssetId?` / … | Passed through as Expo `data` |

**Response:** `{ ok, status: sent|stubbed|failed|skipped, detail, deviceCount?, privacy }`

## Prefs / privacy

- Requires **Push to this phone** (`push_enabled`)
- Kind gates: safety recalls → `recalls_enabled`, etc.
- Loads only the caller’s `push_devices` via RLS
- Does **not** write assets or documents

## Founder steps (live push)

1. Deploy this function (`supabase functions deploy send-push`)
2. Set `EXPO_ACCESS_TOKEN` in Supabase → Edge Functions → Secrets
3. **Android:** the preview APK must include Firebase `google-services.json` or Register for push fails (“Firebase Messaging / googleServicesFile”). Plain steps + PowerShell: [`apps/mobile/README.md`](../../../apps/mobile/README.md#android-lock-screen-push-fcm). That needs a **new APK install**. Also upload the FCM V1 service account under Expo Credentials so Expo can deliver Android pushes.
4. On the phone: Settings → Push & in-app → turn on Safety recall alerts + Push → **Register this phone for push**
5. Add Generac / GP6500 (or Check safety recalls) — expect in-app notice + lock-screen when secret is set

**Phone rebuild?** No for this JS/edge work alone if the install already registers Expo push tokens. **Yes** when adding Android FCM / `google-services.json` for the first time. Expo Go soft-disables native push — use the preview APK.
