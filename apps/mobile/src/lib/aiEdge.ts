/**
 * LightLift-style AI path: phone → Supabase edge function `ai-assist`.
 * GEMINI_API_KEY / OPENAI_API_KEY / AI_API_KEY stay on Supabase secrets only.
 */
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { requireSupabaseClient } from "./supabase";

export const AI_EDGE_FUNCTION = "ai-assist";

export type AiEdgeAction =
  | "status"
  | "scan"
  | "howto"
  | "support"
  | "contractor-format"
  | "email-intake"
  | "asset-intake"
  | "suggest-manuals"
  | "fetch-manual"
  | "permits-suggest";

type EdgeErrorBody = {
  error?: string;
  code?: string;
  reason?: string;
  hint?: string;
  model?: string;
  message?: string;
  retry_after?: number | null;
};

/** In-memory scan draft + manual bodies until the homeowner confirms (cloud path). */
const scanManualContents = new Map<string, Record<string, string>>();
const scanDraftById = new Map<
  string,
  {
    suggestedAsset: {
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      purchaseDate?: string | null;
      notes: string | null;
    };
    manuals: Array<{ id: string; title: string }>;
  }
>();

/** Email paste text held until approve (cloud path). */
const emailRawByDraft = new Map<string, string>();

/** Permit drafts held until approve (cloud path). */
const permitDraftById = new Map<
  string,
  {
    propertyId: string;
    permits: Array<{
      id: string;
      suggestedAsset: {
        name: string;
        category: string;
        manufacturer: string | null;
        model: string | null;
        serial: string | null;
        notes: string | null;
      };
    }>;
    sourceMode: "stub" | "live";
  }
>();

/** Email intake drafts held until approve (cloud path). */
const emailDraftById = new Map<
  string,
  {
    propertyId: string;
    summary: string;
    workPerformed: string;
    contractorName: string | null;
    workDate: string | null;
    assetsSuggested: Array<{
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      notes: string | null;
    }>;
    rawEmailText: string;
  }
>();

/** Multi-source asset intake drafts held until approve (cloud path). */
const assetIntakeDraftById = new Map<
  string,
  {
    propertyId: string;
    sourceKind: "photo" | "email" | "invoice" | "notes";
    intent: "add" | "update";
    matchedAssetId: string | null;
    suggestedAsset: {
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      purchaseDate: string | null;
      installDate: string | null;
      installerVendor: string | null;
      location: string | null;
      notes: string | null;
      warrantyEndDate: string | null;
      warrantyTerm: string | null;
    };
  }
>();

export function rememberScanDraft(
  draftId: string,
  draft: {
    suggestedAsset: {
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      purchaseDate?: string | null;
      notes: string | null;
    };
    manuals: Array<{ id: string; title: string }>;
  },
  contents: Record<string, string>,
): void {
  scanDraftById.set(draftId, draft);
  scanManualContents.set(draftId, contents);
}

export function takeScanDraft(draftId: string):
  | {
      suggestedAsset: {
        name: string;
        category: string;
        manufacturer: string | null;
        model: string | null;
        serial: string | null;
        purchaseDate?: string | null;
        notes: string | null;
      };
      manuals: Array<{ id: string; title: string }>;
      manualContents: Record<string, string>;
    }
  | undefined {
  const draft = scanDraftById.get(draftId);
  const contents = scanManualContents.get(draftId);
  scanDraftById.delete(draftId);
  scanManualContents.delete(draftId);
  if (!draft) return undefined;
  return { ...draft, manualContents: contents ?? {} };
}

export function rememberEmailIntakeDraft(
  draftId: string,
  draft: {
    propertyId: string;
    summary: string;
    workPerformed: string;
    contractorName: string | null;
    workDate: string | null;
    assetsSuggested: Array<{
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      notes: string | null;
    }>;
    rawEmailText: string;
  },
): void {
  emailDraftById.set(draftId, draft);
  emailRawByDraft.set(draftId, draft.rawEmailText);
}

export function takeEmailIntakeDraft(draftId: string) {
  const value = emailDraftById.get(draftId);
  emailDraftById.delete(draftId);
  emailRawByDraft.delete(draftId);
  return value;
}

export function rememberAssetIntakeDraft(
  draftId: string,
  draft: {
    propertyId: string;
    sourceKind: "photo" | "email" | "invoice" | "notes";
    intent: "add" | "update";
    matchedAssetId: string | null;
    suggestedAsset: {
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      purchaseDate: string | null;
      installDate: string | null;
      installerVendor: string | null;
      location: string | null;
      notes: string | null;
      warrantyEndDate: string | null;
      warrantyTerm: string | null;
    };
  },
): void {
  assetIntakeDraftById.set(draftId, draft);
}

