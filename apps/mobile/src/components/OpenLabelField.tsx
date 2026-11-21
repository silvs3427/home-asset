import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  categoryLabel,
  documentTypeLabel,
  listPropertyLabels,
  normalizeLabelValue,
  rememberPropertyLabel,
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
};

function displayLabel(kind: PropertyLabelKind, value: string): string {
  return kind === "asset_category"
    ? categoryLabel(value)
    : documentTypeLabel(value);
}

/**
 * Open category / document-type field: type a custom value; once used for this
 * home it stays available as a chip. No fixed pre-list.
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
  } = props;
  const [options, setOptions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
                onPress={() => onChange(item)}
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
      <View style={styles.addRow}>
        <TextInput
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
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
