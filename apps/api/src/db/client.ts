import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

let db: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  faces_json TEXT NOT NULL,
  active_face TEXT NOT NULL,
  active_property_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_properties_owner
  ON properties(owner_user_id);
`;

/**
 * Local SQLite store for accounts + homes.
 * All home data is keyed by property id from day one (property-scoped).
 * Path comes from DATABASE_PATH; use :memory: in tests.
 */
export function getDb(): DatabaseSync {
  if (db) return db;

  const path = config.databasePath;
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/** Test helper — wipe rows and optionally reopen against a fresh memory DB. */
export function __resetDbForTests(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // already closed
    }
    db = null;
  }
  // Force next getDb() to open a clean :memory: when NODE_ENV=test.
  process.env.DATABASE_PATH = ":memory:";
}
