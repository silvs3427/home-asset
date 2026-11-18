/**
 * Postgres-backed store (Supabase) for when DATA_BACKEND=supabase.
 * Service role bypasses RLS; every function still filters by ownerUserId
 * (same privacy bar as the SQLite path).
 */
import { randomUUID } from "node:crypto";
import type {
  AppFace,
  AssetProvenance,
  AssetRecord,
  DocumentRecord,
  DocumentSource,
  DocumentType,
  NotificationPreferences,
  NotificationRecord,
  PropertyRecord,
  PushDeviceRecord,
  ReminderCompletionRecord,
  ReminderRecord,
  UserRecord,
} from "../types.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../types.js";
import type { CreatePropertyInput } from "../properties.js";
import type { CreateDocumentInput, UpdateDocumentInput } from "../documents.js";
import { getSupabaseService } from "./client.js";
import {
  downloadDocumentObject,
  removeDocumentObject,
  uploadDocumentObject,
} from "./storage.js";
import { config } from "../../config.js";

type ProfileRow = {
  id: string;
  email: string;
  faces_json: AppFace[] | string;
  active_face: AppFace;
  active_property_id: string | null;
  created_at: string;
};

function facesFrom(value: AppFace[] | string): AppFace[] {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as AppFace[];
  } catch {
    return ["homeowner"];
  }
}

function profileToUser(row: ProfileRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: "supabase-auth",
    faces: facesFrom(row.faces_json),
    activeFace: row.active_face,
    activePropertyId: row.active_property_id,
    createdAt: row.created_at,
  };
}