export function takeAssetIntakeDraft(draftId: string) {
  const value = assetIntakeDraftById.get(draftId);
  assetIntakeDraftById.delete(draftId);
  return value;
}

/** Manual / spec suggestions held until homeowner confirms (cloud path). */
const manualsDraftById = new Map<
  string,
  {
    propertyId: string;
    assetId: string;
    manufacturer: string;
    model: string;
    manuals: Array<{ id: string; title: string; sourceUrl: string | null }>;
    manualContents: Record<string, string>;
  }
>();

export function rememberManualsDraft(
  draftId: string,
  draft: {
    propertyId: string;
    assetId: string;
    manufacturer: string;
    model: string;
    manuals: Array<{ id: string; title: string; sourceUrl: string | null }>;
    manualContents: Record<string, string>;
  },
): void {
  manualsDraftById.set(draftId, draft);
}

export function takeManualsDraft(draftId: string) {
  const value = manualsDraftById.get(draftId);
  manualsDraftById.delete(draftId);
  return value;
}

export function rememberPermitDraft(
  draftId: string,
  draft: {
    propertyId: string;
    permits: Array<{
      id: string;
      suggestedAsset: {
        name: string;
        category: string;
        manufacturer: string | null;
        model: string | null;
        serial: string | null;
        notes: string | null;
      };
    }>;
    sourceMode: "stub" | "live";
  },
): void {
  permitDraftById.set(draftId, draft);
}

export function takePermitDraft(draftId: string) {
  const value = permitDraftById.get(draftId);
  permitDraftById.delete(draftId);
  return value;
}

export async function invokeAiAssist<T>(
  action: AiEdgeAction,
  body: Record<string, unknown> = {},
): Promise<T> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke<T & EdgeErrorBody>(
    AI_EDGE_FUNCTION,
    {
      body: { action, ...body },
    },
  );

  if (error) {
    throw new Error(await formatEdgeInvokeError(error));
  }
  if (!data || (data as EdgeErrorBody).error) {
    throw new Error(
      formatEdgeErrorBody(data as EdgeErrorBody) ||
        "AI edge function returned no result",
    );
  }
  return data as T;
}

async function formatEdgeInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;
    const status = typeof response?.status === "number" ? response.status : undefined;
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
          return status ? `HTTP ${status}: ${raw.slice(0, 400)}` : raw.slice(0, 400);
        }
      } catch {
        // fall through
      }
    }
    return status
      ? `Edge function returned HTTP ${status}. Check Supabase → Edge Functions → ai-assist → Logs.`
      : "Edge function returned a non-2xx status code";
  }
  if (error instanceof FunctionsRelayError) {
    return `AI relay error: ${error.message}`;
  }
  if (error instanceof FunctionsFetchError) {
    return (
      `Could not reach ${AI_EDGE_FUNCTION}: ${error.message}. ` +
      "Confirm the function is deployed and EXPO_PUBLIC_SUPABASE_URL matches this project."
    );
  }
  return error instanceof Error ? error.message : "Edge function invoke failed";
}

function formatEdgeErrorBody(payload: EdgeErrorBody | null | undefined): string {
  if (!payload) return "";
  const code = payload.code?.trim() ?? "";
  const friendly =
    payload.message?.trim() ||
    payload.error?.trim() ||
    "";
  // Rate / topic refusals: show the plain message only (no code= noise).
  if (
    code === "rate_limited" ||
    code === "daily_cap" ||
    code === "off_topic" ||
    code === "burst"
  ) {
    return friendly || "Ask HomeAsset could not complete that ask.";
  }
  const reason = payload.reason?.trim() ?? "";
  // Stale edge deploy: phone sends asset-intake but old ai-assist schema rejects it.
  if (
    code === "invalid_request_body" &&
    (reason.includes("asset-intake") ||
      reason.includes("sourceKind") ||
      reason.includes("existingAssets") ||
      (payload.hint?.includes("Redeploy") ?? false))
  ) {
    const hint =
      payload.hint?.trim() ||
      "Ask HomeAsset on the server is out of date. Redeploy ai-assist from the latest app code (no new phone install).";
    return friendly
      ? `${friendly} — ${hint}`
      : hint;
  }
  const parts: string[] = [];
  if (friendly) parts.push(friendly);
  if (code) parts.push(`code=${code}`);
  if (reason) parts.push(reason);
  if (payload.hint?.trim()) parts.push(payload.hint.trim());
  return parts.join(" — ");
}
