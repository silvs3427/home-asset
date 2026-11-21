import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReminderLine,
  isReminderScheduleQuestion,
} from "./reminderSchedule.js";

describe("isReminderScheduleQuestion", () => {
  it("routes founder-style reminder asks to the schedule path", () => {
    assert.equal(
      isReminderScheduleQuestion(
        "Do I have any maintenance reminders coming up?",
      ),
      true,
    );
    assert.equal(isReminderScheduleQuestion("What's due soon?"), true);
    assert.equal(
      isReminderScheduleQuestion("Any upcoming reminders for this home?"),
      true,
    );
  });

  it("keeps manuals / how-to procedure questions off the schedule path", () => {
    assert.equal(
      isReminderScheduleQuestion(
        "How do I replace the air filter on my furnace?",
      ),
      false,
    );
    assert.equal(
      isReminderScheduleQuestion(
        "What are the steps to service the generator?",
      ),
      false,
    );
  });
});

describe("formatReminderLine", () => {
  it("formats a plain reminder line without inventing fields", () => {
    assert.equal(
      formatReminderLine({
        title: "Replace air filter",
        dueDate: "2026-12-01",
        assetName: "Furnace",
        recurrence: "monthly",
      }),
      "• Replace air filter — due 2026-12-01 (Furnace) · monthly",
    );
  });
});
