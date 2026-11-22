# ai-assist

Server-side AI for HomeAsset (scan / how-to / **support** / contractor format / email intake / multi-source asset intake / permit hints).

**Same pattern as LightLift** (`parse-voice-invoice` / `find-truck-part`):

- AI keys live **only** as Supabase Edge Function secrets
- Never put them in the Expo app, EAS env, or any `EXPO_PUBLIC_*` variable
- Phone calls this function with the signed-in user’s Bearer JWT
- Preview / standalone installs need **no laptop API** and **no LAN IP**

## Secrets (Dashboard → Edge Functions → Secrets)

| Name | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Preferred (LightLift name) | Google AI Studio key — same name LightLift uses |
| `OPENAI_API_KEY` or `AI_API_KEY` | Alternate | OpenAI-compatible live path if Gemini is unset |
| `GEMINI_MODEL` | No | Default `gemini-2.5-flash` (bare id) |
| `AI_MODEL` | No | OpenAI model when using OpenAI keys (default `gpt-4o-mini`) |
| `AI_BASE_URL` | No | OpenAI-compatible base (default `https://api.openai.com/v1`) |
| `AI_ASSIST_LIVE` | No | Default on when a key is set; set `false` to force mock |
| `AI_ASSIST_BURST_LIMIT` | No | Default `10` asks per burst window (Ask HomeAsset) |
| `AI_ASSIST_BURST_WINDOW_SECONDS` | No | Default `60` |
| `AI_ASSIST_DAILY_CAP` | No | Default `40` asks per UTC day per user (Ask HomeAsset) |
| `SUPPORT_ASSIST_BURST_LIMIT` | No | Default `8` Support messages per burst window |
| `SUPPORT_ASSIST_BURST_WINDOW_SECONDS` | No | Default `60` |
| `SUPPORT_ASSIST_DAILY_CAP` | No | Default `25` Support messages per UTC day |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | No | Optional Redis backend for caps |

Without any AI key (or with live flag off), the function returns **mock** drafts: catalog products only when keywords match (e.g. “Generac”); otherwise a low-confidence blank draft — never a wrong default brand. Live mode turns on when a key is present and uses vision on attached photos.

**Usage limits:** Ask HomeAsset and Support use **separate** per-user caps (defaults above). Apply migrations `20261121140000_ai_assist_rate_limits.sql` and `20261121400000_support_assist_rate_limits.sql` so daily caps stay durable across edge cold starts. Off-topic coding / general-chat asks are soft-refused with a clear message and do not need a phone rebuild.

## Deploy

**Phone error like** `expected one of "status"|"scan"|…` **without** `asset-intake`, or `Unrecognized keys: "sourceKind"…` means this function is **stale** — the app already speaks the new contract; redeploy (no phone rebuild).

### PowerShell (Windows) — redeploy after merge

```powershell
cd C:\Users\Silv3\OneDrive\Desktop\code\home-asset

# One-time if not linked:
# npx supabase login
# npx supabase link --project-ref iiyhogiwqqotlrsjlqud

git pull origin main
npx supabase functions deploy ai-assist
```

Then on the phone: retry **Draft asset** / Format with Ask HomeAsset (same install — JS already calls `action: "asset-intake"`).

Set the secret (CLI or Dashboard) if not already set:

```powershell
# Preferred — same name as LightLift:
npx supabase secrets set GEMINI_API_KEY=your-gemini-key

# Or OpenAI-compatible:
# npx supabase secrets set OPENAI_API_KEY=your-openai-key
```

Optional:

```powershell
npx supabase secrets set GEMINI_MODEL=gemini-2.5-flash
npx supabase secrets set AI_ASSIST_LIVE=true
```

## Contract

**Request:** JSON `{ action, propertyId?, ... }` with Bearer JWT.

| `action` | Body extras | Response |
| --- | --- | --- |
| `status` | — | `{ aiMode, provider, capabilities, privacy }` |
| `scan` | `propertyId`, `hint?`, `filename?`, `imageBase64?`, `mediaMimeType?` | `{ draft, aiMode, manualContents }` — photo bytes preferred; never invents Generac when unmatched |
| `howto` | `propertyId`, `question`, `assetId?` | how-to / manuals answer, or reminder-schedule list from this home’s RLS reminders + asset service fields (no invent) + citations |
| `support` | `question`, `propertyId?`, `homeLabel?` | warm app/account Support reply (`answer`, `escalate`, `nextSteps`) — separate quota; never invents account facts; never writes |
| `contractor-format` | `inputText`, `inputKind?` | format draft (no writes) |
| `email-intake` | `propertyId`, `emailText` | email intake draft |
| `asset-intake` | `propertyId`, `sourceKind`, `text?`, `hint?`, `filename?`, `imageBase64?`, `mediaMimeType?`, `existingAssets?` | one-asset Add/Update draft + missing fields (multimodal OCR for photos/PDFs) |
| `suggest-manuals` | `propertyId`, `manufacturer`, `model`, `assetId?` | draft manuals / spec sheets (catalog + live web search) — confirm on phone |
| `permits-suggest` | `propertyId` | permit suggestion draft |

**Confirm / save** (scan confirm, email approve, asset intake confirm, permit approve) runs on the phone against Supabase Postgres + Storage with the user JWT — those steps do **not** need an AI key.

## Privacy

- Drafts are never written to the home ledger until the homeowner confirms in the app
- Function logs record operational codes / user id / model — not full email bodies or photo/PDF bytes
- Photo/PDF bytes are used only to draft fields; they are not written to the ledger until the homeowner confirms (and intake does not auto-store the attachment as a document)
- How-to answers only use the user’s stored manuals + asset facts (plus catalog fallback)
- Ask HomeAsset is home-scoped (ledger / equipment / manuals / maintenance / recalls / intake) — not a general coding assistant
- Support (`action: "support"`) is app/account help from Settings → Support — distinct from Ask HomeAsset; separate rate bucket; no inventing account facts; escalate flag when stuck
- Rate and daily caps are enforced on the server; the phone cannot bypass them

## Debugging

1. Secrets: `GEMINI_API_KEY` (or `OPENAI_API_KEY` / `AI_API_KEY`) present
2. Deploy: function list includes `ai-assist`
3. Logs: Dashboard → Edge Functions → `ai-assist` → Logs
4. Auth: phone signed in; `401` = JWT missing/expired or wrong project URL/anon key
