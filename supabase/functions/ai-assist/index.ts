/**
 * Supabase Edge Function: HomeAsset AI assist (LightLift pattern).
 *
 * Secrets (Dashboard → Edge Functions → Secrets, never in the mobile app):
 *   GEMINI_API_KEY=...          (preferred — same name as LightLift)
 *   OPENAI_API_KEY=...          (alternate)
 *   AI_API_KEY=...              (alternate)
 * Optional:
 *   GEMINI_MODEL=gemini-2.5-flash
 *   AI_MODEL=gpt-4o-mini
 *   AI_BASE_URL=https://api.openai.com/v1
 *   AI_ASSIST_LIVE=true|false   (default on when a key is set)
 *
 * Deploy:
 *   supabase functions deploy ai-assist
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import {
  getCatalogProduct,
  matchCatalogProducts,
  PRODUCT_CATALOG,
  type CatalogProduct,
} from "../_shared/catalog.ts";
import { enforceRateLimit } from "../_shared/rateLimitStub.ts";
import {
  assessSupportTopic,
  buildSupportUserPrompt,
  mockSupportAnswer,
  parseSupportModelJson,
  SUPPORT_SYSTEM_BLURB,
  type SupportAssistReply,
} from "../_shared/supportAssist.ts";
import {
  assessAskHomeAssetTopic,
  HOME_SCOPE_SYSTEM_BLURB,
} from "../_shared/topicGuard.ts";
import { fetchManualPdf } from "../_shared/fetchManual.ts";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DRAFT_TTL_MS = 30 * 60 * 1000;

type AiMode = "mock" | "live";
type PermitMode = "stub" | "live";
type ErrorCode =
  | "method_not_allowed"
  | "missing_authorization"
  | "supabase_env_missing"
  | "unauthorized"
  | "rate_limited"
  | "daily_cap"
  | "off_topic"
  | "invalid_json"
  | "invalid_request_body"
  | "property_not_found"
  | "asset_not_found"
  | "ai_assist_disabled"
  | "upstream_error"
  | "parse_failed"
  | "manual_not_downloadable";

/** Open homeowner-defined category label (free text). */
type AssetCategory = string;

const ExistingAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  category: z.string().max(80),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  serial: z.string().max(120).nullable().optional(),
});

const RequestSchema = z
  .object({
    action: z.enum([
      "status",
      "scan",
      "howto",
      "support",
      "contractor-format",
      "email-intake",
      "asset-intake",
      "suggest-manuals",
      "fetch-manual",
      "permits-suggest",
    ]),
    propertyId: z.string().uuid().optional(),
    /** Optional display label for Support warmth — never invent ledger facts from it. */
    homeLabel: z.string().max(200).optional().nullable(),
    hint: z.string().max(500).optional().nullable(),
    filename: z.string().max(200).optional().nullable(),
    question: z.string().max(1000).optional(),
    assetId: z.string().uuid().optional().nullable(),
    inputText: z.string().max(8000).optional(),
    inputKind: z.enum(["typed", "voice", "upload"]).optional(),
    emailText: z.string().max(20000).optional(),
    sourceKind: z.enum(["photo", "email", "invoice", "notes"]).optional(),
    text: z.string().max(20000).optional().nullable(),
    /** Raw base64 (no data-URL prefix). Phone compresses before send. */
    imageBase64: z.string().max(3_500_000).optional().nullable(),
    mediaMimeType: z
      .enum([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "application/pdf",
      ])
      .optional()
      .nullable(),
    manufacturer: z.string().max(120).optional().nullable(),
    model: z.string().max(120).optional().nullable(),
    existingAssets: z.array(ExistingAssetSchema).max(100).optional(),
    /** Public https URL of a suggested manual / spec (fetch-manual). */
    sourceUrl: z.string().url().max(2048).optional().nullable(),
    /** Display title hint for filename when fetching a manual. */
    title: z.string().max(200).optional().nullable(),
  })
  .strict();

const INTAKE_MEDIA_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/** Strip accidental data-URL wrappers; keep pure base64 for providers. */
function normalizeBase64Payload(raw: string): string {
  const trimmed = raw.trim();
  const dataUrl = /^data:[^;]+;base64,(.+)$/i.exec(trimmed);
  return (dataUrl?.[1] ?? trimmed).replace(/\s+/g, "");
}

