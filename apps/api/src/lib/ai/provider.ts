import { config } from "../../config.js";
import {
  getCatalogManual,
  matchCatalogProducts,
  type CatalogProduct,
} from "./catalog.js";
import type { SuggestedAssetDraft, SuggestedManualDraft } from "./drafts.js";
import { HOME_SCOPE_SYSTEM_BLURB } from "./topicGuard.js";
import { ASSET_CATEGORIES, type AssetCategory } from "../types.js";

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

function coerceCategory(value: unknown): AssetCategory {
  if (
    typeof value === "string" &&
    (ASSET_CATEGORIES as string[]).includes(value)
  ) {
    return value as AssetCategory;
  }
  return "other";
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

function identifyFromCatalog(query: string, mode: AiMode): IdentifyResult {
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
      serial: null,
      notes: `Identified via AI assist (${mode}). Confirm before saving.`,
    },
    manuals: manualsFromProduct(product),
  };
}

/**
 * Optional OpenAI-compatible chat call. On any failure, falls back to mock catalog
 * so local/CI never hard-depends on secrets.
 */
async function liveIdentifyHint(query: string): Promise<string | null> {
  if (!config.aiApiKey) return null;
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
              "You identify home equipment from short user hints. Reply with JSON only: " +
              '{"manufacturer":"...","model":"...","category":"generator|hvac|water_heater|appliance|other","name":"..."}',
          },
          {
            role: "user",
            content: `Identify this home product for a homeowner ledger: ${query}`,
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

/**
 * Identify a product from a photo filename / hint. Live mode may refine the hint
 * via an API key; catalog still supplies grounded manuals for confirm.
 */
export async function identifyProduct(input: {
  hint?: string | null;
  filename?: string | null;
}): Promise<IdentifyResult> {
  const mode = resolveAiMode();
  const baseQuery = [input.hint, input.filename].filter(Boolean).join(" ").trim() ||
    "generator";

  if (mode === "live") {
    const refined = await liveIdentifyHint(baseQuery);
    return identifyFromCatalog(refined ?? baseQuery, "live");
  }
  return identifyFromCatalog(baseQuery, "mock");
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

  const product = matchCatalogProducts(text)[0]!;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    mode: "mock",
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
                "category must be one of: hvac,roof,appliance,generator,water_heater,plumbing,electrical,kids_gear,vehicle,other. " +
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

  const product = matchCatalogProducts(text)[0]!;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const subject = text.match(/^Subject:\s*(.+)$/im)?.[1]?.trim();
  const contractorName = extractContractorName(text);
  const workDate = extractLikelyDate(text);

  return {
    mode: "mock",
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
    contractorName,
    workDate,
    assetsSuggested: [
      {
        name: product.name,
        category: product.category,
        manufacturer: product.manufacturer,
        model: product.model,
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

/**
 * Multi-source Ask HomeAsset intake → one distinct asset draft (Add or Update).
 * Never writes — homeowner must confirm.
 */
export async function formatAssetIntake(input: {
  sourceKind: AssetIntakeSourceKind;
  text?: string | null;
  hint?: string | null;
  filename?: string | null;
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

  const product = matchCatalogProducts(query || "appliance")[0]!;
  const installDate = extractLikelyDate(query);
  const installerVendor = extractContractorName(query);
  const suggestedAsset: AssetIntakeSuggestedFields = {
    name: product.name,
    category: product.category,
    manufacturer: product.manufacturer,
    model: product.model,
    serial: null,
    purchaseDate: null,
    installDate:
      installDate && /^\d{4}-\d{2}-\d{2}$/.test(installDate)
        ? installDate
        : null,
    installerVendor,
    location: null,
    notes: `Drafted from ${input.sourceKind} via Ask HomeAsset (${mode}). Confirm before saving.`,
    warrantyEndDate: null,
    warrantyTerm: null,
  };
  const matched = matchExistingAsset(suggestedAsset, input.existingAssets);
  return {
    mode,
    intent: matched ? "update" : "add",
    matchedAssetId: matched?.id ?? null,
    matchedAssetLabel: matched?.label ?? null,
    identificationLabel: `${product.manufacturer} ${product.model}`,
    confidence: product.confidence,
    suggestedAsset,
    missingFields: computeMissingFields(suggestedAsset),
    privacy,
  };
}
