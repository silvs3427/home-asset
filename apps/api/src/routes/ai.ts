import { Hono, type Context } from "hono";
import { z } from "zod";
import { createAsset, getAssetForProperty, updateAsset } from "../lib/assets.js";
import { createDocument } from "../lib/documents.js";
import { answerHowTo } from "../lib/ai/howto.js";
import {
  consumeScanDraft,
  createScanDraft,
  toPublicScanDraft,
} from "../lib/ai/drafts.js";
import {
  formatContractorInput,
  identifyProduct,
  resolveAiMode,
} from "../lib/ai/provider.js";
import {
  ASSET_CATEGORIES,
  toPublicAsset,
  toPublicDocument,
} from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";
import { assertPropertyOwnedByUser } from "../lib/assets.js";

/**
 * Property-scoped AI assist (EPIC 6).
 * Scan / manuals / how-to never write the official ledger without an explicit confirm.
 */
export const aiRoutes = new Hono<{ Variables: AuthVariables }>();

aiRoutes.use("*", requireAuth);

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
      category: z.enum(ASSET_CATEGORIES as [string, ...string[]]).optional(),
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
        (overrides.category as (typeof ASSET_CATEGORIES)[number]) ??
        draft.suggestedAsset.category,
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
