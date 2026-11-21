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
  listContractorSubmissions,
  type PublicContractorSubmission,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

/**
 * Homeowner inbox for invite-link submissions (pending first).
 * Approve gate lives on the detail screen.
 */
export default function ContractorSubmissionsScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [items, setItems] = useState<PublicContractorSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty || !SUPABASE_CONFIGURED) {
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await listContractorSubmissions(
        accessToken,
        activeProperty.id,
        { status: "all" },
      );
      setItems(res.submissions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load submissions.",
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

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Contractor submits" />

      <ScrollView contentContainerStyle={styles.body}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>
            No contractor submissions yet. Share an invite link from Settings.
          </Text>
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() =>
                router.push(`/contractor-submissions/${item.id}`)
              }
              style={({ pressed }) => [
                styles.card,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.draft.summary}
                </Text>
                <Text
                  style={[
                    styles.badge,
                    item.status === "pending" && styles.badgePending,
                    item.status === "approved" && styles.badgeApproved,
                    item.status === "declined" && styles.badgeDeclined,
                  ]}
                >
                  {item.status}
                </Text>
              </View>
              <Text style={styles.meta}>
                {item.contractorName || item.companyName || "Contractor"}
                {" · "}
                {new Date(item.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.hint}>
                {item.media.length > 0
                  ? `${item.media.length} attachment(s) · `
                  : ""}
                Review ›
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 56 },
  backLabel: { color: colors.brandMuted, fontSize: 14, fontWeight: "600" },
  brand: { color: colors.brand, fontSize: 17, fontWeight: "700" },
  spacer: { minWidth: 56 },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  error: { color: colors.danger, marginBottom: 12 },
  empty: { color: colors.muted, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  pressed: { opacity: 0.88 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  cardTitle: {
    flex: 1,
    color: colors.ink,
    fontWeight: "600",
    fontSize: 15,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
    color: colors.onBrand,
    backgroundColor: colors.brandMuted,
  },
  badgePending: { backgroundColor: colors.accent, color: colors.onAccent },
  badgeApproved: { backgroundColor: colors.brand },
  badgeDeclined: { backgroundColor: colors.danger },
  meta: { color: colors.muted, marginTop: 8, fontSize: 13 },
  hint: { color: colors.brandMuted, marginTop: 6, fontWeight: "600" },
});
