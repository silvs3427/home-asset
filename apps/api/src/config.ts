import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Runtime configuration with secure defaults.
 * Secrets must come from the environment — never hardcode production values.
 */

function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production`);
  }
  return fallback;
}

function resolveDatabasePath(): string {
  const fromEnv = process.env.DATABASE_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "test") return ":memory:";
  return "./data/homeasset.sqlite";
}

function resolveStoragePath(): string {
  const fromEnv = process.env.STORAGE_PATH?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "test") {
    return join(tmpdir(), `homeasset-files-test-${process.pid}`);
  }
  return "./data/files";
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  jwtSecret: requiredInProduction(
    "JWT_SECRET",
    "dev-only-jwt-secret-replace-before-deploy",
  ),
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 3600),
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Max upload size for manuals / photos (15 MiB). */
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024),
  /** SQLite file path, or `:memory:` for tests. Read live so tests can reset. */
  get databasePath() {
    return resolveDatabasePath();
  },
  /** Durable file store for documents (alongside the DB under data/). */
  get storagePath() {
    return resolveStoragePath();
  },
};
