import { config } from "../../config.js";
import {
  getCatalogManual,
  matchCatalogProducts,
  type CatalogProduct,
} from "./catalog.js";
import type { SuggestedAssetDraft, SuggestedManualDraft } from "./drafts.js";
import { HOME_SCOPE_SYSTEM_BLURB } from "./topicGuard.js";
import type { AssetCategory } from "../types.js";

export type AiMode = "mock" | "live";

export type IdentifyResult = {
  mode: AiMode;
  catalogProduct: CatalogProduct;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: SuggestedAssetDraft;
  manuals: Array<SuggestedManualDraft & { content: string }>;
};

export type ContractorFormatResult = {
  mode: AiMode;
  draft: {
    summary: string;
    workPerformed: string;
    assetsSuggested: Array<{
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      notes: string | null;
    }>;
    materials: string[];
    followUps: string[];
  };
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type EmailIntakeFormatResult = {
  mode: AiMode;
  summary: string;
  workPerformed: string;
  contractorName: string | null;
  workDate: string | null;
  assetsSuggested: SuggestedAssetDraft[];
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type AssetIntakeSourceKind = "photo" | "email" | "invoice" | "notes";

export type AssetIntakeSuggestedFields = {
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

export type AssetIntakeMissingField = {
  key: keyof AssetIntakeSuggestedFields;
  label: string;
  reason: string;
};

export type AssetIntakeFormatResult = {
  mode: AiMode;
  intent: "add" | "update";
  matchedAssetId: string | null;
  matchedAssetLabel: string | null;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: AssetIntakeSuggestedFields;
  missingFields: AssetIntakeMissingField[];
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type ExistingAssetLite = {
  id: string;
  name: string;
  category: string;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
};

/** Accept free-text categories; keep short. Legacy slugs still pass through. */
function coerceCategory(value: unknown): AssetCategory {
  if (typeof value !== "string") return "other";
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return trimmed || "other";
}

export function resolveAiMode(): AiMode {
  if (config.aiForceMock) return "mock";
  if (config.aiApiKey) return "live";
  return "mock";
}

function manualsFromProduct(
  product: CatalogProduct,
): Array<SuggestedManualDraft & { content: string }> {
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
): IdentifyResult {
  const raw = (opts?.label ?? "").trim().slice(0, 120);
  const usable =
    raw && !looksLikeGenericFilename(raw) ? raw : "Unidentified asset";
  const notes =
    opts?.notes?.trim() ||
    "HomeAsset could not confidently identify brand or model from what you sent. Enter make and model, then confirm — nothing is saved until you do.";
  const catalogProduct: CatalogProduct = {
    id: UNKNOWN_CATALOG_ID,
    matchTerms: [],
    name: usable,
    category: "other",
    manufacturer: "",
    model: "",
    confidence: 0.15,
    manuals: [],
    howtoNotes: [],
  };
  return {
    mode,
    catalogProduct,
    identificationLabel:
      usable === "Unidentified asset"
        ? "Could not identify — please enter brand and model"
        : usable,
    confidence: 0.15,
    suggestedAsset: {
      name: usable,
      category: "other",
      manufacturer: null,
      model: null,
      serial: null,
      purchaseDate: null,
      notes,
    },
    manuals: [],
  };
}

function identifyFromCatalog(query: string, mode: AiMode): IdentifyResult {
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
      serial: null,
      purchaseDate: null,
      notes: `Identified via AI assist (${mode}). Confirm before saving.`,
    },
    manuals: manualsFromProduct(product),
  };
}

/** Shared guidance: retailer purchase screenshots are valid product-ID sources. */
export const RETAILER_SCREENSHOT_GUIDANCE =
  "Retailer purchase screenshots (Amazon, Best Buy, Home Depot, Walmart, Target, manufacturer stores, order history) " +
  "are VALID product ID sources — not only physical product / nameplate photos. " +
  "When UI chrome is present: OCR the product TITLE, brand/store link (e.g. \"Visit the iRobot Store\"), " +
  "\"Purchased N times\", \"Last purchased <date>\", list/sale PRICE, and category phrases (Robot Vacuum & Mop, etc.). " +
  "Prefer the title/brand text over guessing from the product hero image alone. " +
  "Ignore ads, ratings, cart chrome, and Alexa badges unless they name the product. ";

/**
 * Shared guidance: retailer order emails + invoice/receipt PDFs (purchase inbox).
 * Paste / attach on phone — no Amazon OAuth and no inbound mailbox required for this slice.
 */
export const RETAILER_ORDER_EMAIL_PDF_GUIDANCE =
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

/** Parse YYYY-MM-DD or common retailer date text (e.g. "Oct 6, 2026"). */
export function nullableIsoDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Common retailer display forms → ISO when year is unambiguous.
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
    if (mm) {
      return `${yearToken}-${mm}-${dayToken.padStart(2, "0")}`;
    }
  }
  return null;
}

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

