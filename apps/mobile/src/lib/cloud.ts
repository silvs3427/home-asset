/**
 * Direct Supabase Auth + Postgres (+ Storage) path for the phone when
 * EXPO_PUBLIC_SUPABASE_URL + anon key are set. Mirrors LightLift: no LAN API.
 */
import type { Session } from "@supabase/supabase-js";
import {
  ApiError,
  type AppFace,
  type AuthResponse,
  type CreateAssetInput,
  type CreatePropertyInput,
  type CreateReminderInput,
  type DocumentType,
  type MeResponse,
  type PublicAsset,
  type PublicDocument,
  type PublicProperty,
  type PublicReminder,
  type PublicReminderCompletion,
  type PublicUser,
  type ReminderTemplate,
  type UpdateAssetInput,
  type UpdateReminderInput,
  type AssetCategory,
} from "./api";
import { requireSupabaseClient } from "./supabase";

type ProfileRow = {
  id: string;
  email: string;
  faces_json: AppFace[] | string;
  active_face: AppFace;
  active_property_id: string | null;
  created_at: string;
};

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

type AssetRow = {
  id: string;
  property_id: string;
  name: string;
  category: AssetCategory;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchase_date: string | null;
  install_date: string | null;
  installer_vendor: string | null;
  location: string | null;
  notes: string | null;
  warranty_end_date: string | null;
  warranty_term: string | null;
  provenance: "homeowner" | "contractor";
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  property_id: string;
  asset_id: string | null;
  title: string;
  doc_type: DocumentType;
  document_date: string | null;
  source: "user" | "ai_fetched" | "contractor";
  mime_type: string;
  original_filename: string;
  storage_key: string;
  byte_size: number;
  created_at: string;
  updated_at: string;
};

type ReminderRow = {
  id: string;
  property_id: string;
  asset_id: string;
  title: string;
  notes: string | null;
  due_date: string;
  recurrence: PublicReminder["recurrence"];
  status: PublicReminder["status"];
  last_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function facesFrom(value: AppFace[] | string): AppFace[] {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as AppFace[];
  } catch {
    return ["homeowner"];
  }
}

function profileToUser(row: ProfileRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    faces: facesFrom(row.faces_json),
    activeFace: row.active_face,
    activePropertyId: row.active_property_id,
  };
}

