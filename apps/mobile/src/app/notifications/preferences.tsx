import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  KeyboardAwareScroll,
  KeyboardAwareTextInput,
} from "@/components/KeyboardAwareScroll";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import {
  isPushSoftDisabled,
  pushUnavailableReason,
  registerForPushNotifications,
} from "@/lib/push";

/**
 * Simple what/when preferences for reminders (and hooks for later kinds).
 * Push registration is optional — in-app center works without it.
 * Default export required by Expo Router for this route file.
 */
export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [leadDaysText, setLeadDaysText] = useState("3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pushSoftDisabled = isPushSoftDisabled();

  const load = useCallback(async () => {
    if (!accessToken) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetchNotificationPreferences(accessToken);
      setPrefs(res.preferences);
      setLeadDaysText(String(res.preferences.reminderLeadDays));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load preferences.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  async function savePatch(
    patch: Parameters<typeof updateNotificationPreferences>[1],
  ) {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const res = await updateNotificationPreferences(accessToken, patch);
      setPrefs(res.preferences);
      setLeadDaysText(String(res.preferences.reminderLeadDays));
      setNote("Saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSaveLeadDays() {
    const days = Number(leadDaysText.trim());
    if (!Number.isInteger(days) || days < 0 || days > 30) {
      setError("Lead days must be a whole number from 0 to 30.");
      return;
    }
    await savePatch({ reminderLeadDays: days });
  }

  async function onRegisterPush() {
    if (!accessToken) return;
    if (isPushSoftDisabled()) {
      setNote(pushUnavailableReason());
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      // Lazy call path — push.ts itself avoids top-level expo-notifications.
      const result = await registerForPushNotifications(accessToken);
      if (result.ok) {
        setNote(
          "This phone is registered for push. Lock-screen delivery uses the cloud sender when the Expo secret is set.",
        );
        if (prefs && !prefs.pushEnabled) {
          await savePatch({ pushEnabled: true });
        }
      } else {
        setNote(result.reason);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not register for push.",
      );
    } finally {
      setSaving(false);
    }
  }

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
        <Text style={styles.brand}>Push & in-app</Text>
        <View style={styles.spacer} />
      </View>

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        {loading || !prefs ? (
          <ActivityIndicator color={colors.brand} style={styles.spinner} />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>What</Text>
              <PrefRow
                label="Maintenance reminders"
                value={prefs.remindersEnabled}
                disabled={saving}
                onChange={(value) => {
                  void savePatch({ remindersEnabled: value });
                }}
              />
              <PrefRow
                label="Safety recall alerts"
                value={prefs.recallsEnabled}
                disabled={saving}
                onChange={(value) => {
                  void savePatch({ recallsEnabled: value });
                }}
              />
              <PrefRow
                label="Contractor submissions"
                value={prefs.contractorSubmitsEnabled}
                disabled={saving}
                onChange={(value) => {
                  void savePatch({ contractorSubmitsEnabled: value });
                }}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>When</Text>
              <Text style={styles.fieldHint}>
                Days before a reminder is due (0 = due day only, max 30)
              </Text>
              <View style={styles.leadRow}>
                <KeyboardAwareTextInput
                  accessibilityLabel="Reminder lead days"
                  keyboardType="number-pad"
                  value={leadDaysText}
                  onChangeText={setLeadDaysText}
                  style={styles.leadInput}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => {
                    void onSaveLeadDays();
                  }}
                  style={({ pressed }) => [
                    styles.smallBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.smallBtnLabel}>Save</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>How</Text>
              <PrefRow
                label="In-app notification center"
                value={prefs.inAppEnabled}
                disabled={saving}
                onChange={(value) => {
                  void savePatch({ inAppEnabled: value });
                }}
              />
              <PrefRow
                label="Push to this phone"
                value={prefs.pushEnabled}
                disabled={saving}
                onChange={(value) => {
                  void savePatch({ pushEnabled: value });
                }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={saving || pushSoftDisabled}
                onPress={() => {
                  void onRegisterPush();
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  (saving || pushSoftDisabled) && styles.secondaryBtnDisabled,
                  pressed && !pushSoftDisabled && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>
                  {pushSoftDisabled
                    ? "Push unavailable in Expo Go"
                    : "Register this phone for push"}
                </Text>
              </Pressable>
              {pushSoftDisabled ? (
                <Text style={styles.footnote}>{pushUnavailableReason()}</Text>
              ) : null}
            </View>
          </>
        )}

        {note ? <Text style={styles.status}>{note}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function PrefRow(props: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{props.label}</Text>
      <Switch
        accessibilityLabel={props.label}
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
        trackColor={{ false: colors.border, true: colors.brandMuted }}
        thumbColor={colors.surface}
      />
    </View>
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
  copy: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.copy,
  },
  spinner: {
    marginTop: 32,
  },
  section: {
    marginTop: 24,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  prefRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  prefLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    fontWeight: "500",
  },
  fieldHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  leadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leadInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  smallBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  smallBtnLabel: {
    color: colors.onBrand,
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnDisabled: {
    opacity: 0.55,
  },
  secondaryLabel: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  status: {
    marginTop: 16,
    fontSize: 14,
    color: colors.brandMuted,
  },
  error: {
    marginTop: 16,
    color: colors.danger,
    fontSize: 14,
  },
});
