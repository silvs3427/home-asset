import Constants from "expo-constants";
import { isSupabaseConfiguredOnDevice } from "./supabase";

/**
 * API base URL for the phone app.
 * - Simulator / Expo Go on same machine: http://localhost:8787
 * - Physical device: set EXPO_PUBLIC_API_URL to your machine's LAN IP
 *   (e.g. http://192.168.1.10:8787) in apps/mobile/.env
 * - Installable EAS builds: set EXPO_PUBLIC_API_URL to your hosted API
 */
const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_BASE_URL =
  fromEnv ||
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl ||
  "http://localhost:8787";

/** True when the build was given public Supabase URL + anon key. */
export const SUPABASE_CONFIGURED = isSupabaseConfiguredOnDevice();
