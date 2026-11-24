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
  extractPdfLinksFromHtml,
  looksLikePdf,
  parseSafeHttpsUrl,
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
