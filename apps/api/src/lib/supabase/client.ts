import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../../config.js";

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

/**
 * True when URL + anon key are present (Auth + optional client Storage).
 * In NODE_ENV=test we stay on the local SQLite path unless SUPABASE_TEST=1,
 * so CI stays green even when the runner has project secrets injected.
 */
export function isSupabaseConfigured(): boolean {
  if (process.env.NODE_ENV === "test" && process.env.SUPABASE_TEST !== "1") {
    return false;
  }
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

/** True when service role is present (server-side Postgres + Storage admin). */
export function isSupabaseServiceConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

/** Auth uses Supabase when configured (auto) or AUTH_BACKEND=supabase. */
export function isSupabaseAuthEnabled(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (config.authBackend === "local") return false;
  if (config.authBackend === "supabase") return true;
  return true; // auto
}

/** Structured data in Postgres when explicitly enabled + service role. */
export function isSupabaseDataEnabled(): boolean {
  return config.dataBackend === "supabase" && isSupabaseServiceConfigured();
}

/** File bytes in Supabase Storage when enabled + keys present. */
export function isSupabaseStorageEnabled(): boolean {
  if (config.storageBackend === "local") return false;
  if (config.storageBackend === "supabase") {
    return isSupabaseServiceConfigured() || isSupabaseConfigured();
  }
  // auto: use supabase storage when service role is available
  return isSupabaseServiceConfigured();
}

export function getSupabaseAnon(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  if (!anonClient) {
    anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return anonClient;
}

/**
 * Service-role client bypasses RLS. Only use after the API has already
 * checked the signed-in user owns the row (same privacy bar as SQLite path).
 */
export function getSupabaseService(): SupabaseClient {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_REQUIRED");
  }
  if (!serviceClient) {
    serviceClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return serviceClient;
}

export function supabaseStatus() {
  return {
    configured: isSupabaseConfigured(),
    auth: isSupabaseAuthEnabled() ? "supabase" : "local",
    data: isSupabaseDataEnabled() ? "supabase" : "sqlite",
    storage: isSupabaseStorageEnabled() ? "supabase" : "local",
    serviceRole: isSupabaseServiceConfigured(),
  };
}

/** Test helper — drop cached clients after env changes. */
export function __resetSupabaseClientsForTests(): void {
  anonClient = null;
  serviceClient = null;
}
