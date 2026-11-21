import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { documentStoragePath, getDb } from "../db/client.js";
import { assertPropertyOwnedByUser, getAssetForProperty } from "./assets.js";
import { rememberPropertyLabel } from "./propertyLabels.js";
import { isSupabaseStorageEnabled } from "./supabase/client.js";
import {
  downloadDocumentObject,
  removeDocumentObject,
  uploadDocumentObject,
} from "./supabase/storage.js";
import type {
  DocumentRecord,
  DocumentSource,
  DocumentType,
} from "./types.js";

type DocumentRow = {
  id: string;
  property_id: string;
  asset_id: string | null;
  title: string;
  doc_type: string;
  document_date: string | null;
  source: string;
  mime_type: string;
  original_filename: string;
  storage_key: string;
  byte_size: number;
  created_at: string;
  updated_at: string;
};

export type CreateDocumentInput = {
  title: string;
  docType: DocumentType;
  documentDate?: string | null;
  source?: DocumentSource;
  assetId?: string | null;
  mimeType: string;
  originalFilename: string;
  bytes: Buffer;
};

export type UpdateDocumentInput = {
  title?: string;
  docType?: DocumentType;
  documentDate?: string | null;
  assetId?: string | null;
};

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeFilename(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180);
  return base.length > 0 ? base : "upload.bin";
}

function rowToDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    assetId: row.asset_id,
    title: row.title,
    docType: row.doc_type as DocumentType,
    documentDate: row.document_date,
    source: row.source as DocumentSource,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    storageKey: row.storage_key,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DOC_SELECT = `SELECT id, property_id, asset_id, title, doc_type, document_date,
       source, mime_type, original_filename, storage_key, byte_size,
       created_at, updated_at
FROM documents`;

function removeStorageFile(storageKey: string): void {
  const path = documentStoragePath(storageKey);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Best-effort cleanup; metadata row is the source of truth for API.
  }
}

/**
 * List documents for an owned home. Optional assetId filters to one asset;
 * scope=property returns only home-level docs (asset_id IS NULL).
 */
export function listDocumentsForProperty(
  propertyId: string,
  ownerUserId: string,
  options?: { assetId?: string | null; propertyOnly?: boolean },
): DocumentRecord[] {
  assertPropertyOwnedByUser(propertyId, ownerUserId);

  let sql = `${DOC_SELECT} WHERE property_id = ?`;
  const params: string[] = [propertyId];

  if (options?.propertyOnly) {
    sql += ` AND asset_id IS NULL`;
  } else if (options?.assetId) {
    sql += ` AND asset_id = ?`;
    params.push(options.assetId);
  }

  sql += ` ORDER BY created_at DESC`;

  const rows = getDb().prepare(sql).all(...params) as DocumentRow[];
  return rows.map(rowToDocument);
}

export function getDocumentForProperty(
  documentId: string,
  propertyId: string,
  ownerUserId: string,
): DocumentRecord | undefined {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  const row = getDb()
    .prepare(
      `${DOC_SELECT}
       WHERE id = ? AND property_id = ?`,
    )
    .get(documentId, propertyId) as DocumentRow | undefined;
  return row ? rowToDocument(row) : undefined;
}

