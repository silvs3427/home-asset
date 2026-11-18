import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { getUserById, setActivePropertyIdAsync } from "./users.js";
import type { PropertyRecord } from "./types.js";

type PropertyRow = {
  id: string;
  owner_user_id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  created_at: string;
  updated_at: string;
};

export type CreatePropertyInput = {
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
};

function rowToProperty(row: PropertyRow): PropertyRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Homes owned by a user. Least privilege: every query filters by ownerUserId.
 * Future assets/docs/recalls must reference propertyId — never orphan global rows.
 */
export function listPropertiesForUser(ownerUserId: string): PropertyRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, owner_user_id, name, address_line1, address_line2, city, region,
              postal_code, country, created_at, updated_at
       FROM properties
       WHERE owner_user_id = ?
       ORDER BY created_at ASC`,
    )
    .all(ownerUserId) as PropertyRow[];
  return rows.map(rowToProperty);
}

export function getPropertyForUser(
  propertyId: string,
  ownerUserId: string,
): PropertyRecord | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, owner_user_id, name, address_line1, address_line2, city, region,
              postal_code, country, created_at, updated_at
       FROM properties
       WHERE id = ? AND owner_user_id = ?`,
    )
    .get(propertyId, ownerUserId) as PropertyRow | undefined;
  return row ? rowToProperty(row) : undefined;
}

export async function createProperty(
  ownerUserId: string,
  input: CreatePropertyInput,
): Promise<PropertyRecord> {
  const owner = getUserById(ownerUserId);
  if (!owner) throw new Error("USER_NOT_FOUND");

  const now = new Date().toISOString();
  const property: PropertyRecord = {
    id: randomUUID(),
    ownerUserId,
    name: input.name.trim(),
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() || null,
    city: input.city.trim(),
    region: input.region.trim(),
    postalCode: input.postalCode.trim(),
    country: (input.country ?? "US").trim() || "US",
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO properties
        (id, owner_user_id, name, address_line1, address_line2, city, region,
         postal_code, country, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      property.id,
      property.ownerUserId,
      property.name,
      property.addressLine1,
      property.addressLine2,
      property.city,
      property.region,
      property.postalCode,
      property.country,
      property.createdAt,
      property.updatedAt,
    );

  // First home becomes the active selection automatically.
  if (!owner.activePropertyId) {
    await setActivePropertyIdAsync(ownerUserId, property.id);
  }

  return property;
}

export async function selectPropertyForUser(
  ownerUserId: string,
  propertyId: string,
): Promise<PropertyRecord> {
  const property = getPropertyForUser(propertyId, ownerUserId);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
  await setActivePropertyIdAsync(ownerUserId, property.id);
  return property;
}
