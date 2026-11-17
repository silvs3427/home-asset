import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { assertPropertyOwnedByUser, getAssetForProperty } from "./assets.js";
import type {
  AssetCategory,
  ReminderCompletionRecord,
  ReminderRecord,
  ReminderRecurrence,
  ReminderStatus,
  ReminderTemplate,
} from "./types.js";

type ReminderRow = {
  id: string;
  property_id: string;
  asset_id: string;
  title: string;
  notes: string | null;
  due_date: string;
  recurrence: string;
  status: string;
  last_completed_at: string | null;
  created_at: string;
  updated_at: string;
  asset_name?: string | null;
};

type CompletionRow = {
  id: string;
  reminder_id: string;
  property_id: string;
  completed_at: string;
  due_date_at_completion: string;
  note: string | null;
};

export type CreateReminderInput = {
  assetId: string;
  title: string;
  notes?: string | null;
  dueDate: string;
  recurrence: ReminderRecurrence;
};

export type UpdateReminderInput = {
  title?: string;
  notes?: string | null;
  dueDate?: string;
  recurrence?: ReminderRecurrence;
};

export type ReminderWithAssetName = ReminderRecord & {
  assetName: string | null;
};

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rowToReminder(row: ReminderRow): ReminderRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    assetId: row.asset_id,
    title: row.title,
    notes: row.notes,
    dueDate: row.due_date,
    recurrence: row.recurrence as ReminderRecurrence,
    status: row.status as ReminderStatus,
    lastCompletedAt: row.last_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCompletion(row: CompletionRow): ReminderCompletionRecord {
  return {
    id: row.id,
    reminderId: row.reminder_id,
    propertyId: row.property_id,
    completedAt: row.completed_at,
    dueDateAtCompletion: row.due_date_at_completion,
    note: row.note,
  };
}

const REMINDER_SELECT = `SELECT r.id, r.property_id, r.asset_id, r.title, r.notes,
       r.due_date, r.recurrence, r.status, r.last_completed_at,
       r.created_at, r.updated_at,
       a.name AS asset_name
FROM reminders r
LEFT JOIN assets a ON a.id = r.asset_id`;

/**
 * Advance a YYYY-MM-DD due date by simple recurrence.
 * Uses UTC calendar arithmetic so local TZ quirks do not shift the day.
 */
export function advanceDueDate(
  dueDate: string,
  recurrence: ReminderRecurrence,
): string {
  const [y, m, d] = dueDate.split("-").map((part) => Number(part));
  if (!y || !m || !d) throw new Error("INVALID_DUE_DATE");
  const date = new Date(Date.UTC(y, m - 1, d));
  if (recurrence === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else if (recurrence === "quarterly") {
    date.setUTCMonth(date.getUTCMonth() + 3);
  } else if (recurrence === "yearly") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    return dueDate;
  }
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Suggested first due date (today + N days) as YYYY-MM-DD. */
export function dueDateFromToday(days: number, now = new Date()): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Thin optional defaults — not a rich template library.
 * Callers still confirm title/due date before saving.
 */
export const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    id: "hvac-filter",
    category: "hvac",
    title: "Replace air filter",
    recurrence: "quarterly",
    defaultDueInDays: 7,
    notes: "Check filter size before buying a replacement.",
  },
  {
    id: "hvac-tuneup",
    category: "hvac",
    title: "Annual HVAC tune-up",
    recurrence: "yearly",
    defaultDueInDays: 30,
    notes: null,
  },
  {
    id: "water-heater-flush",
    category: "water_heater",
    title: "Flush water heater",
    recurrence: "yearly",
    defaultDueInDays: 30,
    notes: null,
  },
  {
    id: "generator-test",
    category: "generator",
    title: "Test generator",
    recurrence: "monthly",
    defaultDueInDays: 14,
    notes: null,
  },
  {
    id: "dryer-vent",
    category: "appliance",
    title: "Clean dryer vent",
    recurrence: "yearly",
    defaultDueInDays: 21,
    notes: null,
  },
  {
    id: "roof-gutters",
    category: "roof",
    title: "Inspect roof and gutters",
    recurrence: "yearly",
    defaultDueInDays: 45,
    notes: null,
  },
  {
    id: "smoke-co",
    category: "electrical",
    title: "Test smoke / CO detectors",
    recurrence: "monthly",
    defaultDueInDays: 7,
    notes: null,
  },
  {
    id: "generic-service",
    category: "any",
    title: "Service check",
    recurrence: "yearly",
    defaultDueInDays: 30,
    notes: null,
  },
];

