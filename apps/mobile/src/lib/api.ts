import { API_BASE_URL } from "./config";

export type AppFace = "homeowner" | "contractor";

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
};

export type UpdateAssetInput = Partial<CreateAssetInput>;

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

export function categoryLabel(category: AssetCategory): string {
  return ASSET_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  }
  return body;
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
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<AuthResponse>(res);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<AuthResponse>(res);
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE_URL}/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson<MeResponse>(res);
}

export async function switchFace(
  accessToken: string,
  face: AppFace,
  enableIfMissing = true,
): Promise<AuthResponse> {
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
  const res = await fetch(`${API_BASE_URL}/properties`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseJson(res);
}

export async function createProperty(
  accessToken: string,
  input: CreatePropertyInput,
): Promise<{ property: PublicProperty; user?: PublicUser }> {
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
  const res = await fetch(
    `${API_BASE_URL}/properties/${propertyId}/assets/${assetId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  return parseJson(res);
}
