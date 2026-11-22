import {
  API_BASE_URL,
  SUPABASE_CONFIGURED,
  assertReachableBackend,
  isLoopbackApiUrl,
} from "./config";
import Constants from "expo-constants";

export type AppFace = "homeowner" | "contractor";

/** When Supabase URL+anon are set, phone uses cloud directly (no LAN API). */
function useCloud(): boolean {
  return SUPABASE_CONFIGURED;
}

export type PublicUser = {
  id: string;
  email: string;
  faces: AppFace[];
  activeFace: AppFace;
  activePropertyId: string | null;
};

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

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: PublicUser;
};

export type MeResponse = {
  user: PublicUser;
  properties: PublicProperty[];
  activeProperty: PublicProperty | null;
  privacy: {
    ledgerOwner: string;
    silentSharing: boolean;
    approveBeforeOfficial: boolean;
    dataScope: string;
  };
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

/** Open homeowner-defined category (per home). Legacy snake_case may still appear. */
export type AssetCategory = string;

export type AssetProvenance = "homeowner" | "contractor";

export type PropertyLabelKind = "asset_category" | "document_type";

export type PublicPropertyLabel = {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

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
  /** Optional Past contractors directory link for installer/vendor. */
  installerContractorId: string | null;
  /** Most recent service date (YYYY-MM-DD). */
  lastServicedAt: string | null;
  /**
   * Audit mark: named contractor who confirmed the work (home-sale confidence).
   * Homeowner records or fills from an approved invite draft — no contractor login.
   */
  confirmedByContractorName: string | null;
  location: string | null;
  notes: string | null;
  warrantyEndDate: string | null;
  warrantyTerm: string | null;
  provenance: AssetProvenance;
  createdAt: string;
  updatedAt: string;
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
  /** When set, links Installer / vendor to Past contractors for this home. */
  installerContractorId?: string | null;
  lastServicedAt?: string | null;
  confirmedByContractorName?: string | null;
  location?: string | null;
  notes?: string | null;
  warrantyEndDate?: string | null;
  warrantyTerm?: string | null;
  /** Defaults to homeowner. Use contractor for invite-link / LightLift approvals. */
  provenance?: AssetProvenance;
};

export type UpdateAssetInput = Partial<CreateAssetInput>;

/** Open homeowner-defined document type (per home). Legacy snake_case may still appear. */
export type DocumentType = string;

export type DocumentSource = "user" | "ai_fetched" | "contractor";

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

export type ReminderRecurrence = "none" | "monthly" | "quarterly" | "yearly";
export type ReminderStatus = "active" | "completed";

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

export type PublicReminderCompletion = {
  id: string;
  reminderId: string;
  completedAt: string;
  dueDateAtCompletion: string;
  note: string | null;
};

export type ReminderTemplate = {
  id: string;
  category: AssetCategory | "any";
  title: string;
  recurrence: ReminderRecurrence;
  defaultDueInDays: number;
  notes: string | null;
};

export type CreateReminderInput = {
  assetId: string;
  title: string;
  notes?: string | null;
  dueDate: string;
  recurrence: ReminderRecurrence;
};

export type UpdateReminderInput = Partial<
  Omit<CreateReminderInput, "assetId">
>;

export type HomePacket = {
  exportedAt: string;
  format: string;
  privacy: {
    ledgerOwner: string;
    silentSharing: boolean;
    note: string;
  };
  property: PublicProperty & { formattedAddress: string };
  assets: PublicAsset[];
  documents: PublicDocument[];
  reminders?: PublicReminder[];
  documentDownloadHint: string;
};

/** Legacy display map only — pickers use per-home custom labels, not this list. */
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

/** @deprecated Prefer listPropertyLabels; kept for older screens during soft migrate. */
export const ASSET_CATEGORIES: { value: string; label: string }[] = Object.entries(
  LEGACY_CATEGORY_LABELS,
).map(([value, label]) => ({ value, label }));

export const LEGACY_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  photo: "Photo",
  manual: "Manual",
  receipt: "Receipt",
  warranty: "Warranty",
  install_paperwork: "Install paperwork",
  other: "Other",
};

/** @deprecated Prefer listPropertyLabels; kept for older screens during soft migrate. */
export const DOCUMENT_TYPES: { value: string; label: string }[] = Object.entries(
  LEGACY_DOCUMENT_TYPE_LABELS,
).map(([value, label]) => ({ value, label }));

export const REMINDER_RECURRENCES: {
  value: ReminderRecurrence;
  label: string;
}[] = [
  { value: "none", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export function categoryLabel(category: AssetCategory): string {
  const key = category.trim().toLowerCase();
  return LEGACY_CATEGORY_LABELS[key] ?? category.trim();
}

export function documentTypeLabel(docType: DocumentType): string {
  const key = docType.trim().toLowerCase();
  return LEGACY_DOCUMENT_TYPE_LABELS[key] ?? docType.trim();
}

export function normalizeLabelValue(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function documentSourceLabel(source: DocumentSource): string {
  if (source === "ai_fetched") return "Fetched by AI";
  if (source === "contractor") return "From contractor";
  return "Added by you";
}

export function recurrenceLabel(recurrence: ReminderRecurrence): string {
  return (
    REMINDER_RECURRENCES.find((r) => r.value === recurrence)?.label ??
    recurrence
  );
}

/** Calendar day helpers for suggested due dates (UTC YYYY-MM-DD). */
export function dueDateFromToday(days: number, now = new Date()): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() + days);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type ApiErrorKind = "network" | "auth" | "client" | "server";

/** Distinguishes phone↔API reachability failures from auth / validation errors. */
export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    const kind: ApiErrorKind =
      res.status === 401 || res.status === 403
        ? "auth"
        : res.status >= 500
          ? "server"
          : "client";
    const base =
      body.message || body.error || `Request failed (${res.status})`;
    const message =
      kind === "auth"
        ? `Sign-in failed: ${base}`
        : kind === "server"
          ? `Server error: ${base}`
          : base;
    throw new ApiError(message, kind, res.status);
  }
  return body;
}

