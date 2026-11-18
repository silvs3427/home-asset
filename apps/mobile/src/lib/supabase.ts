import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function readExtra(): Extra {
  return (Constants.expoConfig?.extra as Extra | undefined) || {};
}

/**
 * Prefer Expo public names, then Cursor/Cloud secret names, then app.config extra
 * (same resolution order as LightLift).
 */
function resolveSupabaseEnv(): { url: string; anonKey: string } {
  const extra = readExtra();
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    extra.supabaseUrl?.trim() ||
    "";
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    extra.supabaseAnonKey?.trim() ||
    "";
  return { url, anonKey };
}

const CONFIG_ERROR =
  "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env (exactly named .env, not .env.txt), then restart with `npx expo start -c`.";

let client: SupabaseClient | null = null;

/**
 * True when both URL and anon key are present.
 * Safe at render time — does not create a client.
 */
export function isSupabaseConfiguredOnDevice(): boolean {
  const { url, anonKey } = resolveSupabaseEnv();
  return Boolean(url && anonKey);
}

export function assertSupabaseConfigured(): void {
  if (!isSupabaseConfiguredOnDevice()) {
    throw new Error(CONFIG_ERROR);
  }
}

/**
 * Lazy shared Supabase client (LightLift pattern).
 * Session persists in AsyncStorage; phone talks to cloud Auth + Postgres + Storage
 * with the anon key + user JWT — no laptop API / LAN IP required.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfiguredOnDevice()) return null;
  if (!client) {
    const { url, anonKey } = resolveSupabaseEnv();
    client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Throws if Supabase env is missing (for cloud-only code paths). */
export function requireSupabaseClient(): SupabaseClient {
  assertSupabaseConfigured();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(CONFIG_ERROR);
  return supabase;
}
