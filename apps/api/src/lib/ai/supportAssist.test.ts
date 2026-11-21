import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessSupportTopic,
  mockSupportAnswer,
  parseSupportModelJson,
  SUPPORT_OFF_TOPIC_MESSAGE,
} from "./supportAssist.js";

describe("assessSupportTopic", () => {
  it("allows short and product questions", () => {
    assert.equal(assessSupportTopic("help").allowed, true);
    assert.equal(assessSupportTopic("How do I sign out of HomeAsset?").allowed, true);
    assert.equal(
      assessSupportTopic("My push notifications are not working").allowed,
      true,
    );
  });

  it("soft-refuses coding / general chat", () => {
    const coding = assessSupportTopic(
      "Write a Python function that sorts a linked list for my homework",
    );
    assert.equal(coding.allowed, false);
    if (!coding.allowed) {
      assert.equal(coding.message, SUPPORT_OFF_TOPIC_MESSAGE);
    }
    const joke = assessSupportTopic("Tell me a joke about dinosaurs please");
    assert.equal(joke.allowed, false);
  });

  it("flags clear ledger-only asks for Ask HomeAsset redirect", () => {
    const topic = assessSupportTopic(
      "What oil change interval is in my generator manual?",
    );
    assert.equal(topic.allowed, true);
    if (topic.allowed) {
      assert.equal(topic.redirectToAsk, true);
    }
  });
});

describe("mockSupportAnswer", () => {
  it("acknowledges frustration and escalates when stuck", () => {
    const res = mockSupportAnswer(
      "I'm frustrated — the app keeps crashing and I'm stuck",
    );
    assert.equal(res.escalate, true);
    assert.match(res.answer, /sorry|frustrating/i);
    assert.ok(res.nextSteps.length >= 1);
    assert.equal(res.privacy.writes, false);
  });

  it("gives sign-out steps without inventing account facts", () => {
    const res = mockSupportAnswer("How do I sign out?");
    assert.equal(res.escalate, false);
    assert.match(res.answer, /Settings/i);
    assert.ok(res.nextSteps.some((s) => /sign out/i.test(s)));
  });

  it("redirects ledger questions to Ask HomeAsset", () => {
    const res = mockSupportAnswer("What filter size is in my HVAC manual?", {
      redirectToAsk: true,
    });
    assert.match(res.answer, /Ask HomeAsset/i);
    assert.equal(res.escalate, false);
  });
});

describe("parseSupportModelJson", () => {
  it("parses structured live replies", () => {
    const res = parseSupportModelJson(
      JSON.stringify({
        answer: "I hear you — try Settings → Push & in-app.",
        escalate: false,
        nextSteps: ["Open Settings", "Register this phone"],
      }),
      "push broken",
      "live",
    );
    assert.equal(res.mode, "live");
    assert.equal(res.escalate, false);
    assert.equal(res.nextSteps.length, 2);
    assert.match(res.answer, /Push/i);
  });
});