/**
 * Optional OpenAI-compatible chat call. On any failure, falls back without inventing
 * a wrong catalog product so local/CI never hard-depends on secrets.
 */
async function liveIdentifyFromVision(input: {
  query: string;
  imageBase64?: string | null;
  mediaMimeType?: string | null;
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
  if (!config.aiApiKey) return null;
  const hasMedia = Boolean(input.imageBase64 && input.mediaMimeType);
  if (!hasMedia && !input.query.trim()) return null;
  try {
    const userText =
      (hasMedia
        ? "An image is attached (physical product photo OR retailer purchase/order screenshot). " +
          "Identify the ONE home product for the ledger. Read on-screen title/brand/purchase text — do not ignore UI chrome.\n"
        : "No photo — identify only from the hint text; if too vague, mark unsure.\n") +
      `hint/filename: ${input.query.trim() || "(none)"}`;
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: userText },
    ];
    if (hasMedia) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${input.mediaMimeType};base64,${input.imageBase64}`,
        },
      });
    }
    const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.aiApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 0,
        messages: [
          { role: "system", content: SCAN_IDENTIFY_SYSTEM },
          {
            role: "user",
            content: hasMedia ? userContent : userText,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content?.trim();
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
    const category = coerceCategory(parsed.category);
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
    const purchaseDate = nullableIsoDate(parsed.purchaseDate);
    return {
      manufacturer,
      model,
      category,
      name,
      identificationLabel,
      confidence,
      purchaseDate,
      notes,
      unsure,
    };
  } catch {
    return null;
  }
}

/**
 * Identify a product from a photo (preferred) and/or hint.
 * Live mode uses vision when image bytes are present; catalog manuals attach only on a real match.
 */
export async function identifyProduct(input: {
  hint?: string | null;
  filename?: string | null;
  imageBase64?: string | null;
  mediaMimeType?: string | null;
}): Promise<IdentifyResult> {
  const mode = resolveAiMode();
  const filename = (input.filename ?? "").trim();
  const hint = (input.hint ?? "").trim();
  const filenameForQuery =
    filename && !looksLikeGenericFilename(filename) ? filename : "";
  const baseQuery = [hint, filenameForQuery].filter(Boolean).join(" ").trim();
  const hasMedia = Boolean(input.imageBase64?.trim() && input.mediaMimeType);

  if (mode === "live" && (hasMedia || baseQuery)) {
    const vision = await liveIdentifyFromVision({
      query: baseQuery || filename || hint,
      imageBase64: input.imageBase64,
      mediaMimeType: input.mediaMimeType,
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
        mode: "live",
        catalogProduct: catalogHit ?? {
          id: UNKNOWN_CATALOG_ID,
          matchTerms: [],
          name: vision.name,
          category: coerceCategory(vision.category),
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
          category: coerceCategory(vision.category),
          manufacturer: vision.manufacturer,
          model: vision.model,
          serial: null,
          purchaseDate: vision.purchaseDate,
          notes:
            vision.notes ??
            (vision.unsure
              ? "Low confidence — please confirm brand and model before saving."
              : "Identified via HomeAsset from your photo or purchase screenshot. Confirm before saving."),
        },
        manuals,
      };
    }
  }

  if (!baseQuery) {
    // Media present but live vision failed / mock — never invent Generac via "home equipment".
    return unidentifiedScanResult(mode, {
      notes: hasMedia
        ? "HomeAsset could not read brand or model from that photo or purchase screenshot. Enter make and model, then confirm — nothing is saved until you do."
        : undefined,
    });
  }

  return identifyFromCatalog(baseQuery, mode);
}

export function buildManualContent(
  catalogProductId: string,
  manualId: string,
): string | undefined {
  return getCatalogManual(catalogProductId, manualId)?.content;
}

/**
 * Format contractor typed / voice / upload notes into a confirmable packet draft.
 * Never writes to the ledger — EPIC 8 owns submit + homeowner approve.
 */
export async function formatContractorInput(input: {
  inputText: string;
  inputKind: "typed" | "voice" | "upload";
}): Promise<ContractorFormatResult> {
  const mode = resolveAiMode();
  const text = input.inputText.trim();

  if (mode === "live" && config.aiApiKey) {
    try {
      const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.aiApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: config.aiModel,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                `${HOME_SCOPE_SYSTEM_BLURB} ` +
                "Format contractor job notes into JSON with keys: summary, workPerformed, " +
                "assetsSuggested (array of {name,category,manufacturer,model,notes}), materials (string[]), followUps (string[]).",
            },
            { role: "user", content: text },
          ],
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = body.choices?.[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ContractorFormatResult["draft"];
          return {
            mode: "live",
            draft: {
              summary: String(parsed.summary ?? text.slice(0, 160)),
              workPerformed: String(parsed.workPerformed ?? text),
              assetsSuggested: Array.isArray(parsed.assetsSuggested)
                ? parsed.assetsSuggested
                : [],
              materials: Array.isArray(parsed.materials) ? parsed.materials : [],
              followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
            },
            privacy: {
              writes: false,
              confirmRequired: true,
              note: "Draft only. Contractor must confirm before submit; homeowner must approve before official.",
            },
          };
        }
      }
    } catch {
      // fall through to mock
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
    mode: "mock",
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
    privacy: {
      writes: false,
      confirmRequired: true,
      note: "Draft only. Contractor must confirm before submit; homeowner must approve before official.",
    },
  };
}

function extractLikelyDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) return iso[1];
  const us = text.match(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})\b/i,
  );
  if (us?.[1]) return us[1];
  return null;
}

/** Heuristic purchase fields from order-email / receipt text (mock + grounding). */
export function extractPurchaseHintsFromText(text: string): {
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
    purchaseDate = nullableIsoDate(labeled[1]);
  }
  if (!purchaseDate) {
    const likely = extractLikelyDate(raw);
    purchaseDate = likely ? nullableIsoDate(likely) : null;
  }

  const priceMatch = raw.match(/\$\s?(\d{1,5}(?:\.\d{2})?)/);
  const price = priceMatch?.[1] ? `$${priceMatch[1]}` : null;

  return { purchaseDate, price, looksLikeRetailPurchase };
}

function isRetailerMailbox(name: string | null): boolean {
  if (!name) return false;
  return /\b(amazon|best\s*buy|home\s*depot|walmart|target|noreply|no-reply|orders?@|shipment|marketplace)\b/i.test(
    name,
  );
}

function extractContractorName(text: string): string | null {
  const from = text.match(/^From:\s*(.+)$/im);
  if (from?.[1]) {
    const cleaned = from[1]
      .replace(/<[^>]+>/g, "")
      .replace(/["']/g, "")
      .trim();
    if (cleaned.length > 0 && cleaned.length <= 120) return cleaned;
  }
  const company = text.match(
    /\b((?:[A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,3})\s+(?:HVAC|Plumbing|Roofing|Electric|Electrical|Heating|Cooling|Services|LLC|Inc)\.?)\b/,
  );
  return company?.[1]?.trim() ?? null;
}

/**
 * Turn a pasted / forwarded contractor email into a confirmable ledger draft.
 * Never writes — homeowner must approve before assets or notes become official.
 */
export async function formatEmailIntake(input: {
  emailText: string;
}): Promise<EmailIntakeFormatResult> {
  const mode = resolveAiMode();
  const text = input.emailText.trim();
  const privacy = {
    writes: false as const,
    confirmRequired: true as const,
    note: "Draft only from the email you pasted. Nothing is official until you approve.",
  };

  if (mode === "live" && config.aiApiKey) {
    try {
      const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.aiApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: config.aiModel,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                `${HOME_SCOPE_SYSTEM_BLURB} ` +
                "You turn a homeowner's forwarded contractor email into JSON only with keys: " +
                "summary (short), workPerformed, contractorName (string|null), workDate (string|null), " +
                "assetsSuggested (array of {name,category,manufacturer,model,notes}). " +
                "category is a short free-text label the homeowner would recognize (e.g. HVAC, Roof, Dishwasher) — not a fixed enum. " +
                "Do not invent serial numbers. Keep facts grounded in the email.",
            },
            { role: "user", content: text },
          ],
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = body.choices?.[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
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
          const assetsSuggested: SuggestedAssetDraft[] = Array.isArray(
            parsed.assetsSuggested,
          )
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
                  serial: null,
                  notes:
                    a.notes != null
                      ? String(a.notes).trim().slice(0, 2000) || null
                      : "Drafted from emailed contractor notes. Approve before saving.",
                }))
            : [];
          return {
            mode: "live",
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
      }
    } catch {
      // fall through to mock
    }
  }

  const product = matchCatalogProducts(text)[0];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const subject = text.match(/^Subject:\s*(.+)$/im)?.[1]?.trim();
  const contractorName = extractContractorName(text);
  const workDate = extractLikelyDate(text);
  const assetName = product?.name ?? "Home asset from email";

  return {
    mode: "mock",
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
    contractorName,
    workDate,
    assetsSuggested: [
      {
        name: assetName,
        category: product?.category ?? "other",
        manufacturer: product?.manufacturer ?? null,
        model: product?.model ?? null,
        serial: null,
        notes: [
          "Drafted from pasted contractor email (mock AI).",
          contractorName ? `Contractor: ${contractorName}.` : null,
          workDate ? `Date hint: ${workDate}.` : null,
          "Approve before saving to your ledger.",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ],
    privacy,
  };
}

function computeMissingFields(
  asset: AssetIntakeSuggestedFields,
): AssetIntakeMissingField[] {
  const meta: Record<
    keyof AssetIntakeSuggestedFields,
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
  const keys: Array<keyof AssetIntakeSuggestedFields> = [
    "manufacturer",
    "model",
    "serial",
    "installDate",
    "location",
  ];
  const missing: AssetIntakeMissingField[] = [];
  for (const key of keys) {
    const value = asset[key];
    if (value == null || String(value).trim() === "") {
      missing.push({
        key,
        label: meta[key].label,
        reason: meta[key].reason,
      });
    }
  }
  return missing;
}

function matchExistingAsset(
  suggested: Pick<
    AssetIntakeSuggestedFields,
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

const ASSET_INTAKE_LIVE_SYSTEM =
  `${HOME_SCOPE_SYSTEM_BLURB} ` +
  "You extract ONE distinct home asset from homeowner input. " +
  "When an image or PDF is attached: (1) read logos and brand marks first, (2) OCR ALL visible text on nameplates, " +
  "data plates, stickers, invoices, receipts, and purchase screenshots, (3) use product shape/type only as support. " +
  RETAILER_SCREENSHOT_GUIDANCE +
  RETAILER_ORDER_EMAIL_PDF_GUIDANCE +
  "Prefer exact printed values over guesses. Transcribe model and serial character-for-character " +
  "(watch O vs 0, I vs 1, S vs 5). " +
  "Look for Manufacturer/Brand, Model, Serial, Capacity (tons/BTU/kW/gallons), SEER/AFUE/HSPF, refrigerant, voltage, " +
  "Last purchased / order date, and price. " +
  "For sourceKind=email or invoice (including PDF), prioritize order/invoice purchase fields over install fields. " +
  "Put capacity, price (as \"Purchase price: $…\"), and other plate/receipt facts into suggestedAsset.notes when there is no dedicated field. " +
  "purchaseDate from \"Last purchased\", order date, or invoice date when visible (YYYY-MM-DD). " +
  "identificationLabel should be brand + model when known (e.g. \"iRobot Roomba 505X\"). " +
  "Reply with JSON only: {intent:\"add\"|\"update\", matchedAssetId:string|null, identificationLabel:string, confidence:number, " +
  "capacity:string|null, " +
  "suggestedAsset:{name,category,manufacturer,model,serial,purchaseDate,installDate,installerVendor,location,notes,warrantyEndDate,warrantyTerm}, " +
  "missingFields:string[]}. " +
  "category is a short free-text label the homeowner would recognize (e.g. HVAC, Roof, Robot vacuum, Vacuum) — not a fixed enum. " +
  "matchedAssetId must be one of the provided existing asset ids or null. Prefer update when the same equipment already exists. " +
  "Do not invent serial numbers, model numbers, capacity, or an unrelated make/model (never default to Generac/Carrier/Rheem). " +
  "If the logo or product is unclear, leave manufacturer/model null, set confidence ≤0.35, and list missingFields. " +
  "Dates YYYY-MM-DD or null. Fill only facts grounded in the input or attached media.";
/**
 * Multi-source Ask HomeAsset intake → one distinct asset draft (Add or Update).
 * Never writes — homeowner must confirm.
 */
export async function formatAssetIntake(input: {
  sourceKind: AssetIntakeSourceKind;
  text?: string | null;
  hint?: string | null;
  filename?: string | null;
  imageBase64?: string | null;
  mediaMimeType?: string | null;
  existingAssets: ExistingAssetLite[];
}): Promise<AssetIntakeFormatResult> {
  const mode = resolveAiMode();
  const privacy = {
    writes: false as const,
    confirmRequired: true as const,
    note: "Draft only. Nothing is official until you choose Add or Update and confirm.",
  };
  const query = [input.hint, input.filename, input.text]
    .filter(Boolean)
    .join(" ")
    .trim();
  const mediaBase64 = input.imageBase64?.trim() || null;
  const mediaMimeType = input.mediaMimeType?.trim().toLowerCase() || null;
  const hasMedia = Boolean(mediaBase64 && mediaMimeType);

  if (mode === "live" && config.aiApiKey) {
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
        ? `mediaAttached=true mime=${mediaMimeType} ` +
          `(physical product photo, nameplate, invoice/receipt PDF, retailer purchase/order screenshot, OR email PDF export — OCR title, brand, order/last-purchased date, price)`
        : "mediaAttached=false";
      const purchaseHint =
        input.sourceKind === "email" || input.sourceKind === "invoice"
          ? "Treat this as a purchase/order or invoice source when it looks like a retailer order email or receipt. Fill purchaseDate + Purchase price in notes when grounded.\n"
          : "";
      const userText =
        `sourceKind=${input.sourceKind}\n${mediaNote}\n${purchaseHint}` +
        `existingAssets=${existingJson}\ninput:\n${query || "(see attached media)"}`;
      const userContent: Array<Record<string, unknown>> = [
        { type: "text", text: userText },
      ];
      if (hasMedia) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${mediaMimeType};base64,${mediaBase64}`,
          },
        });
      }
      const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.aiApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: config.aiModel,
          temperature: 0,
          messages: [
            { role: "system", content: ASSET_INTAKE_LIVE_SYSTEM },
            {
              role: "user",
              content: hasMedia ? userContent : userText,
            },
          ],
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = body.choices?.[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            intent?: string;
            matchedAssetId?: string | null;
            identificationLabel?: string;
            confidence?: number;
            capacity?: string | null;
            suggestedAsset?: Partial<AssetIntakeSuggestedFields> & {
              category?: string;
            };
            missingFields?: unknown;
          };
          let notes =
            parsed.suggestedAsset?.notes != null
              ? String(parsed.suggestedAsset.notes).trim().slice(0, 2000) || null
              : null;
          const capacity =
            parsed.capacity != null
              ? String(parsed.capacity).trim().slice(0, 160) || null
              : null;
          if (capacity) {
            const capacityLine = `Capacity: ${capacity}`;
            notes = notes
              ? notes.toLowerCase().includes("capacity:")
                ? notes
                : `${notes}\n${capacityLine}`.slice(0, 2000)
              : capacityLine;
          }
          const suggestedAsset: AssetIntakeSuggestedFields = {
            name:
              String(parsed.suggestedAsset?.name ?? "Home asset")
                .trim()
                .slice(0, 120) || "Home asset",
            category: coerceCategory(parsed.suggestedAsset?.category),
            manufacturer:
              parsed.suggestedAsset?.manufacturer != null
                ? String(parsed.suggestedAsset.manufacturer).trim().slice(0, 120) ||
                  null
                : null,
            model:
              parsed.suggestedAsset?.model != null
                ? String(parsed.suggestedAsset.model).trim().slice(0, 120) || null
                : null,
            serial:
              parsed.suggestedAsset?.serial != null
                ? String(parsed.suggestedAsset.serial).trim().slice(0, 120) || null
                : null,
            purchaseDate: nullableIsoDate(
              parsed.suggestedAsset?.purchaseDate,
            ),
            installDate:
              parsed.suggestedAsset?.installDate &&
              /^\d{4}-\d{2}-\d{2}$/.test(
                String(parsed.suggestedAsset.installDate),
              )
                ? String(parsed.suggestedAsset.installDate)
                : null,
            installerVendor:
              parsed.suggestedAsset?.installerVendor != null
                ? String(parsed.suggestedAsset.installerVendor)
                    .trim()
                    .slice(0, 120) || null
                : null,
            location:
              parsed.suggestedAsset?.location != null
                ? String(parsed.suggestedAsset.location).trim().slice(0, 120) ||
                  null
                : null,
            notes,
            warrantyEndDate:
              parsed.suggestedAsset?.warrantyEndDate &&
              /^\d{4}-\d{2}-\d{2}$/.test(
                String(parsed.suggestedAsset.warrantyEndDate),
              )
                ? String(parsed.suggestedAsset.warrantyEndDate)
                : null,
            warrantyTerm:
              parsed.suggestedAsset?.warrantyTerm != null
                ? String(parsed.suggestedAsset.warrantyTerm)
                    .trim()
                    .slice(0, 120) || null
                : null,
          };
          const existingIds = new Set(input.existingAssets.map((a) => a.id));
          let matchedAssetId =
            typeof parsed.matchedAssetId === "string" &&
            existingIds.has(parsed.matchedAssetId)
              ? parsed.matchedAssetId
              : null;
          let intent: "add" | "update" =
            parsed.intent === "update" && matchedAssetId ? "update" : "add";
          if (!matchedAssetId) {
            const auto = matchExistingAsset(
              suggestedAsset,
              input.existingAssets,
            );
            if (auto) {
              matchedAssetId = auto.id;
              intent = "update";
            }
          }
          const matched = matchedAssetId
            ? input.existingAssets.find((a) => a.id === matchedAssetId)
            : undefined;
          return {
            mode: "live",
            intent,
            matchedAssetId,
            matchedAssetLabel: matched
              ? `${matched.name}${matched.manufacturer ? ` · ${matched.manufacturer}` : ""}${matched.model ? ` ${matched.model}` : ""}`
              : null,
            identificationLabel: String(
              parsed.identificationLabel ??
                `${suggestedAsset.manufacturer ?? ""} ${suggestedAsset.model ?? suggestedAsset.name}`.trim(),
            ).slice(0, 200),
            confidence: Math.min(
              1,
              Math.max(0, Number(parsed.confidence ?? 0.7) || 0.7),
            ),
            suggestedAsset,
            missingFields: computeMissingFields(suggestedAsset),
            privacy,
          };
        }
      }
    } catch {
      // fall through to mock
    }
  }

  const product = matchCatalogProducts(query || "appliance")[0];
  const purchaseHints = extractPurchaseHintsFromText(query);
  const likelyDateRaw = extractLikelyDate(query);
  const likelyDateIso = likelyDateRaw ? nullableIsoDate(likelyDateRaw) : null;
  const purchaseDate =
    purchaseHints.purchaseDate ??
    (input.sourceKind === "email" || input.sourceKind === "invoice"
      ? likelyDateIso
      : null);
  const installDate =
    input.sourceKind === "email" || input.sourceKind === "invoice"
      ? null
      : likelyDateIso && /^\d{4}-\d{2}-\d{2}$/.test(likelyDateIso)
        ? likelyDateIso
        : null;
  const rawInstaller = extractContractorName(query);
  const installerVendor =
    purchaseHints.looksLikeRetailPurchase || isRetailerMailbox(rawInstaller)
      ? null
      : rawInstaller;
  let notes: string | null = hasMedia
    ? `Drafted from ${input.sourceKind} attachment via HomeAsset (${mode}). Enter brand and model if blank, then confirm.`
    : purchaseHints.looksLikeRetailPurchase
      ? `Drafted from retailer ${input.sourceKind} via HomeAsset (${mode}). Enter brand and model if blank, then confirm.`
      : `Drafted from ${input.sourceKind} via HomeAsset (${mode}). Enter brand and model if blank, then confirm.`;
  notes = mergePriceIntoNotes(notes, purchaseHints.price);
  const suggestedAsset: AssetIntakeSuggestedFields = {
    name: product?.name ?? "Unidentified asset",
    category: product?.category ?? "other",
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
  return {
    mode,
    intent: matched ? "update" : "add",
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
