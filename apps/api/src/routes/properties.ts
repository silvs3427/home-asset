import { Hono } from "hono";
import { z } from "zod";
import { buildHomePacket } from "../lib/exportPacket.js";
import {
  createProperty,
  getPropertyForUser,
  listPropertiesForUser,
  selectPropertyForUser,
} from "../lib/properties.js";
import { getUserById } from "../lib/users.js";
import { toPublicProperty, toPublicUser } from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";
import { assetRoutes } from "./assets.js";
import { documentRoutes } from "./documents.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  country: z.string().trim().min(2).max(56).optional(),
});

/**
 * Property-scoped home APIs. Auth required; responses only include homes the caller owns.
 * No silent sharing — other accounts cannot list or select these rows.
 */
export const propertyRoutes = new Hono<{ Variables: AuthVariables }>();

propertyRoutes.use("*", requireAuth);

propertyRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const properties = listPropertiesForUser(claims.sub).map(toPublicProperty);
  const user = getUserById(claims.sub);
  return c.json({
    properties,
    activePropertyId: user?.activePropertyId ?? null,
  });
});

propertyRoutes.post("/", async (c) => {
  const claims = c.get("claims");
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Add a home name and full address (street, city, state/region, postal code).",
      },
      400,
    );
  }

  try {
    const property = createProperty(claims.sub, parsed.data);
    const user = getUserById(claims.sub);
    return c.json(
      {
        property: toPublicProperty(property),
        user: user ? toPublicUser(user) : undefined,
      },
      201,
    );
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

propertyRoutes.get("/:id", (c) => {
  const claims = c.get("claims");
  const property = getPropertyForUser(c.req.param("id"), claims.sub);
  if (!property) {
    return c.json(
      { error: "not_found", message: "Home not found." },
      404,
    );
  }
  return c.json({ property: toPublicProperty(property) });
});

propertyRoutes.post("/:id/select", (c) => {
  const claims = c.get("claims");
  try {
    const property = selectPropertyForUser(claims.sub, c.req.param("id"));
    const user = getUserById(claims.sub);
    return c.json({
      property: toPublicProperty(property),
      user: user ? toPublicUser(user) : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
      return c.json(
        { error: "not_found", message: "Home not found." },
        404,
      );
    }
    throw err;
  }
});

propertyRoutes.get("/:id/export", (c) => {
  const claims = c.get("claims");
  try {
    const packet = buildHomePacket(c.req.param("id"), claims.sub);
    return c.json({ packet });
  } catch (err) {
    if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
      return c.json(
        { error: "not_found", message: "Home not found." },
        404,
      );
    }
    throw err;
  }
});

// Nested under property so the URL itself encodes the home boundary.
// Auth already applied above; asset/document handlers re-check ownership.
propertyRoutes.route("/:propertyId/assets", assetRoutes);
propertyRoutes.route("/:propertyId/documents", documentRoutes);
