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
 * Optional Supabase client (LightLift-style env resolution).
 * First match wins: EXPO_PUBLIC_* → app.config extra → bare SUPABASE_* (Cloud secrets).
 * When unset, returns null — app keeps using the HomeAsset API (local SQLite path).
 */
export function getSupabaseClient(): SupabaseClient | null {
  const extra = readExtra();
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
    extra.supabaseUrl?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    extra.supabaseAnonKey?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function isSupabaseConfiguredOnDevice(): boolean {
  return getSupabaseClient() !== null;
}
