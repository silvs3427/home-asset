/**
 * Resolve a suggested manual URL to real file bytes (prefer PDF).
 * Used on homeowner approve — never store HTML interstitial pages as manuals.
 * SSRF-hardened: https only, no private/link-local hosts.
 *
 * Manufacturer CDNs often hotlink-block bare bots (403). We send a browser-like
 * User-Agent + Referer, retry a few referer strategies, then try alternate
 * grounding URLs from the same suggest draft.
 */

/** Stay under Storage bucket limit (15 MiB) with headroom. */
export const MAX_MANUAL_BYTES = 14 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_HTML_PDF_CANDIDATES = 3;
const MAX_ALTERNATE_URLS = 6;

/** Browser-like UA — bare custom agents are commonly hotlink-blocked (403). */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const PDF_MAGIC = new TextEncoder().encode("%PDF");

export type FetchManualSuccess = {
  ok: true;
  mimeType: "application/pdf";
  filename: string;
  bytes: Uint8Array;
  finalUrl: string;
  byteSize: number;
};

export type FetchManualFailure = {
  ok: false;
  reason: string;
  code:
    | "invalid_url"
    | "blocked_host"
    | "fetch_failed"
    | "hotlink_blocked"
    | "not_a_file"
    | "too_large"
    | "html_no_pdf";
};

export type FetchManualResult = FetchManualSuccess | FetchManualFailure;

/** True when bytes look like a PDF (%PDF magic). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".localhost")
  ) {
    return true;
  }
  // IPv4 private / link-local / CGNAT
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  // IPv6 unique-local / link-local
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  return false;
}

/** Reject placeholder / demo catalog hosts that are never real PDFs. */
export function isUnfetchableManualHost(hostname: string): boolean {
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

export function parseSafeHttpsUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; reason: string; code: FetchManualFailure["code"] } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) {
    return {
      ok: false,
      reason: "That document link is missing or too long.",
      code: "invalid_url",
    };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "That document link is not a valid web address.",
      code: "invalid_url",
    };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "Only secure https links can be downloaded into your home vault.",
      code: "invalid_url",
    };
  }
  if (isPrivateOrLocalHost(url.hostname) || isUnfetchableManualHost(url.hostname)) {
    return {
      ok: false,
      reason:
        "That source is not a public manufacturer file HomeAsset can download.",
      code: "blocked_host",
    };
  }
  return { ok: true, url };
}

/** HTTP statuses that usually mean hotlink / bot / geo block — not "missing file". */
export function isHotlinkHttpStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 451;
}

export function reasonForHttpStatus(status: number): {
  reason: string;
  code: FetchManualFailure["code"];
} {
  if (isHotlinkHttpStatus(status)) {
    return {
      code: "hotlink_blocked",
      reason:
        "The manufacturer site blocked the download (hotlink / access rule). " +
        "HomeAsset tried browser-style headers and any alternate links from the same search. " +
        "Nothing was stored — open the link on your phone or upload the PDF on the asset.",
    };
  }
  if (status === 404) {
    return {
      code: "fetch_failed",
      reason:
        "That file link is gone (HTTP 404). Try another suggestion or upload the PDF yourself.",
    };
  }
  if (status === 429) {
    return {
      code: "fetch_failed",
      reason:
        "The manufacturer site rate-limited the download. Wait a moment and try again, or upload the PDF yourself.",
    };
  }
  return {
    code: "fetch_failed",
    reason: `The source returned HTTP ${status} — the file was not available to download.`,
  };
}

/**
 * Referer strategies: many CDNs require a same-site Referer; some reject bots
 * with none; a few allow Google search referrals.
 */
