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
  listNotifications,
  listReminderHistory,
  listReminders,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKindLabel,
  recurrenceLabel,
  runDueNotificationCheck,
  runRecallNotificationCheck,
  type PublicNotification,
  type PublicReminder,
  type PublicReminderCompletion,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * One homeowner Notifications surface: upcoming reminders + recent notices.
 * Delivery (push / in-app) is configured under Settings → Push & in-app.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [reminders, setReminders] = useState<PublicReminder[]>([]);
  const [notices, setNotices] = useState<PublicNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<PublicReminderCompletion[]>([]);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty) {
      setReminders([]);
      setNotices([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [remRes, noteRes] = await Promise.all([
        listReminders(accessToken, activeProperty.id),
        listNotifications(accessToken),
      ]);
      setReminders(remRes.reminders);
      setNotices(noteRes.notifications);
      setUnreadCount(noteRes.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load alerts.");
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

  async function onRefreshNotices() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await runDueNotificationCheck(accessToken);
      await runRecallNotificationCheck(accessToken);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not refresh notices.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onMarkRead(item: PublicNotification) {
    if (!accessToken || item.readAt) return;
    setBusy(true);
    setError(null);
    try {
      await markNotificationRead(accessToken, item.id);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark as read.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onMarkAll() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await markAllNotificationsRead(accessToken);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not mark all as read.",
      );
    } finally {
      setBusy(false);
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
        <Text style={styles.brand}>Notifications</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>

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
          <ActivityIndicator style={styles.loader} color={colors.brand} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionLabel}>Upcoming</Text>
        {!loading && reminders.length === 0 ? (
          <Text style={styles.empty}>No upcoming reminders.</Text>
        ) : null}

        <View style={styles.list}>
          {reminders.map((reminder) => {
            const rowBusy = busyId === reminder.id;
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
                    disabled={rowBusy}
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
                    disabled={rowBusy}
                    onPress={() => confirmComplete(reminder)}
                    style={({ pressed }) => [
                      styles.doneBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    {rowBusy ? (
                      <ActivityIndicator color={colors.onBrand} />
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

        <View style={styles.noticesHeader}>
          <Text style={styles.sectionLabel}>Recent notices</Text>
          <View style={styles.noticeActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onRefreshNotices();
              }}
            >
              <Text style={styles.linkAction}>Refresh</Text>
            </Pressable>
            {unreadCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void onMarkAll();
                }}
              >
                <Text style={styles.linkAction}>Mark all read</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {!loading && notices.length === 0 ? (
          <Text style={styles.empty}>No notices yet.</Text>
        ) : null}

        <View style={styles.list}>
          {notices.map((item) => {
            const unread = !item.readAt;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void onMarkRead(item);
                  if (
                    item.kind === "contractor_submit" &&
                    item.relatedEntityId
                  ) {
                    router.push(
                      `/contractor-submissions/${item.relatedEntityId}`,
                    );
                  }
                }}
                style={[styles.row, unread && styles.rowUnread]}
              >
                <Text style={styles.due}>{notificationKindLabel(item.kind)}</Text>
                <Text style={styles.rowName}>{item.title}</Text>
                {item.body ? (
                  <Text style={styles.rowMeta}>{item.body}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
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
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.brand,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 88,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.onBrand,
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
    color: colors.danger,
    fontSize: 14,
  },
  sectionLabel: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  noticesHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  noticeActions: {
    flexDirection: "row",
    gap: 14,
    paddingBottom: 8,
  },
  linkAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  list: {
    gap: 12,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  rowUnread: {
    borderColor: colors.accent,
  },
  rowText: {
    gap: 4,
  },
  due: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
  },
  rowName: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.ink,
  },
  rowMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
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
    color: colors.brandMuted,
  },
  doneBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 88,
    alignItems: "center",
  },
  doneLabel: {
    color: colors.onBrand,
    fontSize: 14,
    fontWeight: "600",
  },
  historyBox: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 10,
    gap: 6,
  },
  historyEmpty: {
    fontSize: 13,
    color: colors.muted,
  },
  historyLine: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.copy,
  },
});