function normalizeIntakeMime(
  mime: string | null | undefined,
): string | null {
  if (!mime) return null;
  const lower = mime.trim().toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  if (!INTAKE_MEDIA_MIMES.has(lower)) return null;
  return lower;
}

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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "Expected JSON body");
  }

  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((i) => i.message).join("; ");
    const rawAction =
      rawBody &&
      typeof rawBody === "object" &&
      "action" in rawBody &&
      typeof (rawBody as { action?: unknown }).action === "string"
        ? (rawBody as { action: string }).action
        : null;
    const knownActions = [
      "status",
      "scan",
      "howto",
      "support",
      "contractor-format",
      "email-intake",
      "asset-intake",
      "suggest-manuals",
      "fetch-manual",
      "permits-suggest",
    ] as const;
    const staleDeploy =
      rawAction != null &&
      !(knownActions as readonly string[]).includes(rawAction);
    return errorResponse(400, "invalid_request_body", "Invalid request body", {
      reason,
      hint: staleDeploy
        ? `Unknown action "${rawAction}". Supported: ${knownActions.join(", ")}. If the phone expects asset-intake, redeploy this function from latest main (npx supabase functions deploy ai-assist).`
        : reason.includes("Unrecognized key")
          ? "Request fields do not match this function version. Redeploy ai-assist from latest main."
          : undefined,
    });
  }

  const body = parsed.data;
  const live = resolveLiveConfig();

  // Soft topic reject before burning quota (howto + support + free-text intakes).
  let supportRedirectToAsk = false;
  if (body.action === "howto") {
    const topic = assessAskHomeAssetTopic(body.question);
    if (!topic.allowed) {
      return jsonResponse({
        mode: live.mode,
        grounded: false,
        refused: true,
        code: "off_topic",
        answer: topic.message,
        citations: [],
        privacy: {
          writes: false,
          note: "How-to answers never change your ledger.",
        },
      });
    }
  } else if (body.action === "support") {
    const topic = assessSupportTopic(body.question);
    if (!topic.allowed) {
      return jsonResponse({
        mode: live.mode,
        refused: true,
        code: "off_topic",
        answer: topic.message,
        escalate: false,
        nextSteps: ["Home → Ask HomeAsset for ledger help"],
        privacy: {
          writes: false,
          note: "Support replies never change your ledger or account settings.",
        },
      });
    }
    supportRedirectToAsk = topic.redirectToAsk === true;
  } else if (body.action === "contractor-format") {
    const topic = assessAskHomeAssetTopic(body.inputText);
    if (!topic.allowed) {
      return errorResponse(422, "off_topic", topic.message);
    }
  } else if (body.action === "email-intake") {
    const topic = assessAskHomeAssetTopic(body.emailText);
    if (!topic.allowed) {
      return errorResponse(422, "off_topic", topic.message);
    }
  } else if (body.action === "asset-intake") {
    const topic = assessAskHomeAssetTopic(
      [body.hint, body.text].filter(Boolean).join("\n"),
    );
    if (!topic.allowed) {
      return errorResponse(422, "off_topic", topic.message);
    }
  }

  const rateRoute =
    body.action === "support" ? "support-assist" : "ai-assist";
  // fetch-manual is a post-approve download (not an AI ask) — do not burn Ask quota.
  const rate = await enforceRateLimit({
    key: user.id,
    route: rateRoute,
    supabase,
    skip: body.action === "status" || body.action === "fetch-manual",
  });
  if (!rate.allowed) {
    const code: ErrorCode =
      rate.reason === "daily_cap" ? "daily_cap" : "rate_limited";
    const fallback =
      rateRoute === "support-assist"
        ? rate.reason === "daily_cap"
          ? `You've reached today's Support limit (${rate.dailyCap} messages).`
          : "Support needs a short pause — try again in a moment."
        : rate.reason === "daily_cap"
          ? `You've reached today's Ask HomeAsset limit (${rate.dailyCap} asks).`
          : "Ask HomeAsset needs a short pause — try again in a moment.";
    return errorResponse(429, code, rate.message ?? fallback, {
      extra: {
        retry_after: rate.retryAfterSeconds,
        daily_cap: rate.dailyCap,
        daily_remaining: rate.dailyRemaining,
        reason: rate.reason,
      },
    });
  }

  try {
    switch (body.action) {
      case "status":
        return jsonResponse({
          aiMode: live.mode,
          provider: live.provider,
          capabilities: {
            scan: true,
            howto: true,
            support: true,
            contractorFormat: true,
            emailIntake: true,
            assetIntake: true,
            suggestManuals: true,
            fetchManual: true,
            permitsSuggest: true,
            submitToLedger: false,
            note: "Confirm / approve writes happen on the phone via Supabase RLS — never silently. Support is separate from Ask HomeAsset.",
          },
          limits: {
            burstLimit: rate.burstLimit,
            dailyCap: rate.dailyCap,
            note: "Server-enforced per signed-in user. Ask HomeAsset = home help; Support = app/account help — separate caps, not unlimited AI.",
          },
          privacy: {
            writes: false,
            confirmRequired: true,
            homeownerApproveRequired: true,
          },
        });

      case "scan": {
        if (!body.propertyId) {
          return errorResponse(400, "invalid_request_body", "propertyId required");
        }
        const scanRawMedia = body.imageBase64?.trim() || "";
        const scanMediaBase64 = scanRawMedia
          ? normalizeBase64Payload(scanRawMedia)
          : null;
        const scanMediaMime = normalizeIntakeMime(body.mediaMimeType);
        if (scanMediaBase64 && !scanMediaMime) {
          return errorResponse(
            400,
            "invalid_request_body",
            "mediaMimeType required with imageBase64 (image/*)",
          );
        }
        if (scanMediaBase64 && scanMediaMime?.startsWith("application/")) {
          return errorResponse(
            400,
            "invalid_request_body",
            "Scan expects a photo (image/*), not a PDF — use asset intake for PDFs",
          );
        }
        if (scanMediaBase64 && scanMediaBase64.length < 64) {
          return errorResponse(
            400,
            "invalid_request_body",
            "Attached photo looks empty or truncated",
          );
        }
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        const identified = await identifyProduct({
          hint: body.hint,
          filename: body.filename,
          mediaBase64: scanMediaBase64,
          mediaMimeType: scanMediaMime,
          live,
        });
        const draftId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();
        const manuals = identified.manuals.map((m, index) => ({
          id: m.id,
          title: m.title,
          sourceUrl: m.sourceUrl,
          preview: m.preview,
          selectedByDefault: index === 0,
        }));
        const manualContents: Record<string, string> = {};
        for (const m of identified.manuals) {
          manualContents[m.id] = m.content;
        }
        return jsonResponse({
          draft: {
            draftId,
            mode: identified.mode,
            identificationLabel: identified.identificationLabel,
            confidence: identified.confidence,
            catalogProductId: identified.catalogProduct.id,
            suggestedAsset: identified.suggestedAsset,
            manuals,
            expiresAt,
            privacy: {
              writes: false,
              confirmRequired: true,
              note: "Nothing is saved until you confirm. You choose which manuals to keep.",
            },
          },
          aiMode: identified.mode,
          manualContents,
        });
      }

      case "howto": {
        if (!body.propertyId || !body.question?.trim()) {
          return errorResponse(
            400,
            "invalid_request_body",
            "propertyId and question required",
          );
        }
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        const howto = await answerHowTo({
          supabase,
          propertyId: body.propertyId,
          question: body.question.trim(),
          assetId: body.assetId,
          mode: live.mode,
        });
        return jsonResponse(howto);
      }

      case "support": {
        if (!body.question?.trim()) {
          return errorResponse(
            400,
            "invalid_request_body",
            "question required",
          );
        }
        // Optional home ownership check — never invent ledger facts from the label.
        if (body.propertyId) {
          await assertPropertyOwned(supabase, body.propertyId, user.id);
        }
        const support = await answerCustomerSupport({
          question: body.question.trim(),
          homeLabel: body.homeLabel,
          live,
          redirectToAsk: supportRedirectToAsk,
        });
        console.info(
          JSON.stringify({
            msg: "support_assist_reply",
            userId: user.id,
            mode: support.mode,
            escalate: support.escalate,
            refused: support.refused === true,
          }),
        );
        return jsonResponse(support);
      }

      case "contractor-format": {
        if (!body.inputText?.trim()) {
          return errorResponse(400, "invalid_request_body", "inputText required");
        }
        const formatted = await formatContractor({
          inputText: body.inputText,
          inputKind: body.inputKind ?? "typed",
          live,
        });
        return jsonResponse(formatted);
      }

      case "email-intake": {
        if (!body.propertyId || !body.emailText?.trim()) {
          return errorResponse(
            400,
            "invalid_request_body",
            "propertyId and emailText required",
          );
        }
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        const email = await formatEmailIntake({
          emailText: body.emailText,
          live,
        });
        const draftId = crypto.randomUUID();
        return jsonResponse({
          draft: {
            draftId,
            mode: email.mode,
            summary: email.summary,
            workPerformed: email.workPerformed,
            contractorName: email.contractorName,
            workDate: email.workDate,
            assetsSuggested: email.assetsSuggested,
            expiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
            privacy: email.privacy,
          },
          aiMode: email.mode,
          rawEmailText: body.emailText.trim(),
        });
      }

      case "asset-intake": {
        if (!body.propertyId || !body.sourceKind) {
          return errorResponse(
            400,
            "invalid_request_body",
            "propertyId and sourceKind required",
          );
        }
        const intakeText = (body.text ?? body.emailText ?? "").trim();
        const intakeHint = (body.hint ?? "").trim();
        const intakeFilename = (body.filename ?? "").trim();
        const rawMedia = body.imageBase64?.trim() || "";
        const mediaBase64 = rawMedia
          ? normalizeBase64Payload(rawMedia)
          : null;
        const mediaMimeType = normalizeIntakeMime(body.mediaMimeType);
        if (mediaBase64 && !mediaMimeType) {
          return errorResponse(
            400,
            "invalid_request_body",
            "mediaMimeType required with imageBase64 (image/* or application/pdf)",
          );
        }
        if (mediaBase64 && mediaBase64.length < 64) {
          return errorResponse(
            400,
            "invalid_request_body",
            "Attached media looks empty or truncated",
          );
        }
        if (
          !intakeText &&
          !intakeHint &&
          !intakeFilename &&
          !mediaBase64
        ) {
          return errorResponse(
            400,
            "invalid_request_body",
            "Provide a photo/PDF attachment, filename, hint, or pasted text",
          );
        }
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        const intake = await formatAssetIntake({
          sourceKind: body.sourceKind,
          text: intakeText || null,
          hint: intakeHint || null,
          filename: intakeFilename || null,
          mediaBase64,
          mediaMimeType,
          existingAssets: body.existingAssets ?? [],
          live,
        });
        const draftId = crypto.randomUUID();
        return jsonResponse({
          draft: {
            draftId,
            mode: intake.mode,
            sourceKind: body.sourceKind,
            intent: intake.intent,
            matchedAssetId: intake.matchedAssetId,
            matchedAssetLabel: intake.matchedAssetLabel,
            identificationLabel: intake.identificationLabel,
            confidence: intake.confidence,
            suggestedAsset: intake.suggestedAsset,
            missingFields: intake.missingFields,
            expiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
            privacy: intake.privacy,
          },
          aiMode: intake.mode,
        });
      }

      case "suggest-manuals": {
        if (!body.propertyId) {
          return errorResponse(
            400,
            "invalid_request_body",
            "propertyId required",
          );
        }
        const mfr = (body.manufacturer ?? "").trim();
        const mdl = (body.model ?? "").trim();
        if (!mfr || !mdl) {
          return errorResponse(
            400,
            "invalid_request_body",
            "manufacturer and model required to suggest manuals",
          );
        }
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        const manualsDraft = await suggestManualsForMakeModel({
          manufacturer: mfr,
          model: mdl,
          live,
        });
        const draftId = crypto.randomUUID();
        return jsonResponse({
          draft: {
            draftId,
            mode: manualsDraft.mode,
            manufacturer: mfr,
            model: mdl,
            identificationLabel: `${mfr} ${mdl}`,
            manuals: manualsDraft.manuals,
            expiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
            privacy: {
              writes: false,
              confirmRequired: true,
              note: "Suggested docs only. Nothing is stored until you choose which to keep.",
            },
          },
          aiMode: manualsDraft.mode,
          manualContents: manualsDraft.manualContents,
        });
      }

      case "fetch-manual": {
        // Post-approve download: resolve URL → real PDF → store in home vault (RLS).
        // Called only after the homeowner confirms on the phone — never auto-adds.
        if (!body.propertyId) {
          return errorResponse(
            400,
            "invalid_request_body",
            "propertyId required",
          );
        }
        const sourceUrl = (body.sourceUrl ?? "").trim();
        if (!sourceUrl) {
          return errorResponse(
            400,
            "invalid_request_body",
            "sourceUrl required to fetch a manual",
          );
        }
        const assetId = body.assetId ?? null;
        if (!assetId) {
          return errorResponse(
            400,
            "invalid_request_body",
            "assetId required to store a fetched manual",
          );
        }
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        // Ensure asset belongs to this home (RLS also enforces).
        const { data: assetRow, error: assetErr } = await supabase
          .from("assets")
          .select("id")
          .eq("id", assetId)
          .eq("property_id", body.propertyId)
          .maybeSingle();
        if (assetErr || !assetRow) {
          return errorResponse(404, "asset_not_found", "Asset not found on this home");
        }

        const title = (body.title ?? "").trim() || "Manual";
        const fetched = await fetchManualPdf({
          sourceUrl,
          titleHint: title,
        });
        if (!fetched.ok) {
          return jsonResponse({
            ok: false,
            code: "manual_not_downloadable",
            reason: fetched.reason,
            fetchCode: fetched.code,
            privacy: {
              writes: false,
              note: "Nothing was stored. HomeAsset does not save broken links as manuals.",
            },
          });
        }

        const documentId = crypto.randomUUID();
        const safeName =
          fetched.filename.replace(/[^\w.\-()+ ]+/g, "_") || "manual.pdf";
        const storageKey = `${body.propertyId}/${documentId}/${safeName}`;
        const uploadBody = new Blob([fetched.bytes], {
          type: fetched.mimeType,
        });
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storageKey, uploadBody, {
            contentType: fetched.mimeType,
            upsert: false,
          });
        if (uploadError) {
          return errorResponse(
            502,
            "upstream_error",
            "Could not store the PDF in your home vault.",
            { reason: uploadError.message },
          );
        }
        const now = new Date().toISOString();
        const { data: docRow, error: insertError } = await supabase
          .from("documents")
          .insert({
            id: documentId,
            property_id: body.propertyId,
            asset_id: assetId,
            title: title.slice(0, 200),
            doc_type: "manual",
            document_date: null,
            source: "ai_fetched",
            mime_type: fetched.mimeType,
            original_filename: safeName,
            storage_key: storageKey,
            byte_size: fetched.byteSize,
            created_at: now,
            updated_at: now,
          })
          .select(
            "id, property_id, asset_id, title, doc_type, document_date, source, mime_type, original_filename, byte_size, created_at, updated_at",
          )
          .single();
        if (insertError || !docRow) {
          await supabase.storage.from("documents").remove([storageKey]);
          return errorResponse(
            502,
            "upstream_error",
            "Could not save the document record.",
            { reason: insertError?.message },
          );
        }
        const row = docRow as {
          id: string;
          property_id: string;
          asset_id: string | null;
          title: string;
          doc_type: string;
          document_date: string | null;
          source: string;
          mime_type: string;
          original_filename: string;
          byte_size: number;
          created_at: string;
          updated_at: string;
        };
        return jsonResponse({
          ok: true,
          finalUrl: fetched.finalUrl,
          document: {
            id: row.id,
            propertyId: row.property_id,
            assetId: row.asset_id,
            title: row.title,
            docType: row.doc_type,
            documentDate: row.document_date,
            source: row.source,
            mimeType: row.mime_type,
            originalFilename: row.original_filename,
            byteSize: row.byte_size,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          privacy: {
            writes: true,
            confirmedByUser: true,
            note: "Stored only because you confirmed. Real PDF in this home’s vault — not a nested link.",
          },
        });
      }

      case "permits-suggest": {
        if (!body.propertyId) {
          return errorResponse(400, "invalid_request_body", "propertyId required");
        }
        const property = await assertPropertyOwned(
          supabase,
          body.propertyId,
          user.id,
        );
        const suggested = suggestPermitsStub(property);
        const draftId = crypto.randomUUID();
        return jsonResponse({
          draft: {
            draftId,
            mode: suggested.mode,
            addressQuery: suggested.addressQuery,
            sourceNote: suggested.sourceNote,
            permits: suggested.permits,
            expiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
            privacy: {
              writes: false,
              confirmRequired: true,
              note: "Permit hints are suggestions only. Nothing is saved until you approve.",
            },
          },
          sourceMode: suggested.mode,
        });
      }

      default:
        return errorResponse(400, "invalid_request_body", "Unknown action");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail === "PROPERTY_NOT_FOUND") {
      return errorResponse(404, "property_not_found", "Home not found.");
    }
    if (detail === "ASSET_NOT_FOUND") {
      return errorResponse(404, "asset_not_found", "Asset not found.");
    }
    if (detail === "AI_ASSIST_DISABLED") {
      return errorResponse(
        503,
        "ai_assist_disabled",
        "AI assist live flag is off",
        {
          hint: "Set AI_ASSIST_LIVE=true (or delete it — default is on when a key is set).",
        },
      );
    }
    console.error(
      JSON.stringify({
        msg: "ai_assist_failed",
        user_id: user.id,
        action: body.action,
        detail,
      }),
    );
    return errorResponse(500, "parse_failed", "AI assist failed", {
      reason: detail.slice(0, 400),
    });
  }
});

