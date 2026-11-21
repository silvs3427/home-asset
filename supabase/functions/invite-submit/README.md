# invite-submit

Public contractor submission page for **homeowner-sent invite links** (non-LightLift pros).

- Homeowner creates a link in the phone app (Settings → Invite a contractor).
- Pro opens the link (no HomeAsset account): type notes, record voice, upload photos.
- This function formats a draft with Ask HomeAsset (server-side AI keys) and stores a **pending** submission.
- Homeowner approves / edits / declines in the app — nothing becomes official silently.

**JWT verification is off** (`config.toml` → `verify_jwt = false`). Access is gated by the invite **token**, not a login.

## Secrets

Same AI secrets as `ai-assist` (optional — mock drafts work without a key):

| Name | Notes |
| --- | --- |
| `GEMINI_API_KEY` | Preferred — same name as LightLift |
| `OPENAI_API_KEY` / `AI_API_KEY` | Alternate |
| `GEMINI_MODEL` / `AI_MODEL` / `AI_BASE_URL` / `AI_ASSIST_LIVE` | Optional |

Also needs the project’s built-in `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (provided automatically to edge functions).

## Deploy

```bash
npx supabase functions deploy invite-submit
```

PowerShell (Windows):

```powershell
cd C:\Users\Silv3\OneDrive\Desktop\code\home-asset
git pull origin main
npx supabase functions deploy invite-submit
```

Apply SQL first: `migrations/20261121180000_contractor_invite_submissions.sql` (paste in SQL Editor).

## URL shape

```
https://YOUR_PROJECT.supabase.co/functions/v1/invite-submit?t=TOKEN
```

- `GET` — phone-friendly HTML form (voice + photos + text)
- `POST` `multipart/form-data` — submit (fields: `token`, optional `notes` / `contractorName` / `companyName`, files `photos` / `audio`)
- `POST` `application/json` — `{ token, notes?, contractorName?, companyName? }` for smoke tests without files

## Privacy

- Token must be valid, not revoked, and not expired.
- Does **not** expose the home ledger to the contractor (only a short home label).
- Writes a **pending** row only; ledger assets wait for homeowner approve in the app.
- AI keys never leave the edge.
