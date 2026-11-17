import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  createDocument,
  deleteDocument,
  getDocumentForProperty,
  listDocumentsForProperty,
  readDocumentBytes,
  updateDocument,
} from "../lib/documents.js";
import {
  DOCUMENT_TYPES,
  toPublicDocument,
} from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .nullable();

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    docType: z.enum(DOCUMENT_TYPES as [string, ...string[]]).optional(),
    documentDate: optionalDate,
    assetId: z.string().uuid().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

/**
 * Document upload / list / download nested under a property.
 * Auth required; every handler verifies the caller owns propertyId.
 * Files never cross homes — property_id is the hard boundary.
 */
export const documentRoutes = new Hono<{ Variables: AuthVariables }>();

documentRoutes.use("*", requireAuth);

function mapDocError(
  err: unknown,
  c: Context<{ Variables: AuthVariables }>,
) {
  if (err instanceof Error && err.message === "PROPERTY_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }
  if (err instanceof Error && err.message === "ASSET_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Asset not found." }, 404);
  }
  if (err instanceof Error && err.message === "DOCUMENT_NOT_FOUND") {
    return c.json({ error: "not_found", message: "Document not found." }, 404);
  }
  if (err instanceof Error && err.message === "EMPTY_FILE") {
    return c.json(
      { error: "invalid_input", message: "Choose a non-empty file or photo." },
      400,
    );
  }
  if (err instanceof Error && err.message === "FILE_TOO_LARGE") {
    return c.json(
      {
        error: "invalid_input",
        message: "That file is too large. Keep uploads under 15 MB.",
      },
      400,
    );
  }
  if (err instanceof Error && err.message === "FILE_MISSING") {
    return c.json(
      {
        error: "not_found",
        message: "File is missing from storage. Try uploading again.",
      },
      404,
    );
  }
  throw err;
}

documentRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  const assetId = c.req.query("assetId")?.trim() || undefined;
  const scope = c.req.query("scope")?.trim();
  const propertyOnly = scope === "property";

  try {
    const documents = listDocumentsForProperty(propertyId, claims.sub, {
      assetId,
      propertyOnly,
    }).map(toPublicDocument);
    return c.json({ documents, propertyId });
  } catch (err) {
    return mapDocError(err, c);
  }
});

documentRoutes.post("/", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  if (!propertyId) {
    return c.json({ error: "not_found", message: "Home not found." }, 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody()) as Record<string, unknown>;
  } catch {
    return c.json(
      {
        error: "invalid_input",
        message: "Upload a file with title and type (multipart form).",
      },
      400,
    );
  }

  const file = body.file;
  if (!(file instanceof File)) {
    return c.json(
      {
        error: "invalid_input",
        message: "Attach a photo or file in the file field.",
      },
      400,
    );
  }

  const titleRaw = typeof body.title === "string" ? body.title : "";
  const docTypeRaw = typeof body.docType === "string" ? body.docType : "";
  const documentDateRaw =
    typeof body.documentDate === "string" ? body.documentDate : null;
  const assetIdRaw =
    typeof body.assetId === "string" && body.assetId.trim().length > 0
      ? body.assetId.trim()
      : null;

  const meta = z
    .object({
      title: z.string().trim().min(1).max(200),
      docType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
      documentDate: optionalDate,
      assetId: z.string().uuid().optional().nullable(),
    })
    .safeParse({
      title: titleRaw,
      docType: docTypeRaw,
      documentDate: documentDateRaw,
      assetId: assetIdRaw,
    });

  if (!meta.success) {
    return c.json(
      {
        error: "invalid_input",
        message:
          "Add a title and document type (manual, receipt, warranty, install_paperwork, photo, other). Dates use YYYY-MM-DD.",
      },
      400,
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const document = createDocument(propertyId, claims.sub, {
      title: meta.data.title,
      docType: meta.data.docType as (typeof DOCUMENT_TYPES)[number],
      documentDate: meta.data.documentDate ?? null,
      assetId: meta.data.assetId ?? null,
      source: "user",
      mimeType: file.type || "application/octet-stream",
      originalFilename: file.name || "upload.bin",
      bytes,
    });
    return c.json({ document: toPublicDocument(document) }, 201);
  } catch (err) {
    return mapDocError(err, c);
  }
});

documentRoutes.get("/:documentId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const documentId = c.req.param("documentId");
  if (!propertyId || !documentId) {
    return c.json({ error: "not_found", message: "Document not found." }, 404);
  }
  try {
    const document = getDocumentForProperty(documentId, propertyId, claims.sub);
    if (!document) {
      return c.json(
        { error: "not_found", message: "Document not found." },
        404,
      );
    }
    return c.json({ document: toPublicDocument(document) });
  } catch (err) {
    return mapDocError(err, c);
  }
});

documentRoutes.get("/:documentId/content", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const documentId = c.req.param("documentId");
  if (!propertyId || !documentId) {
    return c.json({ error: "not_found", message: "Document not found." }, 404);
  }
  try {
    const document = getDocumentForProperty(documentId, propertyId, claims.sub);
    if (!document) {
      return c.json(
        { error: "not_found", message: "Document not found." },
        404,
      );
    }
    const bytes = readDocumentBytes(document);
    const disposition = `attachment; filename="${document.originalFilename.replace(/"/g, "")}"`;
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": document.mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": disposition,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return mapDocError(err, c);
  }
});

documentRoutes.patch("/:documentId", async (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const documentId = c.req.param("documentId");
  if (!propertyId || !documentId) {
    return c.json({ error: "not_found", message: "Document not found." }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Provide at least one valid field to update.",
      },
      400,
    );
  }

  try {
    const document = updateDocument(documentId, propertyId, claims.sub, {
      ...parsed.data,
      docType: parsed.data.docType as
        | (typeof DOCUMENT_TYPES)[number]
        | undefined,
    });
    return c.json({ document: toPublicDocument(document) });
  } catch (err) {
    return mapDocError(err, c);
  }
});

documentRoutes.delete("/:documentId", (c) => {
  const claims = c.get("claims");
  const propertyId = c.req.param("propertyId");
  const documentId = c.req.param("documentId");
  if (!propertyId || !documentId) {
    return c.json({ error: "not_found", message: "Document not found." }, 404);
  }
  try {
    deleteDocument(documentId, propertyId, claims.sub);
    return c.json({ ok: true });
  } catch (err) {
    return mapDocError(err, c);
  }
});
