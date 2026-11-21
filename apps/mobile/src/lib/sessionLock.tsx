import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "./auth";
import {
  BACKGROUND_GRACE_MS,
  loadSessionLockPrefs,
  saveSessionLockPrefs,
  type IdleTimeoutMs,
  type SessionLockPrefs,
} from "./sessionLockPrefs";
import { colors } from "./theme";

type LocalAuthModule = typeof import("expo-local-authentication");

/**
 * Lazy-load so a preview APK missing the native biometric module (or a bad
 * OTA/native mismatch) does not crash the whole app at root layout import.
 */
function loadLocalAuth(): LocalAuthModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-local-authentication") as LocalAuthModule;
  } catch (err) {
    console.warn("[sessionLock] expo-local-authentication unavailable", err);
    return null;
  }
}

type BiometricAvailability = {
  hardware: boolean;
  enrolled: boolean;
  label: string;
};

type SessionLockState = {
  prefs: SessionLockPrefs;
  prefsReady: boolean;
  locked: boolean;
  biometric: BiometricAvailability;
  setEnabled: (enabled: boolean) => Promise<void>;
  setIdleTimeoutMs: (ms: IdleTimeoutMs) => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  markActivity: () => void;
};

const SessionLockContext = createContext<SessionLockState | null>(null);

function biometricLabelFromTypes(
  LocalAuthentication: LocalAuthModule,
  types: number[],
): string {
  const hasFace = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );
  const hasFinger = types.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  );
  if (hasFace && hasFinger) return "Face ID or fingerprint";
  if (hasFace) return Platform.OS === "ios" ? "Face ID" : "Face unlock";
  if (hasFinger) return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
  return "Device biometrics";
}

async function readBiometricAvailability(): Promise<BiometricAvailability> {
  if (Platform.OS === "web") {
    return { hardware: false, enrolled: false, label: "Device biometrics" };
  }
  const LocalAuthentication = loadLocalAuth();
  if (!LocalAuthentication) {
    return { hardware: false, enrolled: false, label: "Device biometrics" };
  }
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return {
      hardware,
      enrolled,
      label: biometricLabelFromTypes(LocalAuthentication, types),
    };
  } catch (err) {
    console.warn("[sessionLock] biometric availability check failed", err);
    return { hardware: false, enrolled: false, label: "Device biometrics" };
  }
}

/**
 * Idle + background-return lock for the signed-in ledger.
 * Unlock uses OS biometrics (never stored by us) or password re-entry.
 */
