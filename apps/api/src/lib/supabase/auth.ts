import type { AppFace, UserRecord } from "../types.js";
import { getSupabaseAnon, getSupabaseService, isSupabaseServiceConfigured } from "./client.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type ProfileRow = {
  id: string;
  email: string;
  faces_json: AppFace[] | string;
  active_face: AppFace;
  active_property_id: string | null;
  created_at: string;
};

function facesFromJson(value: AppFace[] | string): AppFace[] {
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
    // Password lives in Supabase Auth — never returned or used locally.
    passwordHash: "supabase-auth",
    faces: facesFromJson(row.faces_json),
    activeFace: row.active_face,
    activePropertyId: row.active_property_id,
    createdAt: row.created_at,
  };
}

async function fetchProfile(userId: string): Promise<UserRecord | null> {
  const client = isSupabaseServiceConfigured()
    ? getSupabaseService()
    : getSupabaseAnon();
  const { data, error } = await client
    .from("profiles")
    .select(
      "id, email, faces_json, active_face, active_property_id, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`SUPABASE_PROFILE_READ:${error.message}`);
  if (!data) return null;
  return profileToUser(data as ProfileRow);
}

async function ensureProfile(input: {
  id: string;
  email: string;
  startingFace: AppFace;
}): Promise<UserRecord> {
  const existing = await fetchProfile(input.id);
  if (existing) return existing;

  if (!isSupabaseServiceConfigured()) {
    // Trigger on auth.users should create the row; brief wait + re-read.
    await new Promise((r) => setTimeout(r, 250));
    const again = await fetchProfile(input.id);
    if (again) return again;
    throw new Error(
      "SUPABASE_PROFILE_MISSING: run supabase/migrations/001_homeasset_schema.sql and set SUPABASE_SERVICE_ROLE_KEY for server bootstrap.",
    );
  }

  const client = getSupabaseService();
  const now = new Date().toISOString();
  const faces: AppFace[] = [input.startingFace];
  const { error } = await client.from("profiles").upsert(
    {
      id: input.id,
      email: normalizeEmail(input.email),
      faces_json: faces,
      active_face: input.startingFace,
      active_property_id: null,
      created_at: now,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`SUPABASE_PROFILE_UPSERT:${error.message}`);

  await client.from("notification_preferences").upsert(
    { user_id: input.id },
    { onConflict: "user_id" },
  );

  const created = await fetchProfile(input.id);
  if (!created) throw new Error("SUPABASE_PROFILE_MISSING");
  return created;
}

/**
 * Sign up with Supabase Auth (email + password). Profile row is created by
 * SQL trigger (or service-role upsert as fallback).
 */
export async function supabaseSignUp(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const startingFace: AppFace = input.startingFace ?? "homeowner";
  const supabase = getSupabaseAnon();

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

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      throw new Error("EMAIL_TAKEN");
    }
    throw new Error(`SUPABASE_SIGNUP:${error.message}`);
  }
  if (!data.user) throw new Error("SUPABASE_SIGNUP:no_user");

  return ensureProfile({
    id: data.user.id,
    email,
    startingFace,
  });
}

/** Sign in with Supabase Auth; returns the HomeAsset profile. */
export async function supabaseSignIn(
  email: string,
  password: string,
): Promise<UserRecord | null> {
  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error || !data.user) return null;

  const faceMeta = data.user.user_metadata?.starting_face as AppFace | undefined;
  return ensureProfile({
    id: data.user.id,
    email: data.user.email ?? email,
    startingFace: faceMeta ?? "homeowner",
  });
}
