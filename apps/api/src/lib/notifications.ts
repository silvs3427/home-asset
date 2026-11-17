import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { sendExpoPush } from "./push.js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationKind,
  type NotificationPreferences,
  type NotificationRecord,
  type PushDeliveryStatus,
  type PushDeviceRecord,
} from "./types.js";

type PrefsRow = {
  user_id: string;
  reminders_enabled: number;
  recalls_enabled: number;
  contractor_submits_enabled: number;
  reminder_lead_days: number;
  push_enabled: number;
  in_app_enabled: number;
  updated_at: string;
};

type DeviceRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: string | null;
  device_name: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  kind: string;
  title: string;
  body: string;
  related_reminder_id: string | null;
  related_asset_id: string | null;
  related_entity_id: string | null;
  dedupe_key: string;
  read_at: string | null;
  push_status: string;
  push_sent_at: string | null;
  created_at: string;
};

type DueReminderRow = {
  reminder_id: string;
  property_id: string;
  asset_id: string;
  title: string;
  due_date: string;
  asset_name: string | null;
  owner_user_id: string;
};

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function intToBool(value: number): boolean {
  return value === 1;
}

function rowToPrefs(row: PrefsRow): NotificationPreferences {
  return {
    remindersEnabled: intToBool(row.reminders_enabled),
    recallsEnabled: intToBool(row.recalls_enabled),
    contractorSubmitsEnabled: intToBool(row.contractor_submits_enabled),
    reminderLeadDays: row.reminder_lead_days,
    pushEnabled: intToBool(row.push_enabled),
    inAppEnabled: intToBool(row.in_app_enabled),
    updatedAt: row.updated_at,
  };
}

function rowToDevice(row: DeviceRow): PushDeviceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    expoPushToken: row.expo_push_token,
    platform: row.platform,
    deviceName: row.device_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    propertyId: row.property_id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    relatedReminderId: row.related_reminder_id,
    relatedAssetId: row.related_asset_id,
    relatedEntityId: row.related_entity_id,
    dedupeKey: row.dedupe_key,
    readAt: row.read_at,
    pushStatus: row.push_status as PushDeliveryStatus,
    pushSentAt: row.push_sent_at,
    createdAt: row.created_at,
  };
}

/** UTC calendar day as YYYY-MM-DD. */
export function utcToday(now = new Date()): string {
  const yy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Add calendar days to a YYYY-MM-DD (UTC). */
export function addUtcDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return utcToday(date);
}

export function getNotificationPreferences(
  userId: string,
): NotificationPreferences {
  const row = getDb()
    .prepare(
      `SELECT user_id, reminders_enabled, recalls_enabled,
              contractor_submits_enabled, reminder_lead_days,
              push_enabled, in_app_enabled, updated_at
       FROM notification_preferences WHERE user_id = ?`,
    )
    .get(userId) as PrefsRow | undefined;

  if (row) return rowToPrefs(row);

  // Lazy defaults — no row until the user saves prefs (or first due-check).
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    updatedAt: new Date(0).toISOString(),
  };
}

export type UpdateNotificationPreferencesInput = {
  remindersEnabled?: boolean;
  recallsEnabled?: boolean;
  contractorSubmitsEnabled?: boolean;
  reminderLeadDays?: number;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
};

export function upsertNotificationPreferences(
  userId: string,
  patch: UpdateNotificationPreferencesInput,
): NotificationPreferences {
  const current = getNotificationPreferences(userId);
  const next: NotificationPreferences = {
    remindersEnabled: patch.remindersEnabled ?? current.remindersEnabled,
    recallsEnabled: patch.recallsEnabled ?? current.recallsEnabled,
    contractorSubmitsEnabled:
      patch.contractorSubmitsEnabled ?? current.contractorSubmitsEnabled,
    reminderLeadDays: patch.reminderLeadDays ?? current.reminderLeadDays,
    pushEnabled: patch.pushEnabled ?? current.pushEnabled,
    inAppEnabled: patch.inAppEnabled ?? current.inAppEnabled,
    updatedAt: new Date().toISOString(),
  };

  if (next.reminderLeadDays < 0 || next.reminderLeadDays > 30) {
    throw new Error("INVALID_LEAD_DAYS");
  }

  getDb()
    .prepare(
      `INSERT INTO notification_preferences
        (user_id, reminders_enabled, recalls_enabled, contractor_submits_enabled,
         reminder_lead_days, push_enabled, in_app_enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         reminders_enabled = excluded.reminders_enabled,
         recalls_enabled = excluded.recalls_enabled,
         contractor_submits_enabled = excluded.contractor_submits_enabled,
         reminder_lead_days = excluded.reminder_lead_days,
         push_enabled = excluded.push_enabled,
         in_app_enabled = excluded.in_app_enabled,
         updated_at = excluded.updated_at`,
    )
    .run(
      userId,
      boolToInt(next.remindersEnabled),
      boolToInt(next.recallsEnabled),
      boolToInt(next.contractorSubmitsEnabled),
      next.reminderLeadDays,
      boolToInt(next.pushEnabled),
      boolToInt(next.inAppEnabled),
      next.updatedAt,
    );

  return next;
}