export function buildRefererStrategies(url: URL): Array<string | null> {
  const origin = url.origin;
  const parentPath = url.pathname.replace(/\/[^/]*$/, "/") || "/";
  const parent = `${origin}${parentPath}`;
  const strategies: Array<string | null> = [
    `${origin}/`,
    parent,
    null,
    "https://www.google.com/",
  ];
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const out: Array<string | null> = [];
  for (const s of strategies) {
    const key = s === null ? "__null__" : s;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function filenameFromUrl(url: URL, fallback: string): string {
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const decoded = decodeURIComponent(last).replace(/[^\w.\-()+ ]+/g, "_");
  if (/\.pdf$/i.test(decoded)) return decoded.slice(0, 180);
  const base = (fallback || "manual").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
  return `${base || "manual"}.pdf`;
}

function contentTypeIsPdf(header: string | null): boolean {
  if (!header) return false;
  const lower = header.toLowerCase();
  return (
    lower.includes("application/pdf") ||
    lower.includes("application/x-pdf") ||
    lower.includes("application/acrobat")
  );
}

function contentTypeIsHtml(header: string | null): boolean {
  if (!header) return false;
  return header.toLowerCase().includes("text/html");
}

function browserHeaders(
  target: URL,
  referer: string | null,
): Record<string, string> {
  let fetchSite = "none";
  if (referer) {
    try {
      const refHost = new URL(referer).hostname.toLowerCase();
      fetchSite =
        refHost === target.hostname.toLowerCase() ? "same-origin" : "cross-site";
    } catch {
      fetchSite = "cross-site";
    }
  }
  const headers: Record<string, string> = {
    Accept:
      "application/pdf,application/octet-stream;q=0.9,text/html;q=0.8,*/*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": BROWSER_UA,
    // Hint we are navigating for a document (not a silent scrapers-only profile).
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": fetchSite,
  };
  if (referer) headers.Referer = referer;
  return headers;
}

async function fetchBytesOnce(
  url: URL,
  referer: string | null,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string | null; finalUrl: string }
  | { ok: false; reason: string; code: FetchManualFailure["code"]; status?: number }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: browserHeaders(url, referer),
    });
    if (!response.ok) {
      const mapped = reasonForHttpStatus(response.status);
      return {
        ok: false,
        reason: mapped.reason,
        code: mapped.code,
        status: response.status,
      };
    }
    // Re-check final URL after redirects (SSRF).
    let finalUrl = url.toString();
    try {
      if (response.url) {
        const finalParsed = parseSafeHttpsUrl(response.url);
        if (!finalParsed.ok) {
          return {
            ok: false,
            reason: finalParsed.reason,
            code: finalParsed.code,
          };
        }
        finalUrl = finalParsed.url.toString();
      }
    } catch {
      // keep original
    }
    const lenHeader = response.headers.get("content-length");
    if (lenHeader) {
      const n = Number(lenHeader);
      if (Number.isFinite(n) && n > MAX_MANUAL_BYTES) {
        return {
          ok: false,
          reason:
            "That file is larger than HomeAsset can store from a web link right now. Try saving a smaller PDF from the manufacturer site, then upload it on the asset.",
          code: "too_large",
        };
      }
    }
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > MAX_MANUAL_BYTES) {
      return {
        ok: false,
        reason:
          "That file is larger than HomeAsset can store from a web link right now. Try saving a smaller PDF from the manufacturer site, then upload it on the asset.",
        code: "too_large",
      };
    }
    if (buf.byteLength === 0) {
      return {
        ok: false,
        reason: "The source returned an empty file.",
        code: "not_a_file",
      };
    }
    return {
      ok: true,
      bytes: buf,
      contentType: response.headers.get("content-type"),
      finalUrl,
    };
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ok: false,
      reason: aborted
        ? "Timed out reaching that document source."
        : "Could not reach that document source.",
      code: "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch bytes with referer retries when the CDN hotlink-blocks the first attempt.
 */
async function fetchBytes(
  url: URL,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string | null; finalUrl: string }
  | { ok: false; reason: string; code: FetchManualFailure["code"] }
