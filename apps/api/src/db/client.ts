import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
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

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial TEXT,
  purchase_date TEXT,
  install_date TEXT,
  installer_vendor TEXT,
  location TEXT,
  notes TEXT,
  warranty_end_date TEXT,
  warranty_term TEXT,
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_property
  ON assets(property_id);

-- Hooks for EPIC 7 recalls: manufacturer/model/serial are indexed for matching later.
CREATE INDEX IF NOT EXISTS idx_assets_recall_keys
  ON assets(manufacturer, model, serial);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  asset_id TEXT,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  document_date TEXT,
  source TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_property
  ON documents(property_id);

CREATE INDEX IF NOT EXISTS idx_documents_asset
  ON documents(asset_id);
`;

type ColumnInfo = { name: string };

function ensureColumn(
  database: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const cols = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as ColumnInfo[];
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Migrate existing DBs created before EPIC 3 (warranty columns).
 * CREATE TABLE IF NOT EXISTS does not add new columns to old tables.
 */
function migrateSchema(database: DatabaseSync): void {
  ensureColumn(database, "assets", "warranty_end_date", "TEXT");
  ensureColumn(database, "assets", "warranty_term", "TEXT");
}

/**
 * Local SQLite store for accounts, homes, assets, and document metadata.
 * File bytes live under STORAGE_PATH (durable local backup alongside the DB).
 * All home data is keyed by property id from day one (property-scoped).
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
  migrateSchema(db);
  mkdirSync(config.storagePath, { recursive: true });
  return db;
}

/** Absolute path for a stored document blob (property-scoped folder). */
export function documentStoragePath(storageKey: string): string {
  return join(config.storagePath, storageKey);
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
  // Isolate uploaded files per test process; wipe between tests.
  const testStorage = join(tmpdir(), `homeasset-files-test-${process.pid}`);
  process.env.STORAGE_PATH = testStorage;
  try {
    rmSync(testStorage, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