function propertyFromRow(row: PropertyRow): PublicProperty {
  return {
    id: row.id,
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

function assetFromRow(row: AssetRow): PublicAsset {
  return {
    id: row.id,
    propertyId: row.property_id,
    name: row.name,
    category: row.category,
    manufacturer: row.manufacturer,
    model: row.model,
    serial: row.serial,
    purchaseDate: row.purchase_date,
    installDate: row.install_date,
    installerVendor: row.installer_vendor,
    location: row.location,
    notes: row.notes,
    warrantyEndDate: row.warranty_end_date,
    warrantyTerm: row.warranty_term,
    provenance: row.provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function documentFromRow(row: DocumentRow): PublicDocument {
  return {
    id: row.id,
    propertyId: row.property_id,
    assetId: row.asset_id,
    title: row.title,
    docType: row.doc_type,
    documentDate: row.document_date,
    source: row.source,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reminderFromRow(
  row: ReminderRow,
  assetName: string | null = null,
): PublicReminder {
  return {
    id: row.id,
    propertyId: row.property_id,
    assetId: row.asset_id,
    assetName,
    title: row.title,
    notes: row.notes,
    dueDate: row.due_date,
    recurrence: row.recurrence,
    status: row.status,
    lastCompletedAt: row.last_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PostgREST / Auth errors are often plain `{ message }` objects, not Error. */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const raw = (err as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}

function mapCloudError(err: unknown, fallback: string): never {
  const message = extractErrorMessage(err, fallback);
  const lower = message.toLowerCase();
  if (
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("could not find the function") ||
    lower.includes("function public.bootstrap_new_user") ||
    (lower.includes("relation") && lower.includes("does not exist")) ||
    (lower.includes("profiles") && lower.includes("does not exist"))
  ) {
    throw new ApiError(
      "HomeAsset cloud setup is incomplete. In Supabase SQL Editor, run supabase/migrations/20261118000000_init_schema.sql, then 20261121000000_bootstrap_new_user.sql (LightLift-style Auth bootstrap).",
      "server",
    );
  }
  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("email not confirmed")
  ) {
    throw new ApiError(
      lower.includes("email not confirmed")
        ? "Email not confirmed yet. For product testing, turn Confirm email OFF in Supabase Auth (Authentication → Providers → Email), or confirm via the inbox link."
        : "Email or password is incorrect.",
      "auth",
      401,
    );
  }
  if (lower.includes("already") || lower.includes("registered")) {
    throw new ApiError(
      "An account with that email already exists.",
      "client",
      409,
    );
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("failed to fetch")
  ) {
    throw new ApiError(
      `Cannot reach Supabase. Check EXPO_PUBLIC_SUPABASE_URL / network. (${message})`,
      "network",
    );
  }
  throw new ApiError(message || fallback, "client");
}

async function requireSession(): Promise<Session> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) mapCloudError(error, "Could not read session.");
  if (!data.session) {
    throw new ApiError("Sign in required.", "auth", 401);
  }
  return data.session;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, faces_json, active_face, active_property_id, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) mapCloudError(error, "Could not load profile.");
  return (data as ProfileRow | null) ?? null;
}

function startingFaceFromSession(
  session: Session,
  fallback: AppFace = "homeowner",
): AppFace {
  const meta = session.user.user_metadata?.starting_face;
  if (meta === "homeowner" || meta === "contractor") return meta;
  return fallback;
}

/**
 * LightLift pattern: after Auth signup/sign-in (session required), call
 * security-definer RPC bootstrap_new_user. No Auth trigger dependency;
 * no client insert of another user's profile.
 */
async function bootstrapNewUser(
  email: string,
  startingFace: AppFace,
): Promise<ProfileRow> {
  const supabase = requireSupabaseClient();
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc("bootstrap_new_user", {
    p_email: normalizedEmail,
    p_starting_face: startingFace,
  });
  if (error) {
    mapCloudError(
      error,
      "Could not finish account setup (bootstrap failed). In Supabase SQL Editor, run 20261121000000_bootstrap_new_user.sql, then try again.",
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | null;
  if (!row?.id) {
    throw new ApiError(
      "Could not finish account setup (bootstrap returned no profile). Confirm 20261121000000_bootstrap_new_user.sql ran in Supabase.",
      "server",
    );
  }
  return row;
}

async function ensureBootstrappedProfile(
  session: Session,
  startingFace?: AppFace,
): Promise<ProfileRow> {
  const face = startingFace ?? startingFaceFromSession(session);
  const email = session.user.email ?? "";
  const existing = await fetchProfile(session.user.id);
  if (existing) return existing;
  return bootstrapNewUser(email, face);
}

async function listOwnedProperties(
  ownerUserId: string,
): Promise<PublicProperty[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });
  if (error) mapCloudError(error, "Could not load homes.");
  return ((data as PropertyRow[]) ?? []).map(propertyFromRow);
}

async function meFromSession(
  session: Session,
  startingFace?: AppFace,
): Promise<MeResponse> {
  const profile = await ensureBootstrappedProfile(session, startingFace);
  const user = profileToUser(profile);
  const properties = await listOwnedProperties(session.user.id);
  const activeProperty =
    properties.find((p) => p.id === user.activePropertyId) ?? null;
  return {
    user,
    properties,
    activeProperty,
    privacy: {
      ledgerOwner: "homeowner",
      silentSharing: false,
      approveBeforeOfficial: true,
      dataScope: "property",
    },
  };
}

function authResponse(session: Session, user: PublicUser): AuthResponse {
  return {
    accessToken: session.access_token,
    tokenType: "Bearer",
    expiresIn: session.expires_in ?? 3600,
    user,
  };
}

export async function cloudGetSession(): Promise<Session | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) mapCloudError(error, "Could not read session.");
  return data.session;
}

export async function cloudSignOut(): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) mapCloudError(error, "Could not sign out.");
}

export async function cloudSignup(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<AuthResponse> {
  try {
    const supabase = requireSupabaseClient();
    const email = input.email.trim().toLowerCase();
    const startingFace: AppFace = input.startingFace ?? "homeowner";
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          starting_face: startingFace,
          faces: [startingFace],
        },
      },
    });
    if (error) mapCloudError(error, "Could not create account.");
    if (!data.user) {
      throw new ApiError("Could not create account.", "server");
    }
    if (!data.session) {
      throw new ApiError(
        "Account created, but no session yet. For product testing turn Confirm email OFF (Supabase → Authentication → Providers → Email), then sign in — or confirm via the email link first.",
        "auth",
        401,
      );
    }
    // Persist session before RLS / RPC (same race LightLift avoids after signUp).
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    const me = await meFromSession(data.session, startingFace);
    return authResponse(data.session, me.user);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not create account.");
  }
}

export async function cloudLogin(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  try {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error || !data.session || !data.user) {
      mapCloudError(error ?? new Error("invalid credentials"), "Sign-in failed.");
    }
    await supabase.auth.setSession({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
    });
    // Confirm-email path: first real session finishes bootstrap (idempotent).
    const me = await meFromSession(data.session!);
    return authResponse(data.session!, me.user);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Sign-in failed.");
  }
}

export async function cloudFetchMe(_accessToken?: string): Promise<MeResponse> {
  try {
    const session = await requireSession();
    return await meFromSession(session);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load account.");
  }
}

export async function cloudSwitchFace(
  _accessToken: string,
  face: AppFace,
  enableIfMissing = true,
): Promise<AuthResponse> {
  try {
    const session = await requireSession();
    const profile = await ensureBootstrappedProfile(session);
    let faces = facesFrom(profile.faces_json);
    if (!faces.includes(face)) {
      if (!enableIfMissing) {
        throw new ApiError(
          "That face is not on this account yet.",
          "auth",
          403,
        );
      }
      faces = [...faces, face];
    }
    const supabase = requireSupabaseClient();
    const { error } = await supabase
      .from("profiles")
      .update({ faces_json: faces, active_face: face })
      .eq("id", session.user.id);
    if (error) mapCloudError(error, "Could not switch face.");
    const me = await meFromSession(session);
    return authResponse(session, me.user);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not switch face.");
  }
}