type LiveConfig = {
  mode: AiMode;
  provider: "gemini" | "openai" | "none";
  geminiKey: string;
  geminiModel: string;
  openaiKey: string;
  openaiModel: string;
  openaiBase: string;
};

function resolveLiveConfig(): LiveConfig {
  const geminiKey = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  const openaiKey =
    (Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("AI_API_KEY") ?? "").trim();
  const flag = (Deno.env.get("AI_ASSIST_LIVE") ?? "true").trim().toLowerCase();
  const liveFlagOn = !(
    flag === "0" ||
    flag === "false" ||
    flag === "off" ||
    flag === "no"
  );
  const geminiModel = normalizeGeminiModel(Deno.env.get("GEMINI_MODEL"));
  const openaiModel =
    (Deno.env.get("AI_MODEL") ?? "").trim() || DEFAULT_OPENAI_MODEL;
  const openaiBase = (
    (Deno.env.get("AI_BASE_URL") ?? "").trim() || DEFAULT_OPENAI_BASE
  ).replace(/\/$/, "");

  if (!liveFlagOn) {
    return {
      mode: "mock",
      provider: "none",
      geminiKey: "",
      geminiModel,
      openaiKey: "",
      openaiModel,
      openaiBase,
    };
  }
  if (geminiKey) {
    return {
      mode: "live",
      provider: "gemini",
      geminiKey,
      geminiModel,
      openaiKey,
      openaiModel,
      openaiBase,
    };
  }
  if (openaiKey) {
    return {
      mode: "live",
      provider: "openai",
      geminiKey: "",
      geminiModel,
      openaiKey,
      openaiModel,
      openaiBase,
    };
  }
  return {
    mode: "mock",
    provider: "none",
    geminiKey: "",
    geminiModel,
    openaiKey: "",
    openaiModel,
    openaiBase,
  };
}

function normalizeGeminiModel(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return DEFAULT_GEMINI_MODEL;
  const withoutUrl = trimmed
    .replace(/^https?:\/\/generativelanguage\.googleapis\.com\/v1beta\//i, "")
    .replace(/:generateContent$/i, "");
  const bare = withoutUrl.replace(/^(models\/)+/i, "").trim();
  if (!bare || bare.includes("/")) return DEFAULT_GEMINI_MODEL;
  return bare;
}

async function assertPropertyOwned(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  userId: string,
): Promise<{
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
}> {
  const { data, error } = await supabase
    .from("properties")
    .select(
      "id, address_line1, address_line2, city, region, postal_code, country",
    )
    .eq("id", propertyId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("PROPERTY_NOT_FOUND");
  return data as {
    id: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    region: string;
    postal_code: string;
    country: string;
  };
}

function coerceCategory(raw: unknown): AssetCategory {
  if (typeof raw !== "string") return "other";
  const value = raw.trim().replace(/\s+/g, " ").slice(0, 80);
  return value || "other";
}

function manualsFromProduct(product: CatalogProduct) {
  return product.manuals.map((m, index) => ({
    id: m.id,
    title: m.title,
    sourceUrl: m.sourceUrl,
    preview: m.content.slice(0, 280) + (m.content.length > 280 ? "…" : ""),
    selectedByDefault: index === 0,
    content: m.content,
  }));
}

const UNKNOWN_CATALOG_ID = "unknown-unidentified";

function looksLikeGenericFilename(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    /^(photo|image|img|scan|camera|screenshot)[-_\s]?\d*\.(jpe?g|png|webp|heic|heif)$/i.test(
      v,
    ) ||
    /^[a-f0-9-]{8,}\.(jpe?g|png|webp|heic|heif)$/i.test(v) ||
    /^\d{8,}(_\d+)?\.(jpe?g|png|webp|heic|heif)$/i.test(v)
  );
}

function unidentifiedScanResult(
  mode: AiMode,
  opts?: { label?: string | null; notes?: string | null },
) {
  const raw = (opts?.label ?? "").trim().slice(0, 120);
  const usable =
    raw && !looksLikeGenericFilename(raw) ? raw : "Unidentified asset";
  const notes =
    opts?.notes?.trim() ||
    "Ask HomeAsset could not confidently identify brand or model from what you sent. Enter make and model, then confirm — nothing is saved until you do.";
  return {
    mode,
    catalogProduct: {
      id: UNKNOWN_CATALOG_ID,
      matchTerms: [] as string[],
      name: usable,
      category: "other" as const,
      manufacturer: "",
      model: "",
      confidence: 0.15,
      manuals: [] as Array<{
        id: string;
        title: string;
        sourceUrl: string;
        content: string;
      }>,
      howtoNotes: [] as string[],
    },
    identificationLabel:
      usable === "Unidentified asset"
        ? "Could not identify — please enter brand and model"
        : usable,
    confidence: 0.15,
    suggestedAsset: {
      name: usable,
      category: "other",
      manufacturer: null as string | null,
      model: null as string | null,
      serial: null as string | null,
      purchaseDate: null as string | null,
      notes,
    },
    manuals: [] as ReturnType<typeof manualsFromProduct>,
  };
}

function identifyFromCatalog(query: string, mode: AiMode) {
  const product = matchCatalogProducts(query)[0];
  if (!product) {
    return unidentifiedScanResult(mode, {
      label: query,
      notes:
        "No catalog match for that hint. Confirm or edit brand and model before saving.",
    });
  }
  return {
    mode,
    catalogProduct: product,
    identificationLabel: `${product.manufacturer} ${product.model}`,
    confidence: product.confidence,
    suggestedAsset: {
      name: product.name,
      category: product.category,
      manufacturer: product.manufacturer,
      model: product.model,
      serial: null as string | null,
      purchaseDate: null as string | null,
      notes: `Identified via AI assist (${mode}). Confirm before saving.`,
    },
    manuals: manualsFromProduct(product),
  };
}

const RETAILER_SCREENSHOT_GUIDANCE =
  "Retailer purchase screenshots (Amazon, Best Buy, Home Depot, Walmart, Target, manufacturer stores, order history) " +
  "are VALID product ID sources — not only physical product / nameplate photos. " +
  "When UI chrome is present: OCR the product TITLE, brand/store link (e.g. \"Visit the iRobot Store\"), " +
  "\"Purchased N times\", \"Last purchased <date>\", list/sale PRICE, and category phrases (Robot Vacuum & Mop, etc.). " +
  "Prefer the title/brand text over guessing from the product hero image alone. " +
  "Ignore ads, ratings, cart chrome, and Alexa badges unless they name the product. ";

/** Retailer order emails + invoice/receipt PDFs (purchase inbox — paste/attach; no OAuth). */
const RETAILER_ORDER_EMAIL_PDF_GUIDANCE =
  "Retailer ORDER EMAILS (Amazon, Best Buy, Home Depot, Walmart, Target, manufacturer stores) " +
  "and invoice/receipt PDFs are VALID purchase sources when pasted or attached. " +
  "Extract ONE primary home product when the order lists several items (prefer the clearest durable home good). " +
  "Read Subject / Order confirmation / Shipped / Delivered lines, item TITLE, brand, model, " +
  "Order date / Ordered on / Purchase date / Invoice date, and Total / Item price / Grand total. " +
  "purchaseDate = that order or invoice date as YYYY-MM-DD (never invent). " +
  "Put a grounded price into notes as \"Purchase price: $…\" — do not invent a price. " +
  "Guess a short free-text category (e.g. Robot vacuum, Vacuum, Appliance) when the title implies it. " +
  "Do NOT treat Amazon/retailer \"From:\" as installerVendor. " +
  "Ignore shipping ads, tracking chrome, and payment-method blurbs that do not name the product. ";

const SCAN_IDENTIFY_SYSTEM =
  `${HOME_SCOPE_SYSTEM_BLURB} ` +
  "You identify ONE home product for a homeowner ledger from a photo, purchase screenshot, and/or short hint. " +
  "PRIORITY: (1) logos, brand marks, product titles, model stickers, nameplate text, " +
  "(2) retailer page text (title, brand link, last-purchased date, price), " +
  "(3) overall product shape only as support. " +
  RETAILER_SCREENSHOT_GUIDANCE +
  "Make, model, and category MUST be grounded in what is visible or clearly stated — never invent an unrelated demo product. " +
  "If the brand logo or store link is readable (e.g. Roomba / iRobot), use that brand even when model is unclear. " +
  "purchaseDate: YYYY-MM-DD when \"Last purchased\", order date, or similar is visible; otherwise null. " +
  "Put a visible sale/list price into notes as \"Purchase price: $…\" when useful; do not invent a price. " +
  "If unsure, leave manufacturer/model null, set confidence low (≤0.35), and say what you need the homeowner to confirm. " +
  "Do not guess Generac, Carrier, Rheem, or any catalog default when the image does not show that brand. " +
  "Reply with JSON only: " +
  '{"manufacturer":string|null,"model":string|null,"category":"short free-text label","name":string,' +
  '"identificationLabel":string,"confidence":number,"purchaseDate":string|null,"notes":string|null,"unsure":boolean}';

function mergePriceIntoNotes(
  notes: string | null,
  priceHint: string | null | undefined,
): string | null {
  const price =
    priceHint != null ? String(priceHint).trim().slice(0, 40) : "";
  if (!price) return notes;
  const line = /^\$?\d/.test(price)
    ? `Purchase price: ${price.startsWith("$") ? price : `$${price}`}`
    : `Purchase price: ${price}`;
  if (notes && /purchase price:/i.test(notes)) return notes;
  return notes ? `${notes}\n${line}`.slice(0, 2000) : line;
}

/** Heuristic purchase fields from order-email / receipt text (mock + grounding). */
function extractPurchaseHintsFromText(text: string): {
  purchaseDate: string | null;
  price: string | null;
  looksLikeRetailPurchase: boolean;
} {
  const raw = text.trim();
  if (!raw) {
    return {
      purchaseDate: null,
      price: null,
      looksLikeRetailPurchase: false,
    };
  }
  const looksLikeRetailPurchase =
    /\b(amazon|best\s*buy|home\s*depot|walmart|target|order\s*confirmation|your\s+order|ordered\s+on|last\s+purchased|invoice|receipt|grand\s*total|order\s*#)\b/i.test(
      raw,
    ) || /\$\s?\d{1,5}(?:\.\d{2})?/.test(raw);

  let purchaseDate: string | null = null;
  const labeled = raw.match(
    /\b(?:last\s+purchased|order(?:ed)?\s+(?:on|date)|purchase\s+date|invoice\s+date)\s*[:\-]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i,
  );
  if (labeled?.[1]) {
    purchaseDate = nullableDate(labeled[1]);
  }
  if (!purchaseDate) {
    const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso?.[1]) purchaseDate = iso[1];
    else {
      const us = raw.match(
        /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})\b/i,
      );
      if (us?.[1]) purchaseDate = nullableDate(us[1]);
    }
  }

  const priceMatch = raw.match(/\$\s?(\d{1,5}(?:\.\d{2})?)/);
  const price = priceMatch?.[1] ? `$${priceMatch[1]}` : null;

  return { purchaseDate, price, looksLikeRetailPurchase };
}

