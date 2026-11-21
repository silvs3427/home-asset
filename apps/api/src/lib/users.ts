import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { __resetDbForTests, getDb } from "../db/client.js";
import { __resetAiDraftsForTests } from "./ai/drafts.js";
import {
  isSupabaseAuthEnabled,
  isSupabaseDataEnabled,
} from "./supabase/client.js";
import {
  supabaseSignIn,
  supabaseSignUp,
} from "./supabase/auth.js";
import {
  sbEnableFace,
  sbGetUserById,
  sbSetActiveFace,
  sbSetActivePropertyId,
} from "./supabase/store.js";
import type { AppFace, UserRecord } from "./types.js";

const BCRYPT_ROUNDS = 12;
const SUPABASE_PASSWORD_MARKER = "supabase-auth";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  faces_json: string;
  active_face: string;
  active_property_id: string | null;
  created_at: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    faces: JSON.parse(row.faces_json) as AppFace[],
    activeFace: row.active_face as AppFace,
    activePropertyId: row.active_property_id,
    createdAt: row.created_at,
  };
}

function insertLocalUser(user: UserRecord): void {
  // Always keep a local mirror so existing SQLite-backed routes keep working
  // when Auth is on Supabase but DATA_BACKEND is still sqlite (default / CI).
  getDb()
    .prepare(
      `INSERT INTO users
        (id, email, password_hash, faces_json, active_face, active_property_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         password_hash = excluded.password_hash,
         faces_json = excluded.faces_json,
         active_face = excluded.active_face,
         active_property_id = excluded.active_property_id`,
    )
    .run(
      user.id,
      user.email,
      user.passwordHash,
      JSON.stringify(user.faces),
      user.activeFace,
      user.activePropertyId,
      user.createdAt,
    );
}

/**
 * Durable user store. Default = local SQLite (CI / demo).
 * When Supabase Auth is configured, passwords live in Supabase Auth and a
 * profile row is created there; we still mirror into SQLite when
 * DATA_BACKEND=sqlite so the rest of the API keeps working unchanged.
 */
export async function createUser(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<UserRecord> {
  if (isSupabaseAuthEnabled()) {
    const user = await supabaseSignUp(input);
    insertLocalUser({ ...user, passwordHash: SUPABASE_PASSWORD_MARKER });
    return user;
  }

  const email = normalizeEmail(input.email);
  const existing = getUserByEmail(email);
  if (existing) {
    throw new Error("EMAIL_TAKEN");
  }

  const startingFace: AppFace = input.startingFace ?? "homeowner";
  const user: UserRecord = {
    id: randomUUID(),
    email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    faces: [startingFace],
    activeFace: startingFace,
    activePropertyId: null,
    createdAt: new Date().toISOString(),
  };

  insertLocalUser(user);
  return user;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserRecord | null> {
  if (isSupabaseAuthEnabled()) {
    const user = await supabaseSignIn(email, password);
    if (!user) return null;
    insertLocalUser({ ...user, passwordHash: SUPABASE_PASSWORD_MARKER });
    return user;
  }

  const user = getUserByEmail(normalizeEmail(email));
  if (!user) return null;
  if (user.passwordHash === SUPABASE_PASSWORD_MARKER) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export function getUserById(id: string): UserRecord | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, email, password_hash, faces_json, active_face, active_property_id, created_at
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined;
  return row ? rowToUser(row) : undefined;
}

export async function getUserByIdAsync(
  id: string,
): Promise<UserRecord | undefined> {
  if (isSupabaseDataEnabled()) return sbGetUserById(id);
  return getUserById(id);
}

export function getUserByEmail(email: string): UserRecord | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, email, password_hash, faces_json, active_face, active_property_id, created_at
       FROM users WHERE email = ?`,
    )
    .get(normalizeEmail(email)) as UserRow | undefined;
  return row ? rowToUser(row) : undefined;
}

export function setActiveFace(userId: string, face: AppFace): UserRecord {
  const user = getUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!user.faces.includes(face)) {
    throw new Error("FACE_NOT_AVAILABLE");
  }

  getDb()
    .prepare(`UPDATE users SET active_face = ? WHERE id = ?`)
    .run(face, userId);

  return { ...user, activeFace: face };
}

export async function setActiveFaceAsync(
  userId: string,
  face: AppFace,
): Promise<UserRecord> {
  if (isSupabaseDataEnabled()) return sbSetActiveFace(userId, face);
  const updated = setActiveFace(userId, face);
  if (isSupabaseAuthEnabled()) {
    try {
      await sbSetActiveFace(userId, face);
    } catch (err) {
      console.warn("[users] supabase face sync failed", err);
    }
  }
  return updated;
}

/**
 * Explicit second-role enrollment on the same login.
 * Distinct from setActiveFace — never call this from a free face toggle.
 */
export function enableFace(userId: string, face: AppFace): UserRecord {
  const user = getUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.faces.includes(face)) return user;

  const faces = [...user.faces, face];
  getDb()
    .prepare(`UPDATE users SET faces_json = ? WHERE id = ?`)
    .run(JSON.stringify(faces), userId);

  return { ...user, faces };
}

export async function enableFaceAsync(
  userId: string,
  face: AppFace,
): Promise<UserRecord> {
  if (isSupabaseDataEnabled()) return sbEnableFace(userId, face);
  const updated = enableFace(userId, face);
  if (isSupabaseAuthEnabled()) {
    try {
      await sbEnableFace(userId, face);
    } catch (err) {
      console.warn("[users] supabase enable-face sync failed", err);
    }
  }
  return updated;
}

export function setActivePropertyId(
  userId: string,
  propertyId: string | null,
): UserRecord {
  const user = getUserById(userId);
  if (!user) throw new Error("USER_NOT_FOUND");

  getDb()
    .prepare(`UPDATE users SET active_property_id = ? WHERE id = ?`)
    .run(propertyId, userId);

  return { ...user, activePropertyId: propertyId };
}

export async function setActivePropertyIdAsync(
  userId: string,
  propertyId: string | null,
): Promise<UserRecord> {
  if (isSupabaseDataEnabled()) {
    return sbSetActivePropertyId(userId, propertyId);
  }
  const updated = setActivePropertyId(userId, propertyId);
  if (isSupabaseAuthEnabled()) {
    try {
      await sbSetActivePropertyId(userId, propertyId);
    } catch (err) {
      console.warn("[users] supabase active-property sync failed", err);
    }
  }
  return updated;
}

/** Test helper — reopen a clean in-memory DB and clear ephemeral AI drafts. */
export function __resetUsersForTests(): void {
  __resetDbForTests();
  __resetAiDraftsForTests();
}
