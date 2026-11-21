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
 * Android lock-screen push (FCM): set android.googleServicesFile only when
 * GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_FILE (EAS file env) or a local
 * apps/mobile/google-services.json is present AND valid. Missing / invalid
 * files are omitted (soft-fail) so preview APKs still boot without Firebase.
 * Register-for-push fails soft in JS until a good file is baked in. See README
 * “Android lock-screen push (FCM)”.
 */
const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

const ANDROID_PACKAGE =
  (appJson.expo &&
    appJson.expo.android &&
    appJson.expo.android.package) ||
  "com.homeasset.app";

/**
 * Only return a path Expo should bake in. Missing path, unreadable file, or
 * JSON that is not a Firebase Android client config → undefined (omit FCM).
 * Never point googleServicesFile at a dangling or garbage path — that can
 * break native startup worse than leaving push unwired.
 *
 * @param {string} candidatePath
 * @param {{ required?: boolean }} [opts] required=true → warn when missing
 *   (env was set). Local optional file stays quiet when absent.
 */
function isUsableGoogleServicesFile(candidatePath, opts = {}) {
  const required = Boolean(opts.required);
  if (!candidatePath || typeof candidatePath !== "string") {
    return false;
  }
  const resolved = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(__dirname, candidatePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    if (required) {
      console.warn(
        `[HomeAsset] google-services file not found (${candidatePath}); omitting android.googleServicesFile so the app can boot without FCM.`,
      );
    }
    return false;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (err) {
    console.warn(
      `[HomeAsset] google-services file is not valid JSON (${candidatePath}); omitting android.googleServicesFile.`,
      err && err.message ? err.message : err,
    );
    return false;
  }
  if (!parsed || typeof parsed !== "object" || !parsed.project_info) {
    console.warn(
      `[HomeAsset] google-services file missing project_info (${candidatePath}); omitting android.googleServicesFile.`,
    );
    return false;
  }
  const clients = Array.isArray(parsed.client) ? parsed.client : [];
  const packageNames = clients
    .map(
      (c) =>
        c &&
        c.client_info &&
        c.client_info.android_client_info &&
        c.client_info.android_client_info.package_name,
    )
    .filter(Boolean);
  if (
    packageNames.length > 0 &&
    !packageNames.includes(ANDROID_PACKAGE)
  ) {
    console.warn(
      `[HomeAsset] google-services package_name is [${packageNames.join(
        ", ",
      )}] but app expects ${ANDROID_PACKAGE}; omitting android.googleServicesFile.`,
    );
    return false;
  }
  return true;
}

function resolveGoogleServicesFile() {
  // Expo docs use GOOGLE_SERVICES_JSON for the EAS file env; keep FILE as alias.
  // EAS file env sets the var to a filesystem path on the build machine.
  const fromEnv = (
    process.env.GOOGLE_SERVICES_JSON ||
    process.env.GOOGLE_SERVICES_FILE ||
    ""
  ).trim();
  if (fromEnv) {
    // Reject accidental paste of raw JSON into a string env (not a file path).
    if (fromEnv.startsWith("{")) {
      console.warn(
        "[HomeAsset] GOOGLE_SERVICES_JSON looks like raw JSON, not a file path. Use EAS env type=file (or a local google-services.json). Omitting android.googleServicesFile.",
      );
      return undefined;
    }
    return isUsableGoogleServicesFile(fromEnv, { required: true })
      ? fromEnv
      : undefined;
  }
  const localPath = path.join(__dirname, "google-services.json");
  if (isUsableGoogleServicesFile(localPath)) {
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
