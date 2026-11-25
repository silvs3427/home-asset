import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
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
  createAsset,
  manualsSuggestPath,
  normalizeLabelValue,
  type AssetCategory,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

function asCategory(value: string | null | undefined): AssetCategory {
  const next = normalizeLabelValue(value ?? "");
  return next || "";
}

/**
 * Create an asset on the current home.
 * Primary path: free-text → Format with HomeAsset → edit draft fields → Save.
 * AI never writes the ledger; Save is the homeowner confirm.
 */
export default function NewAssetScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [freeText, setFreeText] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [installerVendor, setInstallerVendor] = useState("");
  const [installerContractorId, setInstallerContractorId] = useState<
    string | null
  >(null);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  const [warrantyTerm, setWarrantyTerm] = useState("");
  const [formatting, setFormatting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty || !accessToken) {
    return <Redirect href="/home" />;
  }

  async function onFormat() {
    if (!accessToken || !activeProperty) return;
    const text = freeText.trim();
    if (text.length < 8) {
      setError("Add a bit more about the asset first.");
      return;
    }
    setError(null);
    setFormatting(true);
    try {
      const res = await aiAssetIntake(accessToken, activeProperty.id, {
        sourceKind: "notes",
        text,
      });
      // Format-only: drop the held confirm token — Save uses createAsset, not AI confirm.
      try {
        const { takeAssetIntakeDraft } = await import("@/lib/aiEdge");
        takeAssetIntakeDraft(res.draft.draftId);
      } catch {
        // Local API path has no in-memory draft map.
      }
      const suggested = res.draft.suggestedAsset;
      setName(suggested.name?.trim() || "");
      setCategory(asCategory(suggested.category));
      setManufacturer(suggested.manufacturer?.trim() || "");
      setModel(suggested.model?.trim() || "");
      setSerial(suggested.serial?.trim() || "");
      setPurchaseDate(suggested.purchaseDate?.trim() || "");
      setInstallDate(suggested.installDate?.trim() || "");
      setInstallerVendor(suggested.installerVendor?.trim() || "");
      setInstallerContractorId(null);
      setLocation(suggested.location?.trim() || "");
      setNotes(suggested.notes?.trim() || "");
      setWarrantyEndDate(suggested.warrantyEndDate?.trim() || "");
      setWarrantyTerm(suggested.warrantyTerm?.trim() || "");
      setDraftReady(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "HomeAsset could not format that.",
      );
    } finally {
      setFormatting(false);
    }
  }

  async function onSubmit() {
    if (!accessToken || !activeProperty) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!normalizeLabelValue(category)) {
      setError("Add a category (your own words).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await createAsset(accessToken, activeProperty.id, {
        name: name.trim(),
        category: normalizeLabelValue(category),
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial: serial.trim() || null,
        purchaseDate: purchaseDate.trim() || null,
        installDate: installDate.trim() || null,
        installerVendor: installerVendor.trim() || null,
        installerContractorId,
        location: location.trim() || null,
        notes: notes.trim() || null,
        warrantyEndDate: warrantyEndDate.trim() || null,
        warrantyTerm: warrantyTerm.trim() || null,
      });
      const manualsPath = manualsSuggestPath({
        assetId: res.asset.id,
        manufacturer: res.asset.manufacturer,
        model: res.asset.model,
      });
      if (manualsPath) {
        router.replace(manualsPath);
      } else {
        router.replace(`/assets/${res.asset.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save asset.");
    } finally {
      setBusy(false);
    }
  }

  const formatDisabled = formatting || busy || freeText.trim().length < 8;
  const saveDisabled = busy || formatting || !name.trim();

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Add asset" />

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        <Text style={styles.label}>Describe the asset</Text>
        <KeyboardAwareTextInput
          style={[styles.input, styles.inputMultiline]}
          value={freeText}
          onChangeText={setFreeText}
          placeholder="e.g. Carrier furnace in basement, model 59TN6, installed June 2022 by ABC Heating"
          placeholderTextColor={colors.placeholder}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />

        <Pressable
          accessibilityRole="button"
          disabled={formatDisabled}
          onPress={() => {
            void onFormat();
          }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
            formatDisabled && styles.disabled,
          ]}
        >
          {formatting ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Text style={styles.secondaryLabel}>
              Format with HomeAsset
            </Text>
          )}
        </Pressable>

        {draftReady ? (
          <Text style={styles.sectionLabel}>Draft fields</Text>
        ) : (
          <Text style={styles.sectionLabel}>Or fill by hand</Text>
        )}

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Furnace, Roof, Dishwasher"
        />

        <OpenLabelField
          accessToken={accessToken}
          propertyId={activeProperty.id}
          kind="asset_category"
          label="Category"
          value={category}
          onChange={setCategory}
          placeholder="e.g. Furnace, Roof, Kids gear"
          emptyHint="Type a category — once saved for this home, it shows up again."
        />

        <Field
          label="Manufacturer"
          value={manufacturer}
          onChangeText={setManufacturer}
          placeholder="e.g. Carrier"
        />
        <Field
          label="Model"
          value={model}
          onChangeText={setModel}
          placeholder="Model number"
        />
        <Field
          label="Serial"
          value={serial}
          onChangeText={setSerial}
          placeholder="Serial number"
          autoCapitalize="characters"
        />
        <Field
          label="Purchase date (YYYY-MM-DD)"
          value={purchaseDate}
          onChangeText={setPurchaseDate}
          placeholder="2022-06-15"
          autoCapitalize="none"
        />
        <Field
          label="Install date (YYYY-MM-DD)"
          value={installDate}
          onChangeText={setInstallDate}
          placeholder="2022-06-20"
          autoCapitalize="none"
        />
        <Field
          label="Warranty end date (YYYY-MM-DD)"
          value={warrantyEndDate}
          onChangeText={setWarrantyEndDate}
          placeholder="2032-06-20"
          autoCapitalize="none"
        />
        <Field
          label="Warranty term"
          value={warrantyTerm}
          onChangeText={setWarrantyTerm}
          placeholder="e.g. 10 years, lifetime"
        />
        <InstallerVendorField
          accessToken={accessToken}
          propertyId={activeProperty.id}
          value={{ installerVendor, installerContractorId }}
          onChange={(next) => {
            setInstallerVendor(next.installerVendor);
            setInstallerContractorId(next.installerContractorId);
          }}
          placeholder="Who installed or sold it"
        />
        <Field
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="Basement, attic, garage…"
        />
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={saveDisabled}
          onPress={() => {
            void onSubmit();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            saveDisabled && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryLabel}>Save asset</Text>
          )}
        </Pressable>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <KeyboardAwareTextInput
        style={[styles.input, props.multiline && styles.inputMultilineShort]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.placeholder}
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
    backgroundColor: colors.bg,
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
  backSpacer: {
    minWidth: 56,
  },
  backLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.brand,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  field: {
    marginTop: 10,
  },
  sectionLabel: {
    marginTop: 22,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
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
  inputMultiline: {
    minHeight: 120,
    paddingTop: 12,
  },
  inputMultilineShort: {
    minHeight: 96,
    paddingTop: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  chipLabelSelected: {
    color: colors.onBrand,
  },
  error: {
    marginTop: 14,
    color: colors.danger,
    fontSize: 14,
  },
  secondaryBtn: {
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600",
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.onBrand,
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