/**
 * fetch() for the optional local Hono API only.
 * Cloud / preview path must use Supabase (useCloud) — never this localhost default.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (useCloud()) {
    throw new ApiError(
      "Cloud path is active — this request should not hit the laptop API.",
      "network",
    );
  }
  try {
    assertReachableBackend();
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : "Backend not configured.",
      "network",
    );
  }
  if (!API_BASE_URL) {
    throw new ApiError(
      "No API URL configured. Prefer Supabase (EXPO_PUBLIC_SUPABASE_URL + anon key) for phone installs.",
      "network",
    );
  }
  const standalone =
    Constants.executionEnvironment === "standalone" ||
    Constants.executionEnvironment === "storeClient";
  if (standalone && isLoopbackApiUrl(API_BASE_URL)) {
    throw new ApiError(
      `Cannot use ${API_BASE_URL} on a preview / store install. ` +
        `Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the Expo preview environment and rebuild. ` +
        `Do not set EXPO_PUBLIC_API_URL to localhost for preview.`,
      "network",
    );
  }
  const url = `${API_BASE_URL}${path}`;
  try {
    return await fetch(url, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    throw new ApiError(
      `Cannot reach the HomeAsset API at ${API_BASE_URL}. ` +
        `Prefer Supabase cloud (no laptop). For local SQLite demo only, set EXPO_PUBLIC_API_URL ` +
        `to your PC LAN IP (example http://192.168.1.10:8787), keep npm run dev:api running, ` +
        `then restart Expo with npx expo start --go -c. (${detail})`,
      "network",
    );
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  return parseJson<T>(res);
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

export async function signup(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<AuthResponse> {
  if (useCloud()) {
    // Lazy require avoids a circular import with cloud.ts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudSignup(input);
  }
  return requestJson<AuthResponse>("/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudLogin(input);
  }
  return requestJson<AuthResponse>("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudFetchMe(accessToken);
  }
  return requestJson<MeResponse>("/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function switchFace(
  accessToken: string,
  face: AppFace,
  enableIfMissing = true,
): Promise<AuthResponse> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudSwitchFace(
      accessToken,
      face,
      enableIfMissing,
    );
  }
  const res = await fetch(`${API_BASE_URL}/me/face`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ face, enableIfMissing }),
  });
  return parseJson<AuthResponse>(res);
}

export async function listProperties(accessToken: string): Promise<{
  properties: PublicProperty[];
  activePropertyId: string | null;
}> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const me = await require("./cloud").cloudFetchMe(accessToken);
    return {
      properties: me.properties,
      activePropertyId: me.user.activePropertyId,
    };
  }
  const res = await fetch(`${API_BASE_URL}/properties`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function createProperty(
  accessToken: string,
  input: CreatePropertyInput,
): Promise<{ property: PublicProperty; user?: PublicUser }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudCreateProperty(accessToken, input);
  }
  const res = await fetch(`${API_BASE_URL}/properties`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function selectProperty(
  accessToken: string,
  propertyId: string,
): Promise<{ property: PublicProperty; user?: PublicUser }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudSelectProperty(accessToken, propertyId);
  }
  const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/select`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export function formatPropertyAddress(property: PublicProperty): string {
  const line2 = property.addressLine2?.trim();
  const street = line2
    ? `${property.addressLine1}, ${line2}`
    : property.addressLine1;
  return `${street}, ${property.city}, ${property.region} ${property.postalCode}`;
}

export async function listAssets(
  accessToken: string,
  propertyId: string,
): Promise<{ assets: PublicAsset[]; propertyId: string }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudListAssets(accessToken, propertyId);
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/assets`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function getAsset(
  accessToken: string,
  propertyId: string,
  assetId: string,
): Promise<{ asset: PublicAsset }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudGetAsset(accessToken, propertyId, assetId);
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/assets/${assetId}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function listPropertyLabels(
  accessToken: string,
  propertyId: string,
  kind: PropertyLabelKind,
): Promise<{
  propertyId: string;
  kind: PropertyLabelKind;
  labels: PublicPropertyLabel[];
}> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudListPropertyLabels(
      accessToken,
      propertyId,
      kind,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/labels?kind=${encodeURIComponent(kind)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function rememberPropertyLabel(
  accessToken: string,
  propertyId: string,
  kind: PropertyLabelKind,
  value: string,
): Promise<{ label: PublicPropertyLabel & { kind: PropertyLabelKind } }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudRememberPropertyLabel(
      accessToken,
      propertyId,
      kind,
      value,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/labels`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ kind, value }),
    },
  );
  return parseJson(res);
}

export async function createAsset(
  accessToken: string,
  propertyId: string,
  input: CreateAssetInput,
): Promise<{ asset: PublicAsset }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudCreateAsset(accessToken, propertyId, input);
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/assets`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function updateAsset(
  accessToken: string,
  propertyId: string,
  assetId: string,
  input: UpdateAssetInput,
): Promise<{ asset: PublicAsset }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudUpdateAsset(
      accessToken,
      propertyId,
      assetId,
      input,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/assets/${assetId}`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function deleteAsset(
  accessToken: string,
  propertyId: string,
  assetId: string,
): Promise<{ ok: boolean }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudDeleteAsset(
      accessToken,
      propertyId,
      assetId,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/assets/${assetId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export async function listDocuments(
  accessToken: string,
  propertyId: string,
  options?: { assetId?: string; propertyOnly?: boolean },
): Promise<{ documents: PublicDocument[]; propertyId: string }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudListDocuments(
      accessToken,
      propertyId,
      options,
    );
  }
  const params = new URLSearchParams();
  if (options?.assetId) params.set("assetId", options.assetId);
  if (options?.propertyOnly) params.set("scope", "property");
  const query = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/documents${query ? `?${query}` : ""}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function uploadDocument(
  accessToken: string,
  propertyId: string,
  input: {
    uri: string;
    name: string;
    mimeType: string;
    title: string;
    docType: DocumentType;
    documentDate?: string | null;
    assetId?: string | null;
  },
): Promise<{ document: PublicDocument }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudUploadDocument(
      accessToken,
      propertyId,
      input,
    );
  }
  const form = new FormData();
  form.append("file", {
    uri: input.uri,
    name: input.name,
    type: input.mimeType || "application/octet-stream",
  } as unknown as Blob);
  form.append("title", input.title);
  form.append("docType", input.docType);
  if (input.documentDate?.trim()) {
    form.append("documentDate", input.documentDate.trim());
  }
  if (input.assetId) {
    form.append("assetId", input.assetId);
  }

  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/documents`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  return parseJson(res);
}

export async function deleteDocument(
  accessToken: string,
  propertyId: string,
  documentId: string,
): Promise<{ ok: boolean }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudDeleteDocument(
      accessToken,
      propertyId,
      documentId,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/documents/${documentId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export function documentContentUrl(
  propertyId: string,
  documentId: string,
): string {
  return `${API_BASE_URL}/properties/${propertyId}/documents/${documentId}/content`;
}

/** Resolve a downloadable URL (signed Storage URL when on Supabase cloud). */
export async function resolveDocumentDownloadUrl(
  accessToken: string,
  propertyId: string,
  documentId: string,
): Promise<{ url: string; authHeader?: string }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const url = await require("./cloud").cloudDocumentDownloadUrl(
      propertyId,
      documentId,
    );
    return { url };
  }
  return {
    url: documentContentUrl(propertyId, documentId),
    authHeader: `Bearer ${accessToken}`,
  };
}

