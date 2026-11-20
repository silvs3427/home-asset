import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
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
  aiConfirmPermits,
  aiSuggestPermits,
  categoryLabel,
  formatPropertyAddress,
  type PermitSuggestDraft,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Suggest assets/jobs from public permit-style hints for this home.
 * MVP uses a stub source with a live connector hook; approve before save.
 */
export default function PermitSuggestionsScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [draft, setDraft] = useState<PermitSuggestDraft | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onSuggest() {
    if (!accessToken || !activeProperty) return;
    setError(null);
    setBusy(true);
    try {
      const res = await aiSuggestPermits(accessToken, activeProperty.id);
      setDraft(res.draft);
      const next: Record<string, boolean> = {};
      for (const permit of res.draft.permits) {
        next[permit.id] = permit.selectedByDefault;
      }
      setSelected(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load permit hints.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!accessToken || !activeProperty || !draft) return;
    if (selectedIds.length < 1) {
      setError("Pick at least one suggestion to approve, or discard the draft.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await aiConfirmPermits(accessToken, activeProperty.id, {
        draftId: draft.draftId,
        selectedPermitIds: selectedIds,
      });
      setDraft(null);
      if (res.assets[0]) {
        router.push(`/assets/${res.assets[0].id}`);
      } else {
        router.push("/assets");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.brand}>Permit hints</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.copy}>
          HomeAsset looks for public open/closed permit-style hints for this
          address and suggests assets or jobs you might want on the ledger.
        </Text>
        <Text style={styles.address}>
          {formatPropertyAddress(activeProperty)}
        </Text>
        <Text style={styles.privacy}>
          Suggestions only. You approve each one. Hints stay scoped to this home
          — never mixed across homes, never silent auto-add.
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void onSuggest();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            busy ? styles.disabled : null,
          ]}
        >
          <Text style={styles.primaryLabel}>
            {draft ? "Refresh suggestions" : "Suggest from permits"}
          </Text>
        </Pressable>

        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#1B3A2F" />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {draft ? (
          <View style={styles.draftBox}>
            <Text style={styles.sectionLabel}>
              Suggestions · {draft.mode} source · not saved yet
            </Text>
            <Text style={styles.privacy}>{draft.sourceNote}</Text>
            <Text style={styles.privacy}>{draft.privacy.note}</Text>

            {draft.permits.length === 0 ? (
              <Text style={styles.fieldValue}>
                No permit hints for this address yet. Live public data can fill
                this later — the approve step will stay the same.
              </Text>
            ) : (
              draft.permits.map((permit) => {
                const on = !!selected[permit.id];
                return (
                  <Pressable
                    key={permit.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      setSelected((prev) => ({
                        ...prev,
                        [permit.id]: !prev[permit.id],
                      }))
                    }
                    style={[styles.rowCard, on && styles.rowCardOn]}
                  >
                    <Text style={styles.check}>{on ? "✓" : "○"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{permit.title}</Text>
                      <Text style={styles.rowMeta}>
                        {permit.status}
                        {permit.filedOrClosedOn
                          ? ` · ${permit.filedOrClosedOn}`
                          : ""}
                      </Text>
                      <Text style={styles.rowMeta}>{permit.description}</Text>
                      <Text style={styles.rowTitleSmall}>
                        Would add: {permit.suggestedAsset.name} (
                        {categoryLabel(permit.suggestedAsset.category)})
                      </Text>
                      <Text style={styles.rowMeta}>{permit.sourceLabel}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}

            {draft.permits.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || selectedIds.length < 1}
                onPress={() => {
                  void onApprove();
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.pressed,
                  busy || selectedIds.length < 1 ? styles.disabled : null,
                ]}
              >
                <Text style={styles.primaryLabel}>
                  Approve selected ({selectedIds.length})
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setDraft(null)}
              style={styles.linkBtn}
            >
              <Text style={styles.linkLabel}>Discard suggestions</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F3F6F4" },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: "#2F5B4A", fontSize: 14, fontWeight: "600", width: 56 },
  brand: { fontSize: 18, fontWeight: "700", color: "#1B3A2F" },
  headerSpacer: { width: 56 },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  copy: { fontSize: 16, lineHeight: 24, color: "#3D5349" },
  address: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: "#14241D",
  },
  privacy: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: "#F3F6F4", fontSize: 16, fontWeight: "600" },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
  error: { marginTop: 14, color: "#8B2E2E", fontSize: 14 },
  draftBox: { marginTop: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5A6E64",
  },
  fieldValue: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: "#14241D",
  },
  rowCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    gap: 10,
  },
  rowCardOn: { borderColor: "#1B3A2F" },
  check: {
    width: 22,
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#14241D" },
  rowTitleSmall: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#14241D",
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  linkBtn: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  linkLabel: { color: "#2F5B4A", fontSize: 14, fontWeight: "600" },
});