async function liveIdentifyFromVision(input: {
  query: string;
  mediaBase64: string | null;
  mediaMimeType: string | null;
  live: LiveConfig;
}): Promise<{
  manufacturer: string | null;
  model: string | null;
  category: string;
  name: string;
  identificationLabel: string;
  confidence: number;
  purchaseDate: string | null;
  notes: string | null;
  unsure: boolean;
} | null> {
  if (input.live.mode !== "live") return null;
  const hasMedia = Boolean(input.mediaBase64 && input.mediaMimeType);
  if (!hasMedia && !input.query.trim()) return null;
  const user =
    (hasMedia
      ? "An image is attached (physical product photo OR retailer purchase/order screenshot). " +
        "Identify the ONE home product for the ledger. Read on-screen title/brand/purchase text — do not ignore UI chrome.\n"
      : "No photo — identify only from the hint text; if too vague, mark unsure.\n") +
    `hint/filename: ${input.query.trim() || "(none)"}`;
  try {
    const content = await chatJsonText({
      live: input.live,
      system: SCAN_IDENTIFY_SYSTEM,
      user,
      media: hasMedia
        ? { mimeType: input.mediaMimeType!, base64: input.mediaBase64! }
        : null,
    });
    if (!content) return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      manufacturer?: string | null;
      model?: string | null;
      category?: string;
      name?: string;
      identificationLabel?: string;
      confidence?: number;
      purchaseDate?: string | null;
      price?: string | null;
      notes?: string | null;
      unsure?: boolean;
    };
    const manufacturer =
      parsed.manufacturer != null
        ? String(parsed.manufacturer).trim().slice(0, 120) || null
        : null;
    const model =
      parsed.model != null
        ? String(parsed.model).trim().slice(0, 120) || null
        : null;
    const category =
      typeof parsed.category === "string" && parsed.category.trim()
        ? parsed.category.trim().replace(/\s+/g, " ").slice(0, 80)
        : "other";
    const name =
      String(parsed.name ?? "")
        .trim()
        .slice(0, 120) ||
      [manufacturer, model].filter(Boolean).join(" ") ||
      "Unidentified asset";
    const identificationLabel =
      String(parsed.identificationLabel ?? "")
        .trim()
        .slice(0, 200) ||
      [manufacturer, model].filter(Boolean).join(" ") ||
      name;
    let confidence = Math.min(
      1,
      Math.max(0, Number(parsed.confidence ?? 0.5) || 0.5),
    );
    const unsure =
      parsed.unsure === true || (!manufacturer && !model) || confidence < 0.4;
    if (unsure) confidence = Math.min(confidence, 0.35);
    let notes =
      parsed.notes != null
        ? String(parsed.notes).trim().slice(0, 2000) || null
        : null;
    notes = mergePriceIntoNotes(
      notes,
      parsed.price != null ? String(parsed.price) : null,
    );
    return {
      manufacturer,
      model,
      category,
      name,
      identificationLabel,
      confidence,
      purchaseDate: nullableDate(parsed.purchaseDate),
      notes,
      unsure,
    };
  } catch {
    return null;
  }
}

async function identifyProduct(input: {
  hint?: string | null;
  filename?: string | null;
  mediaBase64?: string | null;
  mediaMimeType?: string | null;
  live: LiveConfig;
}) {
  const filename = (input.filename ?? "").trim();
  const hint = (input.hint ?? "").trim();
  const filenameForQuery =
    filename && !looksLikeGenericFilename(filename) ? filename : "";
  const baseQuery = [hint, filenameForQuery].filter(Boolean).join(" ").trim();
  const hasMedia = Boolean(input.mediaBase64 && input.mediaMimeType);

  if (input.live.mode === "live" && (hasMedia || baseQuery)) {
    const vision = await liveIdentifyFromVision({
      query: baseQuery || filename || hint,
      mediaBase64: input.mediaBase64 ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
      live: input.live,
    });
    if (vision) {
      const catalogQuery = [
        vision.manufacturer,
        vision.model,
        vision.name,
        vision.category,
        baseQuery,
      ]
        .filter(Boolean)
        .join(" ");
      const catalogHit = matchCatalogProducts(catalogQuery)[0];
      // Only attach catalog manuals when the live ID clearly matches that product.
      const manuals =
        catalogHit &&
        vision.manufacturer &&
        catalogHit.manufacturer.toLowerCase() ===
          vision.manufacturer.toLowerCase()
          ? manualsFromProduct(catalogHit)
          : [];
      if (vision.unsure && !vision.manufacturer && !vision.model) {
        return unidentifiedScanResult("live", {
          label: vision.name,
          notes: vision.notes,
        });
      }
      return {
        mode: "live" as const,
        catalogProduct: catalogHit ?? {
          id: UNKNOWN_CATALOG_ID,
          matchTerms: [],
          name: vision.name,
          category: "other" as const,
          manufacturer: vision.manufacturer ?? "",
          model: vision.model ?? "",
          confidence: vision.confidence,
          manuals: [],
          howtoNotes: [],
        },
        identificationLabel: vision.identificationLabel,
        confidence: vision.confidence,
        suggestedAsset: {
          name: vision.name,
          category: vision.category,
          manufacturer: vision.manufacturer,
          model: vision.model,
          serial: null as string | null,
          purchaseDate: vision.purchaseDate,
          notes:
            vision.notes ??
            (vision.unsure
              ? "Low confidence — please confirm brand and model before saving."
              : "Identified via Ask HomeAsset from your photo or purchase screenshot. Confirm before saving."),
        },
        manuals,
      };
    }
  }

  if (!baseQuery) {
    return unidentifiedScanResult(
      input.live.mode === "live" ? "live" : "mock",
      {
        notes: hasMedia
          ? "Ask HomeAsset could not read brand or model from that photo or purchase screenshot. Enter make and model, then confirm — nothing is saved until you do."
          : undefined,
      },
    );
  }

  return identifyFromCatalog(
    baseQuery,
    input.live.mode === "live" ? "live" : "mock",
  );
}

type ChatMediaPart = {
  mimeType: string;
  base64: string;
};