export async function exportHomePacket(
  accessToken: string,
  propertyId: string,
): Promise<{ packet: HomePacket }> {
  const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/export`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function listReminders(
  accessToken: string,
  propertyId: string,
  options?: { assetId?: string; includeCompleted?: boolean },
): Promise<{ reminders: PublicReminder[]; propertyId: string }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudListReminders(
      accessToken,
      propertyId,
      options,
    );
  }
  const params = new URLSearchParams();
  if (options?.assetId) params.set("assetId", options.assetId);
  if (options?.includeCompleted) params.set("includeCompleted", "1");
  const query = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/reminders${query ? `?${query}` : ""}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function listReminderTemplates(
  accessToken: string,
  propertyId: string,
  category?: AssetCategory,
): Promise<{ templates: ReminderTemplate[] }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudListReminderTemplates(
      accessToken,
      propertyId,
      category,
    );
  }
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const query = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/reminders/templates${query ? `?${query}` : ""}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function createReminder(
  accessToken: string,
  propertyId: string,
  input: CreateReminderInput,
): Promise<{ reminder: PublicReminder }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudCreateReminder(
      accessToken,
      propertyId,
      input,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/reminders`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function completeReminder(
  accessToken: string,
  propertyId: string,
  reminderId: string,
  note?: string | null,
): Promise<{ reminder: PublicReminder; completion?: PublicReminderCompletion }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudCompleteReminder(
      accessToken,
      propertyId,
      reminderId,
      note,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/reminders/${reminderId}/complete`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ note: note ?? null }),
    },
  );
  return parseJson(res);
}

export async function deleteReminder(
  accessToken: string,
  propertyId: string,
  reminderId: string,
): Promise<{ ok: boolean }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudDeleteReminder(
      accessToken,
      propertyId,
      reminderId,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/reminders/${reminderId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export async function listReminderHistory(
  accessToken: string,
  propertyId: string,
  reminderId: string,
): Promise<{ history: PublicReminderCompletion[]; reminderId: string }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const res = await require("./cloud").cloudReminderHistory(
      accessToken,
      propertyId,
      reminderId,
    );
    return { history: res.completions, reminderId };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/reminders/${reminderId}/history`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

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

export type AssetRecallAlertStatus = "open" | "acknowledged" | "dismissed";

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
    source: string;
    title: string;
    summary: string;
    hazard: string | null;
    manufacturer: string;
    model: string;
    recallDate: string | null;
    sourceUrl: string | null;
  };
};

export function recallAlertStatusLabel(status: AssetRecallAlertStatus): string {
  if (status === "open") return "Open";
  if (status === "acknowledged") return "Acknowledged";
  return "Dismissed";
}

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

