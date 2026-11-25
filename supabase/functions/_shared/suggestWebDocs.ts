/**
 * Helpers for suggest-manuals / warranty web search (draft only).
 * Pure functions — no network. Used by ai-assist after Gemini grounding.
 */

export type SuggestedDocKind = "manual" | "spec" | "warranty" | "other";

export type SuggestedWebDoc = {
  title: string;
  url: string;
  kind: SuggestedDocKind;
  note: string;
};

export type WarrantyHint = {
  term: string | null;
  notes: string | null;
};

/** Common product-name → manufacturer aliases (OCR often confuses these). */
const BRAND_ALIASES: Array<{ match: RegExp; prefer: string; also: string[] }> = [
  {
    match: /\broomba\b/i,
    prefer: "iRobot",
    also: ["Roomba", "iRobot"],
  },
  {
    match: /\birobot\b/i,
    prefer: "iRobot",
    also: ["Roomba", "iRobot"],
  },
  {
    match: /\bbravia\b/i,
    prefer: "Sony",
    also: ["Sony", "Bravia"],
  },
  {
    match: /\binstant\s*pot\b/i,
    prefer: "Instant Pot",
    also: ["Instant Brands", "Instant Pot"],
  },
];

export function isDemoOrInvalidHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "example.invalid" ||
    h === "example.com" ||
    h === "example.org" ||
    h.endsWith(".example") ||
    h.endsWith(".invalid") ||
    h.endsWith(".test")
  );
}

export function isUsableHttpsDocUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return false;
    if (isDemoOrInvalidHost(url.hostname)) return false;
    // Google grounding redirects are ok — fetch follows them later.
    return true;
  } catch {
    return false;
  }
}

/**
 * Enrich make/model for search: Roomba → include iRobot, etc.
 * Returns a compact query string for the model + grounding.
 */
export function buildMakeModelSearchQuery(
  manufacturer: string,
  model: string,
): { queryLines: string; brandHints: string[] } {
  const mfr = manufacturer.trim();
  const mdl = model.trim();
  const combined = `${mfr} ${mdl}`;
  const brandHints = new Set<string>();
  if (mfr) brandHints.add(mfr);
  for (const alias of BRAND_ALIASES) {
    if (alias.match.test(combined) || alias.match.test(mfr) || alias.match.test(mdl)) {
      brandHints.add(alias.prefer);
      for (const a of alias.also) brandHints.add(a);
    }
  }
  const hints = [...brandHints];
  const queryLines = [
    `manufacturer=${mfr}`,
    `model=${mdl}`,
    hints.length > 1 ? `brand_aliases=${hints.join(", ")}` : null,
    "Find public owner's manuals, spec sheets, and limited-warranty / warranty PDFs.",
    "Prefer direct manufacturer https URLs ending in .pdf (support / literature / warranty).",
    "Do not invent URLs. Include warranty docs when publicly available for this make/model.",
  ]
    .filter(Boolean)
    .join("\n");
  return { queryLines, brandHints: hints };
}

export function normalizeDocKind(raw: unknown): SuggestedDocKind {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (k === "spec" || k === "specification" || k === "spec sheet") return "spec";
  if (k === "warranty" || k === "limited warranty" || k === "warranty card") {
    return "warranty";
  }
  if (k === "other") return "other";
  return "manual";
}

/** Infer kind from title/url when the model omits it. */
export function inferDocKind(title: string, url: string): SuggestedDocKind {
  const hay = `${title} ${url}`.toLowerCase();
  if (/\bwarrant/.test(hay) || /guarantee/.test(hay)) return "warranty";
  if (/\bspec\b/.test(hay) || /datasheet|data-sheet|specification/.test(hay)) {
    return "spec";
  }
  if (/manual|owner|guide|handbook|instructions/.test(hay)) return "manual";
  return "other";
}

export function extractHttpsUrlsFromText(text: string): string[] {
  const found: string[] = [];
  const re = /https:\/\/[^\s"'<>)\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let url = m[0]!.replace(/[.,;:]+$/, "");
    if (isUsableHttpsDocUrl(url)) found.push(url);
  }
  return found;
}

