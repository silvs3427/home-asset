import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { __resetDbForTests, getDb } from "../db/client.js";
import { __resetAiDraftsForTests } from "./ai/drafts.js";
import type { AppFace, UserRecord } from "./types.js";

const BCRYPT_ROUNDS = 12;

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

/**
 * Durable user store (SQLite). Credentials never leave this process to third parties.
 */
export async function createUser(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<UserRecord> {
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

  getDb()
    .prepare(
      `INSERT INTO users
        (id, email, password_hash, faces_json, active_face, active_property_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

  return user;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserRecord | null> {
  const user = getUserByEmail(normalizeEmail(email));
  if (!user) return null;
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

/**
 * Enable an additional face on the same login (homeowner ↔ contractor).
 * No separate account required.
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

/** Test helper — reopen a clean in-memory DB and clear ephemeral AI drafts. */
export function __resetUsersForTests(): void {
  __resetDbForTests();
  __resetAiDraftsForTests();
}