export function listPushDevicesForUser(userId: string): PushDeviceRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, user_id, expo_push_token, platform, device_name,
              created_at, updated_at
       FROM push_devices WHERE user_id = ? ORDER BY updated_at DESC`,
    )
    .all(userId) as DeviceRow[];
  return rows.map(rowToDevice);
}

export function registerPushDevice(
  userId: string,
  input: {
    expoPushToken: string;
    platform?: string | null;
    deviceName?: string | null;
  },
): PushDeviceRecord {
  const token = input.expoPushToken.trim();
  if (!token || token.length > 256) {
    throw new Error("INVALID_PUSH_TOKEN");
  }
  // Expo tokens look like ExponentPushToken[...] — accept any non-empty for stub.
  const now = new Date().toISOString();
  const existing = getDb()
    .prepare(
      `SELECT id, user_id, expo_push_token, platform, device_name,
              created_at, updated_at
       FROM push_devices WHERE expo_push_token = ?`,
    )
    .get(token) as DeviceRow | undefined;

  if (existing) {
    // Re-assign to this user if the device moved accounts (privacy: last registrant).
    getDb()
      .prepare(
        `UPDATE push_devices
         SET user_id = ?, platform = ?, device_name = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        userId,
        input.platform?.trim() || existing.platform,
        input.deviceName?.trim() || existing.device_name,
        now,
        existing.id,
      );
    return rowToDevice(
      getDb()
        .prepare(
          `SELECT id, user_id, expo_push_token, platform, device_name,
                  created_at, updated_at
           FROM push_devices WHERE id = ?`,
        )
        .get(existing.id) as DeviceRow,
    );
  }

  const device: PushDeviceRecord = {
    id: randomUUID(),
    userId,
    expoPushToken: token,
    platform: input.platform?.trim() || null,
    deviceName: input.deviceName?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO push_devices
        (id, user_id, expo_push_token, platform, device_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      device.id,
      device.userId,
      device.expoPushToken,
      device.platform,
      device.deviceName,
      device.createdAt,
      device.updatedAt,
    );

  return device;
}

export function unregisterPushDevice(
  userId: string,
  deviceId: string,
): boolean {
  const result = getDb()
    .prepare(`DELETE FROM push_devices WHERE id = ? AND user_id = ?`)
    .run(deviceId, userId);
  return Number(result.changes) > 0;
}

export function listNotificationsForUser(
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): NotificationRecord[] {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const unreadOnly = options?.unreadOnly === true;
  const rows = unreadOnly
    ? (getDb()
        .prepare(
          `SELECT id, user_id, property_id, kind, title, body,
                  related_reminder_id, related_asset_id, related_entity_id,
                  dedupe_key, read_at, push_status, push_sent_at, created_at
           FROM notifications
           WHERE user_id = ? AND read_at IS NULL
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(userId, limit) as NotificationRow[])
    : (getDb()
        .prepare(
          `SELECT id, user_id, property_id, kind, title, body,
                  related_reminder_id, related_asset_id, related_entity_id,
                  dedupe_key, read_at, push_status, push_sent_at, created_at
           FROM notifications
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(userId, limit) as NotificationRow[]);
  return rows.map(rowToNotification);
}

export function countUnreadNotifications(userId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE user_id = ? AND read_at IS NULL`,
    )
    .get(userId) as { c: number };
  return Number(row.c);
}

export function markNotificationRead(
  userId: string,
  notificationId: string,
): NotificationRecord | null {
  const existing = getDb()
    .prepare(
      `SELECT id, user_id, property_id, kind, title, body,
              related_reminder_id, related_asset_id, related_entity_id,
              dedupe_key, read_at, push_status, push_sent_at, created_at
       FROM notifications WHERE id = ? AND user_id = ?`,
    )
    .get(notificationId, userId) as NotificationRow | undefined;
  if (!existing) return null;
  if (existing.read_at) return rowToNotification(existing);

  const readAt = new Date().toISOString();
  getDb()
    .prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`)
    .run(readAt, notificationId, userId);

  return rowToNotification({ ...existing, read_at: readAt });
}

