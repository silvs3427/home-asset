import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareTextInput } from "@/components/KeyboardAwareScroll";
import {
  categoryLabel,
  documentTypeLabel,
  listPropertyLabels,
  normalizeLabelValue,
  rememberPropertyLabel,
  renamePropertyLabel,
  type PropertyLabelKind,
} from "@/lib/api";
import { colors } from "@/lib/theme";

type Props = {
  accessToken: string;
  propertyId: string;
  kind: PropertyLabelKind;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Soft starter text when the list is empty (not a forced chip list). */
  emptyHint?: string;
  /** Called after a home-wide rename so parent screens can refresh lists. */
  onRenamed?: (next: {
    oldValue: string;
    newValue: string;
    updatedAssets: number;
    updatedDocuments: number;
  }) => void;
};

function displayLabel(kind: PropertyLabelKind, value: string): string {
  return kind === "asset_category"
    ? categoryLabel(value)
    : documentTypeLabel(value);
}

/**
 * Open category / document-type field: type a custom value; once used for this
 * home it stays available as a chip. Long-press a chip to rename it across
 * this home (cascades to assets / documents). No fixed pre-list.
 */
export function OpenLabelField(props: Props) {
  const {
    accessToken,
    propertyId,
    kind,
    label,
    value,
    onChange,
    placeholder,
    emptyHint,
    onRenamed,
  } = props;
  const [options, setOptions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renamingFrom, setRenamingFrom] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPropertyLabels(accessToken, propertyId, kind);
      setOptions(res.labels.map((row) => row.value));
    } catch (err) {
      console.warn("[OpenLabelField] list failed", {
        kind,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, propertyId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of options) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    if (value.trim()) {
      const key = value.trim().toLowerCase();
      if (!seen.has(key)) out.unshift(value.trim());
    }
    return out;
  }, [options, value]);

  async function applyCustom() {
    const next = normalizeLabelValue(draft);
    if (!next) return;
    setSaving(true);
    try {
      const res = await rememberPropertyLabel(
        accessToken,
        propertyId,
        kind,
        next,
      );
      onChange(res.label.value);
      setDraft("");
      setOptions((prev) => {
        const key = res.label.value.toLowerCase();
        const without = prev.filter((v) => v.toLowerCase() !== key);
        return [...without, res.label.value].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      });
    } catch (err) {
      // Still apply locally so Save can proceed; server remembers on asset/doc write.
      console.warn("[OpenLabelField] remember failed", {
        kind,
        message: err instanceof Error ? err.message : String(err),
      });
      onChange(next);
      setDraft("");
      setOptions((prev) => {
        const key = next.toLowerCase();
        if (prev.some((v) => v.toLowerCase() === key)) return prev;
        return [...prev, next];
      });
    } finally {
      setSaving(false);
    }
  }

  function beginRename(item: string) {
    setRenamingFrom(item);
    setRenameDraft(item);
  }

  async function applyRename() {
    if (!renamingFrom) return;
    const next = normalizeLabelValue(renameDraft);
    if (!next) {
      Alert.alert("Name required", "Enter a new category name.");
      return;
    }
    if (next.toLowerCase() === renamingFrom.trim().toLowerCase() && next === renamingFrom) {
      setRenamingFrom(null);
      setRenameDraft("");
      return;
    }
    setRenaming(true);
    try {
      const res = await renamePropertyLabel(
        accessToken,
        propertyId,
        kind,
        renamingFrom,
        next,
      );
      const oldKey = renamingFrom.trim().toLowerCase();
      setOptions((prev) => {
        const withoutOld = prev.filter((v) => v.toLowerCase() !== oldKey);
        const withoutNew = withoutOld.filter(
          (v) => v.toLowerCase() !== res.label.value.toLowerCase(),
        );
        return [...withoutNew, res.label.value].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      });
      if (value.trim().toLowerCase() === oldKey) {
        onChange(res.label.value);
      }
      onRenamed?.({
        oldValue: renamingFrom,
        newValue: res.label.value,
        updatedAssets: res.updatedAssets,
        updatedDocuments: res.updatedDocuments,
      });
      setRenamingFrom(null);
      setRenameDraft("");
      const count =
        kind === "asset_category" ? res.updatedAssets : res.updatedDocuments;
      Alert.alert(
        "Category renamed",
        count > 0
          ? `Updated to “${res.label.value}” on ${count} item${count === 1 ? "" : "s"} in this home.`
          : `Saved as “${res.label.value}” for this home.`,
      );
    } catch (err) {
      Alert.alert(
        "Could not rename",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setRenaming(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={styles.spinner} />
      ) : null}
      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((item) => {
            const selected =
              value.trim().toLowerCase() === item.trim().toLowerCase();
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityHint="Long press to rename across this home"
                onPress={() => onChange(item)}
                onLongPress={() => beginRename(item)}
                delayLongPress={350}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    selected && styles.chipLabelSelected,
                  ]}
                >
                  {displayLabel(kind, item)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : !loading ? (
        <Text style={styles.hint}>
          {emptyHint ?? "Nothing saved yet — type your own below."}
        </Text>
      ) : null}
      {chips.length > 0 ? (
        <Text style={styles.renameHint}>
          Long-press a chip to rename it for this whole home.
        </Text>
      ) : null}

      {renamingFrom ? (
        <View style={styles.renameBox}>
          <Text style={styles.renameTitle}>
            Rename “{displayLabel(kind, renamingFrom)}”
          </Text>
          <View style={styles.addRow}>
            <KeyboardAwareTextInput
              style={styles.input}
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="New name"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => {
                void applyRename();
              }}
            />
            <Pressable
              accessibilityRole="button"
              disabled={renaming || !renameDraft.trim()}
              onPress={() => {
                void applyRename();
              }}
              style={({ pressed }) => [
                styles.addBtn,
                pressed && styles.pressed,
                (renaming || !renameDraft.trim()) && styles.disabled,
              ]}
            >
              {renaming ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.addLabel}>Save</Text>
              )}
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRenamingFrom(null);
              setRenameDraft("");
            }}
            style={styles.cancelRename}
          >
            <Text style={styles.cancelRenameLabel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.addRow}>
        <KeyboardAwareTextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder ?? "Type a custom value"}
          placeholderTextColor={colors.placeholder}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => {
            void applyCustom();
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={saving || !draft.trim()}
          onPress={() => {
            void applyCustom();
          }}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.pressed,
            (saving || !draft.trim()) && styles.disabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.addLabel}>Use</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 6,
  },
  spinner: {
    marginVertical: 8,
    alignSelf: "flex-start",
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  renameHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  chipLabelSelected: {
    color: colors.onBrand,
  },
  renameBox: {
    marginBottom: 10,
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
  cancelRename: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 4,
  },
  cancelRenameLabel: {
    color: colors.brandMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  addBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 64,
    alignItems: "center",
  },
  addLabel: {
    color: colors.onBrand,
    fontSize: 15,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
});
