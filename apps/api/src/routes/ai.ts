import { Hono, type Context } from "hono";
import { z } from "zod";
import { createAsset, getAssetForProperty, updateAsset } from "../lib/assets.js";
import { createDocument } from "../lib/documents.js";
import { answerHowTo } from "../lib/ai/howto.js";
import {
  consumeAssetIntakeDraft,
  consumeEmailIntakeDraft,
  consumePermitSuggestDraft,
  consumeScanDraft,
  createAssetIntakeDraft,
  createEmailIntakeDraft,
  createPermitSuggestDraft,
  createScanDraft,
  toPublicAssetIntakeDraft,
  toPublicEmailIntakeDraft,
  toPublicPermitSuggestDraft,
  toPublicScanDraft,
} from "../lib/ai/drafts.js";
import { suggestPermitsForAddress } from "../lib/ai/permits.js";
import {
  formatAssetIntake,
  formatContractorInput,
  formatEmailIntake,
  identifyProduct,
  resolveAiMode,
} from "../lib/ai/provider.js";
import { consumeAiAssistQuota } from "../lib/ai/rateLimit.js";
import { assessAskHomeAssetTopic } from "../lib/ai/topicGuard.js";
import { getPropertyForUser } from "../lib/properties.js";
import { normalizeLabelValue } from "../lib/propertyLabels.js";
import {
  formatPropertyAddress,
  toPublicAsset,
  toPublicDocument,
} from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";
import {
  assertPropertyOwnedByUser,
  listAssetsForProperty,
} from "../lib/assets.js";

/** Open category — homeowner-defined free text. */
const openCategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((v) => normalizeLabelValue(v));

/**
 * Property-scoped AI assist (EPIC 6).
 * Scan / manuals / how-to never write the official ledger without an explicit confirm.
 */
export const aiRoutes = new Hono<{ Variables: AuthVariables }>();

aiRoutes.use("*", requireAuth);

function rateLimitOrNull(c: Context<{ Variables: AuthVariables }>) {
  const claims = c.get("claims");
  const rate = consumeAiAssistQuota(claims.sub);
  if (rate.allowed) return null;
  return c.json(
    {
      error: "rate_limited",
      code: rate.reason ?? "rate_limited",
      message: rate.message,
      retry_after: rate.retryAfterSeconds,
      daily_cap: rate.dailyCap,
      daily_remaining: rate.dailyRemaining,
    },
    429,
  );
}

function mapAiError(err: unknown, c: Context<{ Variables: AuthVariables }>) {
  if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  if (err instanceof Error && err.message === "ASSET_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  if (err instanceof Error && err.message === "DRAFT_NOT_FOUND") {
    return c.json(
      {
        error: "not_found",
        message: "That AI draft expired or was already used. Scan again.",
      },
      404,
    );
  }
  throw err;
}

const optionalUuid = z.string().uuid().optional().nullable();

/**
 * POST /properties/:propertyId/ai/scan
 * Multipart or JSON. Returns a draft only — no ledger writes.
 */