async function chatJsonText(args: {
  live: LiveConfig;
  system: string;
  user: string;
  media?: ChatMediaPart | null;
}): Promise<string | null> {
  if (args.live.provider === "gemini") {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(args.live.geminiModel)}:generateContent` +
      `?key=${encodeURIComponent(args.live.geminiKey)}`;
    const parts: Array<Record<string, unknown>> = [
      { text: `${args.system}\n\n${args.user}` },
    ];
    if (args.media?.base64) {
      parts.push({
        inline_data: {
          mime_type: args.media.mimeType,
          data: args.media.base64,
        },
      });
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${rawText.slice(0, 400)}`);
    }
    const envelope = JSON.parse(rawText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      envelope.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() || null
    );
  }

  if (args.live.provider === "openai") {
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: args.user },
    ];
    if (args.media?.base64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${args.media.mimeType};base64,${args.media.base64}`,
        },
      });
    }
    const response = await fetch(`${args.live.openaiBase}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.live.openaiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: args.live.openaiModel,
        temperature: 0,
        messages: [
          { role: "system", content: args.system },
          {
            role: "user",
            content: args.media?.base64 ? userContent : args.user,
          },
        ],
      }),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${raw.slice(0, 400)}`);
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content?.trim() || null;
  }

  return null;
}

/**
 * After make + model are known: suggest manuals / spec sheets for approve.
 * Catalog first; live Gemini may add public manufacturer links (draft only).
 * Never writes the ledger — phone stores only after homeowner confirm.
 */
async function suggestManualsForMakeModel(input: {
  manufacturer: string;
  model: string;
  live: LiveConfig;
}): Promise<{
  mode: AiMode;
  manuals: Array<{
    id: string;
    title: string;
    sourceUrl: string | null;
    preview: string;
    kind: "manual" | "spec" | "other";
    selectedByDefault: boolean;
  }>;
  manualContents: Record<string, string>;
}> {
  const qMfr = input.manufacturer.toLowerCase().trim();
  const qMdl = input.model.toLowerCase().trim();
  // Exact-ish make/model match only — do not fall back to the default catalog product.
  const catalogProduct =
    PRODUCT_CATALOG.find((p) => {
      const mfr = p.manufacturer.toLowerCase();
      const mdl = p.model.toLowerCase();
      const mfrHit = mfr.includes(qMfr) || qMfr.includes(mfr);
      const mdlHit =
        mdl.includes(qMdl) ||
        qMdl.includes(mdl) ||
        p.matchTerms.some((t) => qMdl.includes(t.toLowerCase()));
      return mfrHit && mdlHit;
    }) ?? null;

  const manuals: Array<{
    id: string;
    title: string;
    sourceUrl: string | null;
    preview: string;
    kind: "manual" | "spec" | "other";
    selectedByDefault: boolean;
  }> = [];
  const manualContents: Record<string, string> = {};

  if (catalogProduct) {
    catalogProduct.manuals.forEach((m, index) => {
      manuals.push({
        id: m.id,
        title: m.title,
        sourceUrl: m.sourceUrl,
        preview: m.content.slice(0, 280) + (m.content.length > 280 ? "…" : ""),
        kind: "manual",
        selectedByDefault: index === 0,
      });
      manualContents[m.id] = m.content;
    });
  }

  if (input.live.mode === "live") {
    try {
      const content = await chatJsonTextWithOptionalSearch({
        live: input.live,
        system:
          `${HOME_SCOPE_SYSTEM_BLURB} ` +
          "Find official manufacturer owner's manuals and spec sheets for ONE home equipment model. " +
          "Prefer direct https links to manufacturer.com / support / literature PDFs (URL path ending in .pdf). " +
          "Do NOT return retailer listings, blogs, search pages, or HTML-only product pages when a PDF exists. " +
          "Reply with JSON only: {documents:[{title,url,kind:\"manual\"|\"spec\"|\"other\",note}]}. " +
          "Include at most 5 high-confidence docs. If unsure of a URL, omit it — never invent domains. " +
          "This is a draft for homeowner approve; do not claim documents are already stored.",
        user: `manufacturer=${input.manufacturer}\nmodel=${input.model}\nFind public manuals and spec sheets (prefer direct PDF URLs).`,
        useGoogleSearch: input.live.provider === "gemini",
      });
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          documents?: Array<{
            title?: string;
            url?: string;
            kind?: string;
            note?: string;
          }>;
        };
        const seenUrls = new Set(
          manuals
            .map((m) => m.sourceUrl?.toLowerCase())
            .filter(Boolean) as string[],
        );
        for (const doc of parsed.documents ?? []) {
          const title = String(doc.title ?? "").trim().slice(0, 160);
          const url = String(doc.url ?? "").trim();
          if (!title || !/^https:\/\//i.test(url)) continue;
          // Skip obviously non-file hosts; prefer pdf-looking paths when ranking later.
          try {
            const host = new URL(url).hostname.toLowerCase();
            if (
              host === "example.invalid" ||
              host === "example.com" ||
              host.endsWith(".invalid") ||
              host.endsWith(".test")
            ) {
              continue;
            }
          } catch {
            continue;
          }
          const urlKey = url.toLowerCase();
          if (seenUrls.has(urlKey)) continue;
          seenUrls.add(urlKey);
          const kind =
            doc.kind === "spec" || doc.kind === "manual" || doc.kind === "other"
              ? doc.kind
              : "manual";
          const id = `web-${manuals.length + 1}-${crypto.randomUUID().slice(0, 8)}`;
          const note = String(doc.note ?? "").trim().slice(0, 280);
          const isLikelyPdf = /\.pdf(\?|#|$)/i.test(url);
          // Do NOT store a fake text "link stub" — approve will fetch real PDF bytes.
          // Empty content marks this as URL-backed (phone calls fetch-manual).
          manuals.push({
            id,
            title,
            sourceUrl: url,
            preview:
              note ||
              (isLikelyPdf
                ? "Manufacturer PDF — saved as a real file only after you confirm."
                : "Suggested source — HomeAsset will try to download a real PDF when you confirm."),
            kind,
            selectedByDefault: manuals.length === 0,
          });
          // Intentionally omit manualContents[id] for web URLs — confirm fetches PDF.
          if (manuals.length >= 6) break;
        }
      }
    } catch {
      // keep catalog-only draft
    }
  }

  return {
    mode: input.live.mode,
    manuals,
    manualContents,
  };
}

/** Gemini may use Google Search grounding; OpenAI path is plain JSON chat. */
async function chatJsonTextWithOptionalSearch(args: {
  live: LiveConfig;
  system: string;
  user: string;
  useGoogleSearch?: boolean;
}): Promise<string | null> {
  if (args.live.provider === "gemini" && args.useGoogleSearch) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(args.live.geminiModel)}:generateContent` +
      `?key=${encodeURIComponent(args.live.geminiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${args.system}\n\n${args.user}` }],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
    });
    const rawText = await response.text();
    if (!response.ok) {
      // Fall back to non-search chat if the tool is unavailable on this model/key.
      return chatJsonText({
        live: args.live,
        system: args.system,
        user: args.user,
      });
    }
    const envelope = JSON.parse(rawText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      envelope.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() || null
    );
  }
  return chatJsonText({
    live: args.live,
    system: args.system,
    user: args.user,
  });
}

async function formatContractor(input: {
  inputText: string;
  inputKind: "typed" | "voice" | "upload";
  live: LiveConfig;
}) {
  const text = input.inputText.trim();
  const privacy = {
    writes: false as const,
    confirmRequired: true as const,
    note: "Draft only. Contractor must confirm before submit; homeowner must approve before official.",
  };

  if (input.live.mode === "live") {
    try {
      const content = await chatJsonText({
        live: input.live,
        system:
          `${HOME_SCOPE_SYSTEM_BLURB} ` +
          "Format contractor job notes into JSON with keys: summary, workPerformed, " +
          "assetsSuggested (array of {name,category,manufacturer,model,notes}), materials (string[]), followUps (string[]).",
        user: text,
      });
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          workPerformed?: string;
          assetsSuggested?: unknown[];
          materials?: unknown[];
          followUps?: unknown[];
        };
        return {
          mode: "live" as const,
          draft: {
            summary: String(parsed.summary ?? text.slice(0, 160)),
            workPerformed: String(parsed.workPerformed ?? text),
            assetsSuggested: Array.isArray(parsed.assetsSuggested)
              ? parsed.assetsSuggested
              : [],
            materials: Array.isArray(parsed.materials) ? parsed.materials : [],
            followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
          },
          privacy,
        };
      }
    } catch {
      // fall through
    }
  }

  const product = matchCatalogProducts(text)[0];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const assetName =
    product?.name ??
    lines[0]?.slice(0, 120) ??
    "Home asset from contractor notes";
  return {
    mode: "mock" as const,
    draft: {
      summary:
        lines[0]?.slice(0, 160) ||
        (product
          ? `${input.inputKind} notes for ${product.manufacturer} ${product.model}`
          : `${input.inputKind} notes (confirm brand and model)`),
      workPerformed: text || `Installed / serviced ${assetName}.`,
      assetsSuggested: [
        {
          name: assetName,
          category: product?.category ?? "other",
          manufacturer: product?.manufacturer ?? null,
          model: product?.model ?? null,
          notes: `Formatted from ${input.inputKind} input (mock AI). Confirm before submit.`,
        },
      ],
      materials: lines
        .filter((l) => /part|filter|seal|wire|panel|unit/i.test(l))
        .slice(0, 5),
      followUps: [
        "Homeowner must approve before this becomes official in the ledger.",
        "Attach photos or paperwork on the full submit path (EPIC 8).",
      ],
    },
    privacy,
  };
}

type ExistingAssetLite = {
  id: string;
  name: string;
  category: string;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
};

