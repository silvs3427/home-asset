/**
 * Cloud phone path: invoke Supabase edge `send-push` so EXPO_ACCESS_TOKEN
 * stays server-side (never in EXPO_PUBLIC_* / the APK).
 */
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { requireSupabaseClient } from "./supabase";

export const SEND_PUSH_EDGE_FUNCTION = "send-push";

export type PushKind = "reminder_due" | "recall_alert" | "contractor_submit";

export type SendPushEdgeResult = {
  ok: boolean;
  status: "sent" | "stubbed" | "failed" | "skipped";
  detail?: string;
  deviceCount?: number;
};

type EdgeErrorBody = {
  error?: string;
  code?: string;
  reason?: string;
  hint?: string;
};

/**
 * Ask the edge function to deliver an Expo push for this signed-in user.
 * Prefs + device list are re-checked server-side under RLS.
 * Failures should not block in-app notice creation — callers catch/log.
 */
export async function invokeSendPush(input: {
  kind: PushKind;
  title: string;
  body: string;
  notificationId?: string | null;
  propertyId?: string | null;
  relatedAssetId?: string | null;
  relatedEntityId?: string | null;
  relatedReminderId?: string | null;
}): Promise<SendPushEdgeResult> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke<
    SendPushEdgeResult & EdgeErrorBody
  >(SEND_PUSH_EDGE_FUNCTION, {
    body: {
      kind: input.kind,
      title: input.title,
      body: input.body,
      notificationId: input.notificationId ?? undefined,
      propertyId: input.propertyId ?? undefined,
      relatedAssetId: input.relatedAssetId ?? undefined,
      relatedEntityId: input.relatedEntityId ?? undefined,
      relatedReminderId: input.relatedReminderId ?? undefined,
    },
  });

  if (error) {
    throw new Error(await formatEdgeInvokeError(error));
  }
  if (!data || (data as EdgeErrorBody).error) {
    throw new Error(
      formatEdgeErrorBody(data as EdgeErrorBody) ||
        "send-push edge returned no result",
    );
  }
  const status = data.status;
  if (
    status !== "sent" &&
    status !== "stubbed" &&
    status !== "failed" &&
    status !== "skipped"
  ) {
    throw new Error(`send-push returned unexpected status: ${String(status)}`);
  }
  return {
    ok: Boolean(data.ok),
    status,
    detail: data.detail,
    deviceCount: data.deviceCount,
  };
}

async function formatEdgeInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;
    const status =
      typeof response?.status === "number" ? response.status : undefined;
    if (response) {
      try {
        const raw = (await response.text()).trim();
        if (raw) {
          try {
            const payload = JSON.parse(raw) as EdgeErrorBody;
            const body = formatEdgeErrorBody(payload);
            if (body) {
              return status ? `HTTP ${status}: ${body}` : body;
            }
          } catch {
            // non-JSON
          }
          return status
            ? `HTTP ${status}: ${raw.slice(0, 400)}`
            : raw.slice(0, 400);
        }
      } catch {
        // fall through
      }
    }
    return status
      ? `Edge function returned HTTP ${status}. Deploy send-push and check Logs.`
      : "Edge function returned a non-2xx status code";
  }
  if (error instanceof FunctionsRelayError) {
    return `Push relay error: ${error.message}`;
  }
  if (error instanceof FunctionsFetchError) {
    return (
      `Could not reach ${SEND_PUSH_EDGE_FUNCTION}: ${error.message}. ` +
      "Confirm the function is deployed and EXPO_PUBLIC_SUPABASE_URL matches this project."
    );
  }
  return error instanceof Error ? error.message : "Edge function invoke failed";
}

function formatEdgeErrorBody(
  payload: EdgeErrorBody | null | undefined,
): string {
  if (!payload) return "";
  const parts: string[] = [];
  if (payload.error?.trim()) parts.push(payload.error.trim());
  if (payload.code?.trim()) parts.push(`code=${payload.code.trim()}`);
  if (payload.reason?.trim()) parts.push(payload.reason.trim());
  if (payload.hint?.trim()) parts.push(payload.hint.trim());
  return parts.join(" — ");
}
