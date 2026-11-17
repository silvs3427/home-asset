import { Hono } from "hono";
import { z } from "zod";
import {
  countUnreadNotifications,
  getNotificationPreferences,
  listNotificationsForUser,
  listPushDevicesForUser,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushDevice,
  runDueReminderCheck,
  unregisterPushDevice,
  upsertNotificationPreferences,
} from "../lib/notifications.js";
import {
  toPublicNotification,
  toPublicNotificationPreferences,
  toPublicPushDevice,
} from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";

const prefsSchema = z
  .object({
    remindersEnabled: z.boolean().optional(),
    recallsEnabled: z.boolean().optional(),
    contractorSubmitsEnabled: z.boolean().optional(),
    reminderLeadDays: z.number().int().min(0).max(30).optional(),
    pushEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one preference to update.",
  });

const deviceSchema = z.object({
  expoPushToken: z.string().trim().min(8).max(256),
  platform: z.string().trim().max(40).optional().nullable(),
  deviceName: z.string().trim().max(120).optional().nullable(),
});

/**
 * Account-scoped notification center, preferences, and push device registration.
 * Auth required; never returns another user's rows.
 */
export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();

notificationRoutes.use("*", requireAuth);

notificationRoutes.get("/preferences", (c) => {
  const claims = c.get("claims");
  const prefs = getNotificationPreferences(claims.sub);
  return c.json({
    preferences: toPublicNotificationPreferences(prefs),
    privacy: {
      marketing: false,
      sms: false,
      channels: ["in_app", "push"],
      note: "Only maintenance, recall, and contractor-submit notices — never marketing.",
    },
  });
});

notificationRoutes.patch("/preferences", async (c) => {
  const claims = c.get("claims");
  const body = await c.req.json().catch(() => null);
  const parsed = prefsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Choose what to notify about and how many days before a reminder is due (0–30).",
      },
      400,
    );
  }

  try {
    const prefs = upsertNotificationPreferences(claims.sub, parsed.data);
    return c.json({
      preferences: toPublicNotificationPreferences(prefs),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_LEAD_DAYS") {
      return c.json(
        {
          error: "invalid_input",
          message: "Lead days must be between 0 and 30.",
        },
        400,
      );
    }
    throw err;
  }
});

notificationRoutes.get("/devices", (c) => {
  const claims = c.get("claims");
  const devices = listPushDevicesForUser(claims.sub).map(toPublicPushDevice);
  return c.json({ devices });
});

notificationRoutes.post("/devices", async (c) => {
  const claims = c.get("claims");
  const body = await c.req.json().catch(() => null);
  const parsed = deviceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Provide a valid Expo push token from this device.",
      },
      400,
    );
  }

  try {
    const device = registerPushDevice(claims.sub, parsed.data);
    return c.json({ device: toPublicPushDevice(device) }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_PUSH_TOKEN") {
      return c.json(
        {
          error: "invalid_input",
          message: "Provide a valid Expo push token from this device.",
        },
        400,
      );
    }
    throw err;
  }
});

notificationRoutes.delete("/devices/:id", (c) => {
  const claims = c.get("claims");
  const ok = unregisterPushDevice(claims.sub, c.req.param("id"));
  if (!ok) {
    return c.json({ error: "not_found", message: "Device not found." }, 404);
  }
  return c.json({ ok: true });
});

notificationRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const unreadOnly = c.req.query("unreadOnly") === "1";
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const notifications = listNotificationsForUser(claims.sub, {
    unreadOnly,
    limit: Number.isFinite(limit) ? limit : undefined,
  }).map(toPublicNotification);
  const unreadCount = countUnreadNotifications(claims.sub);
  return c.json({ notifications, unreadCount });
});

notificationRoutes.post("/read-all", (c) => {
  const claims = c.get("claims");
  const updated = markAllNotificationsRead(claims.sub);
  return c.json({ ok: true, updated });
});

/**
 * Self-serve due check for the signed-in homeowner (handy for local try).
 * Only scans reminders on homes they own.
 */
notificationRoutes.post("/run-due-check", async (c) => {
  const claims = c.get("claims");
  const result = await runDueReminderCheck({ userId: claims.sub });
  const unreadCount = countUnreadNotifications(claims.sub);
  return c.json({ ok: true, result, unreadCount });
});

notificationRoutes.post("/:id/read", (c) => {
  const claims = c.get("claims");
  const notification = markNotificationRead(claims.sub, c.req.param("id"));
  if (!notification) {
    return c.json(
      { error: "not_found", message: "Notification not found." },
      404,
    );
  }
  return c.json({ notification: toPublicNotification(notification) });
});