type AssetIntakeSuggested = {
  name: string;
  category: AssetCategory;
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

type MissingField = {
  key: keyof AssetIntakeSuggested;
  label: string;
  reason: string;
};

const MISSING_FIELD_META: Record<
  keyof AssetIntakeSuggested,
  { label: string; reason: string }
> = {
  name: { label: "Name", reason: "What should this asset be called?" },
  category: { label: "Category", reason: "Which category fits best?" },
  manufacturer: {
    label: "Manufacturer",
    reason: "Brand or maker if you have it.",
  },
  model: { label: "Model", reason: "Model number if shown on a label." },
  serial: {
    label: "Serial",
    reason: "Serial helps match manuals and recalls later.",
  },
  purchaseDate: {
    label: "Purchase date",
    reason: "YYYY-MM-DD if you know when you bought it.",
  },
  installDate: {
    label: "Install date",
    reason: "YYYY-MM-DD if you know when it was installed.",
  },
  installerVendor: {
    label: "Installer / vendor",
    reason: "Who installed or sold it?",
  },
  location: {
    label: "Location",
    reason: "Where in the home (attic, kitchen, exterior…)?",
  },
  notes: { label: "Notes", reason: "Anything else worth keeping?" },
  warrantyEndDate: {
    label: "Warranty end",
    reason: "YYYY-MM-DD if you know coverage end.",
  },
  warrantyTerm: {
    label: "Warranty term",
    reason: "e.g. 10 years parts / 1 year labor.",
  },
};

function computeMissingFields(asset: AssetIntakeSuggested): MissingField[] {
  const keys: Array<keyof AssetIntakeSuggested> = [
    "manufacturer",
    "model",
    "serial",
    "installDate",
    "location",
  ];
  const missing: MissingField[] = [];
  for (const key of keys) {
    const value = asset[key];
    if (value == null || String(value).trim() === "") {
      const meta = MISSING_FIELD_META[key];
      missing.push({ key, label: meta.label, reason: meta.reason });
    }
  }
  return missing;
}

function matchExistingAsset(
  suggested: Pick<
    AssetIntakeSuggested,
    "name" | "category" | "manufacturer" | "model" | "serial"
  >,
  existing: ExistingAssetLite[],
): { id: string; label: string } | null {
  if (existing.length === 0) return null;

  const norm = (v: string | null | undefined) =>
    (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (suggested.serial) {
    const serialHit = existing.find(
      (a) => a.serial && norm(a.serial) === norm(suggested.serial),
    );
    if (serialHit) {
      return {
        id: serialHit.id,
        label: `${serialHit.name}${serialHit.manufacturer ? ` · ${serialHit.manufacturer}` : ""}${serialHit.model ? ` ${serialHit.model}` : ""}`,
      };
    }
  }

  if (suggested.manufacturer && suggested.model) {
    const mm = existing.find(
      (a) =>
        norm(a.manufacturer) === norm(suggested.manufacturer) &&
        norm(a.model) === norm(suggested.model),
    );
    if (mm) {
      return {
        id: mm.id,
        label: `${mm.name} · ${mm.manufacturer} ${mm.model}`,
      };
    }
  }

  const nameNorm = norm(suggested.name);
  const nameHit = existing.find((a) => {
    const other = norm(a.name);
    return (
      other === nameNorm ||
      (nameNorm.length >= 4 && other.includes(nameNorm)) ||
      (other.length >= 4 && nameNorm.includes(other))
    );
  });
  if (nameHit && nameHit.category === suggested.category) {
    return {
      id: nameHit.id,
      label: `${nameHit.name}${nameHit.manufacturer ? ` · ${nameHit.manufacturer}` : ""}`,
    };
  }
  return null;
}

const ASSET_INTAKE_SYSTEM =
  `${HOME_SCOPE_SYSTEM_BLURB} ` +
  "You extract ONE distinct home asset from homeowner input. " +
  "When an image or PDF is attached: (1) read logos and brand marks first, (2) OCR ALL visible text on nameplates, " +
  "data plates, stickers, invoices, receipts, and purchase screenshots, (3) use product shape/type only as support. " +
  RETAILER_SCREENSHOT_GUIDANCE +
  RETAILER_ORDER_EMAIL_PDF_GUIDANCE +
  "Prefer exact printed values over guesses. Transcribe model and serial character-for-character " +
  "(watch O vs 0, I vs 1, S vs 5). " +
  "Look for labels such as: Manufacturer / Mfr / Brand, Model / Mod / Model No / Catalog No, " +
  "Serial / Ser / S/N / SN, Capacity / Tons / Ton / BTU / MBH / kW / Gallons / SEER / AFUE / HSPF / EER, " +
  "Refrigerant, Voltage / Volts / Phase, Date / DOM / Install, Last purchased / order date, Price. " +
  "For sourceKind=email or invoice (including PDF), prioritize order/invoice purchase fields over install fields. " +
  "Put capacity, price (as \"Purchase price: $…\"), and other plate/receipt facts into suggestedAsset.notes " +
  "when there is no dedicated field — e.g. \"Capacity: 3 ton / 36000 BTU · SEER 16\". " +
  "purchaseDate from \"Last purchased\", order date, or invoice date when visible (YYYY-MM-DD). " +
  "identificationLabel should be brand + model when known (e.g. \"iRobot Roomba 505X\" or \"Carrier 24ACC636A003\"). " +
  "Reply with JSON only: {intent:\"add\"|\"update\", matchedAssetId:string|null, identificationLabel:string, confidence:number, " +
  "capacity:string|null, " +
  "suggestedAsset:{name,category,manufacturer,model,serial,purchaseDate,installDate,installerVendor,location,notes,warrantyEndDate,warrantyTerm}, " +
  "missingFields:string[]}. " +
  "category is a short free-text label the homeowner would recognize (e.g. HVAC, Roof, Robot vacuum, Vacuum) — not a fixed enum. " +
  "matchedAssetId must be one of the provided existing asset ids or null. Prefer update when the same equipment already exists. " +
  "Do not invent serial numbers, model numbers, capacity, or an unrelated make/model (never default to Generac/Carrier/Rheem). " +
  "If the logo or product is unclear, leave manufacturer/model null, set confidence ≤0.35, and list missingFields. " +
  "Dates YYYY-MM-DD or null. Fill only facts grounded in the input or attached media. " +
  "missingFields = keys still unknown that a homeowner should confirm.";
/**
 * Multi-source Ask HomeAsset intake: photo label / email / invoice / notes →
 * one distinct asset draft with Add or Update. Never writes the ledger.
 */
async function formatAssetIntake(input: {
  sourceKind: "photo" | "email" | "invoice" | "notes";
  text: string | null;
  hint: string | null;
  filename: string | null;
  mediaBase64: string | null;
  mediaMimeType: string | null;
  existingAssets: ExistingAssetLite[];
  live: LiveConfig;
}) {
  const privacy = {
    writes: false as const,
    confirmRequired: true as const,
    note: "Draft only. Nothing is official until you choose Add or Update and confirm.",
  };
  const query = [input.hint, input.filename, input.text]
    .filter(Boolean)
    .join(" ")
    .trim();
  const existingIds = new Set(input.existingAssets.map((a) => a.id));
  const hasMedia = Boolean(input.mediaBase64 && input.mediaMimeType);

  if (input.live.mode === "live") {
    try {
      const existingJson = JSON.stringify(
        input.existingAssets.slice(0, 40).map((a) => ({
          id: a.id,
          name: a.name,
          category: a.category,
          manufacturer: a.manufacturer ?? null,
          model: a.model ?? null,
          serial: a.serial ?? null,
        })),
      );
      const mediaNote = hasMedia
        ? `mediaAttached=true mime=${input.mediaMimeType} (read the attached ${
            input.mediaMimeType === "application/pdf" ? "PDF" : "photo"
          } carefully for nameplate / proposal / invoice/receipt text, retailer purchase/order screenshot, OR email PDF export — OCR title, brand, order/last-purchased date, price)`
        : "mediaAttached=false";
      const purchaseHint =
        input.sourceKind === "email" || input.sourceKind === "invoice"
          ? "Treat this as a purchase/order or invoice source when it looks like a retailer order email or receipt. Fill purchaseDate + Purchase price in notes when grounded.\n"
          : "";
      const content = await chatJsonText({
        live: input.live,
        system: ASSET_INTAKE_SYSTEM,
        user:
          `sourceKind=${input.sourceKind}\n${mediaNote}\n${purchaseHint}` +
          `existingAssets=${existingJson}\ninput:\n${query || "(see attached media)"}`,
        media: hasMedia
          ? {
              mimeType: input.mediaMimeType!,
              base64: input.mediaBase64!,
            }
          : null,
      });
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          intent?: string;
          matchedAssetId?: string | null;
          identificationLabel?: string;
          confidence?: number;
          capacity?: string | null;
          suggestedAsset?: Partial<AssetIntakeSuggested> & { category?: string };
          missingFields?: unknown;
        };
        let notes = nullableTrim(parsed.suggestedAsset?.notes, 2000);
        const capacity = nullableTrim(parsed.capacity, 160);
        if (capacity) {
          const capacityLine = `Capacity: ${capacity}`;
          notes = notes
            ? notes.toLowerCase().includes("capacity:")
              ? notes
              : `${notes}\n${capacityLine}`
            : capacityLine;
          notes = notes.slice(0, 2000);
        }
        const suggestedAsset: AssetIntakeSuggested = {
          name: String(parsed.suggestedAsset?.name ?? "Home asset")
            .trim()
            .slice(0, 120) || "Home asset",
          category: coerceCategory(parsed.suggestedAsset?.category),
          manufacturer: nullableTrim(parsed.suggestedAsset?.manufacturer, 120),
          model: nullableTrim(parsed.suggestedAsset?.model, 120),
          serial: nullableTrim(parsed.suggestedAsset?.serial, 120),
          purchaseDate: nullableDate(parsed.suggestedAsset?.purchaseDate),
          installDate: nullableDate(parsed.suggestedAsset?.installDate),
          installerVendor: nullableTrim(
            parsed.suggestedAsset?.installerVendor,
            120,
          ),
          location: nullableTrim(parsed.suggestedAsset?.location, 120),
          notes,
          warrantyEndDate: nullableDate(parsed.suggestedAsset?.warrantyEndDate),
          warrantyTerm: nullableTrim(parsed.suggestedAsset?.warrantyTerm, 120),
        };
        let matchedAssetId =
          typeof parsed.matchedAssetId === "string" &&
          existingIds.has(parsed.matchedAssetId)
            ? parsed.matchedAssetId
            : null;
        let intent: "add" | "update" =
          parsed.intent === "update" && matchedAssetId ? "update" : "add";
        if (!matchedAssetId) {
          const auto = matchExistingAsset(suggestedAsset, input.existingAssets);
          if (auto) {
            matchedAssetId = auto.id;
            intent = "update";
          }
        }
        const matched = matchedAssetId
          ? input.existingAssets.find((a) => a.id === matchedAssetId)
          : undefined;
        const missingFromModel = Array.isArray(parsed.missingFields)
          ? parsed.missingFields
              .map((k) => String(k))
              .filter((k): k is keyof AssetIntakeSuggested =>
                k in MISSING_FIELD_META,
              )
              .map((key) => ({
                key,
                label: MISSING_FIELD_META[key].label,
                reason: MISSING_FIELD_META[key].reason,
              }))
          : [];
        const missingFields =
          missingFromModel.length > 0
            ? missingFromModel
            : computeMissingFields(suggestedAsset);
        return {
          mode: "live" as const,
          intent,
          matchedAssetId,
          matchedAssetLabel: matched
            ? `${matched.name}${matched.manufacturer ? ` · ${matched.manufacturer}` : ""}${matched.model ? ` ${matched.model}` : ""}`
            : null,
          identificationLabel:
            String(parsed.identificationLabel ?? suggestedAsset.name).slice(
              0,
              200,
            ),
          confidence: Math.min(
            1,
            Math.max(
              0,
              Number(
                parsed.confidence ??
                  (hasMedia &&
                  suggestedAsset.manufacturer &&
                  suggestedAsset.model
                    ? 0.85
                    : 0.7),
              ) || 0.7,
            ),
          ),
          suggestedAsset,
          missingFields,
          privacy,
        };
      }
    } catch {
      // fall through — never log media bytes
    }
  }

  const product = matchCatalogProducts(query || "appliance")[0];
  const purchaseHints = extractPurchaseHintsFromText(query);
  const isoHit = query.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
  const purchaseDate =
    purchaseHints.purchaseDate ??
    (input.sourceKind === "email" || input.sourceKind === "invoice"
      ? isoHit
      : null);
  const installDate =
    input.sourceKind === "email" || input.sourceKind === "invoice"
      ? null
      : isoHit;
  const from = input.text?.match(/^From:\s*(.+)$/im)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .replace(/["']/g, "")
    .trim();
  const installerVendor =
    purchaseHints.looksLikeRetailPurchase ||
    (from != null &&
      /\b(amazon|best\s*buy|home\s*depot|walmart|target|noreply|no-reply|orders?@)\b/i.test(
        from,
      ))
      ? null
      : from && from.length <= 120
        ? from
        : null;
  let notes: string | null = hasMedia
    ? `Drafted from ${input.sourceKind} attachment via Ask HomeAsset (mock — live vision unavailable). Enter brand and model if blank, then confirm.`
    : purchaseHints.looksLikeRetailPurchase
      ? `Drafted from retailer ${input.sourceKind} via Ask HomeAsset (mock). Enter brand and model if blank, then confirm.`
      : `Drafted from ${input.sourceKind} via Ask HomeAsset (mock). Enter brand and model if blank, then confirm.`;
  notes = mergePriceIntoNotes(notes, purchaseHints.price);
  const suggestedAsset: AssetIntakeSuggested = {
    name: product?.name ?? "Unidentified asset",
    category: (product?.category as AssetCategory) ?? "other",
    manufacturer: product?.manufacturer ?? null,
    model: product?.model ?? null,
    serial: null,
    purchaseDate,
    installDate,
    installerVendor,
    location: null,
    notes,
    warrantyEndDate: null,
    warrantyTerm: null,
  };
  const matched = matchExistingAsset(suggestedAsset, input.existingAssets);
  const intent: "add" | "update" = matched ? "update" : "add";
  return {
    mode: "mock" as const,
    intent,
    matchedAssetId: matched?.id ?? null,
    matchedAssetLabel: matched?.label ?? null,
    identificationLabel: product
      ? `${product.manufacturer} ${product.model}`
      : "Could not identify — please enter brand and model",
    confidence: product?.confidence ?? 0.15,
    suggestedAsset,
    missingFields: computeMissingFields(suggestedAsset),
    privacy,
  };
}

function nullableTrim(
  value: unknown,
  max: number,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim().slice(0, max);
  return trimmed || null;
}

function nullableDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = raw.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i,
  );
  if (mdy) {
    const monthToken = mdy[1];
    const dayToken = mdy[2];
    const yearToken = mdy[3];
    if (!monthToken || !dayToken || !yearToken) return null;
    const months: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = months[monthToken.slice(0, 3).toLowerCase()];
    if (mm) return `${yearToken}-${mm}-${dayToken.padStart(2, "0")}`;
  }
  return null;
}