export function listReminderTemplates(
  category?: AssetCategory | null,
): ReminderTemplate[] {
  if (!category) return REMINDER_TEMPLATES;
  return REMINDER_TEMPLATES.filter(
    (t) => t.category === category || t.category === "any",
  );
}

/**
 * Upcoming / active reminders for one owned home, soonest due first.
 * Optionally filter to a single asset.
 */
export function listRemindersForProperty(
  propertyId: string,
  ownerUserId: string,
  options?: {
    assetId?: string;
    includeCompleted?: boolean;
  },
): ReminderWithAssetName[] {
  assertPropertyOwnedByUser(propertyId, ownerUserId);

  const includeCompleted = options?.includeCompleted === true;
  const params: string[] = [propertyId];
  let sql = `${REMINDER_SELECT}
       WHERE r.property_id = ?`;

  if (!includeCompleted) {
    sql += ` AND r.status = 'active'`;
  }
  if (options?.assetId) {
    sql += ` AND r.asset_id = ?`;
    params.push(options.assetId);
  }

  sql += ` ORDER BY r.due_date ASC, r.created_at ASC`;

  const rows = getDb().prepare(sql).all(...params) as ReminderRow[];
  return rows.map((row) => ({
    ...rowToReminder(row),
    assetName: row.asset_name ?? null,
  }));
}

export function getReminderForProperty(
  reminderId: string,
  propertyId: string,
  ownerUserId: string,
): ReminderWithAssetName | undefined {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  const row = getDb()
    .prepare(
      `${REMINDER_SELECT}
       WHERE r.id = ? AND r.property_id = ?`,
    )
    .get(reminderId, propertyId) as ReminderRow | undefined;
  if (!row) return undefined;
  return {
    ...rowToReminder(row),
    assetName: row.asset_name ?? null,
  };
}

