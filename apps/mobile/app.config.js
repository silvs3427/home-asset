/**
 * Maps Cursor/Cloud secrets (SUPABASE_*) onto Expo public env names so Metro
 * can inline them. Prefer EXPO_PUBLIC_* when already set (local .env).
 *
 * Same pattern as LightLift: static values live in app.json; this file only
 * injects env + EAS project id. After `eas init` / first build, Expo may write
 * extra.eas.projectId into app.json — keep it. Do not invent a UUID.
 *
 * EAS Update: updates.url is https://u.expo.dev/<projectId> when projectId is set.
 */
const appJson = require("./app.json");

module.exports = () => {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_URL || "http://localhost:8787";

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

  return {
    ...appJson.expo,
    updates,
    extra: {
      ...existingExtra,
      apiBaseUrl,
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