async function formatEmailIntake(input: {
  emailText: string;
  live: LiveConfig;
}) {
  const text = input.emailText.trim();
  const privacy = {
    writes: false as const,
    confirmRequired: true as const,
    note: "Draft only from the email you pasted. Nothing is official until you approve.",
  };

  if (input.live.mode === "live") {
    try {
      const content = await chatJsonText({
        live: input.live,
        system:
          `${HOME_SCOPE_SYSTEM_BLURB} ` +
          "You turn a homeowner's forwarded contractor email into JSON only with keys: " +
          "summary (short), workPerformed, contractorName (string|null), workDate (string|null), " +
          "assetsSuggested (array of {name,category,manufacturer,model,notes}). " +
          "category is a short free-text label the homeowner would recognize (e.g. HVAC, Roof, Dishwasher) — not a fixed enum. " +
          "Do not invent serial numbers. Keep facts grounded in the email.",
        user: text,
      });
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          workPerformed?: string;
          contractorName?: string | null;
          workDate?: string | null;
          assetsSuggested?: Array<{
            name?: string;
            category?: string;
            manufacturer?: string | null;
            model?: string | null;
            notes?: string | null;
          }>;
        };
        const assetsSuggested = Array.isArray(parsed.assetsSuggested)
          ? parsed.assetsSuggested
              .filter((a) => a && typeof a.name === "string" && a.name.trim())
              .slice(0, 8)
              .map((a) => ({
                name: String(a.name).trim().slice(0, 120),
                category: coerceCategory(a.category),
                manufacturer:
                  a.manufacturer != null
                    ? String(a.manufacturer).trim().slice(0, 120) || null
                    : null,
                model:
                  a.model != null
                    ? String(a.model).trim().slice(0, 120) || null
                    : null,
                serial: null as string | null,
                notes:
                  a.notes != null
                    ? String(a.notes).trim().slice(0, 2000) || null
                    : "Drafted from emailed contractor notes. Approve before saving.",
              }))
          : [];
        return {
          mode: "live" as const,
          summary: String(parsed.summary ?? text.slice(0, 160)).slice(0, 400),
          workPerformed: String(parsed.workPerformed ?? text).slice(0, 4000),
          contractorName:
            parsed.contractorName != null
              ? String(parsed.contractorName).trim().slice(0, 120) || null
              : null,
          workDate:
            parsed.workDate != null
              ? String(parsed.workDate).trim().slice(0, 40) || null
              : null,
          assetsSuggested,
          privacy,
        };
      }
    } catch {
      // fall through
    }
  }

  const product = matchCatalogProducts(text)[0];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const subject = text.match(/^Subject:\s*(.+)$/im)?.[1]?.trim();
  const from = text.match(/^From:\s*(.+)$/im)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .replace(/["']/g, "")
    .trim();
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
  const assetName = product?.name ?? "Home asset from email";

  return {
    mode: "mock" as const,
    summary:
      subject?.slice(0, 160) ||
      lines.find((l) => !/^from:|^to:|^sent:|^date:|^subject:/i.test(l))?.slice(
        0,
        160,
      ) ||
      `Contractor work notes for ${assetName}`,
    workPerformed:
      lines
        .filter((l) => !/^from:|^to:|^sent:|^date:|^subject:/i.test(l))
        .join("\n")
        .slice(0, 4000) || text.slice(0, 4000),
    contractorName: from && from.length <= 120 ? from : null,
    workDate: iso,
    assetsSuggested: [
      {
        name: assetName,
        category: product?.category ?? "other",
        manufacturer: product?.manufacturer ?? null,
        model: product?.model ?? null,
        serial: null as string | null,
        notes: "Drafted from pasted contractor email (mock AI). Approve before saving.",
      },
    ],
    privacy,
  };
}

function scoreText(haystack: string, question: string): number {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (h.includes(w)) hits += 1;
  }
  return hits / words.length;
}

/**
 * Reminder / schedule asks vs manuals how-to.
 * Keep in sync with apps/api/src/lib/ai/reminderSchedule.ts.
 */
