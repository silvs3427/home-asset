import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nullableIsoDate } from "./provider.js";

describe("nullableIsoDate", () => {
  it("keeps ISO dates", () => {
    assert.equal(nullableIsoDate("2026-10-06"), "2026-10-06");
  });

  it("parses Amazon-style Last purchased text", () => {
    assert.equal(nullableIsoDate("Oct 6, 2026"), "2026-10-06");
    assert.equal(nullableIsoDate("October 6, 2026"), "2026-10-06");
  });

  it("rejects invented or empty values", () => {
    assert.equal(nullableIsoDate(null), null);
    assert.equal(nullableIsoDate("tomorrow"), null);
    assert.equal(nullableIsoDate(""), null);
  });
});
