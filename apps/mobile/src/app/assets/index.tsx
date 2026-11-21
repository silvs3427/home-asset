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
  categoryLabel,
  listAssets,
  type PublicAsset,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Asset list for the currently selected home only.
 * Switching homes changes this list — never mixes other properties.
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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.brand}>Assets</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>
        <Text style={styles.title}>Assets</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/assets/new")}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryLabel}>Add asset</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#1B3A2F" />
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
              onPress={() => router.push(`/assets/${asset.id}`)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.pressed,
              ]}
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
              <Text style={styles.rowAction}>View</Text>
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
    paddingTop: 12,
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
  },
  primaryBtn: {
    marginTop: 20,
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
    marginTop: 24,
    fontSize: 15,
    lineHeight: 22,
    color: "#5A6E64",
  },
  list: {
    marginTop: 20,
    gap: 10,
  },
  row: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
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
    color: "#14241D",
  },
  rowMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  rowAction: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2F5B4A",
  },
  footnote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
});
