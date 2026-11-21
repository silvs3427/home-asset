/**
 * Supabase Edge Function: send Expo push for HomeAsset notifications.
 *
 * Secrets (Dashboard → Edge Functions → Secrets, never in the mobile app):
 *   EXPO_ACCESS_TOKEN=...   (optional; without it, push is stubbed/logged)
 *
 * Deploy:
 *   supabase secrets set EXPO_ACCESS_TOKEN=your-expo-token
 *   supabase functions deploy send-push
 *
 * Phone cloud path invokes this after writing an in-app recall notice so the
 * Expo credential never ships in EXPO_PUBLIC_* / the APK.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import { sendExpoPushMessages } from "../_shared/expoPush.ts";
import { enforceRateLimitStub } from "../_shared/rateLimitStub.ts";

type ErrorCode =
  | "method_not_allowed"
  | "missing_authorization"
  | "supabase_env_missing"
  | "unauthorized"
  | "rate_limited"
  | "invalid_json"
  | "invalid_request_body"
  | "prefs_blocked"
  | "notification_not_found";

const RequestSchema = z
  .object({
    kind: z.enum(["reminder_due", "recall_alert", "contractor_submit"]),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1000),
    notificationId: z.string().uuid().optional().nullable(),
    propertyId: z.string().uuid().optional().nullable(),
    relatedAssetId: z.string().uuid().optional().nullable(),
    relatedEntityId: z.string().max(120).optional().nullable(),
    relatedReminderId: z.string().uuid().optional().nullable(),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(
      401,
      "missing_authorization",
      "Missing or invalid Authorization header",
      {
        hint: "Sign in on the phone so supabase-js can attach the session JWT.",
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse(
      503,
      "supabase_env_missing",
      "Supabase env is not configured on this function",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return errorResponse(401, "unauthorized", "Unauthorized", {
      reason: userError?.message ?? "getUser returned no user",
    });
  }

  const rate = await enforceRateLimitStub({
    key: user.id,
    route: "send-push",
    limit: 60,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return errorResponse(429, "rate_limited", "Rate limited", {
      extra: { retry_after: rate.retryAfterSeconds },
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "Expected JSON body");
  }

  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request_body", "Invalid request body", {
      reason: parsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  const body = parsed.data;

  const { data: prefsRow, error: prefsErr } = await supabase
    .from("notification_preferences")
    .select(
      "push_enabled, recalls_enabled, reminders_enabled, contractor_submits_enabled",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (prefsErr) {
    console.error(
      JSON.stringify({
        msg: "send_push_prefs_error",
        userId: user.id,
        error: prefsErr.message,
      }),
    );
  }

  const pushEnabled = prefsRow?.push_enabled !== false;
  if (!pushEnabled) {
    return jsonResponse({
      ok: true,
      status: "skipped",
      detail: "Push disabled in preferences.",
      privacy: privacyNote(),
    });
  }

  if (body.kind === "recall_alert" && prefsRow?.recalls_enabled === false) {
    return jsonResponse({
      ok: true,
      status: "skipped",
      detail: "Safety recall alerts disabled in preferences.",
      privacy: privacyNote(),
    });
  }
  if (body.kind === "reminder_due" && prefsRow?.reminders_enabled === false) {
    return jsonResponse({
      ok: true,
      status: "skipped",
      detail: "Reminder alerts disabled in preferences.",
      privacy: privacyNote(),
    });
  }
  if (
    body.kind === "contractor_submit" &&
    prefsRow?.contractor_submits_enabled === false
  ) {
    return jsonResponse({
      ok: true,
      status: "skipped",
      detail: "Contractor submission alerts disabled in preferences.",
      privacy: privacyNote(),
    });
  }

  if (body.notificationId) {
    const { data: note, error: noteErr } = await supabase
      .from("notifications")
      .select("id")
      .eq("id", body.notificationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (noteErr || !note?.id) {
      return errorResponse(
        404,
        "notification_not_found",
        "Notification not found for this account",
      );
    }
  }

  const { data: devices, error: deviceErr } = await supabase
    .from("push_devices")
    .select("expo_push_token")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (deviceErr) {
    console.error(
      JSON.stringify({
        msg: "send_push_devices_error",
        userId: user.id,
        error: deviceErr.message,
      }),
    );
  }

  const tokens = ((devices as Array<{ expo_push_token: string }> | null) ?? [])
    .map((d) => d.expo_push_token)
    .filter(Boolean);

  const result = await sendExpoPushMessages(
    tokens,
    {
      title: body.title,
      body: body.body,
      data: {
        kind: body.kind,
        notificationId: body.notificationId ?? "",
        propertyId: body.propertyId ?? "",
        relatedAssetId: body.relatedAssetId ?? "",
        relatedEntityId: body.relatedEntityId ?? "",
        relatedReminderId: body.relatedReminderId ?? "",
      },
    },
    Deno.env.get("EXPO_ACCESS_TOKEN") ?? undefined,
  );

  if (body.notificationId) {
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({
        push_status: result.status,
        push_sent_at: now,
      })
      .eq("id", body.notificationId)
      .eq("user_id", user.id);
    if (updateErr) {
      console.error(
        JSON.stringify({
          msg: "send_push_status_update_error",
          notificationId: body.notificationId,
          error: updateErr.message,
        }),
      );
    }
  }

  console.info(
    JSON.stringify({
      msg: "send_push_done",
      userId: user.id,
      kind: body.kind,
      status: result.status,
      deviceCount: tokens.length,
      marketing: false,
    }),
  );

  return jsonResponse({
    ok: true,
    status: result.status,
    detail: result.detail,
    deviceCount: tokens.length,
    privacy: privacyNote(),
  });
});

function privacyNote() {
  return {
    marketing: false,
    note: "Push only for opted-in homeowners; own devices and prefs only; no silent ledger writes.",
  };
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
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
  code: ErrorCode,
  error: string,
  extras?: {
    hint?: string;
    reason?: string;
    extra?: Record<string, unknown>;
  },
): Response {
  return jsonResponse(
    {
      error,
      code,
      ...(extras?.hint ? { hint: extras.hint } : {}),
      ...(extras?.reason ? { reason: extras.reason } : {}),
      ...(extras?.extra ?? {}),
    },
    status,
  );
}
