import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  completeReminder,
  createReminder,
  deleteReminder,
  getReminderForProperty,
  listCompletionsForReminder,
  listReminderTemplates,
  listRemindersForProperty,
  updateReminder,
} from "../lib/reminders.js";
import {
  REMINDER_RECURRENCES,
  toPublicReminder,
  toPublicReminderCompletion,
  type AssetCategory,
} from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";

const dueDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const createSchema = z.object({
  assetId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2000).optional().nullable(),
  dueDate: dueDateSchema,
  recurrence: z.enum(REMINDER_RECURRENCES as [string, ...string[]]),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    dueDate: dueDateSchema.optional(),
    recurrence: z.enum(REMINDER_RECURRENCES as [string, ...string[]]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

const completeSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Maintenance reminders nested under a property.
 * Auth + ownership required; rows never cross homes.
 */
export const reminderRoutes = new Hono<{ Variables: AuthVariables }>();

reminderRoutes.use("*", requireAuth);

function mapReminderError(
  err: unknown,
  c: Context<{ Variables: AuthVariables }>,
) {
  if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  if (err instanceof Error && err.message === "ASSET_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  if (err instanceof Error && err.message === "REMINDER_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Reminder not found." }, 404);
  }
  if (err instanceof Error && err.message === "REMINDER_NOT_ACTIVE") {
    return c.json(
      {
        error: "conflict",
        message: "This reminder is already completed.",
      },
      409,
    );
  }
  throw err;
}

reminderRoutes.get("/templates", (c) => {
  // Auth already applied; templates are static starters (no home data).
  const categoryParam = c.req.query("category")?.trim();
  let category: AssetCategory | null = null;
  if (categoryParam) {
    if (categoryParam.length > 80) {
      return c.json(
        {
          error: "invalid_input",
          message: "Category is too long for templates.",
        },
        400,
      );
    }
    category = categoryParam;
  }
  return c.json({ templates: listReminderTemplates(category) });
});

reminderRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const assetId = c.req.query("assetId");
  const includeCompleted = c.req.query("includeCompleted") === "1";

  try {
    const reminders = listRemindersForProperty(propertyId, claims.sub, {
      assetId: assetId || undefined,
      includeCompleted,
    }).map((r) => toPublicReminder(r, r.assetName));
    return c.json({ reminders, propertyId });
  } catch (err) {
    return mapReminderError(err, c);
  }
});

reminderRoutes.post("/", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Pick an asset, title, due date (YYYY-MM-DD), and recurrence (none, monthly, quarterly, or yearly).",
      },
      400,
    );
  }

  try {
    const reminder = createReminder(propertyId, claims.sub, {
      ...parsed.data,
      recurrence: parsed.data.recurrence as (typeof REMINDER_RECURRENCES)[number],
    });
    return c.json(
      { reminder: toPublicReminder(reminder, reminder.assetName) },
      201,
    );
  } catch (err) {
    return mapReminderError(err, c);
  }
});

reminderRoutes.get("/:reminderId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const reminderId = c.req.param("reminderId");
  if (!propertyId || !reminderId) {
    return c.json({ error: "not_found", message: "Reminder not found." }, 404);
  }
  try {
    const reminder = getReminderForProperty(reminderId, propertyId, claims.sub);
    if (!reminder) {
      return c.json({ error: "not_found", message: "Reminder not found." }, 404);
    }
    return c.json({
      reminder: toPublicReminder(reminder, reminder.assetName),
    });
  } catch (err) {
    return mapReminderError(err, c);
  }
});

reminderRoutes.patch("/:reminderId", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const reminderId = c.req.param("reminderId");
  if (!propertyId || !reminderId) {
    return c.json({ error: "not_found", message: "Reminder not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Provide at least one valid field (dates use YYYY-MM-DD; recurrence is none/monthly/quarterly/yearly).",
      },
      400,
    );
  }

  try {
    const reminder = updateReminder(reminderId, propertyId, claims.sub, {
      ...parsed.data,
      recurrence: parsed.data.recurrence as
        | (typeof REMINDER_RECURRENCES)[number]
        | undefined,
    });
    return c.json({
      reminder: toPublicReminder(reminder, reminder.assetName),
    });
  } catch (err) {
    return mapReminderError(err, c);
  }
});

reminderRoutes.delete("/:reminderId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const reminderId = c.req.param("reminderId");
  if (!propertyId || !reminderId) {
    return c.json({ error: "not_found", message: "Reminder not found." }, 404);
  }
  try {
    deleteReminder(reminderId, propertyId, claims.sub);
    return c.json({ ok: true });
  } catch (err) {
    return mapReminderError(err, c);
  }
});

reminderRoutes.post("/:reminderId/complete", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const reminderId = c.req.param("reminderId");
  if (!propertyId || !reminderId) {
    return c.json({ error: "not_found", message: "Reminder not found." }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = completeSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Optional note must be short text.",
      },
      400,
    );
  }

  try {
    const result = completeReminder(
      reminderId,
      propertyId,
      claims.sub,
      parsed.data.note,
    );
    return c.json({
      reminder: toPublicReminder(result.reminder, result.reminder.assetName),
      completion: toPublicReminderCompletion(result.completion),
    });
  } catch (err) {
    return mapReminderError(err, c);
  }
});

reminderRoutes.get("/:reminderId/history", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const reminderId = c.req.param("reminderId");
  if (!propertyId || !reminderId) {
    return c.json({ error: "not_found", message: "Reminder not found." }, 404);
  }
  try {
    const history = listCompletionsForReminder(
      reminderId,
      propertyId,
      claims.sub,
    ).map(toPublicReminderCompletion);
    return c.json({ history, reminderId });
  } catch (err) {
    return mapReminderError(err, c);
  }
});
