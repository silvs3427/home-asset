import { API_BASE_URL, SUPABASE_CONFIGURED } from "./config";

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

export type AssetProvenance = "homeowner" | "contractor";

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

export type CreateAssetInput = {
  name: string;
  category: AssetCategory;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  purchaseDate?: string | null;
  installDate?: string | null;
  installerVendor?: string | null;
  location?: string | null;
  notes?: string | null;
  warrantyEndDate?: string | null;
  warrantyTerm?: string | null;
};

export type UpdateAssetInput = Partial<CreateAssetInput>;

export type DocumentType =
  | "manual"
  | "receipt"
  | "warranty"
  | "install_paperwork"
  | "photo"
  | "other";

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

export const ASSET_CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: "hvac", label: "HVAC" },
  { value: "roof", label: "Roof" },
  { value: "appliance", label: "Appliance" },
  { value: "generator", label: "Generator" },
  { value: "water_heater", label: "Water heater" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "kids_gear", label: "Kids' gear" },
  { value: "vehicle", label: "Vehicle / parts" },
  { value: "other", label: "Other" },
];

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "manual", label: "Manual" },
  { value: "receipt", label: "Receipt" },
  { value: "warranty", label: "Warranty" },
  { value: "install_paperwork", label: "Install paperwork" },
  { value: "other", label: "Other" },
];

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
  return ASSET_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function documentTypeLabel(docType: DocumentType): string {
  return DOCUMENT_TYPES.find((d) => d.value === docType)?.label ?? docType;
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
 * fetch() that turns connection failures into a clear network ApiError
 * (common when the phone still points at localhost instead of the PC LAN IP).
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  try {
    return await fetch(url, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    throw new ApiError(
      `Cannot reach the HomeAsset API at ${API_BASE_URL}. ` +
        `This is a network/reachability problem (not a bad password). ` +
        `On a physical phone set EXPO_PUBLIC_API_URL to your computer's LAN IP ` +
        `(example http://192.168.1.10:8787) in apps/mobile/.env, keep npm run dev:api running, ` +
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
  kind: "document" | "asset" | "catalog";
  id: string;
  title: string;
};

export type AiHowToResponse = {
  mode: "mock" | "live";
  answer: string;
  grounded: boolean;
  citations: AiHowToCitation[];
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

function requireHostedApiForAi(): void {
  if (useCloud() && !process.env.EXPO_PUBLIC_API_URL?.trim()) {
    throw new ApiError(
      "AI assist still needs a hosted HomeAsset API (set EXPO_PUBLIC_API_URL). Signup, homes, assets, docs, and reminders already work on Supabase alone.",
      "network",
    );
  }
}

export async function aiScanProduct(
  accessToken: string,
  propertyId: string,
  input: { hint?: string | null; filename?: string | null },
): Promise<{ draft: AiScanDraft; aiMode: "mock" | "live" }> {
  requireHostedApiForAi();
  const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/ai/scan`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
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
  requireHostedApiForAi();
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
  requireHostedApiForAi();
  const res = await fetch(`${API_BASE_URL}/properties/${propertyId}/ai/howto`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
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
  requireHostedApiForAi();
  const res = await fetch(`${API_BASE_URL}/ai/contractor/format`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function aiContractorStatus(accessToken: string): Promise<{
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
  requireHostedApiForAi();
  const res = await fetch(`${API_BASE_URL}/ai/contractor/status`, {
    headers: { authorization: `Bearer ${accessToken}` },
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
  requireHostedApiForAi();
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
  requireHostedApiForAi();
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

export async function aiSuggestPermits(
  accessToken: string,
  propertyId: string,
): Promise<{ draft: PermitSuggestDraft; sourceMode: "stub" | "live" }> {
  requireHostedApiForAi();
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
  requireHostedApiForAi();
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
