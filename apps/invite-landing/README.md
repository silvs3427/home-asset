# Contractor invite landing (HTML)

Phone-friendly submit page for homeowner-sent invite links (voice + photos + text).

## Why this exists

Supabase **project hostnames** rewrite `GET` responses with `Content-Type: text/html` to `text/plain` (and add a sandbox CSP). Opening `/functions/v1/invite-submit` in a browser therefore shows **source code**, not a page.

This static site is served from **GitHub Pages** with a real `text/html` MIME type. It calls the `invite-submit` edge function for metadata (GET JSON) and submit (POST).

## URL

```
https://silvs3427.github.io/home-asset/?t=TOKEN&api=https://YOUR_PROJECT.supabase.co
```

The phone builds this URL when sharing. Optional override: `EXPO_PUBLIC_INVITE_LANDING_URL`.

## Deploy

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (once).
2. Push to `main` (or run workflow **Deploy invite landing**).
3. Redeploy edge: `npx supabase functions deploy invite-submit` so browser hits on the old edge URL `302` here.
