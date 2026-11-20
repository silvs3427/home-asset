import { config } from "../../config.js";
import {
  FIXTURE_RECALLS,
  type RecallCatalogEntry,
} from "./catalog.js";

export type RecallSourceMode = "fixture" | "live";

export type LoadedRecallCatalog = {
  mode: RecallSourceMode;
  entries: RecallCatalogEntry[];
  sourceNote: string;
};

/**
 * SaferProducts.gov RestWebServices is the pragmatic free CPSC-style feed.
 * It can be slow or flaky — always fall back to fixtures so CI and demos work.
 */
const CPSC_RECALL_URL =
  "https://www.saferproducts.gov/RestWebServices/Recall?format=json";

type CpscRecallRow = {
  RecallID?: number | string;
  Title?: string;
  Description?: string;
  Manufacturers?: Array<{ Name?: string }>;
  Products?: Array<{ Name?: string; Description?: string; Model?: string }>;
  Hazards?: Array<{ Name?: string }>;
  RecallDate?: string;
  URL?: string;
};

function mapCpscRow(row: CpscRecallRow): RecallCatalogEntry | null {
  const manufacturer =
    row.Manufacturers?.find((m) => m.Name?.trim())?.Name?.trim() ?? null;
  const product = row.Products?.[0];
  const model =
    product?.Model?.trim() ||
    product?.Name?.trim() ||
    product?.Description?.trim() ||
    null;
  if (!manufacturer || !model) return null;

  const externalId = String(row.RecallID ?? "").trim();
  if (!externalId) return null;

  return {
    externalId: `cpsc-live-${externalId}`,
    source: "cpsc_live",
    title: (row.Title ?? `Recall ${externalId}`).trim().slice(0, 240),
    summary: (row.Description ?? row.Title ?? "Public safety recall notice.")
      .trim()
      .slice(0, 2000),
    hazard: row.Hazards?.[0]?.Name?.trim() ?? null,
    manufacturer,
    model: model.slice(0, 160),
    serialPattern: null,
    productType: null,
    recallDate: row.RecallDate?.slice(0, 10) ?? null,
    sourceUrl: row.URL?.trim() || "https://www.cpsc.gov/",
  };
}

async function fetchLiveCpscRecalls(
  signal: AbortSignal,
): Promise<RecallCatalogEntry[]> {
  const res = await fetch(CPSC_RECALL_URL, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`CPSC_HTTP_${res.status}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  const mapped: RecallCatalogEntry[] = [];
  for (const row of data.slice(0, 200)) {
    const entry = mapCpscRow(row as CpscRecallRow);
    if (entry) mapped.push(entry);
  }
  return mapped;
}

/**
 * Load the recall catalog. Default = fixtures (CI-safe).
 * Set RECALL_SOURCE=live to attempt SaferProducts; on failure, fixtures win.
 */
export async function loadRecallCatalog(options?: {
  forceMode?: RecallSourceMode;
  now?: Date;
}): Promise<LoadedRecallCatalog> {
  const preferLive =
    options?.forceMode === "live" ||
    (options?.forceMode !== "fixture" && config.recallSource === "live");

  if (!preferLive) {
    return {
      mode: "fixture",
      entries: FIXTURE_RECALLS,
      sourceNote:
        "Using HomeAsset fixture public-safety catalog (CPSC/NHTSA-style). Live SaferProducts feed is optional via RECALL_SOURCE=live.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.recallLiveTimeoutMs);
  try {
    const live = await fetchLiveCpscRecalls(controller.signal);
    if (live.length === 0) {
      return {
        mode: "fixture",
        entries: FIXTURE_RECALLS,
        sourceNote:
          "Live SaferProducts returned no usable rows; fell back to fixture catalog.",
      };
    }
    // Prefer fixtures first so demo assets still match, then append live.
    const seen = new Set(FIXTURE_RECALLS.map((e) => e.externalId));
    const merged = [...FIXTURE_RECALLS];
    for (const entry of live) {
      if (seen.has(entry.externalId)) continue;
      seen.add(entry.externalId);
      merged.push(entry);
    }
    return {
      mode: "live",
      entries: merged,
      sourceNote:
        "Live SaferProducts.gov feed plus fixture catalog for reliable demos.",
    };
  } catch {
    return {
      mode: "fixture",
      entries: FIXTURE_RECALLS,
      sourceNote:
        "Live SaferProducts feed failed or timed out; using fixture catalog.",
    };
  } finally {
    clearTimeout(timer);
  }
}
