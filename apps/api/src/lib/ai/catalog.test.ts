import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchCatalogProducts } from "./catalog.js";

describe("matchCatalogProducts", () => {
  it("matches Generac when the hint names it", () => {
    const hits = matchCatalogProducts("Generac GP6500 portable generator");
    assert.equal(hits[0]?.id, "generac-gp6500");
  });

  it("does not invent Generac for an unrelated Roomba photo filename", () => {
    const hits = matchCatalogProducts("photo-1732280000000.jpg");
    assert.deepEqual(hits, []);
  });

  it("does not invent Generac for Roomba / iRobot text", () => {
    const hits = matchCatalogProducts("iRobot Roomba j7+ robot vacuum");
    assert.deepEqual(hits, []);
  });

  it("does not invent Generac for empty or generic appliance text", () => {
    assert.deepEqual(matchCatalogProducts(""), []);
    assert.deepEqual(matchCatalogProducts("appliance"), []);
    assert.deepEqual(matchCatalogProducts("home equipment"), []);
  });
});
