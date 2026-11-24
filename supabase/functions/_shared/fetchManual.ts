/**
 * Resolve a suggested manual URL to real file bytes (prefer PDF).
 * Used on homeowner approve — never store HTML interstitial pages as manuals.
 * SSRF-hardened: https only, no private/link-local hosts.
 */

/** Stay under Storage bucket limit (15 MiB) with headroom. */
export const MAX_MANUAL_BYTES = 14 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_HTML_PDF_CANDIDATES = 3;

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

async function fetchBytes(
  url: URL,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string | null; finalUrl: string }
  | { ok: false; reason: string; code: FetchManualFailure["code"] }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
        "User-Agent": "HomeAssetManualFetch/1.0",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: `The source returned HTTP ${response.status} — file was not available.`,
        code: "fetch_failed",
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
    if (/manual|owner|literature|support|docs|document|spec/.test(path)) {
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

/**
 * Download a suggested manual URL into real PDF bytes, or fail honestly.
 * Prefer direct PDFs; if the URL is an HTML landing page, try a few linked PDFs.
 */
export async function fetchManualPdf(input: {
  sourceUrl: string;
  titleHint?: string;
}): Promise<FetchManualResult> {
  const parsed = parseSafeHttpsUrl(input.sourceUrl);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, code: parsed.code };
  }
  const titleHint = (input.titleHint ?? "manual").trim() || "manual";

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

  for (const candidate of candidates) {
    const next = await fetchBytes(new URL(candidate));
    if (!next.ok) continue;
    if (looksLikePdf(next.bytes) || contentTypeIsPdf(next.contentType)) {
      const result = bytesToResult(next.bytes, next.finalUrl, titleHint);
      if (result.ok) return result;
    }
  }

  return {
    ok: false,
    reason:
      "Found links on that page, but none returned a real PDF. Nothing was stored for this suggestion.",
    code: "html_no_pdf",
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
