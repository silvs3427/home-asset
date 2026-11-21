import { Redirect, useRouter } from "expo-router";
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
  aiContractorFormat,
  aiContractorStatus,
  type ContractorFormatResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Contractor link-path hook: typed / voice transcript / upload text → AI format.
 * Draft only — confirm/submit + homeowner approve arrive in EPIC 8.
 */
export default function ContractorFormatScreen() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [inputKind, setInputKind] = useState<"typed" | "voice" | "upload">(
    "typed",
  );
  const [inputText, setInputText] = useState("");
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContractorFormatResponse | null>(null);
  const [confirmedLocal, setConfirmedLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken) return;
      try {
        const status = await aiContractorStatus(accessToken);
        if (cancelled) return;
        setStatusNote(status.capabilities.note);
      } catch {
        // Status is informational; format still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!user) return <Redirect href="/sign-in" />;

  async function onFormat() {
    if (!accessToken) return;
    setError(null);
    setDraft(null);
    setConfirmedLocal(false);
    setBusy(true);
    try {
      const res = await aiContractorFormat(accessToken, {
        inputText: inputText.trim(),
        inputKind,
      });
      setDraft(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Format failed.");
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
        <Text style={styles.brand}>Format notes</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {statusNote ? <Text style={styles.meta}>{statusNote}</Text> : null}

        <Text style={styles.label}>Input kind</Text>
        <View style={styles.row}>
          {(["typed", "voice", "upload"] as const).map((kind) => {
            const on = inputKind === kind;
            return (
              <Pressable
                key={kind}
                onPress={() => setInputKind(kind)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {kind}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Installed Carrier Infinity outdoor unit, replaced filter…"
          placeholderTextColor="#8AA094"
          style={[styles.input, styles.multiline]}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy || inputText.trim().length < 1}
          onPress={() => {
            void onFormat();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            busy || inputText.trim().length < 1 ? styles.disabled : null,
          ]}
        >
          <Text style={styles.primaryLabel}>AI format draft</Text>
        </Pressable>

        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#1B3A2F" />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {draft ? (
          <View style={styles.draftBox}>
            <Text style={styles.sectionLabel}>Draft packet · {draft.mode}</Text>
            <Text style={styles.fieldLabel}>Summary</Text>
            <Text style={styles.fieldValue}>{draft.draft.summary}</Text>
            <Text style={styles.fieldLabel}>Work performed</Text>
            <Text style={styles.fieldValue}>{draft.draft.workPerformed}</Text>
            <Text style={styles.fieldLabel}>Suggested assets</Text>
            {draft.draft.assetsSuggested.map((asset, idx) => (
              <Text key={`${asset.name}-${idx}`} style={styles.fieldValue}>
                · {asset.name}
                {asset.manufacturer ? ` (${asset.manufacturer}` : ""}
                {asset.model ? ` ${asset.model}` : ""}
                {asset.manufacturer ? ")" : ""}
              </Text>
            ))}
            {draft.draft.materials.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>Materials</Text>
                {draft.draft.materials.map((m) => (
                  <Text key={m} style={styles.fieldValue}>
                    · {m}
                  </Text>
                ))}
              </>
            ) : null}
            <Text style={styles.fieldLabel}>Follow-ups</Text>
            {draft.draft.followUps.map((f) => (
              <Text key={f} style={styles.fieldValue}>
                · {f}
              </Text>
            ))}

            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmedLocal(true)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>
                {confirmedLocal
                  ? "Draft confirmed (local)"
                  : "Confirm draft wording"}
              </Text>
            </Pressable>
            {confirmedLocal ? (
              <Text style={styles.success}>Draft confirmed (local only).</Text>
            ) : null}
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
  meta: { marginTop: 10, fontSize: 13, lineHeight: 18, color: "#5A6E64" },
  label: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: "700",
    color: "#5A6E64",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { borderColor: "#1B3A2F", backgroundColor: "#1B3A2F" },
  chipText: { color: "#1B3A2F", fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: "#F3F6F4" },
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
  multiline: { minHeight: 140 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: "#F3F6F4", fontSize: 16, fontWeight: "600" },
  secondaryBtn: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: { color: "#1B3A2F", fontSize: 16, fontWeight: "600" },
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
  privacy: { marginTop: 8, fontSize: 13, lineHeight: 18, color: "#5A6E64" },
  fieldLabel: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    color: "#5A6E64",
    textTransform: "uppercase",
  },
  fieldValue: { marginTop: 4, fontSize: 15, lineHeight: 22, color: "#14241D" },
  success: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#1B3A2F",
    fontWeight: "600",
  },
});
