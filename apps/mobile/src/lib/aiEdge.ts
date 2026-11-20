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
  | "contractor-format"
  | "email-intake"
  | "permits-suggest";

type EdgeErrorBody = {
  error?: string;
  code?: string;
  reason?: string;
  hint?: string;
  model?: string;
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

export function rememberScanDraft(
  draftId: string,
  draft: {
    suggestedAsset: {
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
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
  const parts: string[] = [];
  if (payload.error?.trim()) parts.push(payload.error.trim());
  if (payload.code?.trim()) parts.push(`code=${payload.code.trim()}`);
  if (payload.reason?.trim()) parts.push(payload.reason.trim());
  if (payload.hint?.trim()) parts.push(payload.hint.trim());
  return parts.join(" — ");
}
