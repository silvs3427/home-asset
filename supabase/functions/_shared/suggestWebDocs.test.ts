/**
 * Deno tests for web-doc suggest helpers (no network).
 * Run: deno test --allow-none supabase/functions/_shared/suggestWebDocs.test.ts
 */
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMakeModelSearchQuery,
  docTypeForKind,
  extractHttpsUrlsFromText,
  harvestGroundingDocs,
  inferDocKind,
  isUsableHttpsDocUrl,
  mergeAndRankSuggestedDocs,
  parseSuggestedDocumentsJson,
} from "./suggestWebDocs.ts";

Deno.test("Roomba query includes iRobot alias", () => {
  const q = buildMakeModelSearchQuery("Roomba", "j7+");
  assert(q.brandHints.includes("iRobot"));
  assert(q.queryLines.includes("brand_aliases="));
  assert(q.queryLines.includes("warranty"));
});

Deno.test("iRobot Roomba query keeps aliases", () => {
  const q = buildMakeModelSearchQuery("iRobot", "Roomba 960");
  assert(q.brandHints.includes("Roomba"));
  assert(q.brandHints.includes("iRobot"));
});

Deno.test("isUsableHttpsDocUrl rejects demo hosts", () => {
  assert(isUsableHttpsDocUrl("https://homesupport.irobot.com/s/article/manual.pdf"));
  assertFalse(isUsableHttpsDocUrl("http://irobot.com/a.pdf"));
  assertFalse(isUsableHttpsDocUrl("https://example.invalid/a.pdf"));
});

Deno.test("parseSuggestedDocumentsJson reads docs + warranty hint", () => {
  const raw = `
Here are results:
\`\`\`json
{"documents":[{"title":"Roomba j7 Owner's Guide","url":"https://homesupport.irobot.com/s/article/guide.pdf","kind":"manual","note":"official"},{"title":"Limited Warranty","url":"https://www.irobot.com/warranty.pdf","kind":"warranty"}],"warrantyHint":{"term":"1 year limited","notes":"Excludes consumables"}}
\`\`\`
`;
  const parsed = parseSuggestedDocumentsJson(raw);
  assertEquals(parsed.documents.length, 2);
  assertEquals(parsed.documents[1]!.kind, "warranty");
  assertEquals(parsed.warrantyHint?.term, "1 year limited");
});

Deno.test("parseSuggestedDocumentsJson empty on prose without urls object", () => {
  const parsed = parseSuggestedDocumentsJson("No manuals found.");
  assertEquals(parsed.documents.length, 0);
  assertEquals(parsed.warrantyHint, null);
});

Deno.test("harvestGroundingDocs pulls https chunks", () => {
  const docs = harvestGroundingDocs([
    { web: { uri: "https://example.invalid/x.pdf", title: "bad" } },
    {
      web: {
        uri: "https://homesupport.irobot.com/manual.pdf",
        title: "Owner Manual",
      },
    },
  ]);
  assertEquals(docs.length, 1);
  assertEquals(docs[0]!.kind, "manual");
});

Deno.test("mergeAndRankSuggestedDocs prefers PDFs over search pages", () => {
  const ranked = mergeAndRankSuggestedDocs([
    [
      {
        title: "Google search",
        url: "https://www.google.com/search?q=roomba+manual",
        kind: "other",
        note: "",
      },
      {
        title: "Owner PDF",
        url: "https://homesupport.irobot.com/s/article/owner.pdf",
        kind: "manual",
        note: "",
      },
      {
        title: "Warranty PDF",
        url: "https://www.irobot.com/content/warranty.pdf",
        kind: "warranty",
        note: "",
      },
    ],
  ]);
  assertEquals(ranked[0]!.kind, "manual");
  assert(ranked.some((d) => d.kind === "warranty"));
  assertFalse(ranked.some((d) => d.url.includes("google.com")));
});

Deno.test("extractHttpsUrlsFromText strips trailing punctuation", () => {
  const urls = extractHttpsUrlsFromText(
    "See https://www.irobot.com/manual.pdf.",
  );
  assertEquals(urls[0], "https://www.irobot.com/manual.pdf");
});

Deno.test("inferDocKind and docTypeForKind", () => {
  assertEquals(inferDocKind("Limited Warranty Card", "https://x.com/a"), "warranty");
  assertEquals(docTypeForKind("warranty"), "warranty");
  assertEquals(docTypeForKind("spec"), "spec");
  assertEquals(docTypeForKind("manual"), "manual");
});