function propertyFromRow(row: Record<string, unknown>): PropertyRecord {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name),
    addressLine1: String(row.address_line1),
    addressLine2: (row.address_line2 as string | null) ?? null,
    city: String(row.city),
    region: String(row.region),
    postalCode: String(row.postal_code),
    country: String(row.country),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function assetFromRow(row: Record<string, unknown>): AssetRecord {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    name: String(row.name),
    category: row.category as AssetRecord["category"],
    manufacturer: (row.manufacturer as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serial: (row.serial as string | null) ?? null,
    purchaseDate: (row.purchase_date as string | null) ?? null,
    installDate: (row.install_date as string | null) ?? null,
    installerVendor: (row.installer_vendor as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    warrantyEndDate: (row.warranty_end_date as string | null) ?? null,
    warrantyTerm: (row.warranty_term as string | null) ?? null,
    provenance: row.provenance as AssetProvenance,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function documentFromRow(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    assetId: (row.asset_id as string | null) ?? null,
    title: String(row.title),
    docType: row.doc_type as DocumentType,
    documentDate: (row.document_date as string | null) ?? null,
    source: row.source as DocumentSource,
    mimeType: String(row.mime_type),
    originalFilename: String(row.original_filename),
    storageKey: String(row.storage_key),
    byteSize: Number(row.byte_size),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function reminderFromRow(row: Record<string, unknown>): ReminderRecord {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    assetId: String(row.asset_id),
    title: String(row.title),
    notes: (row.notes as string | null) ?? null,
    dueDate: String(row.due_date),
    recurrence: row.recurrence as ReminderRecord["recurrence"],
    status: row.status as ReminderRecord["status"],
    lastCompletedAt: (row.last_completed_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function sbGetUserById(id: string): Promise<UserRecord | undefined> {
  const { data, error } = await getSupabaseService()
    .from("profiles")
    .select("id, email, faces_json, active_face, active_property_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`SB_USER:${error.message}`);
  return data ? profileToUser(data as ProfileRow) : undefined;
}

export async function sbSetActiveFace(
  userId: string,
  face: AppFace,
): Promise<UserRecord> {
  const user = await sbGetUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!user.faces.includes(face)) throw new Error("FACE_NOT_AVAILABLE");
  const { error } = await getSupabaseService()
    .from("profiles")
    .update({ active_face: face })
    .eq("id", userId);
  if (error) throw new Error(`SB_FACE:${error.message}`);
  return { ...user, activeFace: face };
}

export async function sbEnableFace(
  userId: string,
  face: AppFace,
): Promise<UserRecord> {
  const user = await sbGetUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.faces.includes(face)) return user;
  const faces = [...user.faces, face];
  const { error } = await getSupabaseService()
    .from("profiles")
    .update({ faces_json: faces })
    .eq("id", userId);
  if (error) throw new Error(`SB_ENABLE_FACE:${error.message}`);
  return { ...user, faces };
}

export async function sbSetActivePropertyId(
  userId: string,
  propertyId: string | null,
): Promise<UserRecord> {
  const user = await sbGetUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  const { error } = await getSupabaseService()
    .from("profiles")
    .update({ active_property_id: propertyId })
    .eq("id", userId);
  if (error) throw new Error(`SB_ACTIVE_PROPERTY:${error.message}`);
  return { ...user, activePropertyId: propertyId };
}

export async function sbListProperties(
  ownerUserId: string,
): Promise<PropertyRecord[]> {
  const { data, error } = await getSupabaseService()
    .from("properties")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`SB_PROPERTIES:${error.message}`);
  return (data ?? []).map((row) => propertyFromRow(row));
}

export async function sbGetProperty(
  propertyId: string,
  ownerUserId: string,
): Promise<PropertyRecord | undefined> {
  const { data, error } = await getSupabaseService()
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) throw new Error(`SB_PROPERTY:${error.message}`);
  return data ? propertyFromRow(data) : undefined;
}

export async function sbCreateProperty(
  ownerUserId: string,
  input: CreatePropertyInput,
): Promise<PropertyRecord> {
  const owner = await sbGetUserById(ownerUserId);
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
  const { error } = await getSupabaseService().from("properties").insert({
    id: property.id,
    owner_user_id: property.ownerUserId,
    name: property.name,
    address_line1: property.addressLine1,
    address_line2: property.addressLine2,
    city: property.city,
    region: property.region,
    postal_code: property.postalCode,
    country: property.country,
    created_at: property.createdAt,
    updated_at: property.updatedAt,
  });
  if (error) throw new Error(`SB_CREATE_PROPERTY:${error.message}`);
  if (!owner.activePropertyId) {
    await sbSetActivePropertyId(ownerUserId, property.id);
  }
  return property;
}

export async function sbAssertPropertyOwned(
  propertyId: string,
  ownerUserId: string,
): Promise<PropertyRecord> {
  const property = await sbGetProperty(propertyId, ownerUserId);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
  return property;
}

export async function sbListAssets(
  propertyId: string,
  ownerUserId: string,
): Promise<AssetRecord[]> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  const { data, error } = await getSupabaseService()
    .from("assets")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`SB_ASSETS:${error.message}`);
  return (data ?? []).map((row) => assetFromRow(row));
}

export async function sbGetAsset(
  assetId: string,
  propertyId: string,
  ownerUserId: string,
): Promise<AssetRecord | undefined> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  const { data, error } = await getSupabaseService()
    .from("assets")
    .select("*")
    .eq("id", assetId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw new Error(`SB_ASSET:${error.message}`);
  return data ? assetFromRow(data) : undefined;
}

export async function sbCreateAsset(
  propertyId: string,
  ownerUserId: string,
  input: Omit<
    AssetRecord,
    "id" | "propertyId" | "createdAt" | "updatedAt" | "provenance"
  > & { provenance?: AssetProvenance },
): Promise<AssetRecord> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  const now = new Date().toISOString();
  const asset: AssetRecord = {
    id: randomUUID(),
    propertyId,
    name: input.name.trim(),
    category: input.category,
    manufacturer: input.manufacturer,
    model: input.model,
    serial: input.serial,
    purchaseDate: input.purchaseDate,
    installDate: input.installDate,
    installerVendor: input.installerVendor,
    location: input.location,
    notes: input.notes,
    warrantyEndDate: input.warrantyEndDate,
    warrantyTerm: input.warrantyTerm,
    provenance: input.provenance ?? "homeowner",
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await getSupabaseService().from("assets").insert({
    id: asset.id,
    property_id: asset.propertyId,
    name: asset.name,
    category: asset.category,
    manufacturer: asset.manufacturer,
    model: asset.model,
    serial: asset.serial,
    purchase_date: asset.purchaseDate,
    install_date: asset.installDate,
    installer_vendor: asset.installerVendor,
    location: asset.location,
    notes: asset.notes,
    warranty_end_date: asset.warrantyEndDate,
    warranty_term: asset.warrantyTerm,
    provenance: asset.provenance,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
  });
  if (error) throw new Error(`SB_CREATE_ASSET:${error.message}`);
  return asset;
}

export async function sbListDocuments(
  propertyId: string,
  ownerUserId: string,
  options?: { assetId?: string | null; propertyOnly?: boolean },
): Promise<DocumentRecord[]> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  let q = getSupabaseService()
    .from("documents")
    .select("*")
    .eq("property_id", propertyId);
  if (options?.propertyOnly) q = q.is("asset_id", null);
  else if (options?.assetId) q = q.eq("asset_id", options.assetId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`SB_DOCUMENTS:${error.message}`);
  return (data ?? []).map((row) => documentFromRow(row));
}

