import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  filterHomeContractors,
  listHomeContractors,
  type PublicHomeContractor,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

/**
 * Searchable past-contractor directory for this home.
 * Contact, work done, and other services — homeowner-owned only.
 */
export default function ContractorDirectoryScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [items, setItems] = useState<PublicHomeContractor[]>([]);
  const [query, setQuery] = useState("");
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
      const res = await listHomeContractors(accessToken, activeProperty.id);
      setItems(res.contractors);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load contractors.",
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

  const filtered = useMemo(
    () => filterHomeContractors(items, query),
    [items, query],
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
        <Text style={styles.brand}>Past contractors</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/contractors/new")}
          style={styles.add}
        >
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!SUPABASE_CONFIGURED ? (
          <Text style={styles.error}>
            Contractor directory needs the cloud connection on this phone.
          </Text>
        ) : null}

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone, work, services…"
          placeholderTextColor={colors.placeholder}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>
            {items.length === 0
              ? "No past contractors yet. Approve a submission or tap Add."
              : "No matches for that search."}
          </Text>
        ) : (
          filtered.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push(`/contractors/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text style={styles.cardTitle}>{item.displayName}</Text>
              {item.companyName ? (
                <Text style={styles.cardMeta}>{item.companyName}</Text>
              ) : null}
              {item.phone || item.email ? (
                <Text style={styles.cardMeta}>
                  {[item.phone, item.email].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              {item.servicesOffered.length > 0 ? (
                <Text style={styles.services}>
                  {item.servicesOffered.join(" · ")}
                </Text>
              ) : null}
              <Text style={styles.hint}>
                {item.work.length > 0
                  ? `${item.work.length} job(s) on record · `
                  : ""}
                Open ›
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
  add: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 56, alignItems: "flex-end" },
  addLabel: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 16,
    marginBottom: 14,
  },
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
  cardTitle: { color: colors.ink, fontWeight: "600", fontSize: 16 },
  cardMeta: { color: colors.muted, marginTop: 4, fontSize: 13 },
  services: { color: colors.brandMuted, marginTop: 6, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.accent, marginTop: 8, fontWeight: "600" },
});
