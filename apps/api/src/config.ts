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

function resolveBackend(
  name: "AUTH_BACKEND" | "DATA_BACKEND" | "STORAGE_BACKEND",
  allowed: readonly string[],
  fallback: string,
): string {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (!allowed.includes(raw)) {
    throw new Error(
      `${name} must be one of ${allowed.join("|")} (got ${JSON.stringify(raw)})`,
    );
  }
  return raw;
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

  /**
   * Recall catalog source for EPIC 7.
   * `fixture` (default, CI-safe) or `live` (SaferProducts.gov with fixture fallback).
   */
  recallSource: ((): "fixture" | "live" => {
    const raw = process.env.RECALL_SOURCE?.trim().toLowerCase();
    return raw === "live" ? "live" : "fixture";
  })(),
  /** Timeout for live SaferProducts fetch before falling back to fixtures. */
  recallLiveTimeoutMs: Number(process.env.RECALL_LIVE_TIMEOUT_MS ?? 8000),

  /**
   * Supabase project URL (Dashboard → Project Settings → API).
   * Leave empty for local SQLite demo / CI.
   */
  supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
  /** Publishable / anon key — safe for mobile + server Auth calls. */
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "",
  /**
   * Service-role key — server only. Needed for DATA_BACKEND=supabase and
   * for STORAGE_BACKEND=supabase admin uploads. Never put this in the phone app.
   */
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",

  /**
   * Auth store: `auto` (Supabase when URL+anon set), `supabase`, or `local`.
   * Default `auto` keeps CI on local JWT+SQLite when secrets are absent.
   */
  authBackend: resolveBackend(
    "AUTH_BACKEND",
    ["auto", "local", "supabase"],
    "auto",
  ) as "auto" | "local" | "supabase",
  /**
   * Structured ledger: `sqlite` (default, CI-safe) or `supabase` (needs
   * service role + schema migration applied).
   */
  dataBackend: resolveBackend(
    "DATA_BACKEND",
    ["sqlite", "supabase"],
    "sqlite",
  ) as "sqlite" | "supabase",
  /**
   * File bytes: `auto` (Supabase Storage when service role set), `local`, or
   * `supabase`.
   */
  storageBackend: resolveBackend(
    "STORAGE_BACKEND",
    ["auto", "local", "supabase"],
    "auto",
  ) as "auto" | "local" | "supabase",
};