export async function cloudCreateProperty(
  _accessToken: string,
  input: CreatePropertyInput,
): Promise<{ property: PublicProperty; user?: PublicUser }> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("properties")
      .insert({
        owner_user_id: session.user.id,
        name: input.name.trim(),
        address_line1: input.addressLine1.trim(),
        address_line2: input.addressLine2?.trim() || null,
        city: input.city.trim(),
        region: input.region.trim(),
        postal_code: input.postalCode.trim(),
        country: (input.country ?? "US").trim() || "US",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) mapCloudError(error, "Could not add home.");
    const property = propertyFromRow(data as PropertyRow);
    const profile = await ensureBootstrappedProfile(session);
    if (!profile.active_property_id) {
      await supabase
        .from("profiles")
        .update({ active_property_id: property.id })
        .eq("id", session.user.id);
    }
    const me = await meFromSession(session);
    return { property, user: me.user };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not add home.");
  }
}

export async function cloudSelectProperty(
  _accessToken: string,
  propertyId: string,
): Promise<{ property: PublicProperty; user?: PublicUser }> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .eq("owner_user_id", session.user.id)
      .maybeSingle();
    if (error) mapCloudError(error, "Could not switch homes.");
    if (!data) {
      throw new ApiError("Home not found.", "client", 404);
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ active_property_id: propertyId })
      .eq("id", session.user.id);
    if (updateError) mapCloudError(updateError, "Could not switch homes.");
    const me = await meFromSession(session);
    return { property: propertyFromRow(data as PropertyRow), user: me.user };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not switch homes.");
  }
}

export async function cloudListAssets(
  _accessToken: string,
  propertyId: string,
): Promise<{ assets: PublicAsset[]; propertyId: string }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (error) mapCloudError(error, "Could not load assets.");
    return {
      assets: ((data as AssetRow[]) ?? []).map(assetFromRow),
      propertyId,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load assets.");
  }
}

export async function cloudGetAsset(
  _accessToken: string,
  propertyId: string,
  assetId: string,
): Promise<{ asset: PublicAsset }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("id", assetId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) mapCloudError(error, "Could not load asset.");
    if (!data) throw new ApiError("Asset not found.", "client", 404);
    return { asset: assetFromRow(data as AssetRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load asset.");
  }
}

export async function cloudCreateAsset(
  _accessToken: string,
  propertyId: string,
  input: CreateAssetInput,
): Promise<{ asset: PublicAsset }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("assets")
      .insert({
        property_id: propertyId,
        name: input.name.trim(),
        category: input.category,
        manufacturer: input.manufacturer?.trim() || null,
        model: input.model?.trim() || null,
        serial: input.serial?.trim() || null,
        purchase_date: input.purchaseDate || null,
        install_date: input.installDate || null,
        installer_vendor: input.installerVendor?.trim() || null,
        location: input.location?.trim() || null,
        notes: input.notes?.trim() || null,
        warranty_end_date: input.warrantyEndDate || null,
        warranty_term: input.warrantyTerm?.trim() || null,
        provenance: "homeowner",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) mapCloudError(error, "Could not add asset.");
    return { asset: assetFromRow(data as AssetRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not add asset.");
  }
}

export async function cloudUpdateAsset(
  _accessToken: string,
  propertyId: string,
  assetId: string,
  input: UpdateAssetInput,
): Promise<{ asset: PublicAsset }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.category !== undefined) patch.category = input.category;
    if (input.manufacturer !== undefined)
      patch.manufacturer = input.manufacturer?.trim() || null;
    if (input.model !== undefined) patch.model = input.model?.trim() || null;
    if (input.serial !== undefined) patch.serial = input.serial?.trim() || null;
    if (input.purchaseDate !== undefined)
      patch.purchase_date = input.purchaseDate || null;
    if (input.installDate !== undefined)
      patch.install_date = input.installDate || null;
    if (input.installerVendor !== undefined)
      patch.installer_vendor = input.installerVendor?.trim() || null;
    if (input.location !== undefined)
      patch.location = input.location?.trim() || null;
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    if (input.warrantyEndDate !== undefined)
      patch.warranty_end_date = input.warrantyEndDate || null;
    if (input.warrantyTerm !== undefined)
      patch.warranty_term = input.warrantyTerm?.trim() || null;

    const { data, error } = await supabase
      .from("assets")
      .update(patch)
      .eq("id", assetId)
      .eq("property_id", propertyId)
      .select("*")
      .single();
    if (error) mapCloudError(error, "Could not update asset.");
    return { asset: assetFromRow(data as AssetRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not update asset.");
  }
}

export async function cloudDeleteAsset(
  _accessToken: string,
  propertyId: string,
  assetId: string,
): Promise<{ ok: boolean }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { error } = await supabase
      .from("assets")
      .delete()
      .eq("id", assetId)
      .eq("property_id", propertyId);
    if (error) mapCloudError(error, "Could not delete asset.");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not delete asset.");
  }
}

