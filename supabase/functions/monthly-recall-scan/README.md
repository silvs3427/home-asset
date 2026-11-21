# monthly-recall-scan

Cloud cron job: once a month, scan **every** homeowner asset that has manufacturer + model, match the same free public safety list used by **Check safety recalls**, create alerts + in-app notices for **new** matches, and send lock-screen push when prefs + registered devices allow.

Idempotent: existing `(asset, recall)` alerts are not duplicated; already-notified alerts are not re-pushed.

## Privacy

- Signed-in accounts / home-scoped ledger only (service role reads ownership already on `properties`)
- Creates **alerts + notices only** — never invents assets or documents
- Gates: **Safety recall alerts** (`recalls_enabled`) plus In-app and/or Push
- Acknowledge / dismiss on the asset is unchanged
- No marketing channel

## Secrets

| Name | Required | Notes |
| --- | --- | --- |
| `RECALL_SCAN_SECRET` | **Yes** | Shared with the SQL cron invoke; refuse if unset |
| `EXPO_ACCESS_TOKEN` | For live lock-screen | Same as `send-push`; without it push is stubbed |

```bash
supabase secrets set RECALL_SCAN_SECRET=pick-a-long-random-string
# optional if already set for send-push:
supabase secrets set EXPO_ACCESS_TOKEN=your-expo-token
supabase functions deploy monthly-recall-scan
```

## Founder steps (plain)

1. Deploy this function (command above).
2. Paste SQL migration `20261121300000_monthly_recall_scan_cron.sql` in Supabase **SQL Editor** (after epic7 recalls SQL).
3. In SQL Editor, store two Vault secrets (use your real project URL and the **same** `RECALL_SCAN_SECRET` value):

```sql
select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
select vault.create_secret('the-same-recall-scan-secret', 'recall_scan_secret');
```

If `project_url` already exists from another job, only add `recall_scan_secret`.

4. Optional one-shot test (no wait for the 1st of the month):

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/monthly-recall-scan" \
  -H "Authorization: Bearer the-same-recall-scan-secret" \
  -H "Content-Type: application/json" \
  -d '{}'
```

5. On the phone: prefs → Safety recall alerts on; for lock-screen also Push on + Register this phone. Add Generac / GP6500 if you want a demo match.

## Phone rebuild?

**No** for this edge + SQL work alone. Homeowners do not need a new install to receive monthly alerts/notices on an existing cloud preview.

## Schedule

Cron name `monthly-recall-scan` runs at **12:00 UTC on the 1st of each month** (`0 12 1 * *`) via `pg_cron` → `pg_net` → this function.
