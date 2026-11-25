import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { getPropertyForUser } from "./properties.js";

export type PropertyLabelKind = "asset_category" | "document_type";

export type PropertyLabelRecord = {
  id: string;
  propertyId: string;
  kind: PropertyLabelKind;
  value: string;
  createdAt: string;
  updatedAt: string;
};

const KINDS = new Set<PropertyLabelKind>([
  "asset_category",
  "document_type",
]);

/** Trim, collapse spaces, cap length — open labels, not rigid enums. */
export function normalizeLabelValue(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function labelKey(value: string): string {
  return normalizeLabelValue(value).toLowerCase();
}

function assertKind(kind: string): asserts kind is PropertyLabelKind {
  if (!KINDS.has(kind as PropertyLabelKind)) {
    throw new Error("INVALID_LABEL_KIND");
  }
}

/**
 * Remember a custom category / document type for this home.
 * Idempotent on case-insensitive match; refreshes display casing on reuse.
 */
export function rememberPropertyLabel(
  propertyId: string,
  ownerUserId: string,
  kind: PropertyLabelKind,
  rawValue: string,
): PropertyLabelRecord | null {
  assertPropertyOwned(propertyId, ownerUserId);
  assertKind(kind);
  const value = normalizeLabelValue(rawValue);
  if (!value) return null;
  const key = labelKey(value);
  const now = new Date().toISOString();
  const existing = getDb()
    .prepare(
      `SELECT id, property_id, kind, value, created_at, updated_at
       FROM property_labels
       WHERE property_id = ? AND kind = ? AND value_key = ?`,
    )
    .get(propertyId, kind, key) as
    | {
        id: string;
        property_id: string;
        kind: string;
        value: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (existing) {
    getDb()
      .prepare(
        `UPDATE property_labels
         SET value = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(value, now, existing.id);
    return {
      id: existing.id,
      propertyId: existing.property_id,
      kind: existing.kind as PropertyLabelKind,
      value,
      createdAt: existing.created_at,
      updatedAt: now,
    };
  }

  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO property_labels
        (id, property_id, kind, value, value_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, propertyId, kind, value, key, now, now);

  return {
    id,
    propertyId,
    kind,
    value,
    createdAt: now,
    updatedAt: now,
  };
}

export function listPropertyLabels(
  propertyId: string,
  ownerUserId: string,
  kind: PropertyLabelKind,
): PropertyLabelRecord[] {
  assertPropertyOwned(propertyId, ownerUserId);
  assertKind(kind);
  const rows = getDb()
    .prepare(
      `SELECT id, property_id, kind, value, created_at, updated_at
       FROM property_labels
       WHERE property_id = ? AND kind = ?
       ORDER BY lower(value) ASC`,
    )
    .all(propertyId, kind) as Array<{
    id: string;
    property_id: string;
    kind: string;
    value: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    kind: row.kind as PropertyLabelKind,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export type RenamePropertyLabelResult = {
  label: PropertyLabelRecord;
  updatedAssets: number;
  updatedDocuments: number;
};

/**
 * Rename a home-scoped category / document-type label and cascade to rows
 * that already use the old name. Caller must have confirmed in the UI.
 */
export function renamePropertyLabel(
  propertyId: string,
  ownerUserId: string,
  kind: PropertyLabelKind,
  rawOldValue: string,
  rawNewValue: string,
): RenamePropertyLabelResult {
  assertPropertyOwned(propertyId, ownerUserId);
  assertKind(kind);
  const oldValue = normalizeLabelValue(rawOldValue);
  const newValue = normalizeLabelValue(rawNewValue);
  if (!oldValue || !newValue) {
    throw new Error("EMPTY_LABEL");
  }
  const oldKey = labelKey(oldValue);
  const newKey = labelKey(newValue);
  const now = new Date().toISOString();
  const db = getDb();

  let oldRow = db
    .prepare(
      `SELECT id, property_id, kind, value, created_at, updated_at
       FROM property_labels
       WHERE property_id = ? AND kind = ? AND value_key = ?`,
    )
    .get(propertyId, kind, oldKey) as
    | {
        id: string;
        property_id: string;
        kind: string;
        value: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!oldRow) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO property_labels
        (id, property_id, kind, value, value_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, propertyId, kind, oldValue, oldKey, now, now);
    oldRow = {
      id,
      property_id: propertyId,
      kind,
      value: oldValue,
      created_at: now,
      updated_at: now,
    };
  }

  let updatedAssets = 0;
  let updatedDocuments = 0;
  if (kind === "asset_category") {
    const info = db
      .prepare(
        `UPDATE assets
         SET category = ?, updated_at = ?
         WHERE property_id = ? AND lower(trim(category)) = ?`,
      )
      .run(newValue, now, propertyId, oldKey);
    updatedAssets = Number(info.changes ?? 0);
  } else {
    const info = db
      .prepare(
        `UPDATE documents
         SET doc_type = ?, updated_at = ?
         WHERE property_id = ? AND lower(trim(doc_type)) = ?`,
      )
      .run(newValue, now, propertyId, oldKey);
    updatedDocuments = Number(info.changes ?? 0);
  }

  let label: PropertyLabelRecord;
  if (oldKey === newKey) {
    db.prepare(
      `UPDATE property_labels SET value = ?, updated_at = ? WHERE id = ?`,
    ).run(newValue, now, oldRow.id);
    label = {
      id: oldRow.id,
      propertyId: oldRow.property_id,
      kind: oldRow.kind as PropertyLabelKind,
      value: newValue,
      createdAt: oldRow.created_at,
      updatedAt: now,
    };
  } else {
    const existingNew = db
      .prepare(
        `SELECT id, property_id, kind, value, created_at, updated_at
         FROM property_labels
         WHERE property_id = ? AND kind = ? AND value_key = ?`,
      )
      .get(propertyId, kind, newKey) as
      | {
          id: string;
          property_id: string;
          kind: string;
          value: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (existingNew) {
      db.prepare(
        `UPDATE property_labels SET value = ?, updated_at = ? WHERE id = ?`,
      ).run(newValue, now, existingNew.id);
      db.prepare(`DELETE FROM property_labels WHERE id = ?`).run(oldRow.id);
      label = {
        id: existingNew.id,
        propertyId: existingNew.property_id,
        kind: existingNew.kind as PropertyLabelKind,
        value: newValue,
        createdAt: existingNew.created_at,
        updatedAt: now,
      };
    } else {
      db.prepare(
        `UPDATE property_labels
         SET value = ?, value_key = ?, updated_at = ?
         WHERE id = ?`,
      ).run(newValue, newKey, now, oldRow.id);
      label = {
        id: oldRow.id,
        propertyId: oldRow.property_id,
        kind: oldRow.kind as PropertyLabelKind,
        value: newValue,
        createdAt: oldRow.created_at,
        updatedAt: now,
      };
    }
  }

  return { label, updatedAssets, updatedDocuments };
}

function assertPropertyOwned(propertyId: string, ownerUserId: string): void {
  const property = getPropertyForUser(propertyId, ownerUserId);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
}