> {
  const strategies = buildRefererStrategies(url);
  let lastFail: {
    reason: string;
    code: FetchManualFailure["code"];
  } | null = null;

  for (const referer of strategies) {
    const result = await fetchBytesOnce(url, referer);
    if (result.ok) return result;
    lastFail = { reason: result.reason, code: result.code };
    // Only rotate referer strategies on hotlink-ish blocks.
    if (result.code !== "hotlink_blocked") {
      return { ok: false, reason: result.reason, code: result.code };
    }
  }

  return (
    lastFail ?? {
      ok: false,
      reason: reasonForHttpStatus(403).reason,
      code: "hotlink_blocked",
    }
  );
}

/** Pull absolute https PDF hrefs from a simple HTML page (no full DOM). */
export function extractPdfLinksFromHtml(
  html: string,
  pageUrl: URL,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const hrefRe =
    /href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const abs = new URL(raw, pageUrl);
      const safe = parseSafeHttpsUrl(abs.toString());
      if (!safe.ok) continue;
      const key = safe.url.toString().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(safe.url.toString());
    } catch {
      // skip bad href
    }
  }
  // Prefer same-host / manufacturer-ish paths first.
  const host = pageUrl.hostname.toLowerCase();
  found.sort((a, b) => scorePdfCandidate(b, host) - scorePdfCandidate(a, host));
  return found;
}

function scorePdfCandidate(urlStr: string, pageHost: string): number {
  try {
    const u = new URL(urlStr);
    let score = 0;
    if (u.hostname.toLowerCase() === pageHost) score += 50;
    if (/\.pdf$/i.test(u.pathname)) score += 20;
    const path = u.pathname.toLowerCase();
    if (/manual|owner|literature|support|docs|document|spec|warrant/.test(path)) {
      score += 15;
    }
    if (/blog|forum|reddit|pinterest|facebook/.test(u.hostname)) score -= 40;
    return score;
  } catch {
    return 0;
  }
}

function bytesToResult(
  bytes: Uint8Array,
  finalUrl: string,
  titleHint: string,
): FetchManualResult {
  if (!looksLikePdf(bytes)) {
    return {
      ok: false,
      reason:
        "That link did not return a real PDF file (got a web page or other content). HomeAsset will not store a broken link as a manual.",
      code: "not_a_file",
    };
  }
  const parsed = new URL(finalUrl);
  return {
    ok: true,
    mimeType: "application/pdf",
    filename: filenameFromUrl(parsed, titleHint),
    bytes,
    finalUrl,
    byteSize: bytes.byteLength,
  };
}

async function resolveOneUrl(
  sourceUrl: string,
  titleHint: string,
): Promise<FetchManualResult> {
  const parsed = parseSafeHttpsUrl(sourceUrl);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, code: parsed.code };
  }

  const first = await fetchBytes(parsed.url);
  if (!first.ok) return first;

  if (looksLikePdf(first.bytes) || contentTypeIsPdf(first.contentType)) {
    return bytesToResult(first.bytes, first.finalUrl, titleHint);
  }

  // HTML / interstitial — try embedded PDF links, never store the HTML.
  const asText = new TextDecoder("utf-8", { fatal: false }).decode(
    first.bytes.slice(0, Math.min(first.bytes.byteLength, 500_000)),
  );
  const looksHtml =
    contentTypeIsHtml(first.contentType) ||
    /^\s*<(!DOCTYPE|html|head|body)/i.test(asText) ||
    /<a\s+[^>]*href=/i.test(asText);

  if (!looksHtml) {
    return {
      ok: false,
      reason:
        "That source was not a downloadable PDF. HomeAsset will not store a nested web link as a manual.",
      code: "not_a_file",
    };
  }

  let pageUrl: URL;
  try {
    pageUrl = new URL(first.finalUrl);
  } catch {
    pageUrl = parsed.url;
  }
  const candidates = extractPdfLinksFromHtml(asText, pageUrl).slice(
    0,
    MAX_HTML_PDF_CANDIDATES,
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        "That page looked like a web site, not a PDF, and no downloadable PDF link was found. Try another suggestion or upload the file yourself.",
      code: "html_no_pdf",
    };
  }

  let sawHotlink = false;
  for (const candidate of candidates) {
    const next = await fetchBytes(new URL(candidate));
    if (!next.ok) {
      if (next.code === "hotlink_blocked") sawHotlink = true;
      continue;
    }
    if (looksLikePdf(next.bytes) || contentTypeIsPdf(next.contentType)) {
      const result = bytesToResult(next.bytes, next.finalUrl, titleHint);
      if (result.ok) return result;
    }
  }

  if (sawHotlink) {
    return {
      ok: false,
      reason: reasonForHttpStatus(403).reason,
      code: "hotlink_blocked",
    };
  }

  return {
    ok: false,
    reason:
      "Found links on that page, but none returned a real PDF. Nothing was stored for this suggestion.",
    code: "html_no_pdf",
  };
}

