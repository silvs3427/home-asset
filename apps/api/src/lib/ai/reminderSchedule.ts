/**
 * Detect Ask HomeAsset questions about this home's saved reminders / schedule.
 * Manuals / how-to procedure questions stay on the manuals path.
 * Keep in sync with supabase/functions/ai-assist (isReminderScheduleQuestion).
 */

/**
 * True when the homeowner is asking what is due / upcoming on their reminders,
 * not how to perform maintenance from a manual.
 */
export function isReminderScheduleQuestion(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (q.length < 4) return false;

  const mentionsSchedule =
    /\b(reminder|reminders)\b/.test(q) ||
    /\b(upcoming|coming up)\b/.test(q) ||
    /\b(due soon|next due|what'?s due|whats due|anything due|any(thing)? due)\b/.test(
      q,
    ) ||
    /\b(scheduled|schedule)\b/.test(q) ||
    (/\bmaintenance\b/.test(q) &&
      /\b(coming|upcoming|due|schedule|reminder|next|any)\b/.test(q)) ||
    /\b(do i have|have i got|any).{0,48}\b(maintenance|service|filter).{0,48}\b(reminder|coming|upcoming|due)\b/.test(
      q,
    );

  if (!mentionsSchedule) return false;

  // Pure how-to / procedure stays on manuals (unless they also ask about reminders).
  const howToOnly =
    /\b(how (do|to|can|should|would)|steps? (to|for)|procedure|instructions?)\b/.test(
      q,
    ) && !/\b(reminder|reminders|upcoming|coming up|due soon|what'?s due)\b/.test(q);
  if (howToOnly) return false;

  return true;
}

export function recurrencePlainLabel(
  recurrence: string | null | undefined,
): string {
  switch (recurrence) {
    case "monthly":
      return "monthly";
    case "quarterly":
      return "quarterly";
    case "yearly":
      return "yearly";
    default:
      return "one-time";
  }
}

export function formatReminderLine(input: {
  title: string;
  dueDate: string;
  assetName?: string | null;
  recurrence?: string | null;
  notes?: string | null;
}): string {
  const parts = [
    `• ${input.title} — due ${input.dueDate}`,
    input.assetName ? ` (${input.assetName})` : "",
    ` · ${recurrencePlainLabel(input.recurrence)}`,
  ];
  const line = parts.join("");
  if (input.notes?.trim()) {
    return `${line}\n  Notes: ${input.notes.trim()}`;
  }
  return line;
}
