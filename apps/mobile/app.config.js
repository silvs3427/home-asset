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
 * Android lock-screen push (FCM):
 * - Expo Go / local Metro: soft-omit android.googleServicesFile when the file
 *   is missing (push soft-disables in JS).
 * - EAS Android preview / development: soft-omit + warn when missing so
 *   founder preview APKs are not blocked on Firebase setup. Push stays
 *   unavailable until a usable file is present.
 * - EAS Android production: REQUIRE a usable google-services.json via EAS
 *   file env GOOGLE_SERVICES_JSON (visibility sensitive — needed for
 *   app.config resolution) or a local file. Fail the build loudly instead of
 *   shipping a store APK without Firebase Messaging.
 * Escape hatch (any profile): ALLOW_MISSING_GOOGLE_SERVICES=1.
 * Force-require (any profile): REQUIRE_GOOGLE_SERVICES=1.
 * See README “Android lock-screen push (FCM)”.
 */
const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

const ANDROID_PACKAGE =
  (appJson.expo &&
    appJson.expo.android &&
    appJson.expo.android.package) ||
  "com.homeasset.app";

const LOCAL_GOOGLE_SERVICES_REL = "./google-services.json";
const LOCAL_GOOGLE_SERVICES_ABS = path.join(__dirname, "google-services.json");

function isEasBuild() {
  return process.env.EAS_BUILD === "true";
}

function isEasAndroidBuild() {
  return isEasBuild() && process.env.EAS_BUILD_PLATFORM === "android";
}

function easBuildProfile() {
  return (process.env.EAS_BUILD_PROFILE || "").trim();
}

function allowMissingGoogleServices() {
  return process.env.ALLOW_MISSING_GOOGLE_SERVICES === "1";
}

/**
 * Hard-fail only when shipping production (or when explicitly forced).
 * Preview/development soft-omit so Read app config does not die as
 * “Unknown error” when GOOGLE_SERVICES_JSON is missing or secret-visibility.
 */
function requireGoogleServicesOnThisBuild() {
  if (!isEasAndroidBuild()) {
    return false;
  }
  if (allowMissingGoogleServices()) {
    return false;
  }
  if (process.env.REQUIRE_GOOGLE_SERVICES === "1") {
    return true;
  }
  return easBuildProfile() === "production";
}

/**
 * Only return true when Expo should bake this path in. Missing path,
 * unreadable file, or JSON that is not a Firebase Android client config → false.
 * Never point googleServicesFile at a dangling or garbage path — that can
 * break native startup worse than leaving push unwired (local/Expo Go only).
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
        `[HomeAsset] google-services file not found (${candidatePath}).`,
      );
    }
    return false;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (err) {
    console.warn(
      `[HomeAsset] google-services file is not valid JSON (${candidatePath}).`,
      err && err.message ? err.message : err,
    );
    return false;
  }
  if (!parsed || typeof parsed !== "object" || !parsed.project_info) {
    console.warn(
      `[HomeAsset] google-services file missing project_info (${candidatePath}).`,
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
      )}] but app expects ${ANDROID_PACKAGE}.`,
    );
    return false;
  }
  return true;
}

/**
 * Copy EAS file-env path into the project so prebuild always sees a
 * project-relative google-services.json (EAS stores file envs outside the repo).
 * @param {string} sourcePath
 * @returns {string} relative path for android.googleServicesFile
 */
function materializeGoogleServicesFile(sourcePath) {
  const resolved = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(__dirname, sourcePath);
  if (path.resolve(resolved) !== path.resolve(LOCAL_GOOGLE_SERVICES_ABS)) {
    fs.copyFileSync(resolved, LOCAL_GOOGLE_SERVICES_ABS);
  }
  return LOCAL_GOOGLE_SERVICES_REL;
}