aiRoutes.post("/scan", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const limited = rateLimitOrNull(c);
  if (limited) return limited;

  try {
    assertPropertyOwnedByUser(propertyId, claims.sub);

    const contentType = c.req.header("content-type") ?? "";
    let hint: string | null = null;
    let filename: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.parseBody({ all: true });
      const hintField = form.hint;
      if (typeof hintField === "string") hint = hintField;
      const file = form.photo ?? form.file;
      if (file && typeof file === "object" && "name" in file) {
        filename = String((file as File).name || "photo.jpg");
        // Bytes are intentionally not persisted on scan — confirm owns writes.
      }
    } else {
      const body = await c.req.json().catch(() => null);
      const parsed = z
        .object({
          hint: z.string().trim().max(500).optional().nullable(),
          filename: z.string().trim().max(200).optional().nullable(),
        })
        .safeParse(body ?? {});
      if (!parsed.success) {
        return c.json(
          {
            error: "invalid_input",
            message: "Provide an optional hint or photo to scan.",
          },
          400,
        );
      }
      hint = parsed.data.hint ?? null;
      filename = parsed.data.filename ?? null;
    }

    const identified = await identifyProduct({ hint, filename });
    const draft = createScanDraft({
      userId: claims.sub,
      propertyId,
      mode: identified.mode,
      catalogProductId: identified.catalogProduct.id,
      identificationLabel: identified.identificationLabel,
      confidence: identified.confidence,
      suggestedAsset: identified.suggestedAsset,
      manuals: identified.manuals,
    });

    return c.json({
      draft: toPublicScanDraft(draft),
      aiMode: resolveAiMode(),
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

const confirmSchema = z.object({
  draftId: z.string().uuid(),
  /** Create a new asset from the draft (default true when assetId omitted). */
  createAsset: z.boolean().optional(),
  /** Enrich an existing owned asset instead of creating. */
  assetId: optionalUuid,
  selectedManualIds: z.array(z.string().min(1).max(80)).max(20).default([]),
  assetOverrides: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      category: openCategorySchema.optional(),
      manufacturer: z.string().trim().max(120).optional().nullable(),
      model: z.string().trim().max(120).optional().nullable(),
      serial: z.string().trim().max(120).optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    })
    .optional(),
});

/**
 * POST /properties/:propertyId/ai/confirm-scan
 * Explicit homeowner confirmation — only place that writes assets/docs from AI.
 */
aiRoutes.post("/confirm-scan", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Confirm with draftId and the manuals you want to keep. Nothing is saved without this step.",
      },
      400,
    );
  }

  try {
    const draft = consumeScanDraft(
      parsed.data.draftId,
      claims.sub,
      propertyId,
    );
    if (!draft) throw new Error("DRAFT_NOT_FOUND");

    const overrides = parsed.data.assetOverrides ?? {};
    const base = {
      name: overrides.name ?? draft.suggestedAsset.name,
      category:
        overrides.category ?? draft.suggestedAsset.category,
      manufacturer:
        overrides.manufacturer !== undefined
          ? overrides.manufacturer
          : draft.suggestedAsset.manufacturer,
      model:
        overrides.model !== undefined
          ? overrides.model
          : draft.suggestedAsset.model,
      serial:
        overrides.serial !== undefined
          ? overrides.serial
          : draft.suggestedAsset.serial,
      notes:
        overrides.notes !== undefined
          ? overrides.notes
          : draft.suggestedAsset.notes,
    };

    let asset;
    if (parsed.data.assetId) {
      const existing = getAssetForProperty(
        parsed.data.assetId,
        propertyId,
        claims.sub,
      );
      if (!existing) throw new Error("ASSET_NOT_FOUND");
      asset = updateAsset(parsed.data.assetId, propertyId, claims.sub, {
        name: base.name,
        category: base.category,
        manufacturer: base.manufacturer,
        model: base.model,
        serial: base.serial,
        notes: base.notes,
      });
    } else if (parsed.data.createAsset === false) {
      return c.json(
        {
          error: "invalid_input",
          message:
            "Provide assetId to enrich an existing asset, or leave createAsset enabled to add a new one.",
        },
        400,
      );
    } else {
      asset = createAsset(propertyId, claims.sub, {
        ...base,
        provenance: "homeowner",
      });
    }

    const selected = new Set(parsed.data.selectedManualIds);
    const manualsToStore = draft.manuals.filter((m) => selected.has(m.id));
    const documents = await Promise.all(
      manualsToStore.map((manual) => {
        const bytes = Buffer.from(manual.content, "utf8");
        return createDocument(propertyId, claims.sub, {
          title: manual.title,
          docType: "manual",
          documentDate: null,
          source: "ai_fetched",
          assetId: asset.id,
          mimeType: "text/plain",
          originalFilename: `${manual.id}.txt`,
          bytes,
        });
      }),
    );

    return c.json({
      asset: toPublicAsset(asset),
      documents: documents.map(toPublicDocument),
      storedManualCount: documents.length,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you confirmed. AI never auto-adds to your ledger.",
      },
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

const howtoSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  assetId: optionalUuid,
});

