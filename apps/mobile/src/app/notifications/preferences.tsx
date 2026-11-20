import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
        setNote("This phone is registered for push (delivery needs API config).");
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
        <Text style={styles.brand}>Alert preferences</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.copy}>
          Choose what HomeAsset can notify you about. Push is the phone channel;
          the in-app center always stays under your control. No marketing, no SMS.
        </Text>

        {loading || !prefs ? (
          <ActivityIndicator color="#1B3A2F" style={styles.spinner} />
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
                label="Contractor submissions (later)"
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
                <TextInput
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
              <Text style={styles.footnote}>
                {pushSoftDisabled
                  ? pushUnavailableReason()
                  : "Live push needs an Expo access token on the API. Without it, notices still land in the in-app center and pushes are stubbed."}
              </Text>
            </View>
          </>
        )}

        {note ? <Text style={styles.status}>{note}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
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
        trackColor={{ false: "#C5D2CB", true: "#2F5B4A" }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F3F6F4",
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
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3A2F",
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
    color: "#3D5349",
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
    color: "#5A6E64",
  },
  prefRow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D2CB",
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
    color: "#14241D",
    fontWeight: "500",
  },
  fieldHint: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5A6E64",
  },
  leadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leadInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D2CB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#14241D",
  },
  smallBtn: {
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  smallBtnLabel: {
    color: "#F3F6F4",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnDisabled: {
    opacity: 0.55,
  },
  secondaryLabel: {
    color: "#1B3A2F",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  status: {
    marginTop: 16,
    fontSize: 14,
    color: "#2F5B4A",
  },
  error: {
    marginTop: 16,
    color: "#8B2E2E",
    fontSize: 14,
  },
});
