import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AppFace, UserRecord } from "./types.js";

/**
 * In-memory user store for EPIC 0 only.
 * Replace with a real database in EPIC 1 — same interface shape.
 * No third-party identity sharing; credentials stay in our process.
 */
const usersByEmail = new Map<string, UserRecord>();
const usersById = new Map<string, UserRecord>();

const BCRYPT_ROUNDS = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(input: {
  email: string;
  password: string;
  startingFace?: AppFace;
}): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  if (usersByEmail.has(email)) {
    throw new Error("EMAIL_TAKEN");
  }

  const startingFace: AppFace = input.startingFace ?? "homeowner";
  const user: UserRecord = {
    id: randomUUID(),
    email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    faces: [startingFace],
    activeFace: startingFace,
    createdAt: new Date().toISOString(),
  };

  usersByEmail.set(email, user);
  usersById.set(user.id, user);
  return user;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserRecord | null> {
  const user = usersByEmail.get(normalizeEmail(email));
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export function getUserById(id: string): UserRecord | undefined {
  return usersById.get(id);
}

/** Test / local helpers — not exposed over HTTP. */
export function __resetUsersForTests(): void {
  usersByEmail.clear();
  usersById.clear();
}
