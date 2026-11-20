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
  type CatalogProduct,
} from "../_shared/catalog.ts";
import { enforceRateLimitStub } from "../_shared/rateLimitStub.ts";

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

const RequestSchema = z
  .object({
    action: z.enum([
      "status",
      "scan",
      "howto",
      "contractor-format",
      "email-intake",
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
    route: "ai-assist",
    limit: 30,
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
  const live = resolveLiveConfig();

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
            permitsSuggest: true,
            submitToLedger: false,
            note: "Confirm / approve writes happen on the phone via Supabase RLS — never silently.",
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

async function chatJsonText(args: {
  live: LiveConfig;
  system: string;
  user: string;
}): Promise<string | null> {
  if (args.live.provider === "gemini") {
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
          { role: "user", content: args.user },
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
