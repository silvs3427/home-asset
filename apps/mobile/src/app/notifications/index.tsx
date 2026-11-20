import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKindLabel,
  runDueNotificationCheck,
  runRecallNotificationCheck,
  type PublicNotification,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * In-app notification center for due reminders and safety recall alerts.
 * Account-scoped; property id is shown when the notice is about a home.
 */
export default function NotificationsCenterScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await listNotifications(accessToken);
      setItems(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load notifications.",
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

  async function onRunDueCheck() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const res = await runDueNotificationCheck(accessToken);
      setStatusNote(
        `Checked ${res.result.scanned} reminder(s); created ${res.result.created} notice(s).`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not run due check.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRunRecallCheck() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setStatusNote(null);
    try {
      const res = await runRecallNotificationCheck(accessToken);
      setStatusNote(
        `Checked recalls on ${res.result.assetsScanned} asset(s); ${res.result.alertsCreated} new alert(s), ${res.result.notificationsCreated} notice(s).`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not check recalls.",
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
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/notifications/preferences")}
          style={styles.prefs}
        >
          <Text style={styles.prefsLabel}>Prefs</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.copy}>
          Due reminders and safety recall alerts show up here. Contractor-submit
          notices will use the same inbox later. No marketing.
        </Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              void onRunDueCheck();
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryLabel}>Check due reminders</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              void onRunRecallCheck();
            }}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.secondaryLabel}>Check safety recalls</Text>
          </Pressable>
          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onMarkAll();
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>
                Mark all read ({unreadCount})
              </Text>
            </Pressable>
          ) : null}
        </View>

        {statusNote ? <Text style={styles.status}>{statusNote}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color="#1B3A2F" style={styles.spinner} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>
            No notices yet. Add a reminder due soon, or add an asset with
            manufacturer/model and tap{" "}
            <Text style={styles.emptyEm}>Check safety recalls</Text>.
          </Text>
        ) : (
          <View style={styles.list}>
            {items.map((item) => {
              const unread = !item.readAt;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onMarkRead(item);
                    if (
                      item.kind === "reminder_due" &&
                      item.relatedReminderId
                    ) {
                      router.push("/reminders");
                    } else if (
                      item.kind === "recall_alert" &&
                      item.relatedAssetId
                    ) {
                      if (
                        item.propertyId &&
                        activeProperty &&
                        item.propertyId !== activeProperty.id
                      ) {
                        // Stay in inbox if home switch would be needed; asset
                        // detail requires the active home to match.
                      }
                      router.push({
                        pathname: "/assets/[id]",
                        params: { id: item.relatedAssetId },
                      });
                    }
                  }}
                  style={[styles.row, unread && styles.rowUnread]}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.kind}>
                      {notificationKindLabel(item.kind)}
                    </Text>
                    {unread ? (
                      <Text style={styles.unreadBadge}>New</Text>
                    ) : (
                      <Text style={styles.readBadge}>Read</Text>
                    )}
                  </View>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowBody}>{item.body}</Text>
                  <Text style={styles.rowMeta}>
                    {new Date(item.createdAt).toLocaleString()}
                    {item.pushStatus === "stubbed"
                      ? " · push stubbed"
                      : item.pushStatus === "sent"
                        ? " · pushed"
                        : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
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
  prefs: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 56,
    alignItems: "flex-end",
  },
  prefsLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
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
  actions: {
    marginTop: 18,
    gap: 10,
  },
  primaryBtn: {
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
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#1B3A2F",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.6,
  },
  status: {
    marginTop: 12,
    fontSize: 14,
    color: "#2F5B4A",
  },
  error: {
    marginTop: 12,
    color: "#8B2E2E",
    fontSize: 14,
  },
  spinner: {
    marginTop: 32,
  },
  empty: {
    marginTop: 28,
    fontSize: 15,
    lineHeight: 22,
    color: "#5A6E64",
  },
  emptyEm: {
    fontWeight: "700",
    color: "#1B3A2F",
  },
  list: {
    marginTop: 20,
    gap: 10,
  },
  row: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D2CB",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  rowUnread: {
    borderColor: "#1B3A2F",
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kind: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5A6E64",
  },
  unreadBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  readBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8A9A92",
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#14241D",
  },
  rowBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#3D5349",
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#5A6E64",
  },
});