export function SessionLockProvider({ children }: { children: ReactNode }) {
  const { ready, user, signIn, signOut } = useAuth();
  const [prefs, setPrefs] = useState<SessionLockPrefs>({
    enabled: true,
    idleTimeoutMs: 120_000,
  });
  const [prefsReady, setPrefsReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometric, setBiometric] = useState<BiometricAvailability>({
    hardware: false,
    enrolled: false,
    label: "Device biometrics",
  });

  const lastActivityRef = useRef(Date.now());
  const backgroundedAtRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const enabledRef = useRef(true);
  const idleMsRef = useRef(120_000);
  const userIdRef = useRef<string | null>(null);
  const bootHandledRef = useRef(false);
  const autoTriedRef = useRef(false);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    enabledRef.current = prefs.enabled;
    idleMsRef.current = prefs.idleTimeoutMs;
  }, [prefs.enabled, prefs.idleTimeoutMs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loaded, bio] = await Promise.all([
        loadSessionLockPrefs(),
        readBiometricAvailability(),
      ]);
      if (cancelled) return;
      setPrefs(loaded);
      setBiometric(bio);
      setPrefsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lockNow = useCallback(() => {
    if (!enabledRef.current) return;
    if (!userIdRef.current) return;
    if (lockedRef.current) return;
    autoTriedRef.current = false;
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    lastActivityRef.current = Date.now();
    backgroundedAtRef.current = null;
    autoTriedRef.current = false;
    setLocked(false);
  }, []);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Cold restore → lock. Later sign-in / sign-up → stay unlocked (just authenticated).
  useEffect(() => {
    if (!ready || !prefsReady) return;
    const nextId = user?.id ?? null;

    if (!bootHandledRef.current) {
      bootHandledRef.current = true;
      userIdRef.current = nextId;
      if (nextId && prefs.enabled) {
        autoTriedRef.current = false;
        setLocked(true);
      }
      return;
    }

    if (!nextId) {
      userIdRef.current = null;
      setLocked(false);
      return;
    }

    if (userIdRef.current !== nextId) {
      // New session after boot (sign-in / sign-up).
      userIdRef.current = nextId;
      lastActivityRef.current = Date.now();
      setLocked(false);
    }
  }, [ready, prefsReady, user?.id, prefs.enabled]);

  // Turning lock off clears any active lock.
  useEffect(() => {
    if (!prefs.enabled && locked) {
      unlock();
    }
  }, [prefs.enabled, locked, unlock]);

  // Foreground idle timer.
  useEffect(() => {
    if (!prefs.enabled || !user) return;
    const tick = () => {
      if (lockedRef.current) return;
      if (AppState.currentState !== "active") return;
      if (Date.now() - lastActivityRef.current >= idleMsRef.current) {
        lockNow();
      }
    };
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, [prefs.enabled, user, lockNow]);

  // Background / return grace.
  useEffect(() => {
    if (!prefs.enabled || !user) return;

    const onChange = (next: AppStateStatus) => {
      // Use `background` only — `inactive` also fires for Face ID / Control Center
      // and would re-lock immediately after a successful biometric unlock.
      if (next === "background") {
        if (backgroundedAtRef.current == null && !lockedRef.current) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }
      if (next === "active") {
        const bgAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (lockedRef.current) return;
        if (bgAt != null && Date.now() - bgAt >= BACKGROUND_GRACE_MS) {
          lockNow();
          return;
        }
        // Still count idle across a short background hop.
        if (Date.now() - lastActivityRef.current >= idleMsRef.current) {
          lockNow();
        }
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [prefs.enabled, user, lockNow]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    const next = await saveSessionLockPrefs({ enabled });
    setPrefs(next);
    if (!enabled) {
      lastActivityRef.current = Date.now();
      setLocked(false);
    }
  }, []);

  const setIdleTimeoutMs = useCallback(async (ms: IdleTimeoutMs) => {
    const next = await saveSessionLockPrefs({ idleTimeoutMs: ms });
    setPrefs(next);
    lastActivityRef.current = Date.now();
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") return false;
    try {
      const LocalAuthentication = loadLocalAuth();
      if (!LocalAuthentication) return false;

      const bio = await readBiometricAvailability();
      setBiometric(bio);
      if (!bio.hardware || !bio.enrolled) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock HomeAsset",
        cancelLabel: "Cancel",
        // Prefer biometrics; password fallback is offered in our lock screen.
        disableDeviceFallback: true,
      });
      if (result.success) {
        unlock();
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[sessionLock] biometric unlock failed", err);
      return false;
    }
  }, [unlock]);

  // Auto-prompt biometrics once each time the lock screen appears.
  useEffect(() => {
    if (!locked || !prefs.enabled || !user) return;
    if (autoTriedRef.current) return;
    autoTriedRef.current = true;
    void (async () => {
      const bio = await readBiometricAvailability();
      setBiometric(bio);
      if (bio.hardware && bio.enrolled) {
        await unlockWithBiometrics();
      }
    })();
  }, [locked, prefs.enabled, user, unlockWithBiometrics]);

  const value = useMemo(
    () => ({
      prefs,
      prefsReady,
      locked: Boolean(user && prefs.enabled && locked),
      biometric,
      setEnabled,
      setIdleTimeoutMs,
      unlockWithBiometrics,
      markActivity,
    }),
    [
      prefs,
      prefsReady,
      user,
      locked,
      biometric,
      setEnabled,
      setIdleTimeoutMs,
      unlockWithBiometrics,
      markActivity,
    ],
  );

  const showOverlay = Boolean(user && prefs.enabled && locked);

  return (
    <SessionLockContext.Provider value={value}>
      <View
        style={styles.root}
        onTouchStart={markActivity}
        collapsable={false}
      >
        {children}
        {showOverlay ? (
          <LockOverlay
            email={user!.email}
            biometric={biometric}
            onUnlockBiometrics={unlockWithBiometrics}
            onPasswordUnlock={async (password) => {
              await signIn(user!.email, password);
              unlock();
            }}
            onSignOut={async () => {
              await signOut();
              setLocked(false);
            }}
          />
        ) : null}
      </View>
    </SessionLockContext.Provider>
  );
}

export function useSessionLock(): SessionLockState {
  const ctx = useContext(SessionLockContext);
  if (!ctx) {
    throw new Error("useSessionLock must be used within SessionLockProvider");
  }
  return ctx;
}

function LockOverlay(props: {
  email: string;
  biometric: BiometricAvailability;
  onUnlockBiometrics: () => Promise<boolean>;
  onPasswordUnlock: (password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canBiometric =
    props.biometric.hardware && props.biometric.enrolled;

  async function tryBio() {
    setError(null);
    setBusy(true);
    try {
      const ok = await props.onUnlockBiometrics();
      if (!ok) {
        setError("Biometrics didn’t unlock. Try again or use your password.");
        setShowPassword(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function tryPassword() {
    setError(null);
    setBusy(true);
    try {
      await props.onPasswordUnlock(password);
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not unlock with password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <SafeAreaView style={styles.overlaySafe}>
        <Text style={styles.brand}>HomeAsset</Text>
        <Text style={styles.title}>App locked</Text>
        <Text style={styles.copy}>
          Unlock to see your home record again. We never store your face or
          fingerprint — only the phone’s built-in unlock is used.
        </Text>

        {canBiometric ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              void tryBio();
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
            ]}
          >
            {busy && !showPassword ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryLabel}>
                Unlock with {props.biometric.label}
              </Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.hint}>
            Biometrics aren’t available on this device. Use your account
            password.
          </Text>
        )}

        {!showPassword ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setShowPassword(true)}
            style={styles.linkBtn}
          >
            <Text style={styles.linkLabel}>Use password instead</Text>
          </Pressable>
        ) : (
          <View style={styles.passwordBlock}>
            <Text style={styles.emailLabel}>{props.email}</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              editable={!busy}
              onSubmitEditing={() => {
                void tryPassword();
              }}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy || password.length === 0}
              onPress={() => {
                void tryPassword();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                (busy || password.length === 0) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.primaryLabel}>Unlock with password</Text>
              )}
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void props.onSignOut();
          }}
          style={styles.linkBtn}
        >
          <Text style={styles.linkLabel}>Sign out</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    zIndex: 1000,
    elevation: 1000,
  },
  overlaySafe: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    justifyContent: "center",
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.brand,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 8,
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.copy,
    marginBottom: 28,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryLabel: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
  linkBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  linkLabel: {
    color: colors.brandMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  passwordBlock: {
    marginTop: 8,
    gap: 10,
  },
  emailLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontSize: 14,
  },
});
