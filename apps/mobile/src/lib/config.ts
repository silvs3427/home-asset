import Constants from "expo-constants";
import { isSupabaseConfiguredOnDevice } from "./supabase";

/**
 * API base URL for the optional Hono backend (CI, local SQLite demo, AI jobs).
 *
 * When EXPO_PUBLIC_SUPABASE_URL + anon key are set, the phone talks to Supabase
 * Auth / Postgres / Storage directly — no laptop API or LAN IP is required for
 * signup, login, homes, assets, docs, reminders, or notices.
 *
 * Set EXPO_PUBLIC_API_URL only for:
 * - Local SQLite demo without Supabase
 * - Optional hosted API (AI assist, due-check cron)
 */
const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_BASE_URL =
  fromEnv ||
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl ||
  "http://localhost:8787";

/** True when the build was given public Supabase URL + anon key. */
export const SUPABASE_CONFIGURED = isSupabaseConfiguredOnDevice();