export function createReminder(
  propertyId: string,
  ownerUserId: string,
  input: CreateReminderInput,
): ReminderWithAssetName {
  const asset = getAssetForProperty(input.assetId, propertyId, ownerUserId);
  if (!asset) throw new Error("ASSET_NOT_FOUND");

  const now = new Date().toISOString();
  const reminder: ReminderRecord = {
    id: randomUUID(),
    propertyId,
    assetId: asset.id,
    title: input.title.trim(),
    notes: optionalText(input.notes),
    dueDate: input.dueDate.trim(),
    recurrence: input.recurrence,
    status: "active",
    lastCompletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO reminders
        (id, property_id, asset_id, title, notes, due_date, recurrence,
         status, last_completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      reminder.id,
      reminder.propertyId,
      reminder.assetId,
      reminder.title,
      reminder.notes,
      reminder.dueDate,
      reminder.recurrence,
      reminder.status,
      reminder.lastCompletedAt,
      reminder.createdAt,
      reminder.updatedAt,
    );

  return { ...reminder, assetName: asset.name };
}

export function updateReminder(
  reminderId: string,
  propertyId: string,
  ownerUserId: string,
  input: UpdateReminderInput,
): ReminderWithAssetName {
  const existing = getReminderForProperty(reminderId, propertyId, ownerUserId);
  if (!existing) throw new Error("REMINDER_NOT_FOUND");
  if (existing.status !== "active") {
    throw new Error("REMINDER_NOT_ACTIVE");
  }

  const updated: ReminderRecord = {
    ...existing,
    title: input.title !== undefined ? input.title.trim() : existing.title,
    notes:
      input.notes !== undefined ? optionalText(input.notes) : existing.notes,
    dueDate:
      input.dueDate !== undefined ? input.dueDate.trim() : existing.dueDate,
    recurrence: input.recurrence ?? existing.recurrence,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE reminders SET
         title = ?, notes = ?, due_date = ?, recurrence = ?, updated_at = ?
       WHERE id = ? AND property_id = ?`,
    )
    .run(
      updated.title,
      updated.notes,
      updated.dueDate,
      updated.recurrence,
      updated.updatedAt,
      updated.id,
      updated.propertyId,
    );

  return { ...updated, assetName: existing.assetName };
}

export function deleteReminder(
  reminderId: string,
  propertyId: string,
  ownerUserId: string,
): void {
  const existing = getReminderForProperty(reminderId, propertyId, ownerUserId);
  if (!existing) throw new Error("REMINDER_NOT_FOUND");

  getDb()
    .prepare(`DELETE FROM reminder_completions WHERE reminder_id = ?`)
    .run(reminderId);
  getDb()
    .prepare(`DELETE FROM reminders WHERE id = ? AND property_id = ?`)
    .run(reminderId, propertyId);
}

/**
 * Mark done: log light history; one-off → completed; recurring → next due date.
 */
export function completeReminder(
  reminderId: string,
  propertyId: string,
  ownerUserId: string,
  note?: string | null,
): { reminder: ReminderWithAssetName; completion: ReminderCompletionRecord } {
  const existing = getReminderForProperty(reminderId, propertyId, ownerUserId);
  if (!existing) throw new Error("REMINDER_NOT_FOUND");
  if (existing.status !== "active") {
    throw new Error("REMINDER_NOT_ACTIVE");
  }

  const now = new Date().toISOString();
  const completion: ReminderCompletionRecord = {
    id: randomUUID(),
    reminderId: existing.id,
    propertyId,
    completedAt: now,
    dueDateAtCompletion: existing.dueDate,
    note: optionalText(note),
  };

  getDb()
    .prepare(
      `INSERT INTO reminder_completions
        (id, reminder_id, property_id, completed_at, due_date_at_completion, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      completion.id,
      completion.reminderId,
      completion.propertyId,
      completion.completedAt,
      completion.dueDateAtCompletion,
      completion.note,
    );

  const isOneOff = existing.recurrence === "none";
  const nextDue = isOneOff
    ? existing.dueDate
    : advanceDueDate(existing.dueDate, existing.recurrence);
  const nextStatus: ReminderStatus = isOneOff ? "completed" : "active";

  getDb()
    .prepare(
      `UPDATE reminders SET
         status = ?, due_date = ?, last_completed_at = ?, updated_at = ?
       WHERE id = ? AND property_id = ?`,
    )
    .run(
      nextStatus,
      nextDue,
      now,
      now,
      existing.id,
      propertyId,
    );

  return {
    reminder: {
      ...existing,
      status: nextStatus,
      dueDate: nextDue,
      lastCompletedAt: now,
      updatedAt: now,
    },
    completion,
  };
}

export function listCompletionsForReminder(
  reminderId: string,
  propertyId: string,
  ownerUserId: string,
): ReminderCompletionRecord[] {
  const existing = getReminderForProperty(reminderId, propertyId, ownerUserId);
  if (!existing) throw new Error("REMINDER_NOT_FOUND");

  const rows = getDb()
    .prepare(
      `SELECT id, reminder_id, property_id, completed_at, due_date_at_completion, note
       FROM reminder_completions
       WHERE reminder_id = ? AND property_id = ?
       ORDER BY completed_at DESC`,
    )
    .all(reminderId, propertyId) as CompletionRow[];
  return rows.map(rowToCompletion);
}