export async function cloudListDocuments(
  _accessToken: string,
  propertyId: string,
  options?: { assetId?: string; propertyOnly?: boolean },
): Promise<{ documents: PublicDocument[]; propertyId: string }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    let query = supabase
      .from("documents")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (options?.assetId) query = query.eq("asset_id", options.assetId);
    if (options?.propertyOnly) query = query.is("asset_id", null);
    const { data, error } = await query;
    if (error) mapCloudError(error, "Could not load documents.");
    return {
      documents: ((data as DocumentRow[]) ?? []).map(documentFromRow),
      propertyId,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load documents.");
  }
}

export async function cloudUploadDocument(
  _accessToken: string,
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
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const documentId = crypto.randomUUID();
    const safeName = input.name.replace(/[^\w.\-()+ ]+/g, "_") || "file";
    const storageKey = `${propertyId}/${documentId}/${safeName}`;

    const fileRes = await fetch(input.uri);
    if (!fileRes.ok) {
      throw new ApiError("Could not read the selected file.", "client");
    }
    const blob = await fileRes.blob();

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storageKey, blob, {
        contentType: input.mimeType || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) mapCloudError(uploadError, "Could not upload file.");

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        property_id: propertyId,
        asset_id: input.assetId || null,
        title: input.title.trim(),
        doc_type: input.docType,
        document_date: input.documentDate?.trim() || null,
        source: "user",
        mime_type: input.mimeType || "application/octet-stream",
        original_filename: safeName,
        storage_key: storageKey,
        byte_size: blob.size,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) {
      await supabase.storage.from("documents").remove([storageKey]);
      mapCloudError(error, "Could not save document.");
    }
    return { document: documentFromRow(data as DocumentRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not upload document.");
  }
}

export async function cloudDeleteDocument(
  _accessToken: string,
  propertyId: string,
  documentId: string,
): Promise<{ ok: boolean }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("documents")
      .select("storage_key")
      .eq("id", documentId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) mapCloudError(error, "Could not delete document.");
    if (!data) throw new ApiError("Document not found.", "client", 404);
    const storageKey = (data as { storage_key: string }).storage_key;
    const { error: delError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("property_id", propertyId);
    if (delError) mapCloudError(delError, "Could not delete document.");
    await supabase.storage.from("documents").remove([storageKey]);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not delete document.");
  }
}

/** Signed URL for sharing/viewing a private Storage object. */
export async function cloudDocumentDownloadUrl(
  propertyId: string,
  documentId: string,
): Promise<string> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("documents")
      .select("storage_key")
      .eq("id", documentId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) mapCloudError(error, "Could not open document.");
    if (!data) throw new ApiError("Document not found.", "client", 404);
    const storageKey = (data as { storage_key: string }).storage_key;
    const { data: signed, error: signError } = await supabase.storage
      .from("documents")
      .createSignedUrl(storageKey, 60 * 10);
    if (signError || !signed?.signedUrl) {
      mapCloudError(signError ?? new Error("signed url"), "Could not open document.");
    }
    return signed!.signedUrl;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not open document.");
  }
}

const CLOUD_REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    id: "hvac-filter",
    category: "hvac",
    title: "Replace air filter",
    recurrence: "quarterly",
    defaultDueInDays: 7,
    notes: "Check filter size before buying a replacement.",
  },
  {
    id: "hvac-tuneup",
    category: "hvac",
    title: "Annual HVAC tune-up",
    recurrence: "yearly",
    defaultDueInDays: 30,
    notes: null,
  },
  {
    id: "water-heater-flush",
    category: "water_heater",
    title: "Flush water heater",
    recurrence: "yearly",
    defaultDueInDays: 30,
    notes: null,
  },
  {
    id: "generator-test",
    category: "generator",
    title: "Test generator",
    recurrence: "monthly",
    defaultDueInDays: 14,
    notes: null,
  },
  {
    id: "dryer-vent",
    category: "appliance",
    title: "Clean dryer vent",
    recurrence: "yearly",
    defaultDueInDays: 21,
    notes: null,
  },
  {
    id: "roof-gutters",
    category: "roof",
    title: "Inspect roof and gutters",
    recurrence: "yearly",
    defaultDueInDays: 45,
    notes: null,
  },
  {
    id: "smoke-co",
    category: "electrical",
    title: "Test smoke / CO detectors",
    recurrence: "monthly",
    defaultDueInDays: 7,
    notes: null,
  },
  {
    id: "generic-service",
    category: "any",
    title: "Service check",
    recurrence: "yearly",
    defaultDueInDays: 30,
    notes: null,
  },
];

export async function cloudListReminderTemplates(
  _accessToken: string,
  _propertyId: string,
  category?: AssetCategory,
): Promise<{ templates: ReminderTemplate[] }> {
  const templates = category
    ? CLOUD_REMINDER_TEMPLATES.filter(
        (t) => t.category === category || t.category === "any",
      )
    : CLOUD_REMINDER_TEMPLATES;
  return { templates };
}