export function parseSuggestedDocumentsJson(content: string | null | undefined): {
  documents: SuggestedWebDoc[];
  warrantyHint: WarrantyHint | null;
} {
  if (!content?.trim()) {
    return { documents: [], warrantyHint: null };
  }
  // Prefer fenced JSON, then first {...} object.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = fence?.[1]?.trim() || content;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { documents: [], warrantyHint: null };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      documents?: Array<{
        title?: string;
        url?: string;
        kind?: string;
        note?: string;
      }>;
      warrantyHint?: {
        term?: string | null;
        notes?: string | null;
      } | null;
      warranty_hint?: {
        term?: string | null;
        notes?: string | null;
      } | null;
    };
    const documents: SuggestedWebDoc[] = [];
    for (const doc of parsed.documents ?? []) {
      const title = String(doc.title ?? "").trim().slice(0, 160);
      const url = String(doc.url ?? "").trim();
      if (!title || !isUsableHttpsDocUrl(url)) continue;
      const kind = doc.kind
        ? normalizeDocKind(doc.kind)
        : inferDocKind(title, url);
      const note = String(doc.note ?? "").trim().slice(0, 280);
      documents.push({ title, url, kind, note });
    }
    const hintRaw = parsed.warrantyHint ?? parsed.warranty_hint ?? null;
    let warrantyHint: WarrantyHint | null = null;
    if (hintRaw && typeof hintRaw === "object") {
      const term = String(hintRaw.term ?? "").trim().slice(0, 120) || null;
      const notes = String(hintRaw.notes ?? "").trim().slice(0, 400) || null;
      if (term || notes) warrantyHint = { term, notes };
    }
    return { documents, warrantyHint };
  } catch {
    return { documents: [], warrantyHint: null };
  }
}

export type GroundingChunkLike = {
  web?: { uri?: string; title?: string; domain?: string };
};

/** Pull usable https docs from Gemini groundingMetadata.groundingChunks. */
export function harvestGroundingDocs(
  chunks: GroundingChunkLike[] | null | undefined,
): SuggestedWebDoc[] {
  if (!chunks?.length) return [];
  const out: SuggestedWebDoc[] = [];
  for (const chunk of chunks) {
    const url = String(chunk.web?.uri ?? "").trim();
    if (!isUsableHttpsDocUrl(url)) continue;
    const title =
      String(chunk.web?.title ?? "").trim().slice(0, 160) ||
      chunk.web?.domain ||
      "Suggested document";
    const kind = inferDocKind(title, url);
    out.push({
      title,
      url,
      kind,
      note: "Found via web search — saved as a real file only after you confirm.",
    });
  }
  return out;
}

/**
 * Prefer PDFs and manufacturer-ish hosts; demote generic search/retailer pages.
 * Cap at `max`. Dedupes by lowercase URL.
 */
export function mergeAndRankSuggestedDocs(
  batches: SuggestedWebDoc[][],
  max = 8,
): SuggestedWebDoc[] {
  const seen = new Set<string>();
  const all: SuggestedWebDoc[] = [];
  for (const batch of batches) {
    for (const doc of batch) {
      const key = doc.url.toLowerCase();
      if (seen.has(key)) continue;
      if (!isUsableHttpsDocUrl(doc.url)) continue;
      seen.add(key);
      all.push(doc);
    }
  }
  all.sort((a, b) => scoreDoc(b) - scoreDoc(a));
  return all.slice(0, max);
}

function scoreDoc(doc: SuggestedWebDoc): number {
  let score = 0;
  const url = doc.url.toLowerCase();
  const title = doc.title.toLowerCase();
  if (/\.pdf(\?|#|$)/i.test(doc.url)) score += 50;
  if (doc.kind === "manual") score += 20;
  if (doc.kind === "warranty") score += 18;
  if (doc.kind === "spec") score += 15;
  if (/manual|owner|warranty|literature|support|docs?/.test(url)) score += 10;
  if (/manual|owner|warranty|spec/.test(title)) score += 8;
  // Demote noisy hosts
  if (
    /google\.(com|co\.)|bing\.com|duckduckgo\.com|facebook\.com|amazon\.com|ebay\.com|reddit\.com|pinterest\.com|youtube\.com/.test(
      url,
    )
  ) {
    score -= 40;
  }
  if (/search\?|\/search\//.test(url)) score -= 25;
  return score;
}

/** Map suggestion kind → vault doc_type (homeowner-defined labels). */
export function docTypeForKind(kind: SuggestedDocKind): string {
  if (kind === "warranty") return "warranty";
  if (kind === "spec") return "spec";
  return "manual";
}
