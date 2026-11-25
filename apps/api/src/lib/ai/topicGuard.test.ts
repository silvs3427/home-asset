import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessAskHomeAssetTopic } from "./topicGuard.js";

describe("Ask HomeAsset topic guard", () => {
  it("allows home ledger / maintenance questions", () => {
    assert.equal(
      assessAskHomeAssetTopic(
        "How do I change the HVAC filter and check my generator oil?",
      ).allowed,
      true,
    );
    assert.equal(
      assessAskHomeAssetTopic(
        "When is the warranty end date on my water heater?",
      ).allowed,
      true,
    );
  });

  it("soft-rejects coding / software assistant asks", () => {
    const result = assessAskHomeAssetTopic(
      "Write me a Python function and debug my TypeScript React component",
    );
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.code, "off_topic");
      assert.match(result.message, /HomeAsset|coding projects/i);
    }
  });

  it("soft-rejects unrelated general chat", () => {
    const result = assessAskHomeAssetTopic("Tell me a joke and write me a poem");
    assert.equal(result.allowed, false);
  });
});