export async function cloudListReminders(
  _accessToken: string,
  propertyId: string,
  options?: { assetId?: string; includeCompleted?: boolean },
): Promise<{ reminders: PublicReminder[]; propertyId: string }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    let query = supabase
      .from("reminders")
      .select("*")
      .eq("property_id", propertyId)
      .order("due_date", { ascending: true });
    if (options?.assetId) query = query.eq("asset_id", options.assetId);
    if (!options?.includeCompleted) query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) mapCloudError(error, "Could not load reminders.");
    const rows = (data as ReminderRow[]) ?? [];
    const assetIds = [...new Set(rows.map((r) => r.asset_id))];
    let nameById = new Map<string, string>();
    if (assetIds.length) {
      const { data: assets } = await supabase
        .from("assets")
        .select("id, name")
        .in("id", assetIds);
      nameById = new Map(
        ((assets as { id: string; name: string }[]) ?? []).map((a) => [
          a.id,
          a.name,
        ]),
      );
    }
    return {
      reminders: rows.map((r) =>
        reminderFromRow(r, nameById.get(r.asset_id) ?? null),
      ),
      propertyId,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load reminders.");
  }
}

export async function cloudCreateReminder(
  _accessToken: string,
  propertyId: string,
  input: CreateReminderInput,
): Promise<{ reminder: PublicReminder }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        property_id: propertyId,
        asset_id: input.assetId,
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        due_date: input.dueDate,
        recurrence: input.recurrence,
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) mapCloudError(error, "Could not create reminder.");
    const row = data as ReminderRow;
    const { data: asset } = await supabase
      .from("assets")
      .select("name")
      .eq("id", row.asset_id)
      .maybeSingle();
    return {
      reminder: reminderFromRow(
        row,
        (asset as { name: string } | null)?.name ?? null,
      ),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not create reminder.");
  }
}

function addRecurrence(dueDate: string, recurrence: PublicReminder["recurrence"]): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (recurrence === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  else if (recurrence === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3);
  else if (recurrence === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function cloudCompleteReminder(
  _accessToken: string,
  propertyId: string,
  reminderId: string,
  note?: string | null,
): Promise<{ reminder: PublicReminder }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { data: existing, error: readError } = await supabase
      .from("reminders")
      .select("*")
      .eq("id", reminderId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (readError) mapCloudError(readError, "Could not complete reminder.");
    if (!existing) throw new ApiError("Reminder not found.", "client", 404);
    const row = existing as ReminderRow;
    const now = new Date().toISOString();
    await supabase.from("reminder_completions").insert({
      reminder_id: reminderId,
      property_id: propertyId,
      completed_at: now,
      due_date_at_completion: row.due_date,
      note: note?.trim() || null,
    });

    const nextDue =
      row.recurrence === "none"
        ? null
        : addRecurrence(row.due_date, row.recurrence);
    const patch =
      nextDue == null
        ? {
            status: "completed" as const,
            last_completed_at: now,
            updated_at: now,
          }
        : {
            due_date: nextDue,
            last_completed_at: now,
            status: "active" as const,
            updated_at: now,
          };

    const { data, error } = await supabase
      .from("reminders")
      .update(patch)
      .eq("id", reminderId)
      .eq("property_id", propertyId)
      .select("*")
      .single();
    if (error) mapCloudError(error, "Could not complete reminder.");
    return { reminder: reminderFromRow(data as ReminderRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not complete reminder.");
  }
}

export async function cloudUpdateReminder(
  _accessToken: string,
  propertyId: string,
  reminderId: string,
  input: UpdateReminderInput,
): Promise<{ reminder: PublicReminder }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;
    if (input.recurrence !== undefined) patch.recurrence = input.recurrence;
    const { data, error } = await supabase
      .from("reminders")
      .update(patch)
      .eq("id", reminderId)
      .eq("property_id", propertyId)
      .select("*")
      .single();
    if (error) mapCloudError(error, "Could not update reminder.");
    return { reminder: reminderFromRow(data as ReminderRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not update reminder.");
  }
}

export async function cloudDeleteReminder(
  _accessToken: string,
  propertyId: string,
  reminderId: string,
): Promise<{ ok: boolean }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", reminderId)
      .eq("property_id", propertyId);
    if (error) mapCloudError(error, "Could not delete reminder.");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not delete reminder.");
  }
}

export async function cloudReminderHistory(
  _accessToken: string,
  propertyId: string,
  reminderId: string,
): Promise<{ completions: PublicReminderCompletion[] }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("reminder_completions")
      .select("*")
      .eq("reminder_id", reminderId)
      .eq("property_id", propertyId)
      .order("completed_at", { ascending: false });
    if (error) mapCloudError(error, "Could not load history.");
    return {
      completions: ((data as Array<Record<string, unknown>>) ?? []).map(
        (row) => ({
          id: String(row.id),
          reminderId: String(row.reminder_id),
          completedAt: String(row.completed_at),
          dueDateAtCompletion: String(row.due_date_at_completion),
          note: (row.note as string | null) ?? null,
        }),
      ),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load history.");
  }
}

