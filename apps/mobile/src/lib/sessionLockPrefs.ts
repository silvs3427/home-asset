import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Local-only prefs for idle / app-return lock. Not secrets — just toggles.
 * Biometric templates stay in the OS; we never store fingerprints or faces.
 */

export const IDLE_TIMEOUT_OPTIONS = [
  { label: "1 minute", ms: 60_000 },
  { label: "2 minutes", ms: 120_000 },
  { label: "3 minutes", ms: 180_000 },
  { label: "5 minutes", ms: 300_000 },
] as const;

export type IdleTimeoutMs = (typeof IDLE_TIMEOUT_OPTIONS)[number]["ms"];

/** Default idle before lock while the app stays open. */
export const DEFAULT_IDLE_TIMEOUT_MS: IdleTimeoutMs = 120_000;

/**
 * Short grace after the app leaves the foreground before a return requires
 * unlock. Keeps quick app-switchers from fighting the lock while still
 * protecting the ledger when the phone sits unlocked in a pocket or on a table.
 */
export const BACKGROUND_GRACE_MS = 20_000;

const ENABLED_KEY = "homeasset.sessionLock.enabled";
const IDLE_MS_KEY = "homeasset.sessionLock.idleMs";

export type SessionLockPrefs = {
  /** When true, idle + background-return lock the ledger until unlock. */
  enabled: boolean;
  idleTimeoutMs: IdleTimeoutMs;
};

export const DEFAULT_SESSION_LOCK_PREFS: SessionLockPrefs = {
  enabled: true,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
};

function parseIdleMs(raw: string | null): IdleTimeoutMs {
  const n = Number(raw);
  const match = IDLE_TIMEOUT_OPTIONS.find((o) => o.ms === n);
  return match ? match.ms : DEFAULT_IDLE_TIMEOUT_MS;
}

export async function loadSessionLockPrefs(): Promise<SessionLockPrefs> {
  try {
    const [enabledRaw, idleRaw] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(IDLE_MS_KEY),
    ]);
    return {
      // Default on for privacy-first ledger; first install opts in.
      enabled: enabledRaw === null ? true : enabledRaw === "1",
      idleTimeoutMs: parseIdleMs(idleRaw),
    };
  } catch (err) {
    console.warn("[sessionLock] failed to load prefs", err);
    return { ...DEFAULT_SESSION_LOCK_PREFS };
  }
}

export async function saveSessionLockPrefs(
  patch: Partial<SessionLockPrefs>,
): Promise<SessionLockPrefs> {
  const current = await loadSessionLockPrefs();
  const next: SessionLockPrefs = {
    enabled: patch.enabled ?? current.enabled,
    idleTimeoutMs: patch.idleTimeoutMs ?? current.idleTimeoutMs,
  };
  try {
    await Promise.all([
      AsyncStorage.setItem(ENABLED_KEY, next.enabled ? "1" : "0"),
      AsyncStorage.setItem(IDLE_MS_KEY, String(next.idleTimeoutMs)),
    ]);
  } catch (err) {
    console.warn("[sessionLock] failed to save prefs", err);
  }
  return next;
}