function failEasAndroidMissingGoogleServices(detail) {
  const profile = easBuildProfile() || "unknown";
  throw new Error(
    `[HomeAsset] Android EAS build (profile=${profile}) requires a usable ` +
      `google-services.json so Firebase Messaging is baked into the APK. ${detail} ` +
      `Upload EAS file env GOOGLE_SERVICES_JSON with visibility **sensitive** ` +
      `(not secret — secrets are unavailable when EAS CLI resolves app.config), ` +
      `package name com.homeasset.app. Or place apps/mobile/google-services.json. ` +
      `Temporary recovery: ALLOW_MISSING_GOOGLE_SERVICES=1. ` +
      `Preview/development soft-omit when missing unless REQUIRE_GOOGLE_SERVICES=1. ` +
      `Steps: apps/mobile/README.md → Android lock-screen push (FCM).`,
  );
}

function warnEasAndroidMissingGoogleServices(detail) {
  console.warn(
    `[HomeAsset] EAS Android (${easBuildProfile() || "unknown"} profile): ` +
      `no usable google-services.json — omitting android.googleServicesFile. ` +
      `${detail} Lock-screen push will soft-disable on this APK. ` +
      `Upload GOOGLE_SERVICES_JSON (visibility **sensitive**) for push, ` +
      `or set REQUIRE_GOOGLE_SERVICES=1 to fail the build instead.`,
  );
}

function resolveGoogleServicesFile() {
  // Expo docs use GOOGLE_SERVICES_JSON for the EAS file env; keep FILE as alias.
  // EAS file env sets the var to a filesystem path on the build machine.
  // Visibility must be sensitive (or plain) so EAS CLI can resolve app.config.
  const fromEnv = (
    process.env.GOOGLE_SERVICES_JSON ||
    process.env.GOOGLE_SERVICES_FILE ||
    ""
  ).trim();

  if (fromEnv) {
    // Reject accidental paste of raw JSON into a string env (not a file path).
    if (fromEnv.startsWith("{")) {
      const msg =
        "GOOGLE_SERVICES_JSON looks like raw JSON, not a file path. Use EAS env type=file.";
      if (requireGoogleServicesOnThisBuild()) {
        failEasAndroidMissingGoogleServices(msg);
      }
      if (isEasAndroidBuild()) {
        warnEasAndroidMissingGoogleServices(msg);
      } else {
        console.warn(`[HomeAsset] ${msg} Omitting android.googleServicesFile.`);
      }
      return undefined;
    }
    if (isUsableGoogleServicesFile(fromEnv, { required: true })) {
      try {
        const rel = materializeGoogleServicesFile(fromEnv);
        console.log(
          `[HomeAsset] android.googleServicesFile ← ${rel} (from EAS file env)`,
        );
        return rel;
      } catch (err) {
        console.warn(
          "[HomeAsset] Could not copy google-services into project; using env path.",
          err && err.message ? err.message : err,
        );
        return fromEnv;
      }
    }
    const invalidDetail = `GOOGLE_SERVICES_JSON is set but the file is missing or invalid (${fromEnv}).`;
    if (requireGoogleServicesOnThisBuild()) {
      failEasAndroidMissingGoogleServices(invalidDetail);
    }
    if (isEasAndroidBuild()) {
      warnEasAndroidMissingGoogleServices(invalidDetail);
    } else {
      console.warn(
        "[HomeAsset] GOOGLE_SERVICES_JSON unusable; omitting android.googleServicesFile so local/Expo Go can boot.",
      );
    }
    return undefined;
  }

  if (isUsableGoogleServicesFile(LOCAL_GOOGLE_SERVICES_ABS)) {
    console.log(
      `[HomeAsset] android.googleServicesFile ← ${LOCAL_GOOGLE_SERVICES_REL} (local file)`,
    );
    return LOCAL_GOOGLE_SERVICES_REL;
  }

  const missingDetail =
    "Neither GOOGLE_SERVICES_JSON nor apps/mobile/google-services.json was found.";
  if (requireGoogleServicesOnThisBuild()) {
    failEasAndroidMissingGoogleServices(missingDetail);
  }
  if (isEasAndroidBuild()) {
    warnEasAndroidMissingGoogleServices(missingDetail);
  }

  // Expo Go / local / preview without Firebase: soft-omit (push soft-disables in JS).
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
