import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  createAsset,
  deleteAsset,
  getAssetForProperty,
  listAssetsForProperty,
  updateAsset,
} from "../lib/assets.js";
import { ASSET_CATEGORIES, toPublicAsset } from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .nullable();

const optionalText = z.string().trim().max(500).optional().nullable();

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.enum(ASSET_CATEGORIES as [string, ...string[]]),
  manufacturer: optionalText,
  model: optionalText,
  serial: optionalText,
  purchaseDate: optionalDate,
  installDate: optionalDate,
  installerVendor: optionalText,
  location: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updateSchema = createSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);

/**
 * Asset CRUD nested under a property.
 * Auth required; every handler verifies the caller owns propertyId.
 * Assets never cross homes — property_id is the hard boundary.
 */
export const assetRoutes = new Hono<{ Variables: AuthVariables }>();

assetRoutes.use("*", requireAuth);

function mapOwnershipError(
  err: unknown,
  c: Context<{ Variables: AuthVariables }>,
) {
  if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  if (err instanceof Error && err.message === "ASSET_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  throw err;
}

assetRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  try {
    const assets = listAssetsForProperty(propertyId, claims.sub).map(toPublicAsset);
    return c.json({ assets, propertyId });
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});

assetRoutes.post("/", async (c) => {
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
          "Add a name and category. Dates use YYYY-MM-DD. Manufacturer, model, and serial help with warranties and recalls later.",
      },
      400,
    );
  }

  try {
    const asset = createAsset(propertyId, claims.sub, {
      ...parsed.data,
      category: parsed.data.category as (typeof ASSET_CATEGORIES)[number],
      provenance: "homeowner",
    });
    return c.json({ asset: toPublicAsset(asset) }, 201);
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});

assetRoutes.get("/:assetId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const assetId = c.req.param("assetId");
  if (!propertyId || !assetId) {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  try {
    const asset = getAssetForProperty(assetId, propertyId, claims.sub);
    if (!asset) {
      return c.json({ error: "not_found", message: "Asset not found." }, 404);
    }
    return c.json({ asset: toPublicAsset(asset) });
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});

assetRoutes.patch("/:assetId", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const assetId = c.req.param("assetId");
  if (!propertyId || !assetId) {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Provide at least one valid field to update (dates use YYYY-MM-DD).",
      },
      400,
    );
  }

  try {
    const asset = updateAsset(assetId, propertyId, claims.sub, {
      ...parsed.data,
      category: parsed.data.category as
        | (typeof ASSET_CATEGORIES)[number]
        | undefined,
    });
    return c.json({ asset: toPublicAsset(asset) });
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});

assetRoutes.delete("/:assetId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const assetId = c.req.param("assetId");
  if (!propertyId || !assetId) {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  try {
    deleteAsset(assetId, propertyId, claims.sub);
    return c.json({ ok: true });
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});