export function markAllNotificationsRead(userId: string): number {
  const readAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `UPDATE notifications SET read_at = ?
       WHERE user_id = ? AND read_at IS NULL`,
    )
    .run(readAt, userId);
  return Number(result.changes);
}

export type CreateNotificationInput = {
  userId: string;
  propertyId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  relatedReminderId?: string | null;
  relatedAssetId?: string | null;
  relatedEntityId?: string | null;
  dedupeKey: string;
  /** When false, skip in-app insert (still returns null). Default true. */
  inApp?: boolean;
  /** Attempt push after create. Default true. */
  attemptPush?: boolean;
};

/**
 * Create an in-app notification (deduped) and optionally stub/send push.
 * Used by the due-check job and as the hook for recall / contractor submit pings.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<{
  notification: NotificationRecord | null;
  created: boolean;
  pushStatus: PushDeliveryStatus;
}> {
  const prefs = getNotificationPreferences(input.userId);
  const wantInApp = input.inApp !== false && prefs.inAppEnabled;
  const wantPush = input.attemptPush !== false && prefs.pushEnabled;

  if (input.kind === "reminder_due" && !prefs.remindersEnabled) {
    return { notification: null, created: false, pushStatus: "skipped" };
  }
  if (input.kind === "recall_alert" && !prefs.recallsEnabled) {
    return { notification: null, created: false, pushStatus: "skipped" };
  }
  if (input.kind === "contractor_submit" && !prefs.contractorSubmitsEnabled) {
    return { notification: null, created: false, pushStatus: "skipped" };
  }

  const existing = getDb()
    .prepare(
      `SELECT id, user_id, property_id, kind, title, body,
              related_reminder_id, related_asset_id, related_entity_id,
              dedupe_key, read_at, push_status, push_sent_at, created_at
       FROM notifications WHERE user_id = ? AND dedupe_key = ?`,
    )
    .get(input.userId, input.dedupeKey) as NotificationRow | undefined;

  if (existing) {
    return {
      notification: rowToNotification(existing),
      created: false,
      pushStatus: existing.push_status as PushDeliveryStatus,
    };
  }

  if (!wantInApp && !wantPush) {
    return { notification: null, created: false, pushStatus: "skipped" };
  }

  let pushStatus: PushDeliveryStatus = wantPush ? "pending" : "skipped";
  let pushSentAt: string | null = null;
  const now = new Date().toISOString();
  const id = randomUUID();

  // Insert first so dedupe holds even if push fails mid-flight.
  if (wantInApp) {
    getDb()
      .prepare(
        `INSERT INTO notifications
          (id, user_id, property_id, kind, title, body,
           related_reminder_id, related_asset_id, related_entity_id,
           dedupe_key, read_at, push_status, push_sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)`,
      )
      .run(
        id,
        input.userId,
        input.propertyId,
        input.kind,
        input.title,
        input.body,
        input.relatedReminderId ?? null,
        input.relatedAssetId ?? null,
        input.relatedEntityId ?? null,
        input.dedupeKey,
        pushStatus,
        now,
      );
  }

  if (wantPush) {
    const devices = listPushDevicesForUser(input.userId);
    const result = await sendExpoPush(devices, {
      title: input.title,
      body: input.body,
      data: {
        kind: input.kind,
        notificationId: wantInApp ? id : "",
        propertyId: input.propertyId ?? "",
        relatedReminderId: input.relatedReminderId ?? "",
        relatedAssetId: input.relatedAssetId ?? "",
        relatedEntityId: input.relatedEntityId ?? "",
      },
    });
    pushStatus = result.status;
    pushSentAt = new Date().toISOString();
    if (wantInApp) {
      getDb()
        .prepare(
          `UPDATE notifications
           SET push_status = ?, push_sent_at = ?
           WHERE id = ?`,
        )
        .run(pushStatus, pushSentAt, id);
    }
  }

  if (!wantInApp) {
    return { notification: null, created: false, pushStatus };
  }

  const row = getDb()
    .prepare(
      `SELECT id, user_id, property_id, kind, title, body,
              related_reminder_id, related_asset_id, related_entity_id,
              dedupe_key, read_at, push_status, push_sent_at, created_at
       FROM notifications WHERE id = ?`,
    )
    .get(id) as NotificationRow;

  return {
    notification: rowToNotification(row),
    created: true,
    pushStatus,
  };
}

/**
 * Hook for EPIC 7: create a recall alert notification for a homeowner.
 * No-op until recalls land; preference + schema are ready.
 */
