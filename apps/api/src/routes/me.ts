import { Hono } from "hono";
import { z } from "zod";
import { issueAccessToken } from "../lib/auth.js";
import { getPropertyForUser, listPropertiesForUser } from "../lib/properties.js";
import {
  enableFaceAsync,
  getUserById,
  setActiveFaceAsync,
} from "../lib/users.js";
import {
  toPublicProperty,
  toPublicUser,
  type AppFace,
} from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";
import { config } from "../config.js";

const faceSchema = z.object({
  face: z.enum(["homeowner", "contractor"]),
});

export const meRoutes = new Hono<{ Variables: AuthVariables }>();

meRoutes.use("*", requireAuth);

meRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const user = getUserById(claims.sub);
  if (!user) {
    return c.json(
      { error: "not_found", message: "Account no longer exists." },
      404,
    );
  }

  const properties = listPropertiesForUser(user.id).map(toPublicProperty);
  const activeProperty = user.activePropertyId
    ? getPropertyForUser(user.activePropertyId, user.id)
    : undefined;

  return c.json({
    user: toPublicUser(user),
    properties,
    activeProperty: activeProperty
      ? toPublicProperty(activeProperty)
      : null,
    privacy: {
      ledgerOwner: "homeowner",
      silentSharing: false,
      approveBeforeOfficial: true,
      dataScope: "property",
    },
  });
});

/**
 * Switch to an already-enrolled face on this login.
 * Does NOT unlock a missing role — use POST /me/face/enroll for that.
 * Issues a fresh access token so JWT claims stay in sync.
 */
meRoutes.post("/face", async (c) => {
  const claims = c.get("claims");
  const body = await c.req.json().catch(() => null);
  const parsed = faceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Choose homeowner or contractor.",
      },
      400,
    );
  }

  const face = parsed.data.face as AppFace;
  try {
    const user = await setActiveFaceAsync(claims.sub, face);
    const accessToken = await issueAccessToken(user);
    return c.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: config.jwtTtlSeconds,
      user: toPublicUser(user),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "FACE_NOT_AVAILABLE") {
      return c.json(
        {
          error: "face_not_available",
          message:
            "That role is not enrolled on this account yet. Enroll for it first — homeowner and contractor are signed up separately.",
        },
        403,
      );
    }
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return c.json(
        { error: "not_found", message: "Account no longer exists." },
        404,
      );
    }
    throw err;
  }
});

/**
 * Explicit second-role enrollment on the same login.
 * Distinct from face switch: you must enroll before you can toggle.
 */
meRoutes.post("/face/enroll", async (c) => {
  const claims = c.get("claims");
  const body = await c.req.json().catch(() => null);
  const parsed = faceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Choose homeowner or contractor.",
      },
      400,
    );
  }

  const face = parsed.data.face as AppFace;
  try {
    await enableFaceAsync(claims.sub, face);
    const user = await setActiveFaceAsync(claims.sub, face);
    const accessToken = await issueAccessToken(user);
    return c.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: config.jwtTtlSeconds,
      user: toPublicUser(user),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return c.json(
        { error: "not_found", message: "Account no longer exists." },
        404,
      );
    }
    throw err;
  }
});
