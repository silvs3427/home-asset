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

function assertPropertyOwned(propertyId: string, ownerUserId: string): void {
  const property = getPropertyForUser(propertyId, ownerUserId);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
}
