import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { documentStoragePath, getDb } from "../db/client.js";
import { rememberPropertyLabel } from "./propertyLabels.js";
import { getPropertyForUser } from "./properties.js";
import type {
  AssetCategory,
  AssetProvenance,
  AssetRecord,
} from "./types.js";

type AssetRow = {
  id: string;
  property_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchase_date: string | null;
  install_date: string | null;
  installer_vendor: string | null;
  installer_contractor_id: string | null;
  last_serviced_at: string | null;
  confirmed_by_contractor_name: string | null;
  location: string | null;
  notes: string | null;
  warranty_end_date: string | null;
  warranty_term: string | null;
  provenance: string;
  created_at: string;
  updated_at: string;
};

export type CreateAssetInput = {
  name: string;
  category: AssetCategory;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  purchaseDate?: string | null;
  installDate?: string | null;
  installerVendor?: string | null;
  installerContractorId?: string | null;
  lastServicedAt?: string | null;
  confirmedByContractorName?: string | null;
  location?: string | null;
  notes?: string | null;
  warrantyEndDate?: string | null;
  warrantyTerm?: string | null;
  provenance?: AssetProvenance;
};

export type UpdateAssetInput = Partial<CreateAssetInput>;

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rowToAsset(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    name: row.name,
    category: row.category as AssetCategory,
    manufacturer: row.manufacturer,
    model: row.model,
    serial: row.serial,
    purchaseDate: row.purchase_date,
    installDate: row.install_date,
    installerVendor: row.installer_vendor,
    installerContractorId: row.installer_contractor_id,
    lastServicedAt: row.last_serviced_at,
    confirmedByContractorName: row.confirmed_by_contractor_name,
    location: row.location,
    notes: row.notes,
    warrantyEndDate: row.warranty_end_date,
    warrantyTerm: row.warranty_term,
    provenance: row.provenance as AssetProvenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ASSET_SELECT = `SELECT id, property_id, name, category, manufacturer, model, serial,
       purchase_date, install_date, installer_vendor, installer_contractor_id,
       last_serviced_at, confirmed_by_contractor_name,
       location, notes,
       warranty_end_date, warranty_term, provenance,
       created_at, updated_at
FROM assets`;

/**
 * Assert the caller owns the property before any asset read/write.
 * Prevents cross-home and cross-account leakage.
 */
export function assertPropertyOwnedByUser(
  propertyId: string,
  ownerUserId: string,
): void {
  const property = getPropertyForUser(propertyId, ownerUserId);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
}

/**
 * List assets for one owned home only. Never returns another property's rows.
 */
export function listAssetsForProperty(
  propertyId: string,
  ownerUserId: string,
): AssetRecord[] {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  const rows = getDb()
    .prepare(
      `${ASSET_SELECT}
       WHERE property_id = ?
       ORDER BY name COLLATE NOCASE ASC, created_at ASC`,
    )
    .all(propertyId) as AssetRow[];
  return rows.map(rowToAsset);
}

export function getAssetForProperty(
  assetId: string,
  propertyId: string,
  ownerUserId: string,
): AssetRecord | undefined {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  const row = getDb()
    .prepare(
      `${ASSET_SELECT}
       WHERE id = ? AND property_id = ?`,
    )
    .get(assetId, propertyId) as AssetRow | undefined;
  return row ? rowToAsset(row) : undefined;
}

export function createAsset(
  propertyId: string,
  ownerUserId: string,
  input: CreateAssetInput,
): AssetRecord {
  assertPropertyOwnedByUser(propertyId, ownerUserId);

  const now = new Date().toISOString();
  const asset: AssetRecord = {
    id: randomUUID(),
    propertyId,
    name: input.name.trim(),
    category: input.category,
    manufacturer: optionalText(input.manufacturer),
    model: optionalText(input.model),
    serial: optionalText(input.serial),
    purchaseDate: optionalText(input.purchaseDate),
    installDate: optionalText(input.installDate),
    installerVendor: optionalText(input.installerVendor),
    installerContractorId: optionalText(input.installerContractorId),
    lastServicedAt: optionalText(input.lastServicedAt),
    confirmedByContractorName: optionalText(input.confirmedByContractorName),
    location: optionalText(input.location),
    notes: optionalText(input.notes),
    warrantyEndDate: optionalText(input.warrantyEndDate),
    warrantyTerm: optionalText(input.warrantyTerm),
    // Homeowner self-capture for this epic; contractor seeds arrive via EPIC 8.
    provenance: input.provenance ?? "homeowner",
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO assets
        (id, property_id, name, category, manufacturer, model, serial,
         purchase_date, install_date, installer_vendor, installer_contractor_id,
         last_serviced_at, confirmed_by_contractor_name,
         location, notes,
         warranty_end_date, warranty_term, provenance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      asset.id,
      asset.propertyId,
      asset.name,
      asset.category,
      asset.manufacturer,
      asset.model,
      asset.serial,
      asset.purchaseDate,
      asset.installDate,
      asset.installerVendor,
      asset.installerContractorId,
      asset.lastServicedAt,
      asset.confirmedByContractorName,
      asset.location,
      asset.notes,
      asset.warrantyEndDate,
      asset.warrantyTerm,
      asset.provenance,
      asset.createdAt,
      asset.updatedAt,
    );

  rememberPropertyLabel(
    propertyId,
    ownerUserId,
    "asset_category",
    asset.category,
  );

  return asset;
}

export function updateAsset(
  assetId: string,
  propertyId: string,
  ownerUserId: string,
  input: UpdateAssetInput,
): AssetRecord {
  const existing = getAssetForProperty(assetId, propertyId, ownerUserId);
  if (!existing) throw new Error("ASSET_NOT_FOUND");

  const updated: AssetRecord = {
    ...existing,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    category: input.category ?? existing.category,
    manufacturer:
      input.manufacturer !== undefined
        ? optionalText(input.manufacturer)
        : existing.manufacturer,
    model:
      input.model !== undefined ? optionalText(input.model) : existing.model,
    serial:
      input.serial !== undefined ? optionalText(input.serial) : existing.serial,
    purchaseDate:
      input.purchaseDate !== undefined
        ? optionalText(input.purchaseDate)
        : existing.purchaseDate,
    installDate:
      input.installDate !== undefined
        ? optionalText(input.installDate)
        : existing.installDate,
    installerVendor:
      input.installerVendor !== undefined
        ? optionalText(input.installerVendor)
        : existing.installerVendor,
    installerContractorId:
      input.installerContractorId !== undefined
        ? optionalText(input.installerContractorId)
        : existing.installerContractorId,
    lastServicedAt:
      input.lastServicedAt !== undefined
        ? optionalText(input.lastServicedAt)
        : existing.lastServicedAt,
    confirmedByContractorName:
      input.confirmedByContractorName !== undefined
        ? optionalText(input.confirmedByContractorName)
        : existing.confirmedByContractorName,
    location:
      input.location !== undefined
        ? optionalText(input.location)
        : existing.location,
    notes:
      input.notes !== undefined ? optionalText(input.notes) : existing.notes,
    warrantyEndDate:
      input.warrantyEndDate !== undefined
        ? optionalText(input.warrantyEndDate)
        : existing.warrantyEndDate,
    warrantyTerm:
      input.warrantyTerm !== undefined
        ? optionalText(input.warrantyTerm)
        : existing.warrantyTerm,
    provenance: input.provenance ?? existing.provenance,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE assets SET
         name = ?, category = ?, manufacturer = ?, model = ?, serial = ?,
         purchase_date = ?, install_date = ?, installer_vendor = ?,
         installer_contractor_id = ?,
         last_serviced_at = ?, confirmed_by_contractor_name = ?,
         location = ?, notes = ?, warranty_end_date = ?, warranty_term = ?,
         provenance = ?, updated_at = ?
       WHERE id = ? AND property_id = ?`,
    )
    .run(
      updated.name,
      updated.category,
      updated.manufacturer,
      updated.model,
      updated.serial,
      updated.purchaseDate,
      updated.installDate,
      updated.installerVendor,
      updated.installerContractorId,
      updated.lastServicedAt,
      updated.confirmedByContractorName,
      updated.location,
      updated.notes,
      updated.warrantyEndDate,
      updated.warrantyTerm,
      updated.provenance,
      updated.updatedAt,
      updated.id,
      updated.propertyId,
    );

  if (input.category !== undefined) {
    rememberPropertyLabel(
      propertyId,
      ownerUserId,
      "asset_category",
      updated.category,
    );
  }

  return updated;
}

export function deleteAsset(
  assetId: string,
  propertyId: string,
  ownerUserId: string,
): void {
  const existing = getAssetForProperty(assetId, propertyId, ownerUserId);
  if (!existing) throw new Error("ASSET_NOT_FOUND");

  // Remove stored files before CASCADE deletes document rows.
  const fileRows = getDb()
    .prepare(
      `SELECT storage_key FROM documents WHERE asset_id = ? AND property_id = ?`,
    )
    .all(assetId, propertyId) as Array<{ storage_key: string }>;
  getDb()
    .prepare(`DELETE FROM documents WHERE asset_id = ? AND property_id = ?`)
    .run(assetId, propertyId);
  for (const row of fileRows) {
    const path = documentStoragePath(row.storage_key);
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // best-effort
    }
  }

  // Completions cascade from reminders; remove reminder rows before the asset.
  getDb()
    .prepare(
      `DELETE FROM reminder_completions
       WHERE reminder_id IN (
         SELECT id FROM reminders WHERE asset_id = ? AND property_id = ?
       )`,
    )
    .run(assetId, propertyId);
  getDb()
    .prepare(`DELETE FROM reminders WHERE asset_id = ? AND property_id = ?`)
    .run(assetId, propertyId);

  getDb()
    .prepare(`DELETE FROM assets WHERE id = ? AND property_id = ?`)
    .run(assetId, propertyId);
}