export async function sbGetDocument(
  documentId: string,
  propertyId: string,
  ownerUserId: string,
): Promise<DocumentRecord | undefined> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  const { data, error } = await getSupabaseService()
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw new Error(`SB_DOCUMENT:${error.message}`);
  return data ? documentFromRow(data) : undefined;
}

function sanitizeFilename(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180);
  return base.length > 0 ? base : "upload.bin";
}

export async function sbCreateDocument(
  propertyId: string,
  ownerUserId: string,
  input: CreateDocumentInput,
): Promise<DocumentRecord> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  if (input.bytes.byteLength === 0) throw new Error("EMPTY_FILE");
  if (input.bytes.byteLength > config.maxUploadBytes) {
    throw new Error("FILE_TOO_LARGE");
  }
  const assetId = input.assetId?.trim() || null;
  if (assetId) {
    const asset = await sbGetAsset(assetId, propertyId, ownerUserId);
    if (!asset) throw new Error("ASSET_NOT_FOUND");
  }
  const id = randomUUID();
  const storageKey = `${propertyId}/${id}/${sanitizeFilename(input.originalFilename)}`;
  await uploadDocumentObject(storageKey, input.bytes, input.mimeType);
  const now = new Date().toISOString();
  const doc: DocumentRecord = {
    id,
    propertyId,
    assetId,
    title: input.title.trim(),
    docType: input.docType,
    documentDate: input.documentDate?.trim() || null,
    source: input.source ?? "user",
    mimeType: input.mimeType.trim() || "application/octet-stream",
    originalFilename: sanitizeFilename(input.originalFilename),
    storageKey,
    byteSize: input.bytes.byteLength,
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await getSupabaseService().from("documents").insert({
    id: doc.id,
    property_id: doc.propertyId,
    asset_id: doc.assetId,
    title: doc.title,
    doc_type: doc.docType,
    document_date: doc.documentDate,
    source: doc.source,
    mime_type: doc.mimeType,
    original_filename: doc.originalFilename,
    storage_key: doc.storageKey,
    byte_size: doc.byteSize,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  });
  if (error) {
    await removeDocumentObject(storageKey);
    throw new Error(`SB_CREATE_DOCUMENT:${error.message}`);
  }
  return doc;
}

