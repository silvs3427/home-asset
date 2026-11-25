/**
 * Deno tests for manual PDF resolve helpers (no network).
 * Run: deno test --allow-none supabase/functions/_shared/fetchManual.test.ts
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRefererStrategies,
  extractPdfLinksFromHtml,
  isHotlinkHttpStatus,
  looksLikePdf,
  normalizeAlternateUrls,
  parseSafeHttpsUrl,
  reasonForHttpStatus,
} from "./fetchManual.ts";

Deno.test("looksLikePdf accepts %PDF magic", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n...");
  assert(looksLikePdf(bytes));
});

Deno.test("looksLikePdf rejects HTML", () => {
  const bytes = new TextEncoder().encode("<!DOCTYPE html><html>");
  assertFalse(looksLikePdf(bytes));
});

Deno.test("parseSafeHttpsUrl allows public https", () => {
  const r = parseSafeHttpsUrl(
    "https://www.generac.com/support/manuals/owner.pdf",
  );
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.url.hostname, "www.generac.com");
  }
});

Deno.test("parseSafeHttpsUrl blocks localhost and example.invalid", () => {
  assertFalse(parseSafeHttpsUrl("http://example.com/a.pdf").ok);
  assertFalse(parseSafeHttpsUrl("https://127.0.0.1/a.pdf").ok);
  assertFalse(parseSafeHttpsUrl("https://example.invalid/manuals/x.pdf").ok);
  assertFalse(parseSafeHttpsUrl("https://192.168.1.5/x.pdf").ok);
});

Deno.test("extractPdfLinksFromHtml prefers same-host PDFs", () => {
  const page = new URL("https://support.acme.com/product/docs");
  const html = `
    <html><body>
      <a href="https://blog.spam.com/post.pdf">blog</a>
      <a href="/literature/Owner-Manual.pdf">official</a>
      <a href='https://support.acme.com/files/spec.pdf?dl=1'>spec</a>
    </body></html>
  `;
  const links = extractPdfLinksFromHtml(html, page);
  assert(links.length >= 2);
  assert(links[0]!.includes("support.acme.com"));
});

Deno.test("403 maps to hotlink_blocked with clear reason", () => {
  assert(isHotlinkHttpStatus(403));
  assert(isHotlinkHttpStatus(401));
  assertFalse(isHotlinkHttpStatus(404));
  const mapped = reasonForHttpStatus(403);
  assertEquals(mapped.code, "hotlink_blocked");
  assert(mapped.reason.toLowerCase().includes("hotlink"));
  assertFalse(mapped.reason.includes("HTTP 403"));
});

Deno.test("buildRefererStrategies includes origin and null", () => {
  const strategies = buildRefererStrategies(
    new URL("https://cdn.irobot.com/docs/manual.pdf"),
  );
  assert(strategies.includes("https://cdn.irobot.com/"));
  assert(strategies.includes(null));
  assert(strategies.includes("https://www.google.com/"));
});

Deno.test("normalizeAlternateUrls skips demo and insecure hosts", () => {
  const alts = normalizeAlternateUrls("https://a.example.org/one.pdf", [
    "https://a.example.org/one.pdf",
    "https://b.example.org/two.pdf",
    "http://insecure.example.org/x.pdf",
    "https://example.invalid/x.pdf",
  ]);
  // example.org / .invalid are unfetchable demo hosts.
  assertEquals(alts.length, 0);
});

Deno.test("normalizeAlternateUrls keeps public https alternates", () => {
  const alts = normalizeAlternateUrls(
    "https://homesupport.irobot.com/a.pdf",
    [
      "https://homesupport.irobot.com/a.pdf",
      "https://www.irobot.com/warranty.pdf",
      "  https://cdn.irobot.com/manual.pdf  ",
    ],
  );
  assertEquals(alts.length, 2);
  assertEquals(alts[0], "https://www.irobot.com/warranty.pdf");
  assertEquals(alts[1], "https://cdn.irobot.com/manual.pdf");
});
