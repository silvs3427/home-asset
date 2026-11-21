import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { useSessionLock } from "@/lib/sessionLock";
import {
  IDLE_TIMEOUT_OPTIONS,
  type IdleTimeoutMs,
} from "@/lib/sessionLockPrefs";
import { SECURITY_SECTIONS } from "@/lib/settingsContent";
import { colors } from "@/lib/theme";

/**
 * Security controls + plain-language explanations.
 * Lock prefs: Settings here; prose in `@/lib/settingsContent` SECURITY_SECTIONS.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    prefs,
    prefsReady,
    biometric,
    setEnabled,
    setIdleTimeoutMs,
  } = useSessionLock();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  async function onToggle(enabled: boolean) {
    setError(null);
    setSaving(true);
    try {
      await setEnabled(enabled);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update lock setting.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onPickIdle(ms: IdleTimeoutMs) {
    setError(null);
    setSaving(true);
    try {
      await setIdleTimeoutMs(ms);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update idle time.",
      );
    } finally {
      setSaving(false);
    }
  }

  const bioReady = biometric.hardware && biometric.enrolled;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.brand}>Security</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.controlsLabel}>App lock</Text>
        {!prefsReady ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Lock when idle or away</Text>
                <Text style={styles.rowHint}>
                  After you step away, require unlock before the ledger shows
                  again. Uses your phone’s Face ID / fingerprint when available
                  — we never store biometrics ourselves.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Lock when idle or away"
                value={prefs.enabled}
                disabled={saving}
                onValueChange={(v) => {
                  void onToggle(v);
                }}
                trackColor={{ false: colors.border, true: colors.brandMuted }}
                thumbColor={colors.surface}
              />
            </View>

            {prefs.enabled ? (
              <View style={styles.idleBlock}>
                <Text style={styles.idleTitle}>Lock after idle for</Text>
                <View style={styles.chips}>
                  {IDLE_TIMEOUT_OPTIONS.map((opt) => {
                    const selected = prefs.idleTimeoutMs === opt.ms;
                    return (
                      <Pressable
                        key={opt.ms}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={saving}
                        onPress={() => {
                          void onPickIdle(opt.ms);
                        }}
                        style={({ pressed }) => [
                          styles.chip,
                          selected && styles.chipSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipLabel,
                            selected && styles.chipLabelSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.rowHint}>
                  Returning from another app after a short pause also locks.
                  {bioReady
                    ? ` Unlock with ${biometric.label}, or your password.`
                    : " Unlock with your account password (biometrics not set up on this phone)."}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {SECURITY_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/privacy")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkLabel}>Related: Privacy</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 56,
  },
  backLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.brand,
  },
  spacer: {
    minWidth: 56,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  controlsLabel: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  rowHint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  idleBlock: {
    marginTop: 14,
    gap: 10,
  },
  idleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  chipLabelSelected: {
    color: colors.onBrand,
  },
  pressed: {
    opacity: 0.9,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontSize: 14,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.copy,
  },
  linkBtn: {
    marginTop: 24,
    paddingVertical: 8,
  },
  linkLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
});
