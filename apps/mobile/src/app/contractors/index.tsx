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
import { listContractorSubmissions } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

/**
 * Contractors hub (homeowner-only): invite, review submits, past directory.
 * Pros use LightLift or invite link — no contractor login here.
 */
export default function ContractorsHubScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty || !SUPABASE_CONFIGURED) {
      setPendingCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listContractorSubmissions(
        accessToken,
        activeProperty.id,
        { status: "pending" },
      );
      setPendingCount(res.submissions.length);
    } catch {
      setPendingCount(0);
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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.brand}>Contractors</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/contractors/invite")}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryLabel}>Invite a contractor</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/contractor-submissions")}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>Review contractor submissions</Text>
          {loading ? (
            <ActivityIndicator
              color={colors.accent}
              style={styles.pendingSpinner}
            />
          ) : pendingCount > 0 ? (
            <Text style={styles.pendingBadge}>{pendingCount} pending</Text>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/contractors/directory")}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>View past contractors</Text>
        </Pressable>
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
  brand: { color: colors.brand, fontSize: 18, fontWeight: "700" },
  spacer: { minWidth: 56 },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryLabel: { color: colors.onBrand, fontSize: 16, fontWeight: "600" },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  secondaryLabel: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  pendingBadge: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: "700",
  },
  pendingSpinner: { marginTop: 2 },
  pressed: { opacity: 0.9 },
});