export async function sbUpdateDocument(
  documentId: string,
  propertyId: string,
  ownerUserId: string,
  input: UpdateDocumentInput,
): Promise<DocumentRecord> {
  const existing = await sbGetDocument(documentId, propertyId, ownerUserId);
  if (!existing) throw new Error("DOCUMENT_NOT_FOUND");
  let nextAssetId = existing.assetId;
  if (input.assetId !== undefined) {
    const assetId = input.assetId?.trim() || null;
    if (assetId) {
      const asset = await sbGetAsset(assetId, propertyId, ownerUserId);
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
        ? input.documentDate?.trim() || null
        : existing.documentDate,
    assetId: nextAssetId,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await getSupabaseService()
    .from("documents")
    .update({
      title: updated.title,
      doc_type: updated.docType,
      document_date: updated.documentDate,
      asset_id: updated.assetId,
      updated_at: updated.updatedAt,
    })
    .eq("id", documentId)
    .eq("property_id", propertyId);
  if (error) throw new Error(`SB_UPDATE_DOCUMENT:${error.message}`);
  return updated;
}

export async function sbDeleteDocument(
  documentId: string,
  propertyId: string,
  ownerUserId: string,
): Promise<void> {
  const existing = await sbGetDocument(documentId, propertyId, ownerUserId);
  if (!existing) throw new Error("DOCUMENT_NOT_FOUND");
  const { error } = await getSupabaseService()
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("property_id", propertyId);
  if (error) throw new Error(`SB_DELETE_DOCUMENT:${error.message}`);
  await removeDocumentObject(existing.storageKey);
}

export async function sbReadDocumentBytes(doc: DocumentRecord): Promise<Buffer> {
  return downloadDocumentObject(doc.storageKey);
}

export async function sbListReminders(
  propertyId: string,
  ownerUserId: string,
): Promise<ReminderRecord[]> {
  await sbAssertPropertyOwned(propertyId, ownerUserId);
  const { data, error } = await getSupabaseService()
    .from("reminders")
    .select("*")
    .eq("property_id", propertyId)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`SB_REMINDERS:${error.message}`);
  return (data ?? []).map((row) => reminderFromRow(row));
}

export async function sbGetNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await getSupabaseService()
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`SB_PREFS:${error.message}`);
  if (!data) {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    remindersEnabled: Boolean(data.reminders_enabled),
    recallsEnabled: Boolean(data.recalls_enabled),
    contractorSubmitsEnabled: Boolean(data.contractor_submits_enabled),
    reminderLeadDays: Number(data.reminder_lead_days),
    pushEnabled: Boolean(data.push_enabled),
    inAppEnabled: Boolean(data.in_app_enabled),
    updatedAt: String(data.updated_at),
  };
}

export async function sbListNotifications(
  userId: string,
): Promise<NotificationRecord[]> {
  const { data, error } = await getSupabaseService()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`SB_NOTIFICATIONS:${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    propertyId: (row.property_id as string | null) ?? null,
    kind: row.kind as NotificationRecord["kind"],
    title: String(row.title),
    body: String(row.body),
    relatedReminderId: (row.related_reminder_id as string | null) ?? null,
    relatedAssetId: (row.related_asset_id as string | null) ?? null,
    relatedEntityId: (row.related_entity_id as string | null) ?? null,
    dedupeKey: String(row.dedupe_key),
    readAt: (row.read_at as string | null) ?? null,
    pushStatus: row.push_status as NotificationRecord["pushStatus"],
    pushSentAt: (row.push_sent_at as string | null) ?? null,
    createdAt: String(row.created_at),
  }));
}

export async function sbUpsertPushDevice(input: {
  userId: string;
  expoPushToken: string;
  platform?: string | null;
  deviceName?: string | null;
}): Promise<PushDeviceRecord> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const { data: existing } = await getSupabaseService()
    .from("push_devices")
    .select("*")
    .eq("expo_push_token", input.expoPushToken)
    .maybeSingle();
  if (existing) {
    const { error } = await getSupabaseService()
      .from("push_devices")
      .update({
        user_id: input.userId,
        platform: input.platform ?? null,
        device_name: input.deviceName ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) throw new Error(`SB_PUSH:${error.message}`);
    return {
      id: String(existing.id),
      userId: input.userId,
      expoPushToken: input.expoPushToken,
      platform: input.platform ?? null,
      deviceName: input.deviceName ?? null,
      createdAt: String(existing.created_at),
      updatedAt: now,
    };
  }
  const { error } = await getSupabaseService().from("push_devices").insert({
    id,
    user_id: input.userId,
    expo_push_token: input.expoPushToken,
    platform: input.platform ?? null,
    device_name: input.deviceName ?? null,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`SB_PUSH_INSERT:${error.message}`);
  return {
    id,
    userId: input.userId,
    expoPushToken: input.expoPushToken,
    platform: input.platform ?? null,
    deviceName: input.deviceName ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// Keep unused import referenced for future reminder completion APIs.
export type { ReminderCompletionRecord };
