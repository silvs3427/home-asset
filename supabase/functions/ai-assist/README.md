# ai-assist

Server-side AI for HomeAsset (scan / how-to / contractor format / email intake / permit hints).

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

Without any AI key (or with live flag off), the function returns **mock** catalog drafts so demos still work. Live mode turns on when a key is present.

## Deploy

```bash
supabase functions deploy ai-assist
```

Set the secret (CLI or Dashboard):

```bash
# Preferred — same name as LightLift:
supabase secrets set GEMINI_API_KEY=your-gemini-key

# Or OpenAI-compatible:
# supabase secrets set OPENAI_API_KEY=your-openai-key
```

Optional:

```bash
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase secrets set AI_ASSIST_LIVE=true
```

## Contract

**Request:** JSON `{ action, propertyId?, ... }` with Bearer JWT.

| `action` | Body extras | Response |
| --- | --- | --- |
| `status` | — | `{ aiMode, provider, capabilities, privacy }` |
| `scan` | `propertyId`, `hint?`, `filename?` | `{ draft, aiMode, manualContents }` |
| `howto` | `propertyId`, `question`, `assetId?` | how-to answer + citations |
| `contractor-format` | `inputText`, `inputKind?` | format draft (no writes) |
| `email-intake` | `propertyId`, `emailText` | email intake draft |
| `permits-suggest` | `propertyId` | permit suggestion draft |

**Confirm / save** (scan confirm, email approve, permit approve) runs on the phone against Supabase Postgres + Storage with the user JWT — those steps do **not** need an AI key.

## Privacy

- Drafts are never written to the home ledger until the homeowner confirms in the app
- Function logs record operational codes / user id / model — not full email bodies or photo bytes
- How-to answers only use the user’s stored manuals + asset facts (plus catalog fallback)

## Debugging

1. Secrets: `GEMINI_API_KEY` (or `OPENAI_API_KEY` / `AI_API_KEY`) present
2. Deploy: function list includes `ai-assist`
3. Logs: Dashboard → Edge Functions → `ai-assist` → Logs
4. Auth: phone signed in; `401` = JWT missing/expired or wrong project URL/anon key