/** Normalize + dedupe alternate https URLs (skip primary / invalid). */
export function normalizeAlternateUrls(
  primary: string,
  alternates: string[] | null | undefined,
): string[] {
  const primaryKey = primary.trim().toLowerCase();
  const seen = new Set<string>(primaryKey ? [primaryKey] : []);
  const out: string[] = [];
  for (const raw of alternates ?? []) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    const safe = parseSafeHttpsUrl(trimmed);
    if (!safe.ok) continue;
    seen.add(key);
    out.push(safe.url.toString());
    if (out.length >= MAX_ALTERNATE_URLS) break;
  }
  return out;
}

/**
 * Download a suggested manual URL into real PDF bytes, or fail honestly.
 * Prefer direct PDFs; if the URL is an HTML landing page, try a few linked PDFs.
 * On hotlink / fetch failure, try alternate grounding URLs from the same suggest draft.
 */
export async function fetchManualPdf(input: {
  sourceUrl: string;
  titleHint?: string;
  /** Other https candidates from the same suggest draft / grounding set. */
  alternateUrls?: string[] | null;
}): Promise<FetchManualResult> {
  const titleHint = (input.titleHint ?? "manual").trim() || "manual";
  const primary = input.sourceUrl.trim();
  const queue = [primary, ...normalizeAlternateUrls(primary, input.alternateUrls)];

  let lastFail: FetchManualFailure | null = null;
  for (const url of queue) {
    const result = await resolveOneUrl(url, titleHint);
    if (result.ok) return result;
    lastFail = result;
    // Keep trying alternates when this URL was blocked or unreachable.
    if (
      result.code !== "hotlink_blocked" &&
      result.code !== "fetch_failed" &&
      result.code !== "html_no_pdf" &&
      result.code !== "not_a_file"
    ) {
      // invalid_url / blocked_host / too_large on primary — still try alternates
      // for invalid primary only if we have more; for too_large stop.
      if (result.code === "too_large") return result;
    }
  }

  if (lastFail) {
    // If we exhausted alternates after hotlink, keep the clear hotlink message.
    if (
      lastFail.code === "hotlink_blocked" ||
      queue.length > 1
    ) {
      return {
        ok: false,
        code: lastFail.code === "hotlink_blocked" ? "hotlink_blocked" : lastFail.code,
        reason:
          lastFail.code === "hotlink_blocked"
            ? lastFail.reason
            : `${lastFail.reason} Tried ${queue.length} link${queue.length === 1 ? "" : "s"} from the search — nothing was stored.`,
      };
    }
    return lastFail;
  }

  return {
    ok: false,
    reason: "No downloadable PDF URL was provided.",
    code: "invalid_url",
  };
}

/** Encode bytes for JSON transport to the phone (confirm then vault upload). */
export function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to avoid call-stack / argument limits on large PDFs.
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