export async function cloudGetNotificationPreferences(
  _accessToken: string,
): Promise<{
  preferences: {
    remindersEnabled: boolean;
    recallsEnabled: boolean;
    contractorSubmitsEnabled: boolean;
    reminderLeadDays: number;
    pushEnabled: boolean;
    inAppEnabled: boolean;
  };
}> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) mapCloudError(error, "Could not load preferences.");
    const row = data as Record<string, unknown> | null;
    return {
      preferences: {
        remindersEnabled: Boolean(row?.reminders_enabled ?? true),
        recallsEnabled: Boolean(row?.recalls_enabled ?? true),
        contractorSubmitsEnabled: Boolean(
          row?.contractor_submits_enabled ?? true,
        ),
        reminderLeadDays: Number(row?.reminder_lead_days ?? 3),
        pushEnabled: Boolean(row?.push_enabled ?? true),
        inAppEnabled: Boolean(row?.in_app_enabled ?? true),
      },
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load preferences.");
  }
}

export async function cloudUpdateNotificationPreferences(
  _accessToken: string,
  input: Partial<{
    remindersEnabled: boolean;
    recallsEnabled: boolean;
    contractorSubmitsEnabled: boolean;
    reminderLeadDays: number;
    pushEnabled: boolean;
    inAppEnabled: boolean;
  }>,
): Promise<{
  preferences: {
    remindersEnabled: boolean;
    recallsEnabled: boolean;
    contractorSubmitsEnabled: boolean;
    reminderLeadDays: number;
    pushEnabled: boolean;
    inAppEnabled: boolean;
  };
}> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.remindersEnabled !== undefined)
      patch.reminders_enabled = input.remindersEnabled;
    if (input.recallsEnabled !== undefined)
      patch.recalls_enabled = input.recallsEnabled;
    if (input.contractorSubmitsEnabled !== undefined)
      patch.contractor_submits_enabled = input.contractorSubmitsEnabled;
    if (input.reminderLeadDays !== undefined)
      patch.reminder_lead_days = input.reminderLeadDays;
    if (input.pushEnabled !== undefined) patch.push_enabled = input.pushEnabled;
    if (input.inAppEnabled !== undefined)
      patch.in_app_enabled = input.inAppEnabled;

    const { error } = await supabase.from("notification_preferences").upsert(
      { user_id: session.user.id, ...patch },
      { onConflict: "user_id" },
    );
    if (error) mapCloudError(error, "Could not save preferences.");
    return cloudGetNotificationPreferences(_accessToken);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not save preferences.");
  }
}

export async function cloudListNotifications(
  _accessToken: string,
  options?: { unreadOnly?: boolean },
): Promise<{
  notifications: Array<{
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
  }>;
}> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (options?.unreadOnly) query = query.is("read_at", null);
    const { data, error } = await query;
    if (error) mapCloudError(error, "Could not load notifications.");
    return {
      notifications: ((data as Array<Record<string, unknown>>) ?? []).map(
        (row) => ({
          id: String(row.id),
          propertyId: (row.property_id as string | null) ?? null,
          kind: String(row.kind),
          title: String(row.title),
          body: String(row.body),
          relatedReminderId: (row.related_reminder_id as string | null) ?? null,
          relatedAssetId: (row.related_asset_id as string | null) ?? null,
          relatedEntityId: (row.related_entity_id as string | null) ?? null,
          readAt: (row.read_at as string | null) ?? null,
          createdAt: String(row.created_at),
        }),
      ),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load notifications.");
  }
}

export async function cloudMarkNotificationRead(
  _accessToken: string,
  notificationId: string,
): Promise<{ ok: boolean }> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", session.user.id);
    if (error) mapCloudError(error, "Could not mark read.");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not mark read.");
  }
}

export async function cloudMarkAllNotificationsRead(
  _accessToken: string,
): Promise<{ ok: boolean }> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .is("read_at", null);
    if (error) mapCloudError(error, "Could not mark all read.");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not mark all read.");
  }
}

export async function cloudRegisterPushDevice(
  _accessToken: string,
  input: {
    expoPushToken: string;
    platform?: string | null;
    deviceName?: string | null;
  },
): Promise<{ ok: boolean }> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from("push_devices").upsert(
      {
        user_id: session.user.id,
        expo_push_token: input.expoPushToken,
        platform: input.platform ?? null,
        device_name: input.deviceName ?? null,
        updated_at: now,
      },
      { onConflict: "expo_push_token" },
    );
    if (error) mapCloudError(error, "Could not register device.");
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not register device.");
  }
}

type RecallNoticeRow = {
  id: string;
  external_id: string;
  source: string;
  title: string;
  summary: string;
  hazard: string | null;
  manufacturer: string;
  model: string;
  serial_pattern: string | null;
  product_type: string | null;
  recall_date: string | null;
  source_url: string | null;
};

type AssetRecallAlertRow = {
  id: string;
  property_id: string;
  asset_id: string;
  recall_notice_id: string;
  status: "open" | "acknowledged" | "dismissed";
  matched_on: "manufacturer_model" | "manufacturer_model_serial";
  notified_at: string | null;
  acknowledged_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  assets?: { name: string } | null;
  recall_notices?: RecallNoticeRow | null;
};

