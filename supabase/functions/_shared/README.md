# Shared edge helpers

## `rateLimitStub.ts`

Documented **no-op** rate-limit hook for JWT-gated AI functions (same as LightLift).

| Function | Suggested key | Why |
| --- | --- | --- |
| `ai-assist` | `auth.uid()` | Cap Gemini / OpenAI spend per user |
| `send-push` | `auth.uid()` | Cap Expo push attempts per user |

Replace the stub body with Upstash/Redis before production traffic; keep the same return shape.

## `catalog.ts`

Local product / manual catalog used for **mock** AI mode and as grounded manuals after live identify. Same demo products as `apps/api` (Generac / Carrier / Rheem).

## `expoPush.ts`

Shared Expo Push API helper for `send-push`. Uses `EXPO_ACCESS_TOKEN` from Edge secrets; stubs (logs) when unset.