/**
 * POST /properties/:propertyId/ai/howto
 * Grounded Q&A — read-only; never writes.
 */
aiRoutes.post("/howto", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = howtoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Ask a short how-to question (and optionally pick an asset).",
      },
      400,
    );
  }

  const topic = assessAskHomeAssetTopic(parsed.data.question);
  if (!topic.allowed) {
    return c.json({
      mode: resolveAiMode(),
      grounded: false,
      refused: true,
      code: topic.code,
      answer: topic.message,
      citations: [],
      privacy: {
        writes: false as const,
        note: "How-to answers never change your ledger.",
      },
    });
  }

  const limited = rateLimitOrNull(c);
  if (limited) return limited;

  try {
    const result = await answerHowTo({
      propertyId,
      ownerUserId: claims.sub,
      question: parsed.data.question,
      assetId: parsed.data.assetId,
    });
    return c.json(result);
  } catch (err) {
    return mapAiError(err, c);
  }
});

const emailIntakeSchema = z.object({
  emailText: z.string().trim().min(20).max(20000),
});

/**
 * POST /properties/:propertyId/ai/email-intake
 * Paste / forward content → AI draft summary. No ledger writes.
 */
aiRoutes.post("/email-intake", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = emailIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Paste the contractor email (or forward text). It must be at least a short paragraph.",
      },
      400,
    );
  }

  const topic = assessAskHomeAssetTopic(parsed.data.emailText);
  if (!topic.allowed) {
    return c.json(
      {
        error: "off_topic",
        code: topic.code,
        message: topic.message,
      },
      422,
    );
  }

  const limited = rateLimitOrNull(c);
  if (limited) return limited;

  try {
    assertPropertyOwnedByUser(propertyId, claims.sub);
    const formatted = await formatEmailIntake({
      emailText: parsed.data.emailText,
    });
    const draft = createEmailIntakeDraft({
      userId: claims.sub,
      propertyId,
      mode: formatted.mode,
      summary: formatted.summary,
      workPerformed: formatted.workPerformed,
      contractorName: formatted.contractorName,
      workDate: formatted.workDate,
      assetsSuggested: formatted.assetsSuggested,
      rawEmailText: parsed.data.emailText,
    });
    return c.json({
      draft: toPublicEmailIntakeDraft(draft),
      aiMode: resolveAiMode(),
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

const confirmEmailSchema = z.object({
  draftId: z.string().uuid(),
  /** Indices into draft.assetsSuggested the homeowner wants to keep. */
  selectedAssetIndexes: z.array(z.number().int().min(0).max(20)).max(20),
  /** Store a home-level note with the AI summary (default true). */
  storeSummaryDocument: z.boolean().optional().default(true),
  assetOverrides: z
    .array(
      z.object({
        index: z.number().int().min(0).max(20),
        name: z.string().trim().min(1).max(120).optional(),
        category: openCategorySchema.optional(),
        manufacturer: z.string().trim().max(120).optional().nullable(),
        model: z.string().trim().max(120).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .max(20)
    .optional(),
});

/**
 * POST /properties/:propertyId/ai/confirm-email-intake
 * Explicit homeowner approval — only place email intake writes the ledger.
 */
aiRoutes.post("/confirm-email-intake", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = confirmEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Approve with draftId and the suggested assets you want to keep. Nothing is saved without this step.",
      },
      400,
    );
  }

  try {
    const draft = consumeEmailIntakeDraft(
      parsed.data.draftId,
      claims.sub,
      propertyId,
    );
    if (!draft) throw new Error("DRAFT_NOT_FOUND");

    const overrideByIndex = new Map(
      (parsed.data.assetOverrides ?? []).map((row) => [row.index, row]),
    );
    const selected = [...new Set(parsed.data.selectedAssetIndexes)].sort(
      (a, b) => a - b,
    );
    const assets = [];
    for (const index of selected) {
      const base = draft.assetsSuggested[index];
      if (!base) continue;
      const overrides = overrideByIndex.get(index);
      assets.push(
        createAsset(propertyId, claims.sub, {
          name: overrides?.name ?? base.name,
          category:
            overrides?.category ??
            base.category,
          manufacturer:
            overrides?.manufacturer !== undefined
              ? overrides.manufacturer
              : base.manufacturer,
          model:
            overrides?.model !== undefined ? overrides.model : base.model,
          serial: base.serial,
          installerVendor: draft.contractorName,
          installDate:
            draft.workDate && /^\d{4}-\d{2}-\d{2}$/.test(draft.workDate)
              ? draft.workDate
              : null,
          notes:
            overrides?.notes !== undefined ? overrides.notes : base.notes,
          provenance: "homeowner",
        }),
      );
    }

    let summaryDocument = null;
    if (parsed.data.storeSummaryDocument) {
      const bodyText = [
        "HomeAsset email intake summary",
        "",
        `Summary: ${draft.summary}`,
        "",
        "Work performed:",
        draft.workPerformed,
        "",
        draft.contractorName
          ? `Contractor: ${draft.contractorName}`
          : "Contractor: (not detected)",
        draft.workDate ? `Date hint: ${draft.workDate}` : null,
        "",
        "---",
        "Original pasted email (homeowner-provided):",
        draft.rawEmailText,
      ]
        .filter((line) => line != null)
        .join("\n");
      const docDate =
        draft.workDate && /^\d{4}-\d{2}-\d{2}$/.test(draft.workDate)
          ? draft.workDate
          : null;
      summaryDocument = await createDocument(propertyId, claims.sub, {
        title: `Email intake: ${draft.summary.slice(0, 80)}`,
        docType: "install_paperwork",
        documentDate: docDate,
        source: "ai_fetched",
        assetId: assets[0]?.id ?? null,
        mimeType: "text/plain",
        originalFilename: "email-intake-summary.txt",
        bytes: Buffer.from(bodyText, "utf8"),
      });
    }

    return c.json({
      assets: assets.map(toPublicAsset),
      summaryDocument: summaryDocument
        ? toPublicDocument(summaryDocument)
        : null,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you approved. Pasted emails never auto-add to your ledger.",
      },
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

const assetIntakeSchema = z.object({
  sourceKind: z.enum(["photo", "email", "invoice", "notes"]),
  text: z.string().trim().max(20000).optional().nullable(),
  hint: z.string().trim().max(500).optional().nullable(),
  filename: z.string().trim().max(200).optional().nullable(),
  imageBase64: z.string().max(3_500_000).optional().nullable(),
  mediaMimeType: z.string().trim().max(80).optional().nullable(),
});

/**
 * POST /properties/:propertyId/ai/asset-intake
 * Photo / email / invoice / notes → one-asset Add or Update draft. No ledger writes.
 */
aiRoutes.post("/asset-intake", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = assetIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Provide sourceKind (photo|email|invoice|notes) plus a photo filename, hint, or pasted text.",
      },
      400,
    );
  }

  const text = parsed.data.text?.trim() || null;
  const hint = parsed.data.hint?.trim() || null;
  const filename = parsed.data.filename?.trim() || null;
  const imageBase64 = parsed.data.imageBase64?.trim() || null;
  const mediaMimeType = parsed.data.mediaMimeType?.trim() || null;
  if (!text && !hint && !filename && !imageBase64) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Provide a photo/PDF attachment, filename, hint, or pasted text.",
      },
      400,
    );
  }

  const topic = assessAskHomeAssetTopic([hint, text].filter(Boolean).join("\n"));
  if (!topic.allowed) {
    return c.json(
      {
        error: "off_topic",
        code: topic.code,
        message: topic.message,
      },
      422,
    );
  }

  const limited = rateLimitOrNull(c);
  if (limited) return limited;

  try {
    assertPropertyOwnedByUser(propertyId, claims.sub);
    const existing = listAssetsForProperty(propertyId, claims.sub).map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      manufacturer: a.manufacturer,
      model: a.model,
      serial: a.serial,
    }));
    const formatted = await formatAssetIntake({
      sourceKind: parsed.data.sourceKind,
      text,
      hint,
      filename,
      imageBase64,
      mediaMimeType,
      existingAssets: existing,
    });
    const draft = createAssetIntakeDraft({
      userId: claims.sub,
      propertyId,
      mode: formatted.mode,
      sourceKind: parsed.data.sourceKind,
      intent: formatted.intent,
      matchedAssetId: formatted.matchedAssetId,
      matchedAssetLabel: formatted.matchedAssetLabel,
      identificationLabel: formatted.identificationLabel,
      confidence: formatted.confidence,
      suggestedAsset: formatted.suggestedAsset,
      missingFields: formatted.missingFields,
    });
    return c.json({
      draft: toPublicAssetIntakeDraft(draft),
      aiMode: resolveAiMode(),
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

const confirmAssetIntakeSchema = z.object({
  draftId: z.string().uuid(),
  intent: z.enum(["add", "update"]),
  matchedAssetId: z.string().uuid().optional().nullable(),
  assetOverrides: z.object({
    name: z.string().trim().min(1).max(120),
    category: openCategorySchema,
    manufacturer: z.string().trim().max(120).optional().nullable(),
    model: z.string().trim().max(120).optional().nullable(),
    serial: z.string().trim().max(120).optional().nullable(),
    purchaseDate: z.string().trim().max(40).optional().nullable(),
    installDate: z.string().trim().max(40).optional().nullable(),
    installerVendor: z.string().trim().max(120).optional().nullable(),
    location: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    warrantyEndDate: z.string().trim().max(40).optional().nullable(),
    warrantyTerm: z.string().trim().max(120).optional().nullable(),
  }),
});

/**
 * POST /properties/:propertyId/ai/confirm-asset-intake
 * Explicit homeowner approval — only place multi-source asset intake writes.
 */
aiRoutes.post("/confirm-asset-intake", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = confirmAssetIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Confirm with draftId, intent (add|update), and assetOverrides. Nothing is saved without this step.",
      },
      400,
    );
  }

  try {
    const draft = consumeAssetIntakeDraft(
      parsed.data.draftId,
      claims.sub,
      propertyId,
    );
    if (!draft) throw new Error("DRAFT_NOT_FOUND");

    const overrides = parsed.data.assetOverrides;
    const payload = {
      name: overrides.name,
      category: overrides.category,
      manufacturer: overrides.manufacturer ?? null,
      model: overrides.model ?? null,
      serial: overrides.serial ?? null,
      purchaseDate: overrides.purchaseDate ?? null,
      installDate: overrides.installDate ?? null,
      installerVendor: overrides.installerVendor ?? null,
      location: overrides.location ?? null,
      notes: overrides.notes ?? null,
      warrantyEndDate: overrides.warrantyEndDate ?? null,
      warrantyTerm: overrides.warrantyTerm ?? null,
      provenance: "homeowner" as const,
    };

    const matchedId =
      parsed.data.matchedAssetId ?? draft.matchedAssetId ?? null;
    if (parsed.data.intent === "update" && matchedId) {
      const asset = updateAsset(matchedId, propertyId, claims.sub, payload);
      return c.json({
        asset: toPublicAsset(asset),
        intent: "update" as const,
        privacy: {
          writes: true,
          confirmedByUser: true,
          note: "Updated only because you confirmed. Ask HomeAsset never auto-writes your ledger.",
        },
      });
    }

    const asset = createAsset(propertyId, claims.sub, payload);
    return c.json({
      asset: toPublicAsset(asset),
      intent: "add" as const,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you confirmed. Ask HomeAsset never auto-writes your ledger.",
      },
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

/**
 * POST /properties/:propertyId/ai/permits/suggest
 * Public permit-style hints for this home → suggestions only.
 */
aiRoutes.post("/permits/suggest", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const limited = rateLimitOrNull(c);
  if (limited) return limited;

  try {
    const property = getPropertyForUser(propertyId, claims.sub);
    if (!property) throw new Error("PROPERTY_NOT_FOUND");

    const suggested = await suggestPermitsForAddress({
      addressLine1: property.addressLine1,
      addressLine2: property.addressLine2,
      city: property.city,
      region: property.region,
      postalCode: property.postalCode,
      country: property.country,
    });

    const draft = createPermitSuggestDraft({
      userId: claims.sub,
      propertyId,
      mode: suggested.mode,
      addressQuery: suggested.addressQuery || formatPropertyAddress(property),
      sourceNote: suggested.sourceNote,
      permits: suggested.permits,
    });

    return c.json({
      draft: toPublicPermitSuggestDraft(draft),
      sourceMode: suggested.mode,
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

const confirmPermitsSchema = z.object({
  draftId: z.string().uuid(),
  /** Permit hint ids the homeowner wants to turn into assets. */
  selectedPermitIds: z.array(z.string().min(1).max(80)).max(20),
  assetOverrides: z
    .array(
      z.object({
        permitId: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(120).optional(),
        category: openCategorySchema.optional(),
        notes: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .max(20)
    .optional(),
});

/**
 * POST /properties/:propertyId/ai/permits/confirm
 * Explicit homeowner approval — only place permit suggestions write assets.
 */
aiRoutes.post("/permits/confirm", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = confirmPermitsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Approve with draftId and the permit suggestions you want to keep. Nothing is saved without this step.",
      },
      400,
    );
  }

  try {
    const draft = consumePermitSuggestDraft(
      parsed.data.draftId,
      claims.sub,
      propertyId,
    );
    if (!draft) throw new Error("DRAFT_NOT_FOUND");

    const selected = new Set(parsed.data.selectedPermitIds);
    const overrideById = new Map(
      (parsed.data.assetOverrides ?? []).map((row) => [row.permitId, row]),
    );
    const assets = [];
    for (const permit of draft.permits) {
      if (!selected.has(permit.id)) continue;
      const base = permit.suggestedAsset;
      const overrides = overrideById.get(permit.id);
      assets.push(
        createAsset(propertyId, claims.sub, {
          name: overrides?.name ?? base.name,
          category:
            overrides?.category ??
            base.category,
          manufacturer: base.manufacturer,
          model: base.model,
          serial: base.serial,
          installDate: permit.filedOrClosedOn,
          notes:
            overrides?.notes !== undefined
              ? overrides.notes
              : [
                  base.notes,
                  `Public permit: ${permit.title} (${permit.status}).`,
                  permit.sourceLabel,
                ]
                  .filter(Boolean)
                  .join(" "),
          provenance: "homeowner",
        }),
      );
    }

    return c.json({
      assets: assets.map(toPublicAsset),
      sourceMode: draft.mode,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you approved. Public permit hints never auto-add.",
      },
    });
  } catch (err) {
    return mapAiError(err, c);
  }
});

/**
 * Account-level contractor format hook (link path).
 * Draft only — submit + homeowner approve land in EPIC 8.
 */
export const contractorAiRoutes = new Hono<{ Variables: AuthVariables }>();

contractorAiRoutes.use("*", requireAuth);

const formatSchema = z.object({
  inputText: z.string().trim().min(1).max(8000),
  inputKind: z.enum(["typed", "voice", "upload"]).default("typed"),
});

contractorAiRoutes.post("/format", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = formatSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Paste typed notes, voice transcript, or upload text to format.",
      },
      400,
    );
  }

  const topic = assessAskHomeAssetTopic(parsed.data.inputText);
  if (!topic.allowed) {
    return c.json(
      {
        error: "off_topic",
        code: topic.code,
        message: topic.message,
      },
      422,
    );
  }

  const limited = rateLimitOrNull(c);
  if (limited) return limited;

  const result = await formatContractorInput(parsed.data);
  return c.json(result);
});

contractorAiRoutes.get("/status", (c) => {
  return c.json({
    aiMode: resolveAiMode(),
    capabilities: {
      formatTyped: true,
      formatVoiceTranscript: true,
      formatUploadText: true,
      submitToLedger: false,
      note: "Format → confirm hooks are ready; full submit / approve is EPIC 8.",
    },
    privacy: {
      writes: false,
      confirmRequired: true,
      homeownerApproveRequired: true,
    },
  });
});
