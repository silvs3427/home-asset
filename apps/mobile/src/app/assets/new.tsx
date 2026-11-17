import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
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
  ASSET_CATEGORIES,
  createAsset,
  type AssetCategory,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Create an asset on the current home. Manufacturer / model / serial are
 * captured now so docs and recalls can hang off them later.
 */
export default function NewAssetScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("appliance");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [installerVendor, setInstallerVendor] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  const [warrantyTerm, setWarrantyTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty || !accessToken) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    if (!accessToken || !activeProperty) return;
    setError(null);
    setBusy(true);
    try {
      const res = await createAsset(accessToken, activeProperty.id, {
        name: name.trim(),
        category,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial: serial.trim() || null,
        purchaseDate: purchaseDate.trim() || null,
        installDate: installDate.trim() || null,
        installerVendor: installerVendor.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        warrantyEndDate: warrantyEndDate.trim() || null,
        warrantyTerm: warrantyTerm.trim() || null,
      });
      router.replace(`/assets/${res.asset.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save asset.");
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
        <Text style={styles.brand}>Add asset</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.copy}>
          Saved to {activeProperty.name} only. Serial and model help with
          warranties and safety recalls later.
        </Text>

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Furnace, Roof, Dishwasher"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {ASSET_CATEGORIES.map((item) => {
            const selected = item.value === category;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                onPress={() => setCategory(item.value)}
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
        <Field
          label="Installer / vendor"
          value={installerVendor}
          onChangeText={setInstallerVendor}
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
          disabled={busy}
          onPress={() => {
            void onSubmit();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#F3F6F4" />
          ) : (
            <Text style={styles.primaryLabel}>Save asset</Text>
          )}
        </Pressable>
      </ScrollView>
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
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#7A8A82"
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
    backgroundColor: "#F3F6F4",
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
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    color: "#3D5349",
    marginBottom: 8,
  },
  field: {
    marginTop: 10,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#1B3A2F",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#14241D",
  },
  inputMultiline: {
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
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: "#1B3A2F",
    backgroundColor: "#1B3A2F",
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2F5B4A",
  },
  chipLabelSelected: {
    color: "#F3F6F4",
  },
  error: {
    marginTop: 14,
    color: "#8B2E2E",
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#F3F6F4",
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
