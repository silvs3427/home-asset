/**
 * Maps Cursor/Cloud secrets (SUPABASE_*) onto Expo public env names so Metro
 * can inline them. Prefer EXPO_PUBLIC_* when already set (local .env).
 *
 * Same pattern as LightLift: static values live in app.json; this file only
 * injects env + EAS project id + Android FCM google-services path.
 * After `eas init` / first build, Expo may write extra.eas.projectId into
 * app.json — keep it. Do not invent a UUID.
 *
 * EAS Update: updates.url is https://u.expo.dev/<projectId> when projectId is set.
 *
 * Never default EXPO_PUBLIC_API_URL / apiBaseUrl to localhost here — that gets
 * baked into preview APKs and makes phones try the laptop. Local Metro can
 * fall back to localhost only in config.ts when __DEV__ and not standalone.
 *
 * Android lock-screen push (FCM): set android.googleServicesFile when
 * GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_FILE (EAS file env) is present, or
 * when apps/mobile/google-services.json exists locally. See README
 * “Android lock-screen push (FCM)”.
 */
const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

function resolveGoogleServicesFile() {
  // Expo docs use GOOGLE_SERVICES_JSON for the EAS file env; keep FILE as alias.
  const fromEnv = (
    process.env.GOOGLE_SERVICES_JSON ||
    process.env.GOOGLE_SERVICES_FILE ||
    ""
  ).trim();
  if (fromEnv) {
    return fromEnv;
  }
  const localPath = path.join(__dirname, "google-services.json");
  if (fs.existsSync(localPath)) {
    return "./google-services.json";
  }
  return undefined;
}

module.exports = () => {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  // Explicit only — never invent localhost for EAS preview/production.
  const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL || "").trim();

  if (supabaseUrl) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = supabaseUrl;
  }
  if (supabaseAnonKey) {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;
  }
  if (apiBaseUrl) {
    process.env.EXPO_PUBLIC_API_URL = apiBaseUrl;
  }

  const existingExtra = appJson.expo.extra || {};
  const projectId =
    process.env.EAS_PROJECT_ID ||
    (existingExtra.eas && existingExtra.eas.projectId) ||
    undefined;

  const updates = {
    ...(appJson.expo.updates || {}),
  };
  if (projectId) {
    updates.url = `https://u.expo.dev/${projectId}`;
  }

  const googleServicesFile = resolveGoogleServicesFile();
  const android = {
    ...(appJson.expo.android || {}),
    ...(googleServicesFile ? { googleServicesFile } : {}),
  };

  return {
    ...appJson.expo,
    android,
    updates,
    extra: {
      ...existingExtra,
      // Omit empty apiBaseUrl so standalone builds do not inherit localhost.
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      supabaseUrl,
      supabaseAnonKey,
      eas: {
        ...(existingExtra.eas || {}),
        // Filled by `eas init` / first `eas build`. Do not invent a UUID.
        ...(projectId ? { projectId } : {}),
      },
    },
  };
};
