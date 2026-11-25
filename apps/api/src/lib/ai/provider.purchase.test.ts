import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPurchaseHintsFromText,
  formatAssetIntake,
} from "./provider.js";

describe("extractPurchaseHintsFromText", () => {
  it("reads Amazon-style Last purchased + price", () => {
    const hints = extractPurchaseHintsFromText(
      "iRobot Roomba 505X Robot Vacuum & Mop Combo Purchased 1 time Last purchased Oct 6, 2026 $469.99",
    );
    assert.equal(hints.looksLikeRetailPurchase, true);
    assert.equal(hints.purchaseDate, "2026-10-06");
    assert.equal(hints.price, "$469.99");
  });

  it("reads order confirmation email fields", () => {
    const hints = extractPurchaseHintsFromText(
      [
        "From: auto-confirm@amazon.com",
        "Subject: Your Amazon.com order of Roomba 505X",
        "",
        "Ordered on October 6, 2026",
        "Grand Total: $469.99",
      ].join("\n"),
    );
    assert.equal(hints.looksLikeRetailPurchase, true);
    assert.equal(hints.purchaseDate, "2026-10-06");
    assert.equal(hints.price, "$469.99");
  });
});

describe("formatAssetIntake purchase mock", () => {
  it("drafts purchase date and price notes from order email without writing", async () => {
    process.env.AI_FORCE_MOCK = "1";
    const result = await formatAssetIntake({
      sourceKind: "email",
      text: [
        "From: auto-confirm@amazon.com",
        "Subject: Your Amazon.com order of iRobot Roomba 505X",
        "",
        "Ordered on Oct 6, 2026",
        "Item: iRobot Roomba 505X Robot Vacuum & Mop Combo",
        "Total: $469.99",
      ].join("\n"),
      existingAssets: [],
    });
    assert.equal(result.privacy.writes, false);
    assert.equal(result.privacy.confirmRequired, true);
    assert.equal(result.suggestedAsset.purchaseDate, "2026-10-06");
    assert.match(
      result.suggestedAsset.notes ?? "",
      /Purchase price:\s*\$469\.99/i,
    );
    assert.equal(result.suggestedAsset.installerVendor, null);
    assert.equal(result.suggestedAsset.installDate, null);
  });
});
