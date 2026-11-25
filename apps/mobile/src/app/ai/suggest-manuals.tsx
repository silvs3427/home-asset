import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  aiConfirmSuggestedManuals,
  aiSuggestManuals,
  type SuggestManualsDraft,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * After make + model are known: suggest manuals / specs / warranty docs →
 * homeowner approve. Nothing is stored until Confirm; skip returns to the asset.
 */
export default function SuggestManualsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    assetId?: string;
    manufacturer?: string;
    model?: string;
  }>();
  const { user, accessToken, activeProperty } = useAuth();
  const [draft, setDraft] = useState<SuggestManualsDraft | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applyWarrantyHint, setApplyWarrantyHint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const assetId = typeof params.assetId === "string" ? params.assetId : "";
  const manufacturer =
    typeof params.manufacturer === "string" ? params.manufacturer : "";
  const model = typeof params.model === "string" ? params.model : "";

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  const hasWarrantyHint = Boolean(
    draft?.warrantyHint?.term || draft?.warrantyHint?.notes,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !activeProperty || !assetId || !manufacturer || !model) {
        setLoading(false);
        setError("Need make and model on the asset to look up manuals.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await aiSuggestManuals(accessToken, activeProperty.id, {
          assetId,
          manufacturer,
          model,
        });
        if (cancelled) return;
        setDraft(res.draft);
        const next: Record<string, boolean> = {};
        for (const m of res.draft.manuals) {
          next[m.id] = m.selectedByDefault;
        }
        setSelected(next);
        setApplyWarrantyHint(
          Boolean(res.draft.warrantyHint?.term || res.draft.warrantyHint?.notes),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not suggest manuals.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeProperty, assetId, manufacturer, model]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onConfirm() {
    if (!accessToken || !activeProperty || !draft || !assetId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await aiConfirmSuggestedManuals(
        accessToken,
        activeProperty.id,
        {
          draftId: draft.draftId,
          assetId,
          selectedManualIds: selectedIds,
          applyWarrantyHint: applyWarrantyHint && hasWarrantyHint,
        },
      );
      setDraft(null);
      const parts: string[] = [];
      if (res.storedManualCount > 0) {
        parts.push(
          `Saved ${res.storedManualCount} document${res.storedManualCount === 1 ? "" : "s"} as real file${res.storedManualCount === 1 ? "" : "s"}`,
        );
      }
      if (res.warrantyApplied) {
        parts.push("applied warranty term on the asset");
      }
      if (res.failed.length > 0 && res.storedManualCount > 0) {
        Alert.alert(
          "Some docs saved",
          `${parts.join("; ")}. ` +
            `${res.failed.length} could not be downloaded:\n` +
            res.failed.map((f) => `• ${f.title}: ${f.reason}`).join("\n"),
          [
            {
              text: "OK",
              onPress: () => router.replace(`/assets/${assetId}`),
            },
          ],
        );
      } else if (res.storedManualCount > 0 || res.warrantyApplied) {
        setSavedMsg(parts.join("; ") + ".");
        router.replace(`/assets/${assetId}`);
      } else if (selectedIds.length === 0 && !applyWarrantyHint) {
        setSavedMsg("Nothing selected — asset kept as-is.");
        router.replace(`/assets/${assetId}`);
      } else {
        router.replace(`/assets/${assetId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed.");
    } finally {
      setBusy(false);
    }
  }

  function onSkip() {
    if (assetId) router.replace(`/assets/${assetId}`);
    else router.replace("/home");
  }

  const canSave =
    selectedIds.length > 0 || (applyWarrantyHint && hasWarrantyHint);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Suggested docs" backLabel="Skip" onBack={onSkip} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.copy}>
          HomeAsset looked for manuals, spec sheets, and warranty info for{" "}
          {manufacturer} {model}. Choose what to keep — nothing is saved until
          you confirm.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={colors.brand} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {savedMsg ? <Text style={styles.success}>{savedMsg}</Text> : null}

        {draft && !loading ? (
          <View style={styles.draftBox}>
            <Text style={styles.sectionLabel}>
              {draft.identificationLabel} · {draft.mode}
            </Text>
            {draft.searchNote && draft.manuals.length === 0 ? (
              <Text style={styles.meta}>{draft.searchNote}</Text>
            ) : null}
            {draft.manuals.length === 0 ? (
              <Text style={styles.meta}>
                No manuals or warranty PDFs found yet for this make and model.
                You can add documents later on the asset.
              </Text>
            ) : (
              draft.manuals.map((manual) => {
                const on = !!selected[manual.id];
                return (
                  <Pressable
                    key={manual.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [manual.id]: !prev[manual.id],
                      }))
                    }
                    style={[styles.manualRow, on && styles.manualRowOn]}
                  >
                    <Text style={styles.manualCheck}>{on ? "✓" : "○"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.manualTitle}>{manual.title}</Text>
                      <Text style={styles.manualKind}>{manual.kind}</Text>
                      <Text style={styles.manualPreview}>{manual.preview}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}

            {hasWarrantyHint ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: applyWarrantyHint }}
                onPress={() => setApplyWarrantyHint((v) => !v)}
                style={[
                  styles.manualRow,
                  applyWarrantyHint && styles.manualRowOn,
                ]}
              >
                <Text style={styles.manualCheck}>
                  {applyWarrantyHint ? "✓" : "○"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.manualTitle}>
                    Apply warranty term on this asset
                  </Text>
                  <Text style={styles.manualKind}>warranty field</Text>
                  <Text style={styles.manualPreview}>
                    {[
                      draft.warrantyHint?.term
                        ? `Term: ${draft.warrantyHint.term}`
                        : null,
                      draft.warrantyHint?.notes,
                    ]
                      .filter(Boolean)
                      .join(" — ")}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy || !canSave}
              onPress={() => {
                void onConfirm();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                busy || !canSave ? styles.disabled : null,
              ]}
            >
              <Text style={styles.primaryLabel}>
                Save selected ({selectedIds.length}
                {applyWarrantyHint && hasWarrantyHint ? " + term" : ""})
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onSkip}
              style={styles.linkBtn}
            >
              <Text style={styles.linkLabel}>Skip for now</Text>
            </Pressable>
          </View>
        ) : null}

        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} color={colors.brand} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.copy,
    marginBottom: 8,
  },
  sectionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  meta: { marginTop: 12, fontSize: 14, lineHeight: 20, color: colors.muted },
  draftBox: { marginTop: 8 },
  manualRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  manualRowOn: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  manualCheck: {
    fontSize: 18,
    color: colors.brand,
    fontWeight: "700",
    width: 22,
  },
  manualTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  manualKind: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  manualPreview: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.copy,
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: colors.onBrand, fontSize: 16, fontWeight: "600" },
  linkBtn: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  linkLabel: { color: colors.brandMuted, fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.9 },
  error: { marginTop: 14, color: colors.danger, fontSize: 14 },
  success: { marginTop: 14, color: colors.brand, fontSize: 14 },
});
