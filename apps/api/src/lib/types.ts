/** Product faces on one login (thin switch; CRM-lite comes later). */
export type AppFace = "homeowner" | "contractor";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  /** Faces this account may use. */
  faces: AppFace[];
  /** Active face for this session context. */
  activeFace: AppFace;
  /** Currently selected home (null until first home is added). */
  activePropertyId: string | null;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  faces: AppFace[];
  activeFace: AppFace;
  activePropertyId: string | null;
};

/**
 * A home the user owns. Every future asset/doc/recall row scopes to propertyId.
 * Solo-owner membership only — no RBAC / co-owners in this epic.
 */
export type PropertyRecord = {
  id: string;
  ownerUserId: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  createdAt: string;
  updatedAt: string;
};

/** Public home payload — never includes other users' data. */
export type PublicProperty = {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Who created the asset row. Homeowner self-capture vs accepted contractor seed.
 * Contractor write path arrives in EPIC 8 — field is ready now.
 */
export type AssetProvenance = "homeowner" | "contractor";

/**
 * Open homeowner-defined category label (per home).
 * Legacy snake_case values still appear on older rows; new entries are free text.
 */
export type AssetCategory = string;

/**
 * Property-scoped asset. manufacturer/model/serial are first-class for
 * docs and recall matching (EPIC 7). Warranty end / term are visible on the asset.
 */
export type AssetRecord = {
  id: string;
  propertyId: string;
  name: string;
  category: AssetCategory;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchaseDate: string | null;
  installDate: string | null;
  installerVendor: string | null;
  location: string | null;
  notes: string | null;
  warrantyEndDate: string | null;
  warrantyTerm: string | null;
  provenance: AssetProvenance;
  createdAt: string;
  updatedAt: string;
};

/** Public asset payload — never includes other homes' rows. */
export type PublicAsset = {
  id: string;
  propertyId: string;
  name: string;
  category: AssetCategory;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchaseDate: string | null;
  installDate: string | null;
  installerVendor: string | null;
  location: string | null;
  notes: string | null;
  warrantyEndDate: string | null;
  warrantyTerm: string | null;
  provenance: AssetProvenance;
  createdAt: string;
  updatedAt: string;
};

/**
 * Open homeowner-defined document type label (per home).
 * Legacy snake_case values still appear on older rows; new entries are free text.
 */
export type DocumentType = string;

/**
 * Provenance of a file. Homeowner uploads are "user"; AI-fetched manuals and
 * contractor packets arrive in later epics — field is ready now.
 */
export type DocumentSource = "user" | "ai_fetched" | "contractor";

/**
 * Property-scoped document. assetId null = home-level paperwork.
 * Bytes live on disk under storage_key; metadata is in SQLite.
 */
export type DocumentRecord = {
  id: string;
  propertyId: string;
  assetId: string | null;
  title: string;
  docType: DocumentType;
  documentDate: string | null;
  source: DocumentSource;
  mimeType: string;
  originalFilename: string;
  storageKey: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
};

/** Public document payload — no storage paths leaked beyond the id. */
export type PublicDocument = {
  id: string;
  propertyId: string;
  assetId: string | null;
  title: string;
  docType: DocumentType;
  documentDate: string | null;
  source: DocumentSource;
  mimeType: string;
  originalFilename: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
};

export type JwtClaims = {
  sub: string;
  email: string;
  faces: AppFace[];
  activeFace: AppFace;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    faces: user.faces,
    activeFace: user.activeFace,
    activePropertyId: user.activePropertyId,
  };
}

export function toPublicProperty(property: PropertyRecord): PublicProperty {
  return {
    id: property.id,
    name: property.name,
    addressLine1: property.addressLine1,
    addressLine2: property.addressLine2,
    city: property.city,
    region: property.region,
    postalCode: property.postalCode,
    country: property.country,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
  };
}

export function formatPropertyAddress(property: PublicProperty | PropertyRecord): string {
  const line2 = property.addressLine2?.trim();
  const street = line2
    ? `${property.addressLine1}, ${line2}`
    : property.addressLine1;
  return `${street}, ${property.city}, ${property.region} ${property.postalCode}, ${property.country}`;
}

