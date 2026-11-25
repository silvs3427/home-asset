import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { InstallerVendorField } from "@/components/InstallerVendorField";
import { OpenLabelField } from "@/components/OpenLabelField";
import {
  aiAssetIntake,
  aiConfirmAssetIntake,
  categoryLabel,
  manualsSuggestPath,
  normalizeLabelValue,
  type AssetCategory,
  type AssetIntakeDraft,
  type AssetIntakeSourceKind,
  type AssetIntakeSuggested,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import {
  pickFromCamera,
  pickFromLibrary,
  pickPdfFile,
} from "@/lib/documents";
import { colors } from "@/lib/theme";

type Mode = "pick" | "paste" | "pdf" | "purchase";

/**
 * Multi-source asset intake (photo / PDF / order email / notes).
 * Draft → homeowner confirm — AI never writes the ledger silently.
 * Purchase slice: paste retailer order email and/or attach invoice PDF.
 */
export default function AssetIntakeScreen() {
  const router = useRouter();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const { user, accessToken, activeProperty } = useAuth();
  const initialMode: Mode =
    modeParam === "pdf"
      ? "pdf"
      : modeParam === "purchase"
        ? "purchase"
        : "pick";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [sourceKind, setSourceKind] = useState<AssetIntakeSourceKind>(
    modeParam === "pdf" || modeParam === "purchase" ? "invoice" : "email",
  );
  const [pasteText, setPasteText] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [heldMedia, setHeldMedia] = useState<{
    base64: string;
    mimeType: string;
    filename: string;
  } | null>(null);
  const [attachSource, setAttachSource] = useState(true);
  const [draft, setDraft] = useState<AssetIntakeDraft | null>(null);
  const [intent, setIntent] = useState<"add" | "update">("add");
  const [fields, setFields] = useState<AssetIntakeSuggested | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (modeParam === "pdf") {
      setMode("pdf");
      setSourceKind("invoice");
    } else if (modeParam === "purchase") {
      setMode("purchase");
      setSourceKind("email");
    }
  }, [modeParam]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  const purchaseFocused = mode === "purchase" || modeParam === "purchase";

  function applyDraft(next: AssetIntakeDraft) {
    setDraft(next);
    setIntent(next.intent);
    setFields({ ...next.suggestedAsset });
  }

  async function runIntake(input: {
    sourceKind: AssetIntakeSourceKind;
    text?: string | null;
    hint?: string | null;
    filename?: string | null;
    imageBase64?: string | null;
    mediaMimeType?: string | null;
  }) {
    if (!accessToken || !activeProperty) return;
    setError(null);
    setBusy(true);
    try {
      const res = await aiAssetIntake(accessToken, activeProperty.id, input);
      applyDraft(res.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft asset.");
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
          "Could not read that photo for HomeAsset. Try taking it again.",
        );
        return;
      }
      setPhotoName(picked.name);
      setPdfName(null);
      setHeldMedia({
        base64: picked.base64,
        mimeType: picked.mimeType || "image/jpeg",
        filename: picked.name,
      });
      setMode("pick");
      await runIntake({
        sourceKind: "photo",
        filename: picked.name,
        text: pasteText.trim() || null,
        imageBase64: picked.base64,
        mediaMimeType: picked.mimeType || "image/jpeg",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open camera.");
    }
  }

  async function onPdf() {
    setError(null);
    try {
      const picked = await pickPdfFile({ forAi: true });
      if (!picked) return;
      if (!picked.base64) {
        setError(
          "Could not read that PDF for HomeAsset. Try another file.",
        );
        return;
      }
      setPdfName(picked.name);
      setPhotoName(null);
      setHeldMedia({
        base64: picked.base64,
        mimeType: picked.mimeType || "application/pdf",
        filename: picked.name,
      });
      setMode(purchaseFocused ? "purchase" : "pdf");
      setSourceKind("invoice");
      await runIntake({
        sourceKind: "invoice",
        filename: picked.name,
        imageBase64: picked.base64,
        mediaMimeType: picked.mimeType || "application/pdf",
        text: pasteText.trim() || null,
        hint: purchaseFocused
          ? "Retailer order email PDF export or purchase invoice/receipt"
          : "PDF invoice or paperwork",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open PDF.");
    }
  }

  async function onPasteDraft() {
    const text = pasteText.trim();
    if (text.length < 12 && !heldMedia) {
      setError("Paste a bit more of the order email, invoice, or notes.");
      return;
    }
    const kind: AssetIntakeSourceKind = purchaseFocused
      ? heldMedia?.mimeType?.includes("pdf")
        ? "invoice"
        : "email"
      : sourceKind;
    await runIntake({
      sourceKind: kind,
      text: text || null,
      filename: heldMedia?.filename ?? null,
      imageBase64: heldMedia?.base64 ?? null,
      mediaMimeType: heldMedia?.mimeType ?? null,
      hint: purchaseFocused
        ? "Retailer order email and/or purchase invoice"
        : null,
    });
  }

  function patchField<K extends keyof AssetIntakeSuggested>(
    key: K,
    value: AssetIntakeSuggested[K],
  ) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onConfirm() {
    if (!accessToken || !activeProperty || !draft || !fields) return;
    if (!fields.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!normalizeLabelValue(fields.category)) {
      setError("Add a category (your own words).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await aiConfirmAssetIntake(accessToken, activeProperty.id, {
        draftId: draft.draftId,
        intent,
        matchedAssetId: draft.matchedAssetId,
        attachSourceDocument: attachSource,
        assetOverrides: {
          ...fields,
          name: fields.name.trim(),
          category: normalizeLabelValue(fields.category) as AssetCategory,
          manufacturer: fields.manufacturer?.trim() || null,
          model: fields.model?.trim() || null,
          serial: fields.serial?.trim() || null,
          purchaseDate: fields.purchaseDate?.trim() || null,
          installDate: fields.installDate?.trim() || null,
          installerVendor: fields.installerVendor?.trim() || null,
          installerContractorId: fields.installerContractorId ?? null,
          location: fields.location?.trim() || null,
          notes: fields.notes?.trim() || null,
        },
      });
      setDraft(null);
      setFields(null);
      setHeldMedia(null);
      const manualsPath = manualsSuggestPath({
        assetId: res.asset.id,
        manufacturer: res.asset.manufacturer ?? fields.manufacturer,
        model: res.asset.model ?? fields.model,
      });
      if (manualsPath) {
        router.replace(manualsPath);
      } else {
        router.replace(`/assets/${res.asset.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed.");
    } finally {
      setBusy(false);
    }
  }

  const missingKeys = new Set((draft?.missingFields ?? []).map((m) => m.key));
  const emailPlaceholder = purchaseFocused
    ? "Paste Amazon / retailer order email…\nSubject: Your Amazon.com order…\nOrdered on Oct 6, 2026…"
    : sourceKind === "email"
      ? "Paste contractor or order email…"
      : sourceKind === "invoice"
        ? "Paste invoice or receipt text…"
        : "Paste notes…";

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title={purchaseFocused ? "Order email / PDF" : "Add or update"}
      />

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        {!draft ? (
          <>
            {purchaseFocused ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onPdf();
                  }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                    busy ? styles.disabled : null,
                  ]}
                >
                  <Text style={styles.primaryLabel}>
                    Upload order / invoice PDF
                  </Text>
                </Pressable>
                {pdfName ? (
                  <Text style={styles.meta}>PDF: {pdfName}</Text>
                ) : null}

                <Text style={styles.label}>Or paste order email</Text>
                <KeyboardAwareTextInput
                  value={pasteText}
                  onChangeText={setPasteText}
                  placeholder={emailPlaceholder}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, styles.multiline]}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={
                    busy ||
                    (pasteText.trim().length < 12 && !heldMedia)
                  }
                  onPress={() => {
                    void onPasteDraft();
                  }}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                    busy ||
                    (pasteText.trim().length < 12 && !heldMedia)
                      ? styles.disabled
                      : null,
                  ]}
                >
                  <Text style={styles.secondaryLabel}>Draft asset</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onPhoto("camera");
                  }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryLabel}>Photo of label</Text>
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
                  <Text style={styles.secondaryLabel}>
                    Photo or purchase screenshot
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onPdf();
                  }}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                    busy ? styles.disabled : null,
                  ]}
                >
                  <Text style={styles.secondaryLabel}>Upload a PDF</Text>
                </Pressable>
                {photoName ? (
                  <Text style={styles.meta}>Photo: {photoName}</Text>
                ) : null}
                {pdfName ? (
                  <Text style={styles.meta}>PDF: {pdfName}</Text>
                ) : null}

                <Text style={styles.label}>Or paste</Text>
                <View style={styles.chips}>
                  {(
                    [
                      ["email", "Email"],
                      ["invoice", "Invoice"],
                      ["notes", "Notes"],
                    ] as const
                  ).map(([value, label]) => {
                    const on = sourceKind === value && mode === "paste";
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        onPress={() => {
                          setMode("paste");
                          setSourceKind(value);
                        }}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text
                          style={[styles.chipLabel, on && styles.chipLabelOn]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <KeyboardAwareTextInput
                  value={pasteText}
                  onChangeText={setPasteText}
                  placeholder={emailPlaceholder}
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, styles.multiline]}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  onFocus={() => setMode("paste")}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || pasteText.trim().length < 12}
                  onPress={() => {
                    void onPasteDraft();
                  }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                    busy || pasteText.trim().length < 12
                      ? styles.disabled
                      : null,
                  ]}
                >
                  <Text style={styles.primaryLabel}>Draft asset</Text>
                </Pressable>
              </>
            )}
          </>
        ) : null}

        {busy ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={colors.brand} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {draft && fields ? (
          <View style={styles.draftBox}>
            <Text style={styles.sectionLabel}>
              {intent === "update" ? "Update asset?" : "Add asset?"}
            </Text>
            <Text style={styles.draftTitle}>{draft.identificationLabel}</Text>
            <Text style={styles.meta}>
              {categoryLabel(fields.category)} ·{" "}
              {Math.round(draft.confidence * 100)}% · {draft.sourceKind}
            </Text>
            {intent === "update" && draft.matchedAssetLabel ? (
              <Text style={styles.meta}>Match: {draft.matchedAssetLabel}</Text>
            ) : null}

            <View style={styles.chips}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIntent("add")}
                style={[styles.chip, intent === "add" && styles.chipOn]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    intent === "add" && styles.chipLabelOn,
                  ]}
                >
                  Add new
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!draft.matchedAssetId}
                onPress={() => {
                  if (draft.matchedAssetId) setIntent("update");
                }}
                style={[
                  styles.chip,
                  intent === "update" && styles.chipOn,
                  !draft.matchedAssetId ? styles.disabled : null,
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    intent === "update" && styles.chipLabelOn,
                  ]}
                >
                  Update existing
                </Text>
              </Pressable>
            </View>

            {draft.missingFields.length > 0 ? (
              <View style={styles.gapsBox}>
                <Text style={styles.sectionLabel}>Still needed</Text>
                {draft.missingFields.map((gap) => (
                  <Text key={gap.key} style={styles.gapLine}>
                    {gap.label} — {gap.reason}
                  </Text>
                ))}
              </View>
            ) : null}

            <Field
              label="Name"
              value={fields.name}
              onChangeText={(v) => patchField("name", v)}
              highlight={missingKeys.has("name")}
            />

            {accessToken && activeProperty ? (
              <OpenLabelField
                accessToken={accessToken}
                propertyId={activeProperty.id}
                kind="asset_category"
                label="Category"
                value={fields.category}
                onChange={(v) => patchField("category", v)}
                placeholder="e.g. Furnace, Roof, Kids gear"
              />
            ) : null}

            <Field
              label="Manufacturer"
              value={fields.manufacturer ?? ""}
              onChangeText={(v) => patchField("manufacturer", v)}
              highlight={missingKeys.has("manufacturer")}
            />
            <Field
              label="Model"
              value={fields.model ?? ""}
              onChangeText={(v) => patchField("model", v)}
              highlight={missingKeys.has("model")}
            />
            <Field
              label="Purchase date"
              value={fields.purchaseDate ?? ""}
              onChangeText={(v) => patchField("purchaseDate", v)}
              placeholder="YYYY-MM-DD"
              highlight={missingKeys.has("purchaseDate")}
            />
            <Field
              label="Serial"
              value={fields.serial ?? ""}
              onChangeText={(v) => patchField("serial", v)}
              highlight={missingKeys.has("serial")}
            />
            <Field
              label="Install date"
              value={fields.installDate ?? ""}
              onChangeText={(v) => patchField("installDate", v)}
              placeholder="YYYY-MM-DD"
              highlight={missingKeys.has("installDate")}
            />
            {accessToken && activeProperty ? (
              <InstallerVendorField
                accessToken={accessToken}
                propertyId={activeProperty.id}
                value={{
                  installerVendor: fields.installerVendor ?? "",
                  installerContractorId: fields.installerContractorId ?? null,
                }}
                onChange={(next) => {
                  setFields((prev) =>
                    prev
                      ? {
                          ...prev,
                          installerVendor: next.installerVendor || null,
                          installerContractorId: next.installerContractorId,
                        }
                      : prev,
                  );
                }}
                highlight={missingKeys.has("installerVendor")}
              />
            ) : null}
            <Field
              label="Location"
              value={fields.location ?? ""}
              onChangeText={(v) => patchField("location", v)}
              highlight={missingKeys.has("location")}
            />
            <Field
              label="Notes"
              value={fields.notes ?? ""}
              onChangeText={(v) => patchField("notes", v)}
              multiline
              placeholder="Price and other details"
            />

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: attachSource }}
              onPress={() => setAttachSource((v) => !v)}
              style={[styles.attachRow, attachSource && styles.attachRowOn]}
            >
              <Text style={styles.attachCheck}>{attachSource ? "✓" : "○"}</Text>
              <Text style={styles.attachLabel}>
                Attach source email / PDF to this asset when I confirm
              </Text>
            </Pressable>

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
                {intent === "update" ? "Confirm update" : "Confirm add"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraft(null);
                setFields(null);
              }}
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

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  highlight?: boolean;
}) {
  return (
    <View>
      <Text style={[styles.label, props.highlight && styles.labelHighlight]}>
        {props.label}
        {props.highlight ? " *" : ""}
      </Text>
      <KeyboardAwareTextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.placeholder}
        style={[
          styles.input,
          props.multiline && styles.multilineShort,
          props.highlight && styles.inputHighlight,
        ]}
        multiline={props.multiline}
        textAlignVertical={props.multiline ? "top" : "center"}
        autoCapitalize="sentences"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  label: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  labelHighlight: { color: colors.brandMuted },
  input: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  inputHighlight: { borderColor: colors.brandMuted },
  multiline: { minHeight: 140 },
  multilineShort: { minHeight: 88 },
  meta: { marginTop: 8, fontSize: 13, color: colors.muted },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: colors.onBrand, fontSize: 16, fontWeight: "600" },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.9 },
  error: { marginTop: 14, color: colors.danger, fontSize: 14 },
  draftBox: { marginTop: 8 },
  sectionLabel: {
    marginTop: 18,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  draftTitle: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  chips: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipLabel: { fontSize: 14, color: colors.accent, fontWeight: "600" },
  chipLabelOn: { color: colors.onBrand },
  gapsBox: {
    marginTop: 8,
    paddingTop: 4,
  },
  gapLine: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.copy,
  },
  attachRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  attachRowOn: {
    borderColor: colors.accent,
  },
  attachCheck: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: "700",
    marginTop: 1,
  },
  attachLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.copy,
  },
  linkBtn: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  linkLabel: { color: colors.brandMuted, fontSize: 14, fontWeight: "600" },
});