function publicAlertFromCloudRow(row: AssetRecallAlertRow): import("./api").PublicAssetRecallAlert {
  const notice = row.recall_notices;
  return {
    id: row.id,
    propertyId: row.property_id,
    assetId: row.asset_id,
    assetName: row.assets?.name ?? null,
    status: row.status,
    matchedOn: row.matched_on,
    notifiedAt: row.notified_at,
    acknowledgedAt: row.acknowledged_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recall: {
      id: row.recall_notice_id,
      externalId: notice?.external_id ?? "",
      source: notice?.source ?? "cpsc_fixture",
      title: notice?.title ?? "Safety recall",
      summary: notice?.summary ?? "",
      hazard: notice?.hazard ?? null,
      manufacturer: notice?.manufacturer ?? "",
      model: notice?.model ?? "",
      recallDate: notice?.recall_date ?? null,
      sourceUrl: notice?.source_url ?? null,
    },
  };
}

export async function cloudListRecallAlerts(
  _accessToken: string,
  propertyId: string,
  options?: { assetId?: string; status?: "open" | "acknowledged" | "dismissed" | "all" },
): Promise<{ alerts: import("./api").PublicAssetRecallAlert[] }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    let query = supabase
      .from("asset_recall_alerts")
      .select("*, assets(name), recall_notices(*)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (options?.assetId) query = query.eq("asset_id", options.assetId);
    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    const { data, error } = await query;
    if (error) mapCloudError(error, "Could not load recall alerts.");
    return {
      alerts: ((data as AssetRecallAlertRow[]) ?? []).map(publicAlertFromCloudRow),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not load recall alerts.");
  }
}

export async function cloudAcknowledgeRecallAlert(
  _accessToken: string,
  propertyId: string,
  alertId: string,
): Promise<{ alert: import("./api").PublicAssetRecallAlert }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("asset_recall_alerts")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
        dismissed_at: null,
        updated_at: now,
      })
      .eq("id", alertId)
      .eq("property_id", propertyId);
    if (error) mapCloudError(error, "Could not acknowledge recall.");
    const listed = await cloudListRecallAlerts(_accessToken, propertyId);
    const alert = listed.alerts.find((a) => a.id === alertId);
    if (!alert) throw new ApiError("Recall alert not found.", "client", 404);
    return { alert };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not acknowledge recall.");
  }
}

export async function cloudDismissRecallAlert(
  _accessToken: string,
  propertyId: string,
  alertId: string,
): Promise<{ alert: import("./api").PublicAssetRecallAlert }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("asset_recall_alerts")
      .update({
        status: "dismissed",
        dismissed_at: now,
        updated_at: now,
      })
      .eq("id", alertId)
      .eq("property_id", propertyId);
    if (error) mapCloudError(error, "Could not dismiss recall.");
    const listed = await cloudListRecallAlerts(_accessToken, propertyId);
    const alert = listed.alerts.find((a) => a.id === alertId);
    if (!alert) throw new ApiError("Recall alert not found.", "client", 404);
    return { alert };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not dismiss recall.");
  }
}

/**
 * Cloud-path recall match using fixture public lists (no LAN API).
 * Upserts notices, creates alerts, and writes in-app notifications.
 */
