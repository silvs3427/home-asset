# invite-submit

Public contractor submission API for **homeowner-sent invite links** (non-LightLift pros).

- Homeowner creates a link in the phone app (Home → Contractors → Invite a contractor).
- Pro opens the **HTML landing page** (GitHub Pages — not the raw edge URL).
- Landing talks to this function: GET JSON for invite metadata, POST multipart for submit (notes, voice, photos; optional phone, email, services).
- Ask HomeAsset formats a draft (server-side AI keys) and stores a **pending** submission.
- Homeowner approves / edits / declines in the app — nothing becomes official silently; approved contact can enter the past-contractor directory.

**Why not HTML from the edge?** Supabase project hostnames rewrite `GET` `text/html` → `text/plain` (browsers show source). The usable page is `apps/invite-landing/` on GitHub Pages. This function still **302-redirects** browser GETs to that landing so old edge links keep working.

**JWT verification is off** (`config.toml` → `verify_jwt = false`). Access is gated by the invite **token**, not a login.

## Secrets

Same AI secrets as `ai-assist` (optional — mock drafts work without a key):

| Name | Notes |
| --- | --- |
| `GEMINI_API_KEY` | Preferred — same name as LightLift |
| `OPENAI_API_KEY` / `AI_API_KEY` | Alternate |
| `GEMINI_MODEL` / `AI_MODEL` / `AI_BASE_URL` / `AI_ASSIST_LIVE` | Optional |
| `INVITE_LANDING_BASE_URL` | Optional override for the HTML host (default `https://silvs3427.github.io/home-asset/`) |

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

Apply SQL first (paste in SQL Editor, in order if not already applied):

1. `migrations/20261121180000_contractor_invite_submissions.sql` — invite tables + RLS  
2. `migrations/20261121400000_invite_submit_service_role.sql` — **service_role grants** + `lookup_contractor_invite_public` RPC (required for the public edge lookup)  
3. `migrations/20261121200000_home_contractor_directory.sql` — Past contractors directory (if using that feature)

Without (2), the Pages form often shows “Invite lookup failed” even when the link and token look fine.

Enable **GitHub Pages** once (Settings → Pages → Build from GitHub Actions), then merge/deploy so `apps/invite-landing` is live. Or run the **Deploy invite landing** workflow manually.

## URL shape

**Shared with contractors (HTML):**

```
https://silvs3427.github.io/home-asset/?t=TOKEN&api=https://YOUR_PROJECT.supabase.co
```

**Edge API:**

```
https://YOUR_PROJECT.supabase.co/functions/v1/invite-submit?t=TOKEN
```

- `GET` + `Accept: application/json` — invite metadata for the landing page
- `GET` from a browser — `302` to the GitHub Pages landing
- `POST` `multipart/form-data` — submit (fields: `token`, optional `notes` / `contractorName` / `companyName` / `phone` / `email` / `servicesOffered`, files `photos` / `audio`)
- `POST` `application/json` — `{ token, notes?, contractorName?, companyName?, phone?, email?, servicesOffered? }` for smoke tests without files

## Privacy

- Token must be valid, not revoked, and not expired.
- Does **not** expose the home ledger to the contractor (only a short home label).
- Writes a **pending** row only; ledger assets and directory contact wait for homeowner approve in the app.
- AI keys never leave the edge.
- Landing only accepts `api` hosts under `*.supabase.co` (HTTPS).
