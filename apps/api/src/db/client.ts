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

-- EPIC 4: maintenance reminders tied to assets (property-scoped).
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT NOT NULL,
  recurrence TEXT NOT NULL,
  status TEXT NOT NULL,
  last_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_property_due
  ON reminders(property_id, due_date);

CREATE INDEX IF NOT EXISTS idx_reminders_asset
  ON reminders(asset_id);

CREATE TABLE IF NOT EXISTS reminder_completions (
  id TEXT PRIMARY KEY NOT NULL,
  reminder_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  due_date_at_completion TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminder_completions_reminder
  ON reminder_completions(reminder_id);

-- EPIC 5: per-user notification preferences (what / when). No marketing.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  recalls_enabled INTEGER NOT NULL DEFAULT 1,
  contractor_submits_enabled INTEGER NOT NULL DEFAULT 1,
  reminder_lead_days INTEGER NOT NULL DEFAULT 3,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Expo (or equivalent) push tokens for the signed-in account.
CREATE TABLE IF NOT EXISTS push_devices (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT,
  device_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user
  ON push_devices(user_id);

-- In-app notification center. Property-scoped when about a home.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  property_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_reminder_id TEXT,
  related_asset_id TEXT,
  related_entity_id TEXT,
  dedupe_key TEXT NOT NULL,
  read_at TEXT,
  push_status TEXT NOT NULL,
  push_sent_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON notifications(user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- EPIC 7: free public recall catalog + per-asset alerts (ack/dismiss history).
CREATE TABLE IF NOT EXISTS recall_notices (
  id TEXT PRIMARY KEY NOT NULL,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  hazard TEXT,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_pattern TEXT,
  product_type TEXT,
  recall_date TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recall_notices_source_external
  ON recall_notices(source, external_id);

CREATE INDEX IF NOT EXISTS idx_recall_notices_keys
  ON recall_notices(manufacturer, model);

CREATE TABLE IF NOT EXISTS asset_recall_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  recall_notice_id TEXT NOT NULL,
  status TEXT NOT NULL,
  matched_on TEXT NOT NULL,
  notified_at TEXT,
  acknowledged_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (recall_notice_id) REFERENCES recall_notices(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_recall_alerts_unique
  ON asset_recall_alerts(asset_id, recall_notice_id);

CREATE INDEX IF NOT EXISTS idx_asset_recall_alerts_property
  ON asset_recall_alerts(property_id, status);

-- Per-home reusable custom asset categories + document types (open lists).
CREATE TABLE IF NOT EXISTS property_labels (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  value_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  UNIQUE (property_id, kind, value_key)
);

CREATE INDEX IF NOT EXISTS idx_property_labels_property_kind
  ON property_labels(property_id, kind);
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