export async function notifyRecallAlert(input: {
  userId: string;
  propertyId: string;
  assetId: string;
  recallId: string;
  title: string;
  body: string;
}) {
  return createNotification({
    userId: input.userId,
    propertyId: input.propertyId,
    kind: "recall_alert",
    title: input.title,
    body: input.body,
    relatedAssetId: input.assetId,
    relatedEntityId: input.recallId,
    dedupeKey: `recall_alert:${input.recallId}:${input.assetId}`,
  });
}

/**
 * Hook for EPIC 8: notify homeowner of a new contractor submission to review.
 * Clearer copy when trusted=true (contractor-app pro).
 */
export async function notifyContractorSubmit(input: {
  userId: string;
  propertyId: string;
  submissionId: string;
  trusted: boolean;
  title?: string;
  body?: string;
}) {
  const title =
    input.title ??
    (input.trusted
      ? "Trusted contractor submitted work"
      : "Contractor submitted work");
  const body =
    input.body ??
    (input.trusted
      ? "A contractor using the contractor app sent a packet for your review. Nothing is official until you approve."
      : "A contractor sent work for your review. Nothing is official until you approve.");
  return createNotification({
    userId: input.userId,
    propertyId: input.propertyId,
    kind: "contractor_submit",
    title,
    body,
    relatedEntityId: input.submissionId,
    dedupeKey: `contractor_submit:${input.submissionId}`,
  });
}

function reminderDueCopy(
  title: string,
  assetName: string | null,
  dueDate: string,
  today: string,
): { title: string; body: string } {
  const where = assetName ? ` on ${assetName}` : "";
  if (dueDate < today) {
    return {
      title: `Overdue: ${title}`,
      body: `${title}${where} was due ${dueDate}. Open Upcoming reminders to mark it done.`,
    };
  }
  if (dueDate === today) {
    return {
      title: `Due today: ${title}`,
      body: `${title}${where} is due today.`,
    };
  }
  return {
    title: `Upcoming: ${title}`,
    body: `${title}${where} is due ${dueDate}.`,
  };
}

export type DueCheckResult = {
  scanned: number;
  created: number;
  skippedExisting: number;
  skippedPrefs: number;
};

/**
 * Scan active reminders and create due/upcoming notifications for owners.
 * Deduped per reminder + due date so daily runs do not spam.
 */
export async function runDueReminderCheck(options?: {
  /** Limit to one homeowner (self-serve “check now”). */
  userId?: string;
  now?: Date;
}): Promise<DueCheckResult> {
  const today = utcToday(options?.now);
  const result: DueCheckResult = {
    scanned: 0,
    created: 0,
    skippedExisting: 0,
    skippedPrefs: 0,
  };

  // Lead window: each owner may differ; use max lead (30) in SQL, filter in JS.
  const horizon = addUtcDays(today, 30);
  const params: string[] = [horizon];
  let ownerFilter = "";
  if (options?.userId) {
    ownerFilter = " AND p.owner_user_id = ?";
    params.push(options.userId);
  }

  const rows = getDb()
    .prepare(
      `SELECT r.id AS reminder_id, r.property_id, r.asset_id, r.title, r.due_date,
              a.name AS asset_name, p.owner_user_id
       FROM reminders r
       INNER JOIN properties p ON p.id = r.property_id
       LEFT JOIN assets a ON a.id = r.asset_id
       WHERE r.status = 'active' AND r.due_date <= ?${ownerFilter}
       ORDER BY r.due_date ASC`,
    )
    .all(...params) as DueReminderRow[];

  for (const row of rows) {
    result.scanned += 1;
    const prefs = getNotificationPreferences(row.owner_user_id);
    if (!prefs.remindersEnabled) {
      result.skippedPrefs += 1;
      continue;
    }
    const cutoff = addUtcDays(today, prefs.reminderLeadDays);
    if (row.due_date > cutoff) {
      result.skippedPrefs += 1;
      continue;
    }

    const copy = reminderDueCopy(
      row.title,
      row.asset_name,
      row.due_date,
      today,
    );
    const created = await createNotification({
      userId: row.owner_user_id,
      propertyId: row.property_id,
      kind: "reminder_due",
      title: copy.title,
      body: copy.body,
      relatedReminderId: row.reminder_id,
      relatedAssetId: row.asset_id,
      dedupeKey: `reminder_due:${row.reminder_id}:${row.due_date}`,
    });

    if (created.created) result.created += 1;
    else if (created.notification) result.skippedExisting += 1;
    else result.skippedPrefs += 1;
  }

  return result;
}