export type NotificationPreferences = {
  remindersEnabled: boolean;
  recallsEnabled: boolean;
  contractorSubmitsEnabled: boolean;
  reminderLeadDays: number;
  pushEnabled: boolean;
  inAppEnabled: boolean;
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

export type UpdateNotificationPreferencesInput = {
  remindersEnabled?: boolean;
  recallsEnabled?: boolean;
  contractorSubmitsEnabled?: boolean;
  reminderLeadDays?: number;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
};

export function notificationKindLabel(kind: NotificationKind): string {
  if (kind === "reminder_due") return "Reminder";
  if (kind === "recall_alert") return "Recall";
  return "Contractor";
}

export async function fetchNotificationPreferences(
  accessToken: string,
): Promise<{ preferences: NotificationPreferences }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const res = await require("./cloud").cloudGetNotificationPreferences(
      accessToken,
    );
    return {
      preferences: {
        ...res.preferences,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  const res = await fetch(`${API_BASE_URL}/me/notifications/preferences`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function updateNotificationPreferences(
  accessToken: string,
  input: UpdateNotificationPreferencesInput,
): Promise<{ preferences: NotificationPreferences }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const res = await require("./cloud").cloudUpdateNotificationPreferences(
      accessToken,
      input,
    );
    return {
      preferences: {
        ...res.preferences,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  const res = await fetch(`${API_BASE_URL}/me/notifications/preferences`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function listNotifications(
  accessToken: string,
  options?: { unreadOnly?: boolean },
): Promise<{ notifications: PublicNotification[]; unreadCount: number }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const res = await require("./cloud").cloudListNotifications(
      accessToken,
      options,
    );
    const notifications: PublicNotification[] = res.notifications.map(
      (n: {
        id: string;
        propertyId: string | null;
        kind: string;
        title: string;
        body: string;
        relatedReminderId: string | null;
        relatedAssetId: string | null;
        relatedEntityId: string | null;
        readAt: string | null;
        createdAt: string;
      }) => ({
        id: n.id,
        propertyId: n.propertyId,
        kind: n.kind as NotificationKind,
        title: n.title,
        body: n.body,
        relatedReminderId: n.relatedReminderId,
        relatedAssetId: n.relatedAssetId,
        relatedEntityId: n.relatedEntityId,
        readAt: n.readAt,
        pushStatus: "stubbed",
        createdAt: n.createdAt,
      }),
    );
    return {
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
    };
  }
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.set("unreadOnly", "1");
  const query = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/me/notifications${query ? `?${query}` : ""}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function markNotificationRead(
  accessToken: string,
  notificationId: string,
): Promise<{ notification?: PublicNotification; ok?: boolean }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await require("./cloud").cloudMarkNotificationRead(
      accessToken,
      notificationId,
    );
    return { ok: true };
  }
  const res = await fetch(
    `${API_BASE_URL}/me/notifications/${notificationId}/read`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export async function markAllNotificationsRead(
  accessToken: string,
): Promise<{ ok: boolean; updated?: number }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudMarkAllNotificationsRead(accessToken);
  }
  const res = await fetch(`${API_BASE_URL}/me/notifications/read-all`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function runDueNotificationCheck(
  accessToken: string,
): Promise<{
  ok: boolean;
  result: {
    scanned: number;
    created: number;
    skippedExisting: number;
    skippedPrefs: number;
  };
  unreadCount: number;
}> {
  if (useCloud()) {
    // Due-check job stays on the Hono API / cron; cloud-only phone skips.
    const listed = await listNotifications(accessToken);
    return {
      ok: true,
      result: {
        scanned: 0,
        created: 0,
        skippedExisting: 0,
        skippedPrefs: 0,
      },
      unreadCount: listed.unreadCount,
    };
  }
  const res = await fetch(`${API_BASE_URL}/me/notifications/run-due-check`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function runRecallNotificationCheck(
  accessToken: string,
): Promise<{
  ok: boolean;
  result: {
    mode?: string;
    catalogSize?: number;
    assetsScanned: number;
    matchesFound: number;
    alertsCreated: number;
    alertsExisting: number;
    notificationsCreated: number;
    pushesAttempted?: number;
  };
  unreadCount: number;
}> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudRunRecallCheck(accessToken);
  }
  const res = await fetch(`${API_BASE_URL}/me/notifications/run-recall-check`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function listRecallAlerts(
  accessToken: string,
  propertyId: string,
  options?: { assetId?: string; status?: AssetRecallAlertStatus | "all" },
): Promise<{ alerts: PublicAssetRecallAlert[] }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudListRecallAlerts(accessToken, propertyId, options);
  }
  const params = new URLSearchParams();
  if (options?.assetId) params.set("assetId", options.assetId);
  if (options?.status) params.set("status", options.status);
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/recalls${qs ? `?${qs}` : ""}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  return parseJson(res);
}

export async function acknowledgeRecallAlert(
  accessToken: string,
  propertyId: string,
  alertId: string,
): Promise<{ alert: PublicAssetRecallAlert }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudAcknowledgeRecallAlert(
      accessToken,
      propertyId,
      alertId,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/recalls/${alertId}/acknowledge`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export async function dismissRecallAlert(
  accessToken: string,
  propertyId: string,
  alertId: string,
): Promise<{ alert: PublicAssetRecallAlert }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./cloud").cloudDismissRecallAlert(
      accessToken,
      propertyId,
      alertId,
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/recalls/${alertId}/dismiss`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export async function runPropertyRecallCheck(
  accessToken: string,
  propertyId: string,
): Promise<{
  ok: boolean;
  result: {
    mode?: string;
    assetsScanned: number;
    matchesFound: number;
    alertsCreated: number;
    notificationsCreated: number;
    pushesAttempted?: number;
  };
  openCount: number;
}> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const res = await require("./cloud").cloudRunRecallCheck(
      accessToken,
      propertyId,
    );
    return {
      ok: res.ok,
      result: res.result,
      openCount: res.openCount ?? 0,
    };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/recalls/run-check`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}

export async function registerPushDevice(
  accessToken: string,
  input: {
    expoPushToken: string;
    platform?: string | null;
    deviceName?: string | null;
  },
): Promise<{ device?: PublicPushDevice; ok?: boolean }> {
  if (useCloud()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await require("./cloud").cloudRegisterPushDevice(accessToken, input);
    return { ok: true };
  }
  const res = await fetch(`${API_BASE_URL}/me/notifications/devices`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

/** EPIC 6 — AI assist (draft → confirm; how-to grounded in docs). */

export type SuggestedManualDraft = {
  id: string;
  title: string;
  sourceUrl: string;
  preview: string;
  selectedByDefault: boolean;
};

export type SuggestedDocsManual = {
  id: string;
  title: string;
  sourceUrl: string | null;
  preview: string;
  kind: "manual" | "spec" | "other";
  selectedByDefault: boolean;
};

export type SuggestManualsDraft = {
  draftId: string;
  mode: "mock" | "live";
  manufacturer: string;
  model: string;
  identificationLabel: string;
  manuals: SuggestedDocsManual[];
  expiresAt: string;
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type AiScanDraft = {
  draftId: string;
  mode: "mock" | "live";
  identificationLabel: string;
  confidence: number;
  catalogProductId: string;
  suggestedAsset: {
    name: string;
    category: AssetCategory;
    manufacturer: string | null;
    model: string | null;
    serial: string | null;
    notes: string | null;
  };
  manuals: SuggestedManualDraft[];
  expiresAt: string;
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type AiHowToCitation = {
  kind: "document" | "asset" | "catalog" | "reminder";
  id: string;
  title: string;
};

export type AiHowToResponse = {
  mode: "mock" | "live";
  answer: string;
  grounded: boolean;
  refused?: boolean;
  code?: string;
  citations: AiHowToCitation[];
  privacy: { writes: false; note: string };
};

/** Settings → Support — product/account help (not ledger Ask HomeAsset). */
export type AiSupportResponse = {
  mode: "mock" | "live";
  answer: string;
  escalate: boolean;
  nextSteps: string[];
  refused?: boolean;
  code?: string;
  privacy: { writes: false; note: string };
};

export type ContractorFormatResponse = {
  mode: "mock" | "live";
  draft: {
    summary: string;
    workPerformed: string;
    assetsSuggested: Array<{
      name: string;
      category: string;
      manufacturer: string | null;
      model: string | null;
      notes: string | null;
    }>;
    materials: string[];
    followUps: string[];
  };
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

/**
 * Cloud phone path (LightLift): AI runs on Supabase edge `ai-assist`.
 * Keys stay in Edge Function secrets — never EXPO_PUBLIC / EAS / laptop LAN.
 * Local SQLite demo still uses the Node API when Supabase is not configured.
 */

export async function aiScanProduct(
  accessToken: string,
  propertyId: string,
  input: {
    hint?: string | null;
    filename?: string | null;
    imageBase64?: string | null;
    mediaMimeType?: string | null;
  },
): Promise<{ draft: AiScanDraft; aiMode: "mock" | "live" }> {
  if (useCloud()) {
    const { invokeAiAssist, rememberScanDraft } = await import("./aiEdge");
    const res = await invokeAiAssist<{
      draft: AiScanDraft;
      aiMode: "mock" | "live";
      manualContents?: Record<string, string>;
    }>("scan", {
      propertyId,
      hint: input.hint ?? null,
      filename: input.filename ?? null,
      imageBase64: input.imageBase64 ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
    });
    rememberScanDraft(
      res.draft.draftId,
      {
        suggestedAsset: res.draft.suggestedAsset,
        manuals: res.draft.manuals.map((m) => ({ id: m.id, title: m.title })),
      },
      res.manualContents ?? {},
    );
    return { draft: res.draft, aiMode: res.aiMode };
  }
  const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/ai/scan`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      hint: input.hint ?? null,
      filename: input.filename ?? null,
      imageBase64: input.imageBase64 ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
    }),
  });
  return parseJson(res);
}

export async function aiConfirmScan(
  accessToken: string,
  propertyId: string,
  input: {
    draftId: string;
    selectedManualIds: string[];
    assetId?: string | null;
    createAsset?: boolean;
    assetOverrides?: {
      name?: string;
      category?: AssetCategory;
      manufacturer?: string | null;
      model?: string | null;
      serial?: string | null;
      notes?: string | null;
    };
  },
): Promise<{
  asset: PublicAsset;
  documents: PublicDocument[];
  storedManualCount: number;
  privacy: { writes: boolean; confirmedByUser: boolean; note: string };
}> {
  if (useCloud()) {
    const { takeScanDraft } = await import("./aiEdge");
    const {
      cloudCreateAsset,
      cloudUpdateAsset,
      cloudCreateDocumentFromBytes,
    } = await import("./cloud");
    const held = takeScanDraft(input.draftId);
    if (!held) {
      throw new ApiError(
        "That AI draft expired or was already used. Scan again.",
        "client",
        404,
      );
    }
    const overrides = input.assetOverrides ?? {};
    const base = {
      name: overrides.name ?? held.suggestedAsset.name,
      category: (overrides.category ??
        held.suggestedAsset.category) as AssetCategory,
      manufacturer:
        overrides.manufacturer !== undefined
          ? overrides.manufacturer
          : held.suggestedAsset.manufacturer,
      model:
        overrides.model !== undefined
          ? overrides.model
          : held.suggestedAsset.model,
      serial:
        overrides.serial !== undefined
          ? overrides.serial
          : held.suggestedAsset.serial,
      notes:
        overrides.notes !== undefined
          ? overrides.notes
          : held.suggestedAsset.notes,
    };
    let asset: PublicAsset;
    if (input.assetId) {
      const updated = await cloudUpdateAsset(
        accessToken,
        propertyId,
        input.assetId,
        base,
      );
      asset = updated.asset;
    } else {
      const created = await cloudCreateAsset(accessToken, propertyId, base);
      asset = created.asset;
    }
    const titleById = new Map(held.manuals.map((m) => [m.id, m.title]));
    const documents: PublicDocument[] = [];
    for (const manualId of input.selectedManualIds) {
      const content = held.manualContents[manualId];
      if (!content) continue;
      const bytes = new TextEncoder().encode(content);
      const { document } = await cloudCreateDocumentFromBytes(propertyId, {
        title: titleById.get(manualId) || manualId,
        docType: "manual",
        assetId: asset.id,
        source: "ai_fetched",
        mimeType: "text/plain",
        originalFilename: `${manualId}.txt`,
        bytes,
      });
      documents.push(document);
    }
    return {
      asset,
      documents,
      storedManualCount: documents.length,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you confirmed. AI never auto-adds to your ledger.",
      },
    };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/confirm-scan`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function aiAskHowto(
  accessToken: string,
  propertyId: string,
  input: { question: string; assetId?: string | null },
): Promise<AiHowToResponse> {
  if (useCloud()) {
    const { invokeAiAssist } = await import("./aiEdge");
    return invokeAiAssist<AiHowToResponse>("howto", {
      propertyId,
      question: input.question,
      assetId: input.assetId ?? null,
    });
  }
  const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/ai/howto`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

/**
 * AI customer support (Settings → Support).
 * Signed-in; optional active home label for warmth — never invents account facts.
 */
export async function aiAskSupport(
  accessToken: string,
  input: {
    question: string;
    propertyId?: string | null;
    homeLabel?: string | null;
  },
): Promise<AiSupportResponse> {
  if (useCloud()) {
    const { invokeAiAssist } = await import("./aiEdge");
    return invokeAiAssist<AiSupportResponse>("support", {
      question: input.question,
      propertyId: input.propertyId ?? undefined,
      homeLabel: input.homeLabel ?? null,
    });
  }
  const res = await fetch(`${API_BASE_URL}/ai/support`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      question: input.question,
      propertyId: input.propertyId ?? null,
      homeLabel: input.homeLabel ?? null,
    }),
  });
  return parseJson(res);
}

