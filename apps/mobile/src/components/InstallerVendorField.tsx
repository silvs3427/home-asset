import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareTextInput } from "@/components/KeyboardAwareScroll";
import {
  filterHomeContractors,
  listHomeContractors,
  type PublicHomeContractor,
} from "@/lib/api";
import { SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

export type InstallerVendorValue = {
  installerVendor: string;
  installerContractorId: string | null;
};

type Props = {
  accessToken: string;
  propertyId: string;
  label?: string;
  value: InstallerVendorValue;
  onChange: (next: InstallerVendorValue) => void;
  placeholder?: string;
  highlight?: boolean;
};

/**
 * Installer / vendor linked to Past contractors for this home.
 * Pick an existing pro or type a new name (saved into the directory on asset save).
 * Cloud-only directory; falls back to free text when Supabase is not configured.
 */
export function InstallerVendorField(props: Props) {
  const {
    accessToken,
    propertyId,
    label = "Installer / vendor",
    value,
    onChange,
    placeholder = "Who installed or sold it",
    highlight,
  } = props;
  const [contractors, setContractors] = useState<PublicHomeContractor[]>([]);
  const [loading, setLoading] = useState(SUPABASE_CONFIGURED);
  const [query, setQuery] = useState(value.installerVendor);

  const load = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) {
      setContractors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listHomeContractors(accessToken, propertyId);
      setContractors(res.contractors);
    } catch (err) {
      console.warn("[InstallerVendorField] list failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setQuery(value.installerVendor);
  }, [value.installerVendor, value.installerContractorId]);

  const filtered = useMemo(
    () => filterHomeContractors(contractors, query).slice(0, 8),
    [contractors, query],
  );

  const selected = useMemo(() => {
    if (!value.installerContractorId) return null;
    return (
      contractors.find((c) => c.id === value.installerContractorId) ?? null
    );
  }, [contractors, value.installerContractorId]);

  function pick(contractor: PublicHomeContractor) {
    onChange({
      installerVendor: contractor.displayName,
      installerContractorId: contractor.id,
    });
    setQuery(contractor.displayName);
  }

  function onTyped(text: string) {
    setQuery(text);
    onChange({
      installerVendor: text,
      installerContractorId: null,
    });
  }

  function clear() {
    setQuery("");
    onChange({ installerVendor: "", installerContractorId: null });
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <KeyboardAwareTextInput
          style={[styles.input, highlight && styles.inputHighlight]}
          value={value.installerVendor}
          onChangeText={(text) =>
            onChange({ installerVendor: text, installerContractorId: null })
          }
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          autoCapitalize="words"
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {selected ? (
        <View style={styles.selectedRow}>
          <View style={styles.selectedText}>
            <Text style={styles.selectedName}>{selected.displayName}</Text>
            {selected.companyName ? (
              <Text style={styles.selectedMeta}>{selected.companyName}</Text>
            ) : null}
            <Text style={styles.selectedHint}>In Past contractors</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={clear}
            style={styles.clearBtn}
          >
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <KeyboardAwareTextInput
            style={[styles.input, highlight && styles.inputHighlight]}
            value={query}
            onChangeText={onTyped}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {query.trim() ? (
            <Text style={styles.hint}>
              Pick a past pro below, or save the asset to add this name to Past
              contractors.
            </Text>
          ) : null}
        </>
      )}

      {loading ? (
        <ActivityIndicator color={colors.brand} style={styles.spinner} />
      ) : !selected && filtered.length > 0 ? (
        <View style={styles.list}>
          {filtered.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => pick(item)}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.chipTitle}>{item.displayName}</Text>
              {item.companyName ? (
                <Text style={styles.chipMeta}>{item.companyName}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: 10,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  inputHighlight: {
    borderColor: colors.accent,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  spinner: {
    marginTop: 10,
  },
  list: {
    marginTop: 8,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  chipMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  selectedText: {
    flex: 1,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  selectedMeta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.muted,
  },
  selectedHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  clearLabel: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 13,
  },
  pressed: {
    opacity: 0.88,
  },
});