function isReminderScheduleQuestion(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (q.length < 4) return false;

  const mentionsSchedule =
    /\b(reminder|reminders)\b/.test(q) ||
    /\b(upcoming|coming up)\b/.test(q) ||
    /\b(due soon|next due|what'?s due|whats due|anything due|any(thing)? due)\b/.test(
      q,
    ) ||
    /\b(scheduled|schedule)\b/.test(q) ||
    (/\bmaintenance\b/.test(q) &&
      /\b(coming|upcoming|due|schedule|reminder|next|any)\b/.test(q)) ||
    /\b(do i have|have i got|any).{0,48}\b(maintenance|service|filter).{0,48}\b(reminder|coming|upcoming|due)\b/.test(
      q,
    );

  if (!mentionsSchedule) return false;

  const howToOnly =
    /\b(how (do|to|can|should|would)|steps? (to|for)|procedure|instructions?)\b/.test(
      q,
    ) &&
    !/\b(reminder|reminders|upcoming|coming up|due soon|what'?s due)\b/.test(q);
  if (howToOnly) return false;

  return true;
}

function recurrencePlainLabel(recurrence: string | null | undefined): string {
  switch (recurrence) {
    case "monthly":
      return "monthly";
    case "quarterly":
      return "quarterly";
    case "yearly":
      return "yearly";
    default:
      return "one-time";
  }
}

function formatReminderLine(input: {
  title: string;
  dueDate: string;
  assetName?: string | null;
  recurrence?: string | null;
  notes?: string | null;
}): string {
  const parts = [
    `• ${input.title} — due ${input.dueDate}`,
    input.assetName ? ` (${input.assetName})` : "",
    ` · ${recurrencePlainLabel(input.recurrence)}`,
  ];
  const line = parts.join("");
  if (input.notes?.trim()) {
    return `${line}\n  Notes: ${input.notes.trim()}`;
  }
  return line;
}

/**
 * Product / account Support — warm, privacy-first, no inventing account facts.
 * Separate from Ask HomeAsset ledger grounding.
 */
async function answerCustomerSupport(input: {
  question: string;
  homeLabel?: string | null;
  live: LiveConfig;
  redirectToAsk?: boolean;
}): Promise<SupportAssistReply> {
  if (input.redirectToAsk) {
    return mockSupportAnswer(input.question, {
      redirectToAsk: true,
      mode: input.live.mode,
    });
  }

  if (input.live.mode === "live") {
    try {
      const content = await chatJsonText({
        live: input.live,
        system: SUPPORT_SYSTEM_BLURB,
        user: buildSupportUserPrompt({
          question: input.question,
          homeLabel: input.homeLabel,
        }),
      });
      return parseSupportModelJson(content, input.question, "live");
    } catch (err) {
      console.warn(
        JSON.stringify({
          msg: "support_assist_live_fallback_mock",
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return mockSupportAnswer(input.question, { mode: "mock" });
}

async function answerHowTo(input: {
  supabase: ReturnType<typeof createClient>;
  propertyId: string;
  question: string;
  assetId?: string | null;
  mode: AiMode;
}) {
  if (isReminderScheduleQuestion(input.question)) {
    return answerReminderSchedule(input);
  }

  const citations: Array<{
    kind: "document" | "asset" | "catalog" | "reminder";
    id: string;
    title: string;
  }> = [];
  const snippets: string[] = [];

  let assetQuery = input.supabase
    .from("assets")
    .select(
      "id, name, category, manufacturer, model, serial, location, install_date, last_serviced_at, confirmed_by_contractor_name, warranty_end_date, notes",
    )
    .eq("property_id", input.propertyId);
  if (input.assetId) {
    assetQuery = assetQuery.eq("id", input.assetId);
  }
  const { data: assets, error: assetError } = await assetQuery;
  if (assetError) throw new Error(assetError.message);
  if (input.assetId && (!assets || assets.length === 0)) {
    throw new Error("ASSET_NOT_FOUND");
  }

  for (const asset of assets ?? []) {
    const blurb = [
      `Asset: ${asset.name}`,
      `Category: ${asset.category}`,
      asset.manufacturer ? `Manufacturer: ${asset.manufacturer}` : null,
      asset.model ? `Model: ${asset.model}` : null,
      asset.serial ? `Serial: ${asset.serial}` : null,
      asset.location ? `Location: ${asset.location}` : null,
      asset.install_date ? `Install date: ${asset.install_date}` : null,
      asset.last_serviced_at
        ? `Last serviced: ${asset.last_serviced_at}`
        : null,
      asset.confirmed_by_contractor_name
        ? `Confirmed by contractor: ${asset.confirmed_by_contractor_name}`
        : null,
      asset.warranty_end_date
        ? `Warranty ends: ${asset.warranty_end_date}`
        : null,
      asset.notes ? `Notes: ${asset.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (scoreText(blurb, input.question) > 0 || input.assetId) {
      snippets.push(blurb);
      citations.push({ kind: "asset", id: asset.id, title: asset.name });
    }

    const { data: docs } = await input.supabase
      .from("documents")
      .select("id, title, doc_type, source, mime_type, original_filename, storage_key")
      .eq("property_id", input.propertyId)
      .eq("asset_id", asset.id);

    for (const doc of docs ?? []) {
      if (
        doc.doc_type !== "manual" &&
        doc.source !== "ai_fetched" &&
        !String(doc.mime_type).startsWith("text/")
      ) {
        continue;
      }
      let text = `${doc.title}\n${doc.original_filename}`;
      if (
        String(doc.mime_type).startsWith("text/") ||
        String(doc.original_filename).endsWith(".txt") ||
        String(doc.original_filename).endsWith(".md")
      ) {
        const { data: file } = await input.supabase.storage
          .from("documents")
          .download(doc.storage_key);
        if (file) {
          text = await file.text();
        }
      }
      if (scoreText(text, input.question) > 0) {
        snippets.push(`[${doc.title}]\n${text.slice(0, 800)}`);
        citations.push({ kind: "document", id: doc.id, title: doc.title });
      }
    }

    if ((docs ?? []).length === 0 && asset.manufacturer && asset.model) {
      const catalog =
        getCatalogProduct("generac-gp6500") &&
        String(asset.manufacturer).toLowerCase().includes("generac")
          ? getCatalogProduct("generac-gp6500")
          : String(asset.manufacturer).toLowerCase().includes("carrier")
            ? getCatalogProduct("carrier-infinity-24")
            : String(asset.manufacturer).toLowerCase().includes("rheem")
              ? getCatalogProduct("rheem-performance-50")
              : undefined;
      if (catalog) {
        for (const manual of catalog.manuals) {
          snippets.push(`[${manual.title}]\n${manual.content.slice(0, 600)}`);
          citations.push({
            kind: "catalog",
            id: manual.id,
            title: `${manual.title} (not yet saved — confirm scan to store)`,
          });
        }
      }
    }
  }

  const grounded = snippets.length > 0;
  if (!grounded) {
    return {
      mode: input.mode,
      grounded: false,
      answer:
        "I don’t have enough saved manuals or home records to answer that safely. " +
        "Scan the product and confirm storing its manuals, or attach a manual photo, then ask again.",
      citations: [],
      privacy: { writes: false, note: "How-to answers never change your ledger." },
    };
  }

  return {
    mode: input.mode,
    grounded: true,
    answer: [
      "Based on your home records and stored / catalog manuals:",
      "",
      ...snippets.slice(0, 6),
      "",
      "Sources are listed below. This is not a substitute for the full manufacturer manual or a licensed pro when safety is involved.",
    ].join("\n"),
    citations: citations.slice(0, 8),
    privacy: { writes: false, note: "How-to answers never change your ledger." },
  };
}

/**
 * Home-scoped reminders + related asset service fields via RLS.
 * Never invents reminders. Empty list is still grounded.
 */
async function answerReminderSchedule(input: {
  supabase: ReturnType<typeof createClient>;
  propertyId: string;
  question: string;
  assetId?: string | null;
  mode: AiMode;
}) {
  let remQuery = input.supabase
    .from("reminders")
    .select(
      "id, title, notes, due_date, recurrence, status, asset_id, last_completed_at",
    )
    .eq("property_id", input.propertyId)
    .eq("status", "active")
    .order("due_date", { ascending: true });
  if (input.assetId) {
    remQuery = remQuery.eq("asset_id", input.assetId);
  }
  const { data: reminderRows, error: remError } = await remQuery;
  if (remError) throw new Error(remError.message);

  let assetQuery = input.supabase
    .from("assets")
    .select(
      "id, name, install_date, last_serviced_at, confirmed_by_contractor_name, warranty_end_date",
    )
    .eq("property_id", input.propertyId);
  if (input.assetId) {
    assetQuery = assetQuery.eq("id", input.assetId);
  }
  const { data: assets, error: assetError } = await assetQuery;
  if (assetError) throw new Error(assetError.message);
  if (input.assetId && (!assets || assets.length === 0)) {
    throw new Error("ASSET_NOT_FOUND");
  }

  const nameById = new Map(
    (assets ?? []).map((a) => [String(a.id), String(a.name)]),
  );

  const citations: Array<{
    kind: "document" | "asset" | "catalog" | "reminder";
    id: string;
    title: string;
  }> = [];
  const lines: string[] = [];
  const reminders = reminderRows ?? [];

  if (reminders.length > 0) {
    lines.push("Upcoming maintenance reminders for this home:");
    lines.push("");
    for (const reminder of reminders.slice(0, 20)) {
      lines.push(
        formatReminderLine({
          title: String(reminder.title),
          dueDate: String(reminder.due_date),
          assetName: nameById.get(String(reminder.asset_id)) ?? null,
          recurrence: String(reminder.recurrence ?? "none"),
          notes: (reminder.notes as string | null) ?? null,
        }),
      );
      citations.push({
        kind: "reminder",
        id: String(reminder.id),
        title: String(reminder.title),
      });
    }
  } else {
    lines.push(
      "This home has no upcoming maintenance reminders saved.",
      "Add one from Notifications → Add reminder. Ask HomeAsset only lists reminders you already saved — it does not invent them.",
    );
  }

  const serviceFacts: string[] = [];
  for (const asset of assets ?? []) {
    const facts = [
      asset.last_serviced_at
        ? `Last serviced: ${asset.last_serviced_at}`
        : null,
      asset.confirmed_by_contractor_name
        ? `Confirmed by contractor: ${asset.confirmed_by_contractor_name}`
        : null,
      asset.install_date ? `Install date: ${asset.install_date}` : null,
      asset.warranty_end_date
        ? `Warranty ends: ${asset.warranty_end_date}`
        : null,
    ].filter(Boolean);
    if (facts.length === 0) continue;
    serviceFacts.push(`• ${asset.name}: ${facts.join(" · ")}`);
    citations.push({
      kind: "asset",
      id: String(asset.id),
      title: String(asset.name),
    });
  }

  if (serviceFacts.length > 0) {
    lines.push("");
    lines.push("Related asset service fields on this home:");
    lines.push(...serviceFacts.slice(0, 12));
  }

  lines.push("");
  lines.push(
    "Open Notifications to mark a reminder done or add more. Asking never changes your ledger.",
  );

  const seen = new Set<string>();
  const uniqueCitations = citations.filter((c) => {
    const key = `${c.kind}:${c.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    mode: input.mode,
    grounded: true,
    answer: lines.join("\n"),
    citations: uniqueCitations.slice(0, 12),
    privacy: {
      writes: false,
      note: "Reminder answers never change your ledger.",
    },
  };
}

function suggestPermitsStub(property: {
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
}) {
  const addressQuery = [
    property.address_line1,
    property.address_line2,
    property.city,
    property.region,
    property.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  const permits = [
    {
      id: "stub-roof-reroof",
      title: "Residential re-roof",
      status: "final",
      filedOrClosedOn: "2024-06-12",
      description:
        "Building permit for asphalt shingle re-roof. Final inspection recorded.",
      sourceLabel: "HomeAsset stub catalog (demo)",
      sourceUrl: null as string | null,
      suggestedAsset: {
        name: "Asphalt shingle roof",
        category: "roof" as AssetCategory,
        manufacturer: null as string | null,
        model: null as string | null,
        serial: null as string | null,
        notes: `Suggested from public-permit stub for ${addressQuery}. Approve before saving.`,
      },
      selectedByDefault: true,
    },
    {
      id: "stub-hvac-replace",
      title: "HVAC equipment replacement",
      status: "final",
      filedOrClosedOn: "2023-09-04",
      description:
        "Mechanical permit for outdoor condenser / furnace replacement.",
      sourceLabel: "HomeAsset stub catalog (demo)",
      sourceUrl: null as string | null,
      suggestedAsset: {
        name: "Central HVAC system",
        category: "hvac" as AssetCategory,
        manufacturer: null,
        model: null,
        serial: null,
        notes: `Suggested from public-permit stub for ${addressQuery}. Approve before saving.`,
      },
      selectedByDefault: true,
    },
    {
      id: "stub-water-heater",
      title: "Water heater replacement",
      status: "closed",
      filedOrClosedOn: "2022-03-18",
      description: "Plumbing permit for tank water heater swap.",
      sourceLabel: "HomeAsset stub catalog (demo)",
      sourceUrl: null as string | null,
      suggestedAsset: {
        name: "Tank water heater",
        category: "water_heater" as AssetCategory,
        manufacturer: null,
        model: null,
        serial: null,
        notes: `Suggested from public-permit stub for ${addressQuery}. Approve before saving.`,
      },
      selectedByDefault: false,
    },
  ];

  return {
    mode: "stub" as PermitMode,
    addressQuery,
    permits,
    sourceNote:
      "Demo permit hints only. Live municipal feeds are not wired yet — approve still required before anything is official.",
  };
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: ErrorCode,
  error: string,
  opts?: {
    reason?: string;
    hint?: string;
    extra?: Record<string, unknown>;
  },
): Response {
  return jsonResponse(
    {
      error,
      code,
      reason: opts?.reason,
      hint: opts?.hint,
      ...opts?.extra,
    },
    status,
  );
}