export function toPublicAsset(asset: AssetRecord): PublicAsset {
  return {
    id: asset.id,
    propertyId: asset.propertyId,
    name: asset.name,
    category: asset.category,
    manufacturer: asset.manufacturer,
    model: asset.model,
    serial: asset.serial,
    purchaseDate: asset.purchaseDate,
    installDate: asset.installDate,
    installerVendor: asset.installerVendor,
    location: asset.location,
    notes: asset.notes,
    warrantyEndDate: asset.warrantyEndDate,
    warrantyTerm: asset.warrantyTerm,
    provenance: asset.provenance,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

export function toPublicDocument(doc: DocumentRecord): PublicDocument {
  return {
    id: doc.id,
    propertyId: doc.propertyId,
    assetId: doc.assetId,
    title: doc.title,
    docType: doc.docType,
    documentDate: doc.documentDate,
    source: doc.source,
    mimeType: doc.mimeType,
    originalFilename: doc.originalFilename,
    byteSize: doc.byteSize,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Legacy category slugs kept for reminder templates + label display only. */
export const LEGACY_ASSET_CATEGORIES = [
  "hvac",
  "roof",
  "appliance",
  "generator",
  "water_heater",
  "plumbing",
  "electrical",
  "kids_gear",
  "vehicle",
  "other",
] as const;

/** @deprecated Prefer open string categories; kept for older call sites. */
export const ASSET_CATEGORIES: AssetCategory[] = [...LEGACY_ASSET_CATEGORIES];

/** Legacy document-type slugs for label display only. */
export const LEGACY_DOCUMENT_TYPES = [
  "manual",
  "receipt",
  "warranty",
  "install_paperwork",
  "photo",
  "other",
] as const;

/** @deprecated Prefer open string doc types; kept for older call sites. */
export const DOCUMENT_TYPES: DocumentType[] = [...LEGACY_DOCUMENT_TYPES];

export const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  hvac: "HVAC",
  roof: "Roof",
  appliance: "Appliance",
  generator: "Generator",
  water_heater: "Water heater",
  plumbing: "Plumbing",
  electrical: "Electrical",
  kids_gear: "Kids' gear",
  vehicle: "Vehicle / parts",
  other: "Other",
};

export const LEGACY_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  photo: "Photo",
  manual: "Manual",
  receipt: "Receipt",
  warranty: "Warranty",
  install_paperwork: "Install paperwork",
  other: "Other",
};

export function categoryLabel(category: string): string {
  const key = category.trim().toLowerCase();
  return LEGACY_CATEGORY_LABELS[key] ?? category.trim();
}

export function documentTypeLabel(docType: string): string {
  const key = docType.trim().toLowerCase();
  return LEGACY_DOCUMENT_TYPE_LABELS[key] ?? docType.trim();
}

export const DOCUMENT_SOURCES: DocumentSource[] = [
  "user",
  "ai_fetched",
  "contractor",
];

/** Simple recurrence for thin maintenance schedules (EPIC 4). */
export type ReminderRecurrence = "none" | "monthly" | "quarterly" | "yearly";

/** active = still due / recurring; completed = one-off finished. */
export type ReminderStatus = "active" | "completed";

/**
 * Property-scoped maintenance reminder tied to an asset.
 * Due notices are created by the EPIC 5 due-check job / self-serve check.
 */
export type ReminderRecord = {
  id: string;
  propertyId: string;
  assetId: string;
  title: string;
  notes: string | null;
  dueDate: string;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  lastCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicReminder = {
  id: string;
  propertyId: string;
  assetId: string;
  assetName: string | null;
  title: string;
  notes: string | null;
  dueDate: string;
  recurrence: ReminderRecurrence;
  status: ReminderStatus;
  lastCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Light completion history for a reminder. */
export type ReminderCompletionRecord = {
  id: string;
  reminderId: string;
  propertyId: string;
  completedAt: string;
  dueDateAtCompletion: string;
  note: string | null;
};

export type PublicReminderCompletion = {
  id: string;
  reminderId: string;
  completedAt: string;
  dueDateAtCompletion: string;
  note: string | null;
};

/** Optional thin starter templates (not a rich library). */
export type ReminderTemplate = {
  id: string;
  category: AssetCategory | "any";
  title: string;
  recurrence: ReminderRecurrence;
  /** Suggested days from today for the first due date. */
  defaultDueInDays: number;
  notes: string | null;
};

export function toPublicReminder(
  reminder: ReminderRecord,
  assetName: string | null = null,
): PublicReminder {
  return {
    id: reminder.id,
    propertyId: reminder.propertyId,
    assetId: reminder.assetId,
    assetName,
    title: reminder.title,
    notes: reminder.notes,
    dueDate: reminder.dueDate,
    recurrence: reminder.recurrence,
    status: reminder.status,
    lastCompletedAt: reminder.lastCompletedAt,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  };
}

export function toPublicReminderCompletion(
  row: ReminderCompletionRecord,
): PublicReminderCompletion {
  return {
    id: row.id,
    reminderId: row.reminderId,
    completedAt: row.completedAt,
    dueDateAtCompletion: row.dueDateAtCompletion,
    note: row.note,
  };
}

export const REMINDER_RECURRENCES: ReminderRecurrence[] = [
  "none",
  "monthly",
  "quarterly",
  "yearly",
];

/**
 * In-app / push notification kinds.
 * reminder_due (EPIC 5) and recall_alert (EPIC 7) are live; contractor_submit is EPIC 8.
 */
export type NotificationKind =
  | "reminder_due"
  | "recall_alert"
  | "contractor_submit";

export type PushDeliveryStatus =
  | "pending"
  | "sent"
  | "skipped"
  | "stubbed"
  | "failed";

/** Public recall catalog row (free lists / fixtures). */
export type RecallNoticeSource =
  | "cpsc_fixture"
  | "cpsc_live"
  | "nhtsa_fixture";

export type RecallNoticeRecord = {
  id: string;
  externalId: string;
  source: RecallNoticeSource;
  title: string;
  summary: string;
  hazard: string | null;
  manufacturer: string;
  model: string;
  serialPattern: string | null;
  productType: string | null;
  recallDate: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetRecallAlertStatus = "open" | "acknowledged" | "dismissed";

export type AssetRecallAlertRecord = {
  id: string;
  propertyId: string;
  assetId: string;
  recallNoticeId: string;
  status: AssetRecallAlertStatus;
  matchedOn: "manufacturer_model" | "manufacturer_model_serial";
  notifiedAt: string | null;
  acknowledgedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Alert + nested notice for phone / API responses. */
export type PublicAssetRecallAlert = {
  id: string;
  propertyId: string;
  assetId: string;
  assetName: string | null;
  status: AssetRecallAlertStatus;
  matchedOn: "manufacturer_model" | "manufacturer_model_serial";
  notifiedAt: string | null;
  acknowledgedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recall: {
    id: string;
    externalId: string;
    source: RecallNoticeSource;
    title: string;
    summary: string;
    hazard: string | null;
    manufacturer: string;
    model: string;
    recallDate: string | null;
    sourceUrl: string | null;
  };
};

export type NotificationPreferences = {
  remindersEnabled: boolean;
  /** EPIC 7 — safety/recall alerts from free public lists. */
  recallsEnabled: boolean;
  /** Hook for EPIC 8 — preference stored now, submit pings arrive later. */
  contractorSubmitsEnabled: boolean;
  /** Days before due date to create a reminder notification (0 = due day only). */
  reminderLeadDays: number;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
};

export type PublicNotificationPreferences = Omit<
  NotificationPreferences,
  "updatedAt"
> & {
  updatedAt: string;
};

export type PushDeviceRecord = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: string | null;
  deviceName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicPushDevice = {
  id: string;
  expoPushToken: string;
  platform: string | null;
  deviceName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  propertyId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  relatedReminderId: string | null;
  relatedAssetId: string | null;
  relatedEntityId: string | null;
  dedupeKey: string;
  readAt: string | null;
  pushStatus: PushDeliveryStatus;
  pushSentAt: string | null;
  createdAt: string;
};

export type PublicNotification = {
  id: string;
  propertyId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  relatedReminderId: string | null;
  relatedAssetId: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  pushStatus: PushDeliveryStatus;
  createdAt: string;
};

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "reminder_due",
  "recall_alert",
  "contractor_submit",
];

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  NotificationPreferences,
  "updatedAt"
> = {
  remindersEnabled: true,
  recallsEnabled: true,
  contractorSubmitsEnabled: true,
  reminderLeadDays: 3,
  pushEnabled: true,
  inAppEnabled: true,
};

export function toPublicNotificationPreferences(
  prefs: NotificationPreferences,
): PublicNotificationPreferences {
  return {
    remindersEnabled: prefs.remindersEnabled,
    recallsEnabled: prefs.recallsEnabled,
    contractorSubmitsEnabled: prefs.contractorSubmitsEnabled,
    reminderLeadDays: prefs.reminderLeadDays,
    pushEnabled: prefs.pushEnabled,
    inAppEnabled: prefs.inAppEnabled,
    updatedAt: prefs.updatedAt,
  };
}

export function toPublicPushDevice(device: PushDeviceRecord): PublicPushDevice {
  return {
    id: device.id,
    expoPushToken: device.expoPushToken,
    platform: device.platform,
    deviceName: device.deviceName,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

export function toPublicNotification(
  row: NotificationRecord,
): PublicNotification {
  return {
    id: row.id,
    propertyId: row.propertyId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    relatedReminderId: row.relatedReminderId,
    relatedAssetId: row.relatedAssetId,
    relatedEntityId: row.relatedEntityId,
    readAt: row.readAt,
    pushStatus: row.pushStatus,
    createdAt: row.createdAt,
  };
}
