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
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  categoryLabel,
  listAssets,
  type PublicAsset,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * View Assets for the current home. Header + adds; each row opens the
 * asset record (documents, recalls, reminders) — Edit is on that screen.
 */
export default function AssetsListScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty) {
      setAssets([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await listAssets(accessToken, activeProperty.id);
      setAssets(res.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assets.");
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="View Assets"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add asset"
            onPress={() => router.push("/assets/new")}
            style={styles.addBtn}
          >
            <Text style={styles.addLabel}>+</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.brand} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && assets.length === 0 ? (
          <Text style={styles.empty}>No assets yet.</Text>
        ) : null}

        <View style={styles.list}>
          {assets.map((asset) => (
            <Pressable
              key={asset.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/assets/[id]",
                  params: { id: asset.id },
                })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{asset.name}</Text>
                <Text style={styles.rowMeta}>
                  {categoryLabel(asset.category)}
                  {asset.manufacturer ? ` · ${asset.manufacturer}` : ""}
                  {asset.warrantyEndDate
                    ? ` · Warranty ends ${asset.warrantyEndDate}`
                    : asset.warrantyTerm
                      ? ` · ${asset.warrantyTerm}`
                      : ""}
                  {asset.location ? ` · ${asset.location}` : ""}
                </Text>
              </View>
              <Text style={styles.rowAction}>Open</Text>
            </Pressable>
          ))}
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
  addBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  addLabel: {
    color: colors.brand,
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 32,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
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
  empty: {
    marginTop: 24,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  list: {
    marginTop: 20,
    gap: 10,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  rowMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  rowAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
});