export async function aiContractorFormat(
  accessToken: string,
  input: {
    inputText: string;
    inputKind?: "typed" | "voice" | "upload";
  },
): Promise<ContractorFormatResponse> {
  if (useCloud()) {
    const { invokeAiAssist } = await import("./aiEdge");
    return invokeAiAssist<ContractorFormatResponse>("contractor-format", {
      inputText: input.inputText,
      inputKind: input.inputKind ?? "typed",
    });
  }
  const res = await fetch(`${API_BASE_URL}/ai/contractor/format`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function aiContractorStatus(_accessToken: string): Promise<{
  aiMode: "mock" | "live";
  capabilities: {
    formatTyped: boolean;
    formatVoiceTranscript: boolean;
    formatUploadText: boolean;
    submitToLedger: boolean;
    note: string;
  };
  privacy: {
    writes: boolean;
    confirmRequired: boolean;
    homeownerApproveRequired: boolean;
  };
}> {
  if (useCloud()) {
    const { invokeAiAssist } = await import("./aiEdge");
    const res = await invokeAiAssist<{
      aiMode: "mock" | "live";
      capabilities?: {
        note?: string;
      };
      privacy: {
        writes: boolean;
        confirmRequired: boolean;
        homeownerApproveRequired: boolean;
      };
    }>("status");
    return {
      aiMode: res.aiMode,
      capabilities: {
        formatTyped: true,
        formatVoiceTranscript: true,
        formatUploadText: true,
        submitToLedger: false,
        note:
          res.capabilities?.note ||
          "Format → confirm hooks are ready; full submit / approve is EPIC 8.",
      },
      privacy: res.privacy,
    };
  }
  const res = await fetch(`${API_BASE_URL}/ai/contractor/status`, {
    headers: { authorization: `Bearer ${_accessToken}` },
  });
  return parseJson(res);
}

export type EmailIntakeDraft = {
  draftId: string;
  mode: "mock" | "live";
  summary: string;
  workPerformed: string;
  contractorName: string | null;
  workDate: string | null;
  assetsSuggested: Array<{
    name: string;
    category: AssetCategory;
    manufacturer: string | null;
    model: string | null;
    serial: string | null;
    notes: string | null;
  }>;
  expiresAt: string;
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type AssetIntakeSourceKind = "photo" | "email" | "invoice" | "notes";

export type AssetIntakeSuggested = {
  name: string;
  category: AssetCategory;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchaseDate: string | null;
  installDate: string | null;
  installerVendor: string | null;
  /** Optional Past contractors link when homeowner picked from directory. */
  installerContractorId?: string | null;
  location: string | null;
  notes: string | null;
  warrantyEndDate: string | null;
  warrantyTerm: string | null;
};

export type AssetIntakeMissingField = {
  key: keyof AssetIntakeSuggested;
  label: string;
  reason: string;
};

export type AssetIntakeDraft = {
  draftId: string;
  mode: "mock" | "live";
  sourceKind: AssetIntakeSourceKind;
  intent: "add" | "update";
  matchedAssetId: string | null;
  matchedAssetLabel: string | null;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: AssetIntakeSuggested;
  missingFields: AssetIntakeMissingField[];
  expiresAt: string;
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export type PermitSuggestDraft = {
  draftId: string;
  mode: "stub" | "live";
  addressQuery: string;
  sourceNote: string;
  permits: Array<{
    id: string;
    title: string;
    status: string;
    filedOrClosedOn: string | null;
    description: string;
    sourceLabel: string;
    sourceUrl: string | null;
    suggestedAsset: {
      name: string;
      category: AssetCategory;
      manufacturer: string | null;
      model: string | null;
      serial: string | null;
      notes: string | null;
    };
    selectedByDefault: boolean;
  }>;
  expiresAt: string;
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

export async function aiEmailIntake(
  accessToken: string,
  propertyId: string,
  input: { emailText: string },
): Promise<{ draft: EmailIntakeDraft; aiMode: "mock" | "live" }> {
  if (useCloud()) {
    const { invokeAiAssist, rememberEmailIntakeDraft } = await import(
      "./aiEdge"
    );
    const res = await invokeAiAssist<{
      draft: EmailIntakeDraft;
      aiMode: "mock" | "live";
      rawEmailText?: string;
    }>("email-intake", {
      propertyId,
      emailText: input.emailText,
    });
    rememberEmailIntakeDraft(res.draft.draftId, {
      propertyId,
      summary: res.draft.summary,
      workPerformed: res.draft.workPerformed,
      contractorName: res.draft.contractorName,
      workDate: res.draft.workDate,
      assetsSuggested: res.draft.assetsSuggested,
      rawEmailText: res.rawEmailText ?? input.emailText,
    });
    return { draft: res.draft, aiMode: res.aiMode };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/email-intake`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function aiConfirmEmailIntake(
  accessToken: string,
  propertyId: string,
  input: {
    draftId: string;
    selectedAssetIndexes: number[];
    storeSummaryDocument?: boolean;
  },
): Promise<{
  assets: PublicAsset[];
  summaryDocument: PublicDocument | null;
  privacy: { writes: boolean; confirmedByUser: boolean; note: string };
}> {
  if (useCloud()) {
    const { takeEmailIntakeDraft } = await import("./aiEdge");
    const { cloudCreateAsset, cloudCreateDocumentFromBytes } = await import(
      "./cloud"
    );
    const held = takeEmailIntakeDraft(input.draftId);
    if (!held || held.propertyId !== propertyId) {
      throw new ApiError(
        "That AI draft expired or was already used. Paste the email again.",
        "client",
        404,
      );
    }
    const assets: PublicAsset[] = [];
    for (const index of [...new Set(input.selectedAssetIndexes)].sort(
      (a, b) => a - b,
    )) {
      const base = held.assetsSuggested[index];
      if (!base) continue;
      const workDate =
        held.workDate && /^\d{4}-\d{2}-\d{2}$/.test(held.workDate)
          ? held.workDate
          : null;
      const created = await cloudCreateAsset(accessToken, propertyId, {
        name: base.name,
        category: base.category as AssetCategory,
        manufacturer: base.manufacturer,
        model: base.model,
        serial: base.serial,
        installerVendor: held.contractorName,
        installDate: workDate,
        lastServicedAt: workDate,
        confirmedByContractorName: held.contractorName,
        notes: base.notes,
      });
      assets.push(created.asset);
    }

    let summaryDocument: PublicDocument | null = null;
    if (input.storeSummaryDocument !== false) {
      const bodyText = [
        "HomeAsset email intake summary",
        "",
        `Summary: ${held.summary}`,
        "",
        "Work performed:",
        held.workPerformed,
        "",
        held.contractorName
          ? `Contractor: ${held.contractorName}`
          : "Contractor: (not detected)",
        held.workDate ? `Date hint: ${held.workDate}` : null,
        "",
        "---",
        "Original pasted email (homeowner-provided):",
        held.rawEmailText,
      ]
        .filter((line) => line != null)
        .join("\n");
      const docDate =
        held.workDate && /^\d{4}-\d{2}-\d{2}$/.test(held.workDate)
          ? held.workDate
          : null;
      const { document } = await cloudCreateDocumentFromBytes(propertyId, {
        title: `Email intake: ${held.summary.slice(0, 80)}`,
        docType: "install_paperwork",
        documentDate: docDate,
        assetId: assets[0]?.id ?? null,
        source: "ai_fetched",
        mimeType: "text/plain",
        originalFilename: "email-intake-summary.txt",
        bytes: new TextEncoder().encode(bodyText),
      });
      summaryDocument = document;
    }

    return {
      assets,
      summaryDocument,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you approved. Pasted emails never auto-add to your ledger.",
      },
    };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/confirm-email-intake`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function aiAssetIntake(
  accessToken: string,
  propertyId: string,
  input: {
    sourceKind: AssetIntakeSourceKind;
    text?: string | null;
    hint?: string | null;
    filename?: string | null;
    /** Compressed photo/PDF bytes for multimodal OCR (cloud edge). */
    imageBase64?: string | null;
    mediaMimeType?: string | null;
  },
): Promise<{ draft: AssetIntakeDraft; aiMode: "mock" | "live" }> {
  if (useCloud()) {
    const { invokeAiAssist, rememberAssetIntakeDraft } = await import(
      "./aiEdge"
    );
    const { assets } = await listAssets(accessToken, propertyId);
    const existingAssets = assets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      manufacturer: a.manufacturer,
      model: a.model,
      serial: a.serial,
    }));
    const res = await invokeAiAssist<{
      draft: AssetIntakeDraft;
      aiMode: "mock" | "live";
    }>("asset-intake", {
      propertyId,
      sourceKind: input.sourceKind,
      text: input.text ?? null,
      hint: input.hint ?? null,
      filename: input.filename ?? null,
      imageBase64: input.imageBase64 ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
      existingAssets,
    });
    rememberAssetIntakeDraft(res.draft.draftId, {
      propertyId,
      sourceKind: res.draft.sourceKind,
      intent: res.draft.intent,
      matchedAssetId: res.draft.matchedAssetId,
      suggestedAsset: res.draft.suggestedAsset,
    });
    return { draft: res.draft, aiMode: res.aiMode };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/asset-intake`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

export async function aiConfirmAssetIntake(
  accessToken: string,
  propertyId: string,
  input: {
    draftId: string;
    intent: "add" | "update";
    matchedAssetId?: string | null;
    assetOverrides: AssetIntakeSuggested;
  },
): Promise<{
  asset: PublicAsset;
  intent: "add" | "update";
  privacy: { writes: boolean; confirmedByUser: boolean; note: string };
}> {
  if (useCloud()) {
    const { takeAssetIntakeDraft } = await import("./aiEdge");
    const { cloudCreateAsset, cloudUpdateAsset } = await import("./cloud");
    const held = takeAssetIntakeDraft(input.draftId);
    if (!held || held.propertyId !== propertyId) {
      throw new ApiError(
        "That AI draft expired or was already used. Try again.",
        "client",
        404,
      );
    }
    const base: CreateAssetInput = {
      name: input.assetOverrides.name.trim(),
      category: input.assetOverrides.category,
      manufacturer: input.assetOverrides.manufacturer,
      model: input.assetOverrides.model,
      serial: input.assetOverrides.serial,
      purchaseDate: input.assetOverrides.purchaseDate,
      installDate: input.assetOverrides.installDate,
      installerVendor: input.assetOverrides.installerVendor,
      installerContractorId: input.assetOverrides.installerContractorId,
      location: input.assetOverrides.location,
      notes: input.assetOverrides.notes,
      warrantyEndDate: input.assetOverrides.warrantyEndDate,
      warrantyTerm: input.assetOverrides.warrantyTerm,
    };
    if (!base.name) {
      throw new ApiError("Asset name is required.", "client", 400);
    }
    const matchedId = input.matchedAssetId ?? held.matchedAssetId;
    if (input.intent === "update" && matchedId) {
      const updated = await cloudUpdateAsset(
        accessToken,
        propertyId,
        matchedId,
        base,
      );
      return {
        asset: updated.asset,
        intent: "update",
        privacy: {
          writes: true,
          confirmedByUser: true,
          note: "Updated only because you confirmed. Ask HomeAsset never auto-writes your ledger.",
        },
      };
    }
    const created = await cloudCreateAsset(accessToken, propertyId, base);
    return {
      asset: created.asset,
      intent: "add",
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you confirmed. Ask HomeAsset never auto-writes your ledger.",
      },
    };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/confirm-asset-intake`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

/**
 * After make + model are on an asset: draft manuals / spec sheets for approve.
 * Cloud edge searches catalog + (live) public web; nothing stored until confirm.
 */
export async function aiSuggestManuals(
  accessToken: string,
  propertyId: string,
  input: {
    assetId: string;
    manufacturer: string;
    model: string;
  },
): Promise<{ draft: SuggestManualsDraft; aiMode: "mock" | "live" }> {
  if (useCloud()) {
    const { invokeAiAssist, rememberManualsDraft } = await import("./aiEdge");
    const res = await invokeAiAssist<{
      draft: SuggestManualsDraft;
      aiMode: "mock" | "live";
      manualContents?: Record<string, string>;
    }>("suggest-manuals", {
      propertyId,
      manufacturer: input.manufacturer,
      model: input.model,
      assetId: input.assetId,
    });
    rememberManualsDraft(res.draft.draftId, {
      propertyId,
      assetId: input.assetId,
      manufacturer: input.manufacturer,
      model: input.model,
      manuals: res.draft.manuals.map((m) => ({ id: m.id, title: m.title })),
      manualContents: res.manualContents ?? {},
    });
    return { draft: res.draft, aiMode: res.aiMode };
  }
  // Local API: no dedicated route yet — return empty draft so UX stays approve-gated.
  return {
    draft: {
      draftId: `local-manuals-${Date.now()}`,
      mode: "mock",
      manufacturer: input.manufacturer,
      model: input.model,
      identificationLabel: `${input.manufacturer} ${input.model}`,
      manuals: [],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      privacy: {
        writes: false,
        confirmRequired: true,
        note: "Suggested docs only. Nothing is stored until you choose which to keep.",
      },
    },
    aiMode: "mock",
  };
}

export async function aiConfirmSuggestedManuals(
  accessToken: string,
  propertyId: string,
  input: {
    draftId: string;
    assetId: string;
    selectedManualIds: string[];
  },
): Promise<{
  documents: PublicDocument[];
  storedManualCount: number;
  privacy: { writes: boolean; confirmedByUser: boolean; note: string };
}> {
  if (useCloud()) {
    const { takeManualsDraft } = await import("./aiEdge");
    const { cloudCreateDocumentFromBytes } = await import("./cloud");
    const held = takeManualsDraft(input.draftId);
    if (
      !held ||
      held.propertyId !== propertyId ||
      held.assetId !== input.assetId
    ) {
      throw new ApiError(
        "That manuals draft expired or was already used. Try again.",
        "client",
        404,
      );
    }
    const titleById = new Map(held.manuals.map((m) => [m.id, m.title]));
    const documents: PublicDocument[] = [];
    for (const manualId of input.selectedManualIds) {
      const content = held.manualContents[manualId];
      if (!content) continue;
      const bytes = new TextEncoder().encode(content);
      const { document } = await cloudCreateDocumentFromBytes(propertyId, {
        title: titleById.get(manualId) || manualId,
        docType: "manual",
        assetId: input.assetId,
        source: "ai_fetched",
        mimeType: "text/plain",
        originalFilename: `${manualId}.txt`,
        bytes,
      });
      documents.push(document);
    }
    return {
      documents,
      storedManualCount: documents.length,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you confirmed. Ask HomeAsset never auto-adds manuals.",
      },
    };
  }
  throw new ApiError(
    "Manuals confirm needs the cloud path for this preview.",
    "client",
    501,
  );
}

/** Navigate helper target after asset save when make + model are present. */
export function manualsSuggestPath(input: {
  assetId: string;
  manufacturer: string | null | undefined;
  model: string | null | undefined;
}): string | null {
  const manufacturer = input.manufacturer?.trim() || "";
  const model = input.model?.trim() || "";
  if (!manufacturer || !model) return null;
  return (
    `/ai/suggest-manuals?assetId=${encodeURIComponent(input.assetId)}` +
    `&manufacturer=${encodeURIComponent(manufacturer)}` +
    `&model=${encodeURIComponent(model)}`
  );
}

export async function aiSuggestPermits(
  accessToken: string,
  propertyId: string,
): Promise<{ draft: PermitSuggestDraft; sourceMode: "stub" | "live" }> {
  if (useCloud()) {
    const { invokeAiAssist, rememberPermitDraft } = await import("./aiEdge");
    const res = await invokeAiAssist<{
      draft: PermitSuggestDraft;
      sourceMode: "stub" | "live";
    }>("permits-suggest", { propertyId });
    rememberPermitDraft(res.draft.draftId, {
      propertyId,
      permits: res.draft.permits.map((p) => ({
        id: p.id,
        suggestedAsset: p.suggestedAsset,
      })),
      sourceMode: res.sourceMode,
    });
    return res;
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/permits/suggest`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({}),
    },
  );
  return parseJson(res);
}

export async function aiConfirmPermits(
  accessToken: string,
  propertyId: string,
  input: {
    draftId: string;
    selectedPermitIds: string[];
  },
): Promise<{
  assets: PublicAsset[];
  sourceMode: "stub" | "live";
  privacy: { writes: boolean; confirmedByUser: boolean; note: string };
}> {
  if (useCloud()) {
    const { takePermitDraft } = await import("./aiEdge");
    const { cloudCreateAsset } = await import("./cloud");
    const held = takePermitDraft(input.draftId);
    if (!held || held.propertyId !== propertyId) {
      throw new ApiError(
        "That permit draft expired or was already used. Suggest again.",
        "client",
        404,
      );
    }
    const selected = new Set(input.selectedPermitIds);
    const assets: PublicAsset[] = [];
    for (const permit of held.permits) {
      if (!selected.has(permit.id)) continue;
      const base = permit.suggestedAsset;
      const created = await cloudCreateAsset(accessToken, propertyId, {
        name: base.name,
        category: base.category as AssetCategory,
        manufacturer: base.manufacturer,
        model: base.model,
        serial: base.serial,
        notes: base.notes,
      });
      assets.push(created.asset);
    }
    return {
      assets,
      sourceMode: held.sourceMode,
      privacy: {
        writes: true,
        confirmedByUser: true,
        note: "Saved only because you approved. Permit hints never auto-add to your ledger.",
      },
    };
  }
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/ai/permits/confirm`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
  return parseJson(res);
}

// ---------------------------------------------------------------------------
// Contractor invite links (cloud-only phone path)
// ---------------------------------------------------------------------------

export type ContractorInviteDraftAsset = {
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  notes: string | null;
};

export type ContractorInviteDraft = {
  summary: string;
  workPerformed: string;
  contractorName: string | null;
  workDate: string | null;
  assetsSuggested: ContractorInviteDraftAsset[];
  materials: string[];
  followUps: string[];
};

export type PublicContractorInvite = {
  id: string;
  propertyId: string;
  label: string | null;
  token: string;
  inviteUrl: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type PublicContractorSubmissionMedia = {
  id: string;
  kind: "photo" | "audio" | "other";
  mimeType: string;
  originalFilename: string;
  byteSize: number;
  createdAt: string;
  signedUrl: string | null;
};

export type PublicContractorSubmission = {
  id: string;
  inviteId: string;
  propertyId: string;
  status: "pending" | "approved" | "declined";
  contractorName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  servicesOffered: string[];
  notesText: string | null;
  draft: ContractorInviteDraft;
  aiMode: "mock" | "live";
  reviewedAt: string | null;
  createdAt: string;
  media: PublicContractorSubmissionMedia[];
};

export type PublicHomeContractorWork = {
  id: string;
  contractorId: string;
  propertyId: string;
  submissionId: string | null;
  summary: string;
  workPerformed: string | null;
  workDate: string | null;
  createdAt: string;
};

export type PublicHomeContractor = {
  id: string;
  propertyId: string;
  displayName: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  servicesOffered: string[];
  notes: string | null;
  lastWorkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  work: PublicHomeContractorWork[];
};

export type HomeContractorInput = {
  displayName: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  servicesOffered?: string[] | string | null;
  notes?: string | null;
  lastWorkedAt?: string | null;
};

const INVITE_CLOUD_ONLY =
  "Contractor invite links need Supabase cloud on this phone (URL + anon key).";

export async function createContractorInvite(
  accessToken: string,
  propertyId: string,
  input: { label?: string | null; expiresInDays?: number | null } = {},
): Promise<{ invite: PublicContractorInvite }> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudCreateContractorInvite(
    accessToken,
    propertyId,
    input,
  );
}

export async function listContractorInvites(
  accessToken: string,
  propertyId: string,
): Promise<{ invites: PublicContractorInvite[] }> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudListContractorInvites(accessToken, propertyId);
}

export async function revokeContractorInvite(
  accessToken: string,
  propertyId: string,
  inviteId: string,
): Promise<{ invite: PublicContractorInvite }> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudRevokeContractorInvite(
    accessToken,
    propertyId,
    inviteId,
  );
}

export async function listContractorSubmissions(
  accessToken: string,
  propertyId: string,
  options: { status?: "pending" | "approved" | "declined" | "all" } = {},
): Promise<{ submissions: PublicContractorSubmission[] }> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudListContractorSubmissions(
    accessToken,
    propertyId,
    options,
  );
}

export async function getContractorSubmission(
  accessToken: string,
  propertyId: string,
  submissionId: string,
): Promise<{ submission: PublicContractorSubmission }> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudGetContractorSubmission(
    accessToken,
    propertyId,
    submissionId,
  );
}

export async function declineContractorSubmission(
  accessToken: string,
  propertyId: string,
  submissionId: string,
): Promise<{ submission: PublicContractorSubmission }> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudDeclineContractorSubmission(
    accessToken,
    propertyId,
    submissionId,
  );
}

export async function approveContractorSubmission(
  accessToken: string,
  propertyId: string,
  submissionId: string,
  input: {
    selectedAssetIndexes: number[];
    storeSummaryDocument?: boolean;
  },
): Promise<{
  submission: PublicContractorSubmission;
  assets: PublicAsset[];
  summaryDocument: PublicDocument | null;
  privacy: { writes: boolean; confirmedByUser: boolean; note: string };
}> {
  if (!useCloud()) {
    throw new ApiError(INVITE_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudApproveContractorSubmission(
    accessToken,
    propertyId,
    submissionId,
    input,
  );
}

const DIRECTORY_CLOUD_ONLY =
  "Contractor directory needs Supabase cloud on this phone (URL + anon key).";

export async function listHomeContractors(
  accessToken: string,
  propertyId: string,
): Promise<{ contractors: PublicHomeContractor[] }> {
  if (!useCloud()) {
    throw new ApiError(DIRECTORY_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudListHomeContractors(accessToken, propertyId);
}

export async function getHomeContractor(
  accessToken: string,
  propertyId: string,
  contractorId: string,
): Promise<{ contractor: PublicHomeContractor }> {
  if (!useCloud()) {
    throw new ApiError(DIRECTORY_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudGetHomeContractor(
    accessToken,
    propertyId,
    contractorId,
  );
}

export async function createHomeContractor(
  accessToken: string,
  propertyId: string,
  input: HomeContractorInput,
): Promise<{ contractor: PublicHomeContractor }> {
  if (!useCloud()) {
    throw new ApiError(DIRECTORY_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudCreateHomeContractor(
    accessToken,
    propertyId,
    input,
  );
}

export async function updateHomeContractor(
  accessToken: string,
  propertyId: string,
  contractorId: string,
  input: HomeContractorInput,
): Promise<{ contractor: PublicHomeContractor }> {
  if (!useCloud()) {
    throw new ApiError(DIRECTORY_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudUpdateHomeContractor(
    accessToken,
    propertyId,
    contractorId,
    input,
  );
}

export async function deleteHomeContractor(
  accessToken: string,
  propertyId: string,
  contractorId: string,
): Promise<{ ok: true }> {
  if (!useCloud()) {
    throw new ApiError(DIRECTORY_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudDeleteHomeContractor(
    accessToken,
    propertyId,
    contractorId,
  );
}

export async function addHomeContractorWork(
  accessToken: string,
  propertyId: string,
  contractorId: string,
  input: {
    summary: string;
    workPerformed?: string | null;
    workDate?: string | null;
  },
): Promise<{ work: PublicHomeContractorWork }> {
  if (!useCloud()) {
    throw new ApiError(DIRECTORY_CLOUD_ONLY, "client", 503);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./cloud").cloudAddHomeContractorWork(
    accessToken,
    propertyId,
    contractorId,
    input,
  );
}

/** Client-side directory search across contact, work, and services. */
export function filterHomeContractors(
  contractors: PublicHomeContractor[],
  query: string,
): PublicHomeContractor[] {
  const q = query.trim().toLowerCase();
  if (!q) return contractors;
  return contractors.filter((c) => {
    const hay = [
      c.displayName,
      c.companyName,
      c.phone,
      c.email,
      c.website,
      c.notes,
      ...c.servicesOffered,
      ...c.work.flatMap((w) => [w.summary, w.workPerformed]),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}