export async function createDocument(
  propertyId: string,
  ownerUserId: string,
  input: CreateDocumentInput,
): Promise<DocumentRecord> {
  assertPropertyOwnedByUser(propertyId, ownerUserId);

  if (input.bytes.byteLength === 0) {
    throw new Error("EMPTY_FILE");
  }
  if (input.bytes.byteLength > config.maxUploadBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const assetId = optionalText(input.assetId);
  if (assetId) {
    const asset = getAssetForProperty(assetId, propertyId, ownerUserId);
    if (!asset) throw new Error("ASSET_NOT_FOUND");
  }

  const id = randomUUID();
  const useSupabase = isSupabaseStorageEnabled();
  // Always forward-slash relative key; absolute path uses platform join.
  // Supabase keys include the filename so Storage folder policies stay clear.
  const storageKey = useSupabase
    ? `${propertyId}/${id}/${sanitizeFilename(input.originalFilename)}`
    : `${propertyId}/${id}`;

  if (useSupabase) {
    await uploadDocumentObject(storageKey, input.bytes, input.mimeType.trim() || "application/octet-stream");
  } else {
    const absolutePath = documentStoragePath(storageKey);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, input.bytes);
  }

  const now = new Date().toISOString();
  const doc: DocumentRecord = {
    id,
    propertyId,
    assetId,
    title: input.title.trim(),
    docType: input.docType,
    documentDate: optionalText(input.documentDate),
    source: input.source ?? "user",
    mimeType: input.mimeType.trim() || "application/octet-stream",
    originalFilename: sanitizeFilename(input.originalFilename),
    storageKey,
    byteSize: input.bytes.byteLength,
    createdAt: now,
    updatedAt: now,
  };

  try {
    getDb()
      .prepare(
        `INSERT INTO documents
          (id, property_id, asset_id, title, doc_type, document_date, source,
           mime_type, original_filename, storage_key, byte_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        doc.id,
        doc.propertyId,
        doc.assetId,
        doc.title,
        doc.docType,
        doc.documentDate,
        doc.source,
        doc.mimeType,
        doc.originalFilename,
        doc.storageKey,
        doc.byteSize,
        doc.createdAt,
        doc.updatedAt,
      );
    rememberPropertyLabel(
      propertyId,
      ownerUserId,
      "document_type",
      doc.docType,
    );
  } catch (err) {
    if (useSupabase) {
      await removeDocumentObject(storageKey);
    } else {
      removeStorageFile(storageKey);
    }
    throw err;
  }

  return doc;
}

export function updateDocument(
  documentId: string,
  propertyId: string,
  ownerUserId: string,
  input: UpdateDocumentInput,
): DocumentRecord {
  const existing = getDocumentForProperty(documentId, propertyId, ownerUserId);
  if (!existing) throw new Error("DOCUMENT_NOT_FOUND");

  let nextAssetId = existing.assetId;
  if (input.assetId !== undefined) {
    const assetId = optionalText(input.assetId);
    if (assetId) {
      const asset = getAssetForProperty(assetId, propertyId, ownerUserId);
      if (!asset) throw new Error("ASSET_NOT_FOUND");
    }
    nextAssetId = assetId;
  }

  const updated: DocumentRecord = {
    ...existing,
    title: input.title !== undefined ? input.title.trim() : existing.title,
    docType: input.docType ?? existing.docType,
    documentDate:
      input.documentDate !== undefined
        ? optionalText(input.documentDate)
        : existing.documentDate,
    assetId: nextAssetId,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE documents SET
         title = ?, doc_type = ?, document_date = ?, asset_id = ?, updated_at = ?
       WHERE id = ? AND property_id = ?`,
    )
    .run(
      updated.title,
      updated.docType,
      updated.documentDate,
      updated.assetId,
      updated.updatedAt,
      updated.id,
      updated.propertyId,
    );

  if (input.docType !== undefined) {
    rememberPropertyLabel(
      propertyId,
      ownerUserId,
      "document_type",
      updated.docType,
    );
  }

  return updated;
}

export async function deleteDocument(
  documentId: string,
  propertyId: string,
  ownerUserId: string,
): Promise<void> {
  const existing = getDocumentForProperty(documentId, propertyId, ownerUserId);
  if (!existing) throw new Error("DOCUMENT_NOT_FOUND");

  getDb()
    .prepare(`DELETE FROM documents WHERE id = ? AND property_id = ?`)
    .run(documentId, propertyId);
  if (isSupabaseStorageEnabled()) {
    await removeDocumentObject(existing.storageKey);
  } else {
    removeStorageFile(existing.storageKey);
  }
}

/** Read file bytes for download — ownership already checked via getDocumentForProperty. */
export async function readDocumentBytes(doc: DocumentRecord): Promise<Buffer> {
  if (isSupabaseStorageEnabled()) {
    return downloadDocumentObject(doc.storageKey);
  }
  const path = documentStoragePath(doc.storageKey);
  if (!existsSync(path)) {
    throw new Error("FILE_MISSING");
  }
  return readFileSync(path);
}
