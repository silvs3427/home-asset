import Constants from "expo-constants";
import { isSupabaseConfiguredOnDevice } from "./supabase";

/**
 * API base URL for the optional Hono backend (local SQLite demo / CI only).
 *
 * When EXPO_PUBLIC_SUPABASE_URL + anon key are set, the phone talks to Supabase
 * Auth / Postgres / Storage / edge `ai-assist` directly — no laptop API or LAN
 * IP is required for signup, login, homes, assets, docs, reminders, recalls,
 * notices, or AI.
 *
 * Set EXPO_PUBLIC_API_URL only for local SQLite demo without Supabase.
 * Never bake localhost into preview/production EAS builds (LightLift pattern).
 */

type Extra = {
  apiBaseUrl?: string;
};

function readExtra(): Extra {
  return (Constants.expoConfig?.extra as Extra | undefined) || {};
}

/** True for installable / store builds — never fall back to laptop localhost. */
function isStandaloneInstall(): boolean {
  const env = Constants.executionEnvironment;
  return env === "standalone" || env === "storeClient";
}

const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim() || "";
const fromExtra = readExtra().apiBaseUrl?.trim() || "";
const explicitApiUrl = fromEnv || fromExtra;

/**
 * Local Metro / Simulator convenience only. Standalone preview APKs must not
 * inherit this — they need Supabase (preferred) or an explicit LAN/hosted URL.
 */
const localDevFallback =
  !isStandaloneInstall() &&
  typeof __DEV__ !== "undefined" &&
  __DEV__
    ? "http://localhost:8787"
    : "";

export const API_BASE_URL = explicitApiUrl || localDevFallback;

/** True when an optional Hono API URL is available (local demo path). */
export const API_CONFIGURED = Boolean(API_BASE_URL);

/** True when the build was given public Supabase URL + anon key. */
export const SUPABASE_CONFIGURED = isSupabaseConfiguredOnDevice();

/**
 * Prefer cloud for all core + AI when Supabase is configured.
 * Standalone installs without Supabase should not silently hit localhost.
 */
export function assertReachableBackend(): void {
  if (SUPABASE_CONFIGURED) return;
  if (API_BASE_URL && !isLoopbackApiUrl(API_BASE_URL)) return;
  if (API_BASE_URL && !isStandaloneInstall()) return;
  throw new Error(
    "This phone install has no cloud connection. " +
      "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the Expo " +
      "preview environment, then rebuild the preview APK. " +
      "Do not set EXPO_PUBLIC_API_URL to localhost on a phone.",
  );
}

export function isLoopbackApiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return /localhost|127\.0\.0\.1/.test(url);
  }
}
