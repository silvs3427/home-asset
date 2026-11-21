import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  listPropertyLabels,
  normalizeLabelValue,
  rememberPropertyLabel,
  type PropertyLabelKind,
} from "../lib/propertyLabels.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";

const kindSchema = z.enum(["asset_category", "document_type"]);

const rememberSchema = z.object({
  kind: kindSchema,
  value: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((v) => normalizeLabelValue(v)),
});

/**
 * Per-home reusable custom labels (asset categories + document types).
 * Open lists — homeowners type values; once added they stay available.
 */
export const labelRoutes = new Hono<{ Variables: AuthVariables }>();

labelRoutes.use("*", requireAuth);

function mapOwnershipError(
  err: unknown,
  c: Context<{ Variables: AuthVariables }>,
) {
  if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  if (err instanceof Error && err.message === "INVALID_LABEL_KIND") {
    return c.json(
      { error: "invalid_input", message: "Unknown label kind." },
      400,
    );
  }
  throw err;
}

labelRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  const kindRaw = c.req.query("kind") ?? "";
  const kindParsed = kindSchema.safeParse(kindRaw);
  if (!kindParsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "kind must be asset_category or document_type.",
      },
      400,
    );
  }
  try {
    const labels = listPropertyLabels(
      propertyId,
      claims.sub,
      kindParsed.data as PropertyLabelKind,
    );
    return c.json({
      propertyId,
      kind: kindParsed.data,
      labels: labels.map((row) => ({
        id: row.id,
        value: row.value,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});

labelRoutes.post("/", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = rememberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Provide kind and a non-empty value (max 80 characters).",
      },
      400,
    );
  }
  try {
    const label = rememberPropertyLabel(
      propertyId,
      claims.sub,
      parsed.data.kind,
      parsed.data.value,
    );
    if (!label) {
      return c.json(
        { error: "invalid_input", message: "Value cannot be empty." },
        400,
      );
    }
    return c.json(
      {
        label: {
          id: label.id,
          value: label.value,
          kind: label.kind,
          createdAt: label.createdAt,
          updatedAt: label.updatedAt,
        },
      },
      201,
    );
  } catch (err) {
    return mapOwnershipError(err, c);
  }
});
