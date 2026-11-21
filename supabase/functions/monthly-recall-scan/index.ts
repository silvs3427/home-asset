/**
 * Monthly automatic whole-home recall scan (cloud cron).
 *
 * Scans every asset with manufacturer+model, matches the same free public
 * fixture catalog as phone "Check safety recalls", creates alerts + in-app
 * notices for new matches, and sends Expo push when prefs + devices allow.
 *
 * Auth: cron / ops secret (not a user JWT). Service role reads/writes under
 * homeowner ownership already stored on properties — never invents assets/docs.
 *
 * Secrets:
 *   RECALL_SCAN_SECRET   — required; cron sends Bearer / x-recall-scan-secret
 *   EXPO_ACCESS_TOKEN    — optional; without it push is stubbed/logged
 *
 * Deploy:
 *   supabase secrets set RECALL_SCAN_SECRET=...
 *   supabase functions deploy monthly-recall-scan
 *
 * Schedule: see migrations/20261121200000_monthly_recall_scan_cron.sql
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  FIXTURE_RECALLS,
  matchAssetToRecalls,
  type RecallCatalogEntry,
} from "../_shared/recallCatalog.ts";
import { sendExpoPushMessages } from "../_shared/expoPush.ts";

type ScanResult = {
  mode: "fixture";
  catalogSize: number;
  assetsScanned: number;
  matchesFound: number;
  alertsCreated: number;
  alertsExisting: number;
  notificationsCreated: number;
  pushesAttempted: number;
  pushesSkippedPrefs: number;
  homesTouched: number;
};

type AssetRow = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  property_id: string;
};

type PropertyRow = {
  id: string;
  owner_user_id: string;
};

type PrefsRow = {
  recalls_enabled: boolean | null;
  in_app_enabled: boolean | null;
  push_enabled: boolean | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Method not allowed");
  }

  if (!authorizeCron(req)) {
    return errorResponse(
      401,
      "unauthorized",
      "Recall scan secret required",
      {
        hint: "Set RECALL_SCAN_SECRET on the edge function and pass it as Authorization: Bearer <secret> or x-recall-scan-secret.",
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(
      503,
      "supabase_env_missing",
      "Supabase service env is not configured on this function",
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await runMonthlyRecallScan(admin);
    console.info(
      JSON.stringify({
        msg: "monthly_recall_scan_done",
        ...result,
        marketing: false,
      }),
    );
    return jsonResponse({
      ok: true,
      job: "monthly-recall-scan",
      result,
      privacy: {
        marketing: false,
        note: "Alerts and notices only for assets already on the home; prefs gate Safety recall alerts + Push; no silent asset/doc invents; ack/dismiss unchanged.",
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "monthly_recall_scan_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return errorResponse(
      500,
      "scan_failed",
      err instanceof Error ? err.message : "Monthly recall scan failed",
    );
  }
});

function authorizeCron(req: Request): boolean {
  const expected = Deno.env.get("RECALL_SCAN_SECRET")?.trim();
  if (!expected) {
    console.error(
      JSON.stringify({
        msg: "monthly_recall_scan_secret_missing",
        detail: "RECALL_SCAN_SECRET unset — refusing all invokes.",
      }),
    );
    return false;
  }

  const headerSecret = req.headers.get("x-recall-scan-secret")?.trim();
  const bearer = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const apikey = req.headers.get("apikey")?.trim();
  const provided = headerSecret || bearer || apikey || "";
  return provided.length > 0 && provided === expected;
}

async function runMonthlyRecallScan(
  admin: SupabaseClient,
): Promise<ScanResult> {
  const result: ScanResult = {
    mode: "fixture",
    catalogSize: FIXTURE_RECALLS.length,
    assetsScanned: 0,
    matchesFound: 0,
    alertsCreated: 0,
    alertsExisting: 0,
    notificationsCreated: 0,
    pushesAttempted: 0,
    pushesSkippedPrefs: 0,
    homesTouched: 0,
  };

  const noticeIdByExternal = await upsertFixtureNotices(admin, FIXTURE_RECALLS);

  const { data: properties, error: propErr } = await admin
    .from("properties")
    .select("id, owner_user_id");
  if (propErr) {
    throw new Error(`Could not list homes: ${propErr.message}`);
  }
  const homes = (properties as PropertyRow[] | null) ?? [];
  result.homesTouched = homes.length;

  const prefsCache = new Map<string, PrefsRow | null>();

  for (const home of homes) {
    const { data: assets, error: assetErr } = await admin
      .from("assets")
      .select("id, name, manufacturer, model, serial, property_id")
      .eq("property_id", home.id)
      .not("manufacturer", "is", null)
      .not("model", "is", null);
    if (assetErr) {
      throw new Error(
        `Could not list assets for home ${home.id}: ${assetErr.message}`,
      );
    }

    for (const asset of (assets as AssetRow[] | null) ?? []) {
      if (!asset.manufacturer?.trim() || !asset.model?.trim()) continue;
      result.assetsScanned += 1;

      const hits = matchAssetToRecalls({
        manufacturer: asset.manufacturer,
        model: asset.model,
        serial: asset.serial,
      });
      result.matchesFound += hits.length;

      for (const hit of hits) {
        const noticeId = noticeIdByExternal.get(hit.entry.externalId);
        if (!noticeId) continue;

        const alertOutcome = await ensureOpenAlert(admin, {
          propertyId: home.id,
          assetId: asset.id,
          noticeId,
          matchedOn: hit.matchedOn,
        });
        if (alertOutcome.created) result.alertsCreated += 1;
        else result.alertsExisting += 1;

        if (alertOutcome.notifiedAt) {
          // Already notified once — idempotent; do not spam.
          continue;
        }

        let prefs = prefsCache.get(home.owner_user_id);
        if (prefs === undefined) {
          prefs = await loadPrefs(admin, home.owner_user_id);
          prefsCache.set(home.owner_user_id, prefs);
        }

        const recallsEnabled = prefs?.recalls_enabled !== false;
        const inAppEnabled = prefs?.in_app_enabled !== false;
        const pushEnabled = prefs?.push_enabled !== false;

        if (!recallsEnabled || (!inAppEnabled && !pushEnabled)) {
          result.pushesSkippedPrefs += 1;
          continue;
        }

        const now = new Date().toISOString();
        const title = `Safety recall: ${asset.name}`;
        const body =
          `${hit.entry.title}. Open the asset to acknowledge or dismiss.`;
        const dedupe = `recall_alert:${alertOutcome.alertId}:${asset.id}`;
        let notificationId: string | null = null;
        let notified = false;

        if (inAppEnabled) {
          const { data: noteRow, error: noteErr } = await admin
            .from("notifications")
            .upsert(
              {
                user_id: home.owner_user_id,
                property_id: home.id,
                kind: "recall_alert",
                title,
                body,
                related_asset_id: asset.id,
                related_entity_id: alertOutcome.alertId,
                dedupe_key: dedupe,
                push_status: pushEnabled ? "pending" : "skipped",
                created_at: now,
              },
              { onConflict: "user_id,dedupe_key" },
            )
            .select("id")
            .single();
          if (noteErr) {
            console.error(
              JSON.stringify({
                msg: "monthly_recall_in_app_failed",
                error: noteErr.message,
                assetId: asset.id,
              }),
            );
          } else if (noteRow?.id) {
            notificationId = String(noteRow.id);
            result.notificationsCreated += 1;
            notified = true;
          }
        }

        if (pushEnabled) {
          result.pushesAttempted += 1;
          const pushOk = await sendOwnerPush(admin, {
            ownerUserId: home.owner_user_id,
            title,
            body,
            notificationId,
            propertyId: home.id,
            relatedAssetId: asset.id,
            relatedEntityId: alertOutcome.alertId,
            now,
          });
          if (pushOk || notificationId) notified = true;
        }

        if (notified) {
          await admin
            .from("asset_recall_alerts")
            .update({ notified_at: now, updated_at: now })
            .eq("id", alertOutcome.alertId);
        }
      }
    }
  }

  return result;
}

async function upsertFixtureNotices(
  admin: SupabaseClient,
  entries: RecallCatalogEntry[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const now = new Date().toISOString();
    const { data: upserted, error } = await admin
      .from("recall_notices")
      .upsert(
        {
          external_id: entry.externalId,
          source: entry.source,
          title: entry.title,
          summary: entry.summary,
          hazard: entry.hazard,
          manufacturer: entry.manufacturer,
          model: entry.model,
          serial_pattern: entry.serialPattern,
          product_type: entry.productType,
          recall_date: entry.recallDate,
          source_url: entry.sourceUrl,
          updated_at: now,
        },
        { onConflict: "source,external_id" },
      )
      .select("id")
      .single();

    if (!error && upserted?.id) {
      map.set(entry.externalId, String(upserted.id));
      continue;
    }

    const { data: existing, error: readErr } = await admin
      .from("recall_notices")
      .select("id")
      .eq("source", entry.source)
      .eq("external_id", entry.externalId)
      .maybeSingle();
    if (readErr || !existing?.id) {
      throw new Error(
        `Could not upsert recall notice ${entry.externalId}: ${
          error?.message ?? readErr?.message ?? "unknown"
        }`,
      );
    }
    map.set(entry.externalId, String(existing.id));
  }
  return map;
}

async function ensureOpenAlert(
  admin: SupabaseClient,
  input: {
    propertyId: string;
    assetId: string;
    noticeId: string;
    matchedOn: "manufacturer_model" | "manufacturer_model_serial";
  },
): Promise<{ alertId: string; notifiedAt: string | null; created: boolean }> {
  const { data: existing } = await admin
    .from("asset_recall_alerts")
    .select("id, notified_at")
    .eq("asset_id", input.assetId)
    .eq("recall_notice_id", input.noticeId)
    .maybeSingle();

  if (existing?.id) {
    return {
      alertId: String(existing.id),
      notifiedAt: existing.notified_at ?? null,
      created: false,
    };
  }

  const now = new Date().toISOString();
  const { data: created, error } = await admin
    .from("asset_recall_alerts")
    .insert({
      property_id: input.propertyId,
      asset_id: input.assetId,
      recall_notice_id: input.noticeId,
      status: "open",
      matched_on: input.matchedOn,
      created_at: now,
      updated_at: now,
    })
    .select("id, notified_at")
    .single();

  if (!error && created?.id) {
    return {
      alertId: String(created.id),
      notifiedAt: created.notified_at ?? null,
      created: true,
    };
  }

  // Unique race: another worker inserted first.
  const { data: raced, error: racedErr } = await admin
    .from("asset_recall_alerts")
    .select("id, notified_at")
    .eq("asset_id", input.assetId)
    .eq("recall_notice_id", input.noticeId)
    .maybeSingle();
  if (racedErr || !raced?.id) {
    throw new Error(
      `Could not create recall alert: ${error?.message ?? racedErr?.message}`,
    );
  }
  return {
    alertId: String(raced.id),
    notifiedAt: raced.notified_at ?? null,
    created: false,
  };
}

async function loadPrefs(
  admin: SupabaseClient,
  userId: string,
): Promise<PrefsRow | null> {
  const { data, error } = await admin
    .from("notification_preferences")
    .select("recalls_enabled, in_app_enabled, push_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      JSON.stringify({
        msg: "monthly_recall_prefs_error",
        userId,
        error: error.message,
      }),
    );
    return null;
  }
  return (data as PrefsRow | null) ?? null;
}

async function sendOwnerPush(
  admin: SupabaseClient,
  input: {
    ownerUserId: string;
    title: string;
    body: string;
    notificationId: string | null;
    propertyId: string;
    relatedAssetId: string;
    relatedEntityId: string;
    now: string;
  },
): Promise<boolean> {
  try {
    const { data: devices, error: deviceErr } = await admin
      .from("push_devices")
      .select("expo_push_token")
      .eq("user_id", input.ownerUserId);
    if (deviceErr) {
      console.error(
        JSON.stringify({
          msg: "monthly_recall_devices_error",
          userId: input.ownerUserId,
          error: deviceErr.message,
        }),
      );
    }
    const tokens = (
      (devices as Array<{ expo_push_token: string }> | null) ?? []
    )
      .map((d) => d.expo_push_token)
      .filter(Boolean);

    const result = await sendExpoPushMessages(
      tokens,
      {
        title: input.title,
        body: input.body,
        data: {
          kind: "recall_alert",
          notificationId: input.notificationId ?? "",
          propertyId: input.propertyId,
          relatedAssetId: input.relatedAssetId,
          relatedEntityId: input.relatedEntityId,
        },
      },
      Deno.env.get("EXPO_ACCESS_TOKEN") ?? undefined,
    );

    if (input.notificationId) {
      await admin
        .from("notifications")
        .update({
          push_status: result.status,
          push_sent_at: input.now,
        })
        .eq("id", input.notificationId)
        .eq("user_id", input.ownerUserId);
    }

    return result.status === "sent" || result.status === "stubbed";
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "monthly_recall_push_failed",
        userId: input.ownerUserId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    if (input.notificationId) {
      await admin
        .from("notifications")
        .update({
          push_status: "failed",
          push_sent_at: input.now,
        })
        .eq("id", input.notificationId)
        .eq("user_id", input.ownerUserId);
    }
    return false;
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, x-recall-scan-secret",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extras?: { hint?: string },
): Response {
  return jsonResponse(
    {
      error,
      code,
      ...(extras?.hint ? { hint: extras.hint } : {}),
    },
    status,
  );
}
