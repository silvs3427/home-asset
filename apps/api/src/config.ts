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
  /**
   * Shared secret for cron / due-check jobs (POST /jobs/...).
   * Required in production; optional in development (open local due-check).
   */
  jobsSecret: process.env.JOBS_SECRET?.trim() || "",
  /**
   * Optional Expo access token for live push. Without it, pushes are stubbed
   * (logged + marked stubbed) so the path can go live with config only.
   */
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN?.trim() || "",
  /**
   * Optional OpenAI-compatible API key for live AI assist.
   * Without it (or with AI_FORCE_MOCK=1), the local catalog mock is used so CI
   * and local runs work without secrets.
   */
  aiApiKey:
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "",
  aiBaseUrl: (
    process.env.AI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/$/, ""),
  aiModel: process.env.AI_MODEL?.trim() || "gpt-4o-mini",
  aiForceMock:
    process.env.AI_FORCE_MOCK === "1" ||
    process.env.AI_FORCE_MOCK === "true",
};
