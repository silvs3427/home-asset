import { config } from "../../config.js";
import {
  getCatalogManual,
  matchCatalogProducts,
  type CatalogProduct,
} from "./catalog.js";
import type { SuggestedAssetDraft, SuggestedManualDraft } from "./drafts.js";

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
