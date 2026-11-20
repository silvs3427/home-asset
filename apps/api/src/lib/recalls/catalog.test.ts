import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FIXTURE_RECALLS,
  matchAssetToRecalls,
  normalizeRecallKey,
} from "./catalog.js";

describe("recall catalog matching", () => {
  it("normalizes keys for case and punctuation", () => {
    assert.equal(normalizeRecallKey("  Evenflo "), "evenflo");
    assert.equal(normalizeRecallKey("GP-6500"), "gp 6500");
    assert.equal(normalizeRecallKey(null), "");
  });

  it("matches manufacturer + model from fixtures", () => {
    const hits = matchAssetToRecalls(
      {
        manufacturer: "Generac",
        model: "GP6500",
        serial: null,
      },
      FIXTURE_RECALLS,
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.entry.externalId, "fixture-cpsc-generac-gp6500");
    assert.equal(hits[0]?.matchedOn, "manufacturer_model");
  });

  it("requires serial when the notice lists a pattern", () => {
    const miss = matchAssetToRecalls(
      {
        manufacturer: "Graco",
        model: "SlimFit3 LX",
        serial: "OTHER-123",
      },
      FIXTURE_RECALLS,
    );
    assert.equal(miss.length, 0);

    const hit = matchAssetToRecalls(
      {
        manufacturer: "Graco",
        model: "SlimFit3 LX",
        serial: "SF3-998877",
      },
      FIXTURE_RECALLS,
    );
    assert.equal(hit.length, 1);
    assert.equal(hit[0]?.matchedOn, "manufacturer_model_serial");
  });

  it("skips assets missing manufacturer or model", () => {
    assert.deepEqual(
      matchAssetToRecalls(
        { manufacturer: "Evenflo", model: null, serial: null },
        FIXTURE_RECALLS,
      ),
      [],
    );
  });
});
