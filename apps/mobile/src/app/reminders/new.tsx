import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  REMINDER_RECURRENCES,
  createReminder,
  dueDateFromToday,
  listAssets,
  listReminderTemplates,
  type PublicAsset,
  type ReminderRecurrence,
  type ReminderTemplate,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Create a one-off or simple recurring reminder tied to an asset on this home.
 */
export default function NewReminderScreen() {
  const router = useRouter();
  const { assetId: presetAssetId } = useLocalSearchParams<{
    assetId?: string;
  }>();
  const { user, accessToken, activeProperty } = useAuth();

  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [assetId, setAssetId] = useState(presetAssetId ?? "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState(dueDateFromToday(7));
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken || !activeProperty) {
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const assetRes = await listAssets(accessToken, activeProperty.id);
        if (cancelled) return;
        setAssets(assetRes.assets);
        const selectedId =
          presetAssetId &&
          assetRes.assets.some((a) => a.id === presetAssetId)
            ? presetAssetId
            : assetRes.assets[0]?.id ?? "";
        setAssetId(selectedId);
        const selected = assetRes.assets.find((a) => a.id === selectedId);
        if (selected) {
          const tpl = await listReminderTemplates(
            accessToken,
            activeProperty.id,
            selected.category,
          );
          if (!cancelled) setTemplates(tpl.templates);
        } else {
          setTemplates([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load assets.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeProperty, presetAssetId]);

  async function onSelectAsset(nextId: string) {
    setAssetId(nextId);
    if (!accessToken || !activeProperty) return;
    const selected = assets.find((a) => a.id === nextId);
    if (!selected) {
      setTemplates([]);
      return;
    }
    try {
      const tpl = await listReminderTemplates(
        accessToken,
        activeProperty.id,
        selected.category,
      );
      setTemplates(tpl.templates);
    } catch {
      setTemplates([]);
    }
  }

  function applyTemplate(template: ReminderTemplate) {
    setTitle(template.title);
    setRecurrence(template.recurrence);
    setDueDate(dueDateFromToday(template.defaultDueInDays));
    setNotes(template.notes ?? "");
  }

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty || !accessToken) {
    return <Redirect href="/home" />;
  }

  async function onSave() {
    if (!accessToken || !activeProperty) return;
    if (!assetId) {
      setError("Add an asset on this home before creating a reminder.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createReminder(accessToken, activeProperty.id, {
        assetId,
        title: title.trim(),
        notes: notes.trim() || null,
        dueDate: dueDate.trim(),
        recurrence,
      });
      router.replace("/reminders");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create reminder.",
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
        <Text style={styles.brand}>New reminder</Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy || loading}
          onPress={() => {
            void onSave();
          }}
          style={styles.headerAction}
        >
          <Text style={styles.headerActionLabel}>
            {busy ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>
        <Text style={styles.title}>Add reminder</Text>

        {loading ? (
          <ActivityIndicator color="#002D72" style={styles.loader} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && assets.length === 0 ? (
          <Text style={styles.empty}>Add an asset first.</Text>
        ) : null}

        {!loading && assets.length > 0 ? (
          <>
            <Text style={styles.label}>Asset</Text>
            <View style={styles.chips}>
              {assets.map((asset) => {
                const selected = asset.id === assetId;
                return (
                  <Pressable
                    key={asset.id}
                    accessibilityRole="button"
                    onPress={() => {
                      void onSelectAsset(asset.id);
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        selected && styles.chipLabelSelected,
                      ]}
                    >
                      {asset.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {templates.length > 0 ? (
              <>
                <Text style={styles.label}>Optional starters</Text>
                <View style={styles.chips}>
                  {templates.map((template) => (
                    <Pressable
                      key={template.id}
                      accessibilityRole="button"
                      onPress={() => applyTemplate(template)}
                      style={styles.templateChip}
                    >
                      <Text style={styles.templateLabel}>{template.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Field label="Title" value={title} onChangeText={setTitle} />
            <Field
              label="Due date (YYYY-MM-DD)"
              value={dueDate}
              onChangeText={setDueDate}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Repeat</Text>
            <View style={styles.chips}>
              {REMINDER_RECURRENCES.map((item) => {
                const selected = item.value === recurrence;
                return (
                  <Pressable
                    key={item.value}
                    accessibilityRole="button"
                    onPress={() => setRecurrence(item.value)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        selected && styles.chipLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Field
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onSave();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryLabel}>Save reminder</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholderTextColor="#8A9BB0"
        autoCapitalize={props.autoCapitalize}
        multiline={props.multiline}
        textAlignVertical={props.multiline ? "top" : "center"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F2F5FA",
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
    color: "#1E4D96",
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#002D72",
  },
  headerAction: {
    paddingVertical: 8,
    minWidth: 56,
    alignItems: "flex-end",
  },
  headerActionLabel: {
    color: "#002D72",
    fontSize: 14,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#5C6E84",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: "#0B1B33",
    letterSpacing: -0.4,
  },
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#3D4F66",
    maxWidth: 420,
  },
  loader: {
    marginTop: 28,
  },
  error: {
    marginTop: 16,
    color: "#B42318",
    fontSize: 14,
  },
  empty: {
    marginTop: 28,
    fontSize: 15,
    lineHeight: 22,
    color: "#5C6E84",
  },
  field: {
    marginTop: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#5C6E84",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D0DE",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0B1B33",
  },
  inputMultiline: {
    minHeight: 96,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#C5D0DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipSelected: {
    borderColor: "#002D72",
    backgroundColor: "#002D72",
  },
  chipLabel: {
    fontSize: 14,
    color: "#0B1B33",
    fontWeight: "500",
  },
  chipLabelSelected: {
    color: "#FFFFFF",
  },
  templateChip: {
    borderWidth: 1,
    borderColor: "#C5D0DE",
    borderStyle: "dashed",
    backgroundColor: "#E6EBF3",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  templateLabel: {
    fontSize: 13,
    color: "#1E4D96",
    fontWeight: "600",
  },
  primaryBtn: {
    marginTop: 28,
    backgroundColor: "#002D72",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.6,
  },
});
