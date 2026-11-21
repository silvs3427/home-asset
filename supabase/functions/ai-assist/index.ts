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
  assessAskHomeAssetTopic,
  HOME_SCOPE_SYSTEM_BLURB,
} from "../_shared/topicGuard.ts";

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
  | "parse_failed";

type AssetCategory =
  | "hvac"
  | "roof"
  | "appliance"
  | "generator"
  | "water_heater"
  | "plumbing"
  | "electrical"
  | "kids_gear"
  | "vehicle"
  | "other";

const CATEGORIES: AssetCategory[] = [
  "hvac",
  "roof",
  "appliance",
  "generator",
  "water_heater",
  "plumbing",
  "electrical",
  "kids_gear",
  "vehicle",
  "other",
];

const ExistingAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  category: z.string().max(40),
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
      "contractor-format",
      "email-intake",
      "asset-intake",
      "suggest-manuals",
      "permits-suggest",
    ]),
    propertyId: z.string().uuid().optional(),
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
      "contractor-format",
      "email-intake",
      "asset-intake",
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

  // Soft topic reject before burning quota (howto + free-text intakes).
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

  const rate = await enforceRateLimit({
    key: user.id,
    route: "ai-assist",
    supabase,
    skip: body.action === "status",
  });
  if (!rate.allowed) {
    const code: ErrorCode =
      rate.reason === "daily_cap" ? "daily_cap" : "rate_limited";
    return errorResponse(
      429,
      code,
      rate.message ??
        (rate.reason === "daily_cap"
          ? `You've reached today's Ask HomeAsset limit (${rate.dailyCap} asks).`
          : "Ask HomeAsset needs a short pause — try again in a moment."),
      {
        extra: {
          retry_after: rate.retryAfterSeconds,
          daily_cap: rate.dailyCap,
          daily_remaining: rate.dailyRemaining,
          reason: rate.reason,
        },
      },
    );
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
            contractorFormat: true,
            emailIntake: true,
            assetIntake: true,
            suggestManuals: true,
            permitsSuggest: true,
            submitToLedger: false,
            note: "Confirm / approve writes happen on the phone via Supabase RLS — never silently.",
          },
          limits: {
            burstLimit: rate.burstLimit,
            dailyCap: rate.dailyCap,
            note: "Server-enforced per signed-in user. Home help only — not a general coding assistant.",
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
        await assertPropertyOwned(supabase, body.propertyId, user.id);
        const identified = await identifyProduct({
          hint: body.hint,
          filename: body.filename,
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
  const value = String(raw ?? "other").toLowerCase().trim();
  return (CATEGORIES.includes(value as AssetCategory)
    ? value
    : "other") as AssetCategory;
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

function identifyFromCatalog(query: string, mode: AiMode) {
  const product = matchCatalogProducts(query)[0]!;
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
      notes: `Identified via AI assist (${mode}). Confirm before saving.`,
    },
    manuals: manualsFromProduct(product),
  };
}

async function liveRefineHint(
  query: string,
  live: LiveConfig,
): Promise<string | null> {
  if (live.mode !== "live") return null;
  const system =
    `${HOME_SCOPE_SYSTEM_BLURB} ` +
    "You identify home equipment from short user hints. Reply with JSON only: " +
    '{"manufacturer":"...","model":"...","category":"generator|hvac|water_heater|appliance|other","name":"..."}';
  const user = `Identify this home product for a homeowner ledger: ${query}`;
  try {
    const content = await chatJsonText({ live, system, user });
    if (!content) return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return content;
    const parsed = JSON.parse(jsonMatch[0]) as {
      manufacturer?: string;
      model?: string;
      name?: string;
      category?: string;
    };
    return [parsed.manufacturer, parsed.model, parsed.name, parsed.category, query]
      .filter(Boolean)
      .join(" ");
  } catch {
    return null;
  }
}

async function identifyProduct(input: {
  hint?: string | null;
  filename?: string | null;
  live: LiveConfig;
}) {
  const baseQuery =
    [input.hint, input.filename].filter(Boolean).join(" ").trim() || "generator";
  if (input.live.mode === "live") {
    const refined = await liveRefineHint(baseQuery, input.live);
    return identifyFromCatalog(refined ?? baseQuery, "live");
  }
  return identifyFromCatalog(baseQuery, "mock");
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
          "Prefer manufacturer.com / support / literature PDF links over random blogs. " +
          "Reply with JSON only: {documents:[{title,url,kind:\"manual\"|\"spec\"|\"other\",note}]}. " +
          "Include at most 5 high-confidence docs. If unsure of a URL, omit it — never invent domains. " +
          "This is a draft for homeowner approve; do not claim documents are already stored.",
        user: `manufacturer=${input.manufacturer}\nmodel=${input.model}\nFind public manuals and spec sheets.`,
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
          const urlKey = url.toLowerCase();
          if (seenUrls.has(urlKey)) continue;
          seenUrls.add(urlKey);
          const kind =
            doc.kind === "spec" || doc.kind === "manual" || doc.kind === "other"
              ? doc.kind
              : "manual";
          const id = `web-${manuals.length + 1}-${crypto.randomUUID().slice(0, 8)}`;
          const note = String(doc.note ?? "").trim().slice(0, 280);
          const body = [
            `${title}`,
            "",
            `Manufacturer: ${input.manufacturer}`,
            `Model: ${input.model}`,
            `Kind: ${kind}`,
            `Source: ${url}`,
            "",
            note ||
              "Link suggested by Ask HomeAsset from a public web search. Open in a browser to view or download. Not fetched automatically.",
            "",
            "Stored only because you confirmed. HomeAsset does not silently add manuals.",
          ].join("\n");
          manuals.push({
            id,
            title,
            sourceUrl: url,
            preview: note || url,
            kind,
            selectedByDefault: manuals.length === 0,
          });
          manualContents[id] = body;
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

  const product = matchCatalogProducts(text)[0]!;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    mode: "mock" as const,
    draft: {
      summary:
        lines[0]?.slice(0, 160) ||
        `${input.inputKind} notes for ${product.manufacturer} ${product.model}`,
      workPerformed: text || `Installed / serviced ${product.name}.`,
      assetsSuggested: [
        {
          name: product.name,
          category: product.category,
          manufacturer: product.manufacturer,
          model: product.model,
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
  "When an image or PDF is attached, carefully OCR / read ALL visible text: equipment nameplates, data plates, " +
  "HVAC proposals, invoices, receipts, stickers, and purchase screenshots. " +
  "Prefer exact printed values over guesses. Transcribe model and serial character-for-character " +
  "(watch O vs 0, I vs 1, S vs 5). " +
  "Look for labels such as: Manufacturer / Mfr / Brand, Model / Mod / Model No / Catalog No, " +
  "Serial / Ser / S/N / SN, Capacity / Tons / Ton / BTU / MBH / kW / Gallons / SEER / AFUE / HSPF / EER, " +
  "Refrigerant, Voltage / Volts / Phase, Date / DOM / Install. " +
  "Put capacity and other plate facts (tons, BTU, SEER, refrigerant, voltage) into suggestedAsset.notes " +
  "when there is no dedicated field — e.g. \"Capacity: 3 ton / 36000 BTU · SEER 16\". " +
  "identificationLabel should be brand + model when known (e.g. \"Carrier 24ACC636A003\"). " +
  "Reply with JSON only: {intent:\"add\"|\"update\", matchedAssetId:string|null, identificationLabel:string, confidence:number, " +
  "capacity:string|null, " +
  "suggestedAsset:{name,category,manufacturer,model,serial,purchaseDate,installDate,installerVendor,location,notes,warrantyEndDate,warrantyTerm}, " +
  "missingFields:string[]}. " +
  "category must be one of: hvac,roof,appliance,generator,water_heater,plumbing,electrical,kids_gear,vehicle,other. " +
  "matchedAssetId must be one of the provided existing asset ids or null. Prefer update when the same equipment already exists. " +
  "Do not invent serial numbers, model numbers, or capacity. Dates YYYY-MM-DD or null. " +
  "Fill only facts grounded in the input or attached media. missingFields = keys still unknown that a homeowner should confirm.";

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
          } carefully for nameplate / proposal / invoice text)`
        : "mediaAttached=false";
      const content = await chatJsonText({
        live: input.live,
        system: ASSET_INTAKE_SYSTEM,
        user:
          `sourceKind=${input.sourceKind}\n${mediaNote}\n` +
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

  const product = matchCatalogProducts(query || "appliance")[0]!;
  const installDate =
    input.text?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
  const from = input.text?.match(/^From:\s*(.+)$/im)?.[1]
    ?.replace(/<[^>]+>/g, "")
    .replace(/["']/g, "")
    .trim();
  const suggestedAsset: AssetIntakeSuggested = {
    name: product.name,
    category: product.category as AssetCategory,
    manufacturer: product.manufacturer,
    model: product.model,
    serial: null,
    purchaseDate: null,
    installDate,
    installerVendor: from && from.length <= 120 ? from : null,
    location: null,
    notes: hasMedia
      ? `Drafted from ${input.sourceKind} attachment via Ask HomeAsset (mock — live vision unavailable). Confirm before saving.`
      : `Drafted from ${input.sourceKind} via Ask HomeAsset (mock). Confirm before saving.`,
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
    identificationLabel: `${product.manufacturer} ${product.model}`,
    confidence: product.confidence,
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
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
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
          "category must be one of: hvac,roof,appliance,generator,water_heater,plumbing,electrical,kids_gear,vehicle,other. " +
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

  const product = matchCatalogProducts(text)[0]!;
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

  return {
    mode: "mock" as const,
    summary:
      subject?.slice(0, 160) ||
      lines.find((l) => !/^from:|^to:|^sent:|^date:|^subject:/i.test(l))?.slice(
        0,
        160,
      ) ||
      `Contractor work notes for ${product.name}`,
    workPerformed:
      lines
        .filter((l) => !/^from:|^to:|^sent:|^date:|^subject:/i.test(l))
        .join("\n")
        .slice(0, 4000) || text.slice(0, 4000),
    contractorName: from && from.length <= 120 ? from : null,
    workDate: iso,
    assetsSuggested: [
      {
        name: product.name,
        category: product.category,
        manufacturer: product.manufacturer,
        model: product.model,
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

async function answerHowTo(input: {
  supabase: ReturnType<typeof createClient>;
  propertyId: string;
  question: string;
  assetId?: string | null;
  mode: AiMode;
}) {
  const citations: Array<{
    kind: "document" | "asset" | "catalog";
    id: string;
    title: string;
  }> = [];
  const snippets: string[] = [];

  let assetQuery = input.supabase
    .from("assets")
    .select(
      "id, name, category, manufacturer, model, serial, location, install_date, warranty_end_date, notes",
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