export async function cloudRunRecallCheck(
  _accessToken: string,
  propertyIdFilter?: string,
): Promise<{
  ok: boolean;
  result: {
    mode: string;
    catalogSize: number;
    assetsScanned: number;
    matchesFound: number;
    alertsCreated: number;
    alertsExisting: number;
    notificationsCreated: number;
  };
  unreadCount: number;
  openCount?: number;
}> {
  try {
    const session = await requireSession();
    const supabase = requireSupabaseClient();
    const { matchMobileRecallFixtures, MOBILE_RECALL_FIXTURES } = await import(
      "./recallFixtures"
    );

    const result = {
      mode: "fixture",
      catalogSize: MOBILE_RECALL_FIXTURES.length,
      assetsScanned: 0,
      matchesFound: 0,
      alertsCreated: 0,
      alertsExisting: 0,
      notificationsCreated: 0,
    };

    // Upsert fixture notices (idempotent by source+external_id).
    const noticeIdByExternal = new Map<string, string>();
    for (const entry of MOBILE_RECALL_FIXTURES) {
      const { data: existing } = await supabase
        .from("recall_notices")
        .select("id")
        .eq("source", entry.source)
        .eq("external_id", entry.externalId)
        .maybeSingle();
      if (existing?.id) {
        noticeIdByExternal.set(entry.externalId, String(existing.id));
        continue;
      }
      const now = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from("recall_notices")
        .insert({
          external_id: entry.externalId,
          source: entry.source,
          title: entry.title,
          summary: entry.summary,
          hazard: entry.hazard,
          manufacturer: entry.manufacturer,
          model: entry.model,
          serial_pattern: entry.serialPattern,
          product_type: entry.productType,
          recall_date: entry.recallDate,
          source_url: entry.sourceUrl,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();
      if (error) mapCloudError(error, "Could not store recall notice.");
      noticeIdByExternal.set(entry.externalId, String(inserted.id));
    }

    let propQuery = supabase
      .from("properties")
      .select("id")
      .eq("owner_user_id", session.user.id);
    if (propertyIdFilter) propQuery = propQuery.eq("id", propertyIdFilter);
    const { data: props, error: propErr } = await propQuery;
    if (propErr) mapCloudError(propErr, "Could not load homes.");
    const propertyIds = ((props as Array<{ id: string }>) ?? []).map((p) => p.id);

    const { data: prefsRow } = await supabase
      .from("notification_preferences")
      .select("recalls_enabled, in_app_enabled")
      .eq("user_id", session.user.id)
      .maybeSingle();
    const recallsEnabled = prefsRow?.recalls_enabled !== false;
    const inAppEnabled = prefsRow?.in_app_enabled !== false;

    for (const propertyId of propertyIds) {
      const { data: assets, error: assetErr } = await supabase
        .from("assets")
        .select("id, name, manufacturer, model, serial, property_id")
        .eq("property_id", propertyId);
      if (assetErr) mapCloudError(assetErr, "Could not load assets.");

      for (const asset of (assets as AssetRow[]) ?? []) {
        result.assetsScanned += 1;
        const hits = matchMobileRecallFixtures({
          manufacturer: asset.manufacturer,
          model: asset.model,
          serial: asset.serial,
        });
        result.matchesFound += hits.length;

        for (const hit of hits) {
          const noticeId = noticeIdByExternal.get(hit.entry.externalId);
          if (!noticeId) continue;

          const { data: existingAlert } = await supabase
            .from("asset_recall_alerts")
            .select("id, notified_at")
            .eq("asset_id", asset.id)
            .eq("recall_notice_id", noticeId)
            .maybeSingle();

          let alertId: string;
          if (existingAlert?.id) {
            result.alertsExisting += 1;
            alertId = String(existingAlert.id);
          } else {
            const now = new Date().toISOString();
            const { data: created, error: createErr } = await supabase
              .from("asset_recall_alerts")
              .insert({
                property_id: propertyId,
                asset_id: asset.id,
                recall_notice_id: noticeId,
                status: "open",
                matched_on: hit.matchedOn,
                created_at: now,
                updated_at: now,
              })
              .select("id")
              .single();
            if (createErr) mapCloudError(createErr, "Could not create recall alert.");
            alertId = String(created.id);
            result.alertsCreated += 1;
          }

          if (!existingAlert?.notified_at && recallsEnabled && inAppEnabled) {
            const now = new Date().toISOString();
            const dedupe = `recall_alert:${alertId}:${asset.id}`;
            const { error: noteErr } = await supabase.from("notifications").upsert(
              {
                user_id: session.user.id,
                property_id: propertyId,
                kind: "recall_alert",
                title: `Safety recall: ${asset.name}`,
                body: `${hit.entry.title}. Open the asset to acknowledge or dismiss.`,
                related_asset_id: asset.id,
                related_entity_id: alertId,
                dedupe_key: dedupe,
                push_status: "skipped",
                created_at: now,
              },
              { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
            );
            if (!noteErr) {
              await supabase
                .from("asset_recall_alerts")
                .update({ notified_at: now, updated_at: now })
                .eq("id", alertId);
              result.notificationsCreated += 1;
            }
          }
        }
      }
    }

    const listed = await cloudListNotifications(_accessToken);
    const unreadCount = listed.notifications.filter((n) => !n.readAt).length;
    let openCount: number | undefined;
    if (propertyIdFilter) {
      const open = await cloudListRecallAlerts(_accessToken, propertyIdFilter, {
        status: "open",
      });
      openCount = open.alerts.length;
    }

    return { ok: true, result, unreadCount, openCount };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not check recalls.");
  }
}

/**
 * Upload a plain-text / binary document from in-memory bytes (AI confirm path).
 * Source defaults to ai_fetched — homeowner already confirmed in the UI.
 */
export async function cloudCreateDocumentFromBytes(
  propertyId: string,
  input: {
    title: string;
    docType: DocumentType;
    documentDate?: string | null;
    assetId?: string | null;
    source?: "user" | "ai_fetched" | "contractor";
    mimeType: string;
    originalFilename: string;
    bytes: Uint8Array;
  },
): Promise<{ document: PublicDocument }> {
  try {
    await requireSession();
    const supabase = requireSupabaseClient();
    const documentId = crypto.randomUUID();
    const safeName =
      input.originalFilename.replace(/[^\w.\-()+ ]+/g, "_") || "file.txt";
    const storageKey = `${propertyId}/${documentId}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storageKey, input.bytes, {
        contentType: input.mimeType || "text/plain",
        upsert: false,
      });
    if (uploadError) mapCloudError(uploadError, "Could not upload file.");

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        property_id: propertyId,
        asset_id: input.assetId || null,
        title: input.title.trim(),
        doc_type: input.docType,
        document_date: input.documentDate?.trim() || null,
        source: input.source ?? "ai_fetched",
        mime_type: input.mimeType || "text/plain",
        original_filename: safeName,
        storage_key: storageKey,
        byte_size: input.bytes.byteLength,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) {
      await supabase.storage.from("documents").remove([storageKey]);
      mapCloudError(error, "Could not save document.");
    }
    return { document: documentFromRow(data as DocumentRow) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    mapCloudError(err, "Could not save document.");
  }
}
