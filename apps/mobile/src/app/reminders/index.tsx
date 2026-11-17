import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  completeReminder,
  listReminderHistory,
  listReminders,
  recurrenceLabel,
  type PublicReminder,
  type PublicReminderCompletion,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Upcoming maintenance for the current home only.
 * Mark done here; push notifications arrive in EPIC 5.
 */
export default function RemindersUpcomingScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [reminders, setReminders] = useState<PublicReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<PublicReminderCompletion[]>([]);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty) {
      setReminders([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await listReminders(accessToken, activeProperty.id);
      setReminders(res.reminders);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load reminders.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeProperty]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty) {
    return <Redirect href="/home" />;
  }

  async function onComplete(reminder: PublicReminder) {
    if (!accessToken || !activeProperty) return;
    setBusyId(reminder.id);
    setError(null);
    try {
      await completeReminder(accessToken, activeProperty.id, reminder.id);
      setHistoryFor(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark reminder done.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleHistory(reminderId: string) {
    if (!accessToken || !activeProperty) return;
    if (historyFor === reminderId) {
      setHistoryFor(null);
      setHistory([]);
      return;
    }
    setBusyId(reminderId);
    setError(null);
    try {
      const res = await listReminderHistory(
        accessToken,
        activeProperty.id,
        reminderId,
      );
      setHistory(res.history);
      setHistoryFor(reminderId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load history.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function confirmComplete(reminder: PublicReminder) {
    const nextHint =
      reminder.recurrence === "none"
        ? "This one-time reminder will be marked complete."
        : `We'll schedule the next ${recurrenceLabel(reminder.recurrence).toLowerCase()} due date.`;
    Alert.alert("Mark done?", nextHint, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark done",
        onPress: () => {
          void onComplete(reminder);
        },
      },
    ]);
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
        <Text style={styles.brand}>Reminders</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>
        <Text style={styles.title}>Upcoming</Text>
        <Text style={styles.copy}>
          Maintenance for this home, soonest first. Push alerts come later —
          act on due items here for now.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/reminders/new")}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryLabel}>Add reminder</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#1B3A2F" />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && reminders.length === 0 ? (
          <Text style={styles.empty}>
            Nothing upcoming. Add a one-time or repeating reminder on an asset.
          </Text>
        ) : null}

        <View style={styles.list}>
          {reminders.map((reminder) => {
            const busy = busyId === reminder.id;
            return (
              <View key={reminder.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.due}>{reminder.dueDate}</Text>
                  <Text style={styles.rowName}>{reminder.title}</Text>
                  <Text style={styles.rowMeta}>
                    {reminder.assetName ?? "Asset"} ·{" "}
                    {recurrenceLabel(reminder.recurrence)}
                    {reminder.lastCompletedAt
                      ? ` · last done ${reminder.lastCompletedAt.slice(0, 10)}`
                      : ""}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      void onToggleHistory(reminder.id);
                    }}
                  >
                    <Text style={styles.historyAction}>
                      {historyFor === reminder.id ? "Hide" : "History"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => confirmComplete(reminder)}
                    style={({ pressed }) => [
                      styles.doneBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#F3F6F4" />
                    ) : (
                      <Text style={styles.doneLabel}>Done</Text>
                    )}
                  </Pressable>
                </View>
                {historyFor === reminder.id ? (
                  <View style={styles.historyBox}>
                    {history.length === 0 ? (
                      <Text style={styles.historyEmpty}>No completions yet.</Text>
                    ) : (
                      history.map((item) => (
                        <Text key={item.id} style={styles.historyLine}>
                          {item.completedAt.slice(0, 10)} · due was{" "}
                          {item.dueDateAtCompletion}
                          {item.note ? ` · ${item.note}` : ""}
                        </Text>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Text style={styles.footnote}>
          Reminders stay on this home only. No silent sharing. Phone push is not
          enabled yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F3F6F4",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    paddingVertical: 8,
    minWidth: 56,
  },
  backSpacer: {
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
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#5A6E64",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: "#14241D",
    letterSpacing: -0.4,
  },
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#3D5349",
    maxWidth: 420,
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#F3F6F4",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  loader: {
    marginTop: 28,
  },
  error: {
    marginTop: 16,
    color: "#8B2E2E",
    fontSize: 14,
  },
  empty: {
    marginTop: 28,
    fontSize: 15,
    lineHeight: 22,
    color: "#5A6E64",
  },
  list: {
    marginTop: 24,
    gap: 12,
  },
  row: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  rowText: {
    gap: 4,
  },
  due: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  rowName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#14241D",
  },
  rowMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyAction: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2F5B4A",
  },
  doneBtn: {
    backgroundColor: "#1B3A2F",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 88,
    alignItems: "center",
  },
  doneLabel: {
    color: "#F3F6F4",
    fontSize: 14,
    fontWeight: "600",
  },
  historyBox: {
    borderTopWidth: 1,
    borderTopColor: "#E2EAE5",
    paddingTop: 10,
    gap: 6,
  },
  historyEmpty: {
    fontSize: 13,
    color: "#5A6E64",
  },
  historyLine: {
    fontSize: 13,
    lineHeight: 18,
    color: "#3D5349",
  },
  footnote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
});
