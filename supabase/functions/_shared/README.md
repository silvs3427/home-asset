# Shared edge helpers

## `rateLimitStub.ts` (Ask HomeAsset caps + push)

Per signed-in user limits for JWT-gated edge functions:

| Function | Suggested key | Why |
| --- | --- | --- |
| `ai-assist` | `auth.uid()` | Cap Gemini / OpenAI spend per user |
| `send-push` | `auth.uid()` | Cap Expo push attempts per user |

Ask HomeAsset defaults (overridable via env):

| Cap | Default | Env override |
| --- | --- | --- |
| Burst | 10 asks / 60s | `AI_ASSIST_BURST_LIMIT`, `AI_ASSIST_BURST_WINDOW_SECONDS` |
| Daily | 40 asks / UTC day | `AI_ASSIST_DAILY_CAP` |

Backends (first match wins):

1. **Upstash Redis REST** — if `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set
2. **Postgres RPC** `consume_ai_assist_quota` — durable (migration `20261121140000_ai_assist_rate_limits.sql`; used by `ai-assist`)
3. **In-memory Map** — best-effort fallback per isolate

`ai-assist` `status` actions skip consume. Friendly 429 messages are returned to the phone.

## `topicGuard.ts`

Soft reject for clearly off-topic free text (coding projects, unrelated general chat). Home ledger / how-to / intake / scan / maintenance / recalls stay allowed. Keep in sync with `apps/api/src/lib/ai/topicGuard.ts`.

## `catalog.ts`

Local product / manual catalog used for **mock** AI mode and as grounded manuals after live identify. Same demo products as `apps/api` (Generac / Carrier / Rheem).

## `expoPush.ts`

Shared Expo Push API helper for `send-push`. Uses `EXPO_ACCESS_TOKEN` from Edge secrets; stubs (logs) when unset.
