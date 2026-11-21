import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
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
  aiConfirmEmailIntake,
  aiEmailIntake,
  categoryLabel,
  type EmailIntakeDraft,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Paste a contractor email → AI draft summary → approve before ledger writes.
 * Real inbound mailbox can replace paste later; approve gate stays.
 */
export default function EmailIntakeScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [emailText, setEmailText] = useState("");
  const [draft, setDraft] = useState<EmailIntakeDraft | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIndexes = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, on]) => on)
        .map(([idx]) => Number(idx))
        .sort((a, b) => a - b),
    [selected],
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onDraft() {
    if (!accessToken || !activeProperty) return;
    setError(null);
    setBusy(true);
    try {
      const res = await aiEmailIntake(accessToken, activeProperty.id, {
        emailText: emailText.trim(),
      });
      setDraft(res.draft);
      const next: Record<number, boolean> = {};
      res.draft.assetsSuggested.forEach((_, idx) => {
        next[idx] = true;
      });
      setSelected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft email.");
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!accessToken || !activeProperty || !draft) return;
    setError(null);
    setBusy(true);
    try {
      const res = await aiConfirmEmailIntake(accessToken, activeProperty.id, {
        draftId: draft.draftId,
        selectedAssetIndexes: selectedIndexes,
        storeSummaryDocument: true,
      });
      setDraft(null);
      setEmailText("");
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
        <Text style={styles.brand}>Email intake</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Pasted email</Text>
        <TextInput
          value={emailText}
          onChangeText={setEmailText}
          placeholder={
            "From: Acme HVAC\nSubject: Install complete\n\nInstalled Carrier Infinity…"
          }
          placeholderTextColor="#8AA094"
          style={[styles.input, styles.multiline]}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy || emailText.trim().length < 20}
          onPress={() => {
            void onDraft();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            busy || emailText.trim().length < 20 ? styles.disabled : null,
          ]}
        >
          <Text style={styles.primaryLabel}>Draft summary (AI)</Text>
        </Pressable>

        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#1B3A2F" />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {draft ? (
          <View style={styles.draftBox}>
            <Text style={styles.sectionLabel}>
              Draft · {draft.mode} · not saved yet
            </Text>

            <Text style={styles.fieldLabel}>Summary</Text>
            <Text style={styles.fieldValue}>{draft.summary}</Text>
            <Text style={styles.fieldLabel}>Work performed</Text>
            <Text style={styles.fieldValue}>{draft.workPerformed}</Text>
            {draft.contractorName ? (
              <>
                <Text style={styles.fieldLabel}>Contractor</Text>
                <Text style={styles.fieldValue}>{draft.contractorName}</Text>
              </>
            ) : null}
            {draft.workDate ? (
              <>
                <Text style={styles.fieldLabel}>Date hint</Text>
                <Text style={styles.fieldValue}>{draft.workDate}</Text>
              </>
            ) : null}

            <Text style={styles.sectionLabel}>Assets to add (optional)</Text>
            {draft.assetsSuggested.map((asset, idx) => {
              const on = !!selected[idx];
              return (
                <Pressable
                  key={`${asset.name}-${idx}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() =>
                    setSelected((prev) => ({
                      ...prev,
                      [idx]: !prev[idx],
                    }))
                  }
                  style={[styles.rowCard, on && styles.rowCardOn]}
                >
                  <Text style={styles.check}>{on ? "✓" : "○"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{asset.name}</Text>
                    <Text style={styles.rowMeta}>
                      {categoryLabel(asset.category)}
                      {asset.manufacturer ? ` · ${asset.manufacturer}` : ""}
                      {asset.model ? ` ${asset.model}` : ""}
                    </Text>
                    {asset.notes ? (
                      <Text style={styles.rowMeta}>{asset.notes}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onApprove();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>
                Approve & save
                {selectedIndexes.length > 0
                  ? ` (${selectedIndexes.length} assets)`
                  : " (summary only)"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDraft(null)}
              style={styles.linkBtn}
            >
              <Text style={styles.linkLabel}>Discard draft</Text>
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
  privacy: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  label: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: "700",
    color: "#5A6E64",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D2CB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#14241D",
  },
  multiline: { minHeight: 160 },
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
    marginTop: 18,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5A6E64",
  },
  fieldLabel: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    color: "#5A6E64",
    textTransform: "uppercase",
  },
  fieldValue: { marginTop: 4, fontSize: 15, lineHeight: 22, color: "#14241D" },
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
  rowMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  linkBtn: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  linkLabel: { color: "#2F5B4A", fontSize: 14, fontWeight: "600" },
});
