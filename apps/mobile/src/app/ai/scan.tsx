import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  KeyboardAwareScroll,
  KeyboardAwareTextInput,
} from "@/components/KeyboardAwareScroll";
import {
  aiConfirmScan,
  aiScanProduct,
  categoryLabel,
  type AiScanDraft,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { pickFromCamera, pickFromLibrary } from "@/lib/documents";

/**
 * Homeowner scan → identify → pick manuals → confirm save.
 * Nothing is written until Confirm is tapped.
 */
export default function AiScanScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [hint, setHint] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiScanDraft | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function runScan(opts?: {
    filename?: string | null;
    imageBase64?: string | null;
    mediaMimeType?: string | null;
  }) {
    if (!accessToken || !activeProperty) return;
    setError(null);
    setSavedMsg(null);
    setBusy(true);
    try {
      const res = await aiScanProduct(accessToken, activeProperty.id, {
        hint: hint.trim() || null,
        filename: opts?.filename ?? photoName,
        imageBase64: opts?.imageBase64 ?? null,
        mediaMimeType: opts?.mediaMimeType ?? null,
      });
      setDraft(res.draft);
      setName(res.draft.suggestedAsset.name);
      setManufacturer(res.draft.suggestedAsset.manufacturer ?? "");
      setModel(res.draft.suggestedAsset.model ?? "");
      setPurchaseDate(res.draft.suggestedAsset.purchaseDate ?? "");
      setNotes(res.draft.suggestedAsset.notes ?? "");
      const next: Record<string, boolean> = {};
      for (const m of res.draft.manuals) {
        next[m.id] = m.selectedByDefault;
      }
      setSelected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(source: "camera" | "library") {
    setError(null);
    try {
      const picked =
        source === "camera"
          ? await pickFromCamera({ forAi: true })
          : await pickFromLibrary({ forAi: true });
      if (!picked) return;
      if (!picked.base64) {
        setError(
          "Could not read that photo for Ask HomeAsset. Try taking it again.",
        );
        return;
      }
      setPhotoName(picked.name);
      await runScan({
        filename: picked.name,
        imageBase64: picked.base64,
        mediaMimeType: picked.mimeType || "image/jpeg",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open camera.");
    }
  }

  async function onConfirm() {
    if (!accessToken || !activeProperty || !draft) return;
    setError(null);
    setBusy(true);
    try {
      const res = await aiConfirmScan(accessToken, activeProperty.id, {
        draftId: draft.draftId,
        selectedManualIds: selectedIds,
        assetOverrides: {
          name: name.trim() || draft.suggestedAsset.name,
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          purchaseDate: purchaseDate.trim() || null,
          notes: notes.trim() || null,
        },
      });
      setSavedMsg(
        `Saved ${res.asset.name} with ${res.storedManualCount} manual${res.storedManualCount === 1 ? "" : "s"}.`,
      );
      setDraft(null);
      router.push(`/assets/${res.asset.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Scan product" />

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        <Text style={styles.label}>Hint (optional)</Text>
        <KeyboardAwareTextInput
          value={hint}
          onChangeText={setHint}
          placeholder="e.g. iRobot Roomba, brand + model"
          placeholderTextColor="#8A9BB0"
          style={styles.input}
          autoCapitalize="words"
        />
        {photoName ? (
          <Text style={styles.meta}>Photo: {photoName}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void onPhoto("camera");
          }}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryLabel}>Take photo & scan</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void onPhoto("library");
          }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>Photo library & scan</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy || (!hint.trim() && !photoName)}
          onPress={() => {
            void runScan({ filename: photoName });
          }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
            busy || (!hint.trim() && !photoName) ? styles.disabled : null,
          ]}
        >
          <Text style={styles.secondaryLabel}>Scan from hint only</Text>
        </Pressable>

        {busy ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#002D72" />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {savedMsg ? <Text style={styles.success}>{savedMsg}</Text> : null}

        {draft ? (
          <View style={styles.draftBox}>
            <Text style={styles.sectionLabel}>Draft (not saved yet)</Text>
            <Text style={styles.draftTitle}>{draft.identificationLabel}</Text>
            <Text style={styles.meta}>
              {categoryLabel(draft.suggestedAsset.category)} · confidence{" "}
              {Math.round(draft.confidence * 100)}% · mode {draft.mode}
            </Text>
            <Text style={styles.label}>Name on your ledger</Text>
            <KeyboardAwareTextInput
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <Text style={styles.label}>Manufacturer</Text>
            <KeyboardAwareTextInput
              value={manufacturer}
              onChangeText={setManufacturer}
              placeholder="e.g. iRobot"
              placeholderTextColor="#8A9BB0"
              style={styles.input}
              autoCapitalize="words"
            />
            <Text style={styles.label}>Model</Text>
            <KeyboardAwareTextInput
              value={model}
              onChangeText={setModel}
              placeholder="e.g. Roomba 505X"
              placeholderTextColor="#8A9BB0"
              style={styles.input}
            />
            <Text style={styles.label}>Purchase date (YYYY-MM-DD)</Text>
            <KeyboardAwareTextInput
              value={purchaseDate}
              onChangeText={setPurchaseDate}
              placeholder="From Last purchased / receipt"
              placeholderTextColor="#8A9BB0"
              style={styles.input}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Notes</Text>
            <KeyboardAwareTextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Price and other details"
              placeholderTextColor="#8A9BB0"
              style={[styles.input, styles.notesInput]}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.sectionLabel}>Manuals to store</Text>
            {draft.manuals.map((manual) => {
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
                    <Text style={styles.manualPreview}>{manual.preview}</Text>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onConfirm();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>
                Confirm & save ({selectedIds.length} manuals)
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
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F2F5FA" },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: "#1E4D96", fontSize: 14, fontWeight: "600", width: 56 },
  brand: { fontSize: 18, fontWeight: "700", color: "#002D72" },
  headerSpacer: { width: 56 },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  copy: { fontSize: 16, lineHeight: 24, color: "#3D4F66", marginBottom: 16 },
  label: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "700",
    color: "#5C6E84",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D0DE",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0B1B33",
  },
  notesInput: {
    minHeight: 72,
  },
  meta: { marginTop: 8, fontSize: 13, color: "#5C6E84" },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#002D72",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FF5910",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: { color: "#FF5910", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.9 },
  error: { marginTop: 14, color: "#B42318", fontSize: 14 },
  success: { marginTop: 14, color: "#002D72", fontSize: 14, fontWeight: "600" },
  draftBox: { marginTop: 28 },
  sectionLabel: {
    marginTop: 18,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5C6E84",
  },
  draftTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "700",
    color: "#0B1B33",
  },
  privacy: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#5C6E84",
  },
  manualRow: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#C5D0DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    gap: 10,
  },
  manualRowOn: { borderColor: "#002D72" },
  manualCheck: {
    width: 22,
    fontSize: 18,
    fontWeight: "700",
    color: "#002D72",
  },
  manualTitle: { fontSize: 15, fontWeight: "600", color: "#0B1B33" },
  manualPreview: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#5C6E84",
  },
  linkBtn: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  linkLabel: { color: "#1E4D96", fontSize: 14, fontWeight: "600" },
});
