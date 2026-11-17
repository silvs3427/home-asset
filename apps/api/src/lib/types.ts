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

/** Categories optimized for warranty / maintenance / safety matching. */
export type AssetCategory =
  | "hvac"
  | "roof"
  | "appliance"
  | "generator"
  | "water_heater"
  | "plumbing"
  | "electrical"
  | "kids_gear"
  | "vehicle"
  | "other";

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

/** Document kinds homeowners attach to an asset or home. */
export type DocumentType =
  | "manual"
  | "receipt"
  | "warranty"
  | "install_paperwork"
  | "photo"
  | "other";

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

export const ASSET_CATEGORIES: AssetCategory[] = [
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
];

export const DOCUMENT_TYPES: DocumentType[] = [
  "manual",
  "receipt",
  "warranty",
  "install_paperwork",
  "photo",
  "other",
];

export const DOCUMENT_SOURCES: DocumentSource[] = [
  "user",
  "ai_fetched",
  "contractor",
];
