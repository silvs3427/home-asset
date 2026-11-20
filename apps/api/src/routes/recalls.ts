import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  acknowledgeRecallAlert,
  dismissRecallAlert,
  getRecallAlertForProperty,
  listRecallAlertsForProperty,
  runRecallMatchCheck,
} from "../lib/recalls.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";
import type { AssetRecallAlertStatus } from "../lib/types.js";

/**
 * Safety/recall alerts nested under a property.
 * Auth + ownership required; rows never cross homes.
 */
export const recallRoutes = new Hono<{ Variables: AuthVariables }>();

recallRoutes.use("*", requireAuth);

function mapRecallError(
  err: unknown,
  c: Context<{ Variables: AuthVariables }>,
) {
  if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  if (err instanceof Error && err.message === "ASSET_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  if (err instanceof Error && err.message === "RECALL_ALERT_NOT_FOUND") {
    return c.json(
      { error: "not_found", message: "Recall alert not found." },
      404,
    );
  }
  throw err;
}

const statusSchema = z.enum(["open", "acknowledged", "dismissed", "all"]);

recallRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId")!;
  const assetId = c.req.query("assetId") || undefined;
  const statusRaw = c.req.query("status") || "all";
  const parsedStatus = statusSchema.safeParse(statusRaw);
  if (!parsedStatus.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "status must be open, acknowledged, dismissed, or all.",
      },
      400,
    );
  }

  try {
    const alerts = listRecallAlertsForProperty(propertyId, claims.sub, {
      assetId,
      status: parsedStatus.data as AssetRecallAlertStatus | "all",
    });
    return c.json({
      alerts,
      privacy: {
        note: "Recall matches stay on your home. Free public lists only in v1 — no paid partner feed.",
      },
    });
  } catch (err) {
    return mapRecallError(err, c);
  }
});

/**
 * Self-serve match for this home (handy for local try / phone CTA).
 * Registered before /:alertId so "run-check" is not treated as an id.
 */
recallRoutes.post("/run-check", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId")!;
  try {
    listRecallAlertsForProperty(propertyId, claims.sub, { status: "all" });
    const result = await runRecallMatchCheck({
      userId: claims.sub,
      propertyId,
    });
    const alerts = listRecallAlertsForProperty(propertyId, claims.sub, {
      status: "open",
    });
    return c.json({
      ok: true,
      result,
      openCount: alerts.length,
      privacy: {
        marketing: false,
        note: "Matches free public safety/recall lists to your assets only. Nothing is shared.",
      },
    });
  } catch (err) {
    return mapRecallError(err, c);
  }
});

recallRoutes.get("/:alertId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId")!;
  try {
    const alert = getRecallAlertForProperty(
      propertyId,
      c.req.param("alertId"),
      claims.sub,
    );
    return c.json({ alert });
  } catch (err) {
    return mapRecallError(err, c);
  }
});

recallRoutes.post("/:alertId/acknowledge", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId")!;
  try {
    const alert = acknowledgeRecallAlert(
      propertyId,
      c.req.param("alertId"),
      claims.sub,
    );
    return c.json({
      alert,
      note: "Acknowledged — kept in history on this asset.",
    });
  } catch (err) {
    return mapRecallError(err, c);
  }
});

recallRoutes.post("/:alertId/dismiss", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId")!;
  try {
    const alert = dismissRecallAlert(
      propertyId,
      c.req.param("alertId"),
      claims.sub,
    );
    return c.json({
      alert,
      note: "Dismissed — kept in history on this asset.",
    });
  } catch (err) {
    return mapRecallError(err, c);
  }
});
