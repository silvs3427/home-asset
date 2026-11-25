import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  categoryLabel,
  listAssets,
  listPropertyLabels,
  normalizeLabelValue,
  renamePropertyLabel,
  type PublicAsset,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * View Assets for the current home. Search + category filter + optional
 * group-by-category (accordion sections). Categories are the homeowner's own
 * tags (not a fixed list).
 */
export default function AssetsListScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [groupByCategory, setGroupByCategory] = useState(false);
  /** Session expand state for category accordion keys (lowercase). */
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty) {
      setAssets([]);
      setKnownCategories([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [res, labels] = await Promise.all([
        listAssets(accessToken, activeProperty.id),
        listPropertyLabels(
          accessToken,
          activeProperty.id,
          "asset_category",
        ).catch(() => ({ labels: [] as { value: string }[] })),
      ]);
      setAssets(res.assets);
      const fromAssets = res.assets.map((a) => a.category.trim()).filter(Boolean);
      const fromLabels = labels.labels.map((l) => l.value.trim()).filter(Boolean);
      const merged = new Map<string, string>();
      for (const raw of [...fromLabels, ...fromAssets]) {
        const key = raw.toLowerCase();
        if (!merged.has(key)) merged.set(key, raw);
      }
      setKnownCategories(
        [...merged.values()].sort((a, b) =>
          categoryLabel(a).localeCompare(categoryLabel(b), undefined, {
            sensitivity: "base",
          }),
        ),
      );
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (categoryFilter) {
        if (asset.category.trim().toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }
      if (!q) return true;
      const hay = [
        asset.name,
        categoryLabel(asset.category),
        asset.category,
        asset.manufacturer,
        asset.model,
        asset.serial,
        asset.location,
        asset.installerVendor,
        asset.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [assets, categoryFilter, query]);

  const grouped = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, PublicAsset[]>();
    for (const asset of filtered) {
      const key = asset.category.trim() || "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(asset);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) =>
      categoryLabel(a).localeCompare(categoryLabel(b), undefined, {
        sensitivity: "base",
      }),
    );
  }, [filtered, groupByCategory]);

  // Seed / prune accordion expand state while grouping is on.
  // Default: first category expanded so the phone isn't an empty wall of headers.
  useEffect(() => {
    if (!groupByCategory || !grouped || grouped.length === 0) return;
    setExpandedCategories((prev) => {
      const keys = grouped.map(([cat]) => cat.toLowerCase());
      const keySet = new Set(keys);
      if (prev.size === 0) {
        return new Set([keys[0]]);
      }
      const pruned = new Set([...prev].filter((k) => keySet.has(k)));
      if (pruned.size === 0) {
        return new Set([keys[0]]);
      }
      if (
        pruned.size === prev.size &&
        [...prev].every((k) => pruned.has(k))
      ) {
        return prev;
      }
      return pruned;
    });
  }, [groupByCategory, grouped]);

  const toggleCategoryExpanded = useCallback((catKey: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  }, []);

  const applyCategoryRename = useCallback(async () => {
    if (!accessToken || !activeProperty || !renamingCategory) return;
    const next = normalizeLabelValue(renameDraft);
    if (!next) {
      Alert.alert("Name required", "Enter a new category name.");
      return;
    }
    setRenaming(true);
    try {
      const res = await renamePropertyLabel(
        accessToken,
        activeProperty.id,
        "asset_category",
        renamingCategory,
        next,
      );
      if (
        categoryFilter &&
        categoryFilter.toLowerCase() === renamingCategory.toLowerCase()
      ) {
        setCategoryFilter(res.label.value);
      }
      setRenamingCategory(null);
      setRenameDraft("");
      await load();
      Alert.alert(
        "Category renamed",
        res.updatedAssets > 0
          ? `Updated to “${res.label.value}” on ${res.updatedAssets} asset${res.updatedAssets === 1 ? "" : "s"}.`
          : `Saved as “${res.label.value}”.`,
      );
    } catch (err) {
      Alert.alert(
        "Could not rename",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setRenaming(false);
    }
  }, [
    accessToken,
    activeProperty,
    renamingCategory,
    renameDraft,
    categoryFilter,
    load,
  ]);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  if (!activeProperty) {
    return <Redirect href="/home" />;
  }

  const hasActiveFilters = Boolean(query.trim() || categoryFilter);

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

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>

        <TextInput
          accessibilityLabel="Search assets"
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, category, model…"
          placeholderTextColor={colors.placeholder}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        {knownCategories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: categoryFilter == null }}
              onPress={() => setCategoryFilter(null)}
              style={[
                styles.chip,
                categoryFilter == null && styles.chipOn,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  categoryFilter == null && styles.chipLabelOn,
                ]}
              >
                All
              </Text>
            </Pressable>
            {knownCategories.map((cat) => {
              const on =
                categoryFilter != null &&
                categoryFilter.toLowerCase() === cat.toLowerCase();
              return (
                <Pressable
                  key={cat.toLowerCase()}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityHint="Long press to rename this category for the whole home"
                  onPress={() =>
                    setCategoryFilter(on ? null : cat)
                  }
                  onLongPress={() => {
                    setRenamingCategory(cat);
                    setRenameDraft(cat);
                  }}
                  delayLongPress={350}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipLabel, on && styles.chipLabelOn]}
                  >
                    {categoryLabel(cat)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {knownCategories.length > 0 ? (
          <Text style={styles.renameHint}>
            Long-press a category to rename it across this home.
          </Text>
        ) : null}

        {renamingCategory ? (
          <View style={styles.renameBox}>
            <Text style={styles.renameTitle}>
              Rename “{categoryLabel(renamingCategory)}”
            </Text>
            <View style={styles.renameRow}>
              <TextInput
                value={renameDraft}
                onChangeText={setRenameDraft}
                placeholder="New category name"
                placeholderTextColor={colors.placeholder}
                style={styles.renameInput}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => {
                  void applyCategoryRename();
                }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={renaming || !renameDraft.trim()}
                onPress={() => {
                  void applyCategoryRename();
                }}
                style={[
                  styles.renameSave,
                  (renaming || !renameDraft.trim()) && styles.renameDisabled,
                ]}
              >
                {renaming ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <Text style={styles.renameSaveLabel}>Save</Text>
                )}
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setRenamingCategory(null);
                setRenameDraft("");
              }}
              style={styles.renameCancel}
            >
              <Text style={styles.renameCancelLabel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: groupByCategory }}
            onPress={() => {
              setGroupByCategory((v) => {
                const next = !v;
                if (next) {
                  // Fresh default (first group) when turning grouping on.
                  setExpandedCategories(new Set());
                }
                return next;
              });
            }}
            style={[
              styles.groupToggle,
              groupByCategory && styles.groupToggleOn,
            ]}
          >
            <Text
              style={[
                styles.groupToggleLabel,
                groupByCategory && styles.groupToggleLabelOn,
              ]}
            >
              {groupByCategory ? "Grouped by category" : "Group by category"}
            </Text>
          </Pressable>
          {hasActiveFilters ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setQuery("");
                setCategoryFilter(null);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearLabel}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.brand} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && assets.length === 0 ? (
          <Text style={styles.empty}>No assets yet.</Text>
        ) : null}

        {!loading && assets.length > 0 && filtered.length === 0 ? (
          <Text style={styles.empty}>No assets match this search.</Text>
        ) : null}

        {!loading && filtered.length > 0 && !groupByCategory ? (
          <View style={styles.list}>
            {filtered.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                onPress={() =>
                  router.push({
                    pathname: "/assets/[id]",
                    params: { id: asset.id },
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {!loading && grouped
          ? grouped.map(([cat, items]) => {
              const catKey = cat.toLowerCase();
              const expanded = expandedCategories.has(catKey);
              return (
                <View key={catKey} style={styles.group}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${categoryLabel(cat)}, ${items.length} assets`}
                    onPress={() => toggleCategoryExpanded(catKey)}
                    style={({ pressed }) => [
                      styles.groupHeader,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.groupChevron} accessibilityElementsHidden>
                      {expanded ? "▾" : "▸"}
                    </Text>
                    <Text style={styles.groupHeading}>
                      {categoryLabel(cat)}
                      <Text style={styles.groupCount}> · {items.length}</Text>
                    </Text>
                  </Pressable>
                  {expanded ? (
                    <View style={styles.groupList}>
                      {items.map((asset) => (
                        <AssetRow
                          key={asset.id}
                          asset={asset}
                          hideCategory
                          onPress={() =>
                            router.push({
                              pathname: "/assets/[id]",
                              params: { id: asset.id },
                            })
                          }
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function AssetRow({
  asset,
  onPress,
  hideCategory = false,
}: {
  asset: PublicAsset;
  onPress: () => void;
  hideCategory?: boolean;
}) {
  const metaParts = [
    hideCategory ? null : categoryLabel(asset.category),
    asset.manufacturer || null,
    asset.lastServicedAt ? `Serviced ${asset.lastServicedAt}` : null,
    asset.confirmedByContractorName ? "Confirmed by contractor" : null,
    asset.warrantyEndDate
      ? `Warranty ends ${asset.warrantyEndDate}`
      : asset.warrantyTerm || null,
    asset.location || null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{asset.name}</Text>
        {metaParts.length > 0 ? (
          <Text style={styles.rowMeta}>{metaParts.join(" · ")}</Text>
        ) : null}
      </View>
      <Text style={styles.rowAction}>Open</Text>
    </Pressable>
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
  search: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  chips: {
    marginTop: 12,
    gap: 8,
    paddingRight: 8,
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  renameHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
  },
  renameBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  renameTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 8,
  },
  renameRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  renameSave: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: "center",
  },
  renameSaveLabel: {
    color: colors.onBrand,
    fontSize: 15,
    fontWeight: "600",
  },
  renameDisabled: {
    opacity: 0.55,
  },
  renameCancel: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 4,
  },
  renameCancelLabel: {
    color: colors.brandMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  chipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },
  chipLabelOn: {
    color: colors.onAccent,
  },
  toolbar: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  groupToggle: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  groupToggleOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  groupToggleLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  groupToggleLabelOn: {
    color: colors.onBrand,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  clearLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
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
    marginTop: 16,
    gap: 10,
  },
  group: {
    marginTop: 16,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  groupChevron: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accent,
    width: 16,
    textAlign: "center",
  },
  groupHeading: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.brand,
  },
  groupCount: {
    fontWeight: "600",
    color: colors.muted,
  },
  groupList: {
    marginTop: 10,
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
