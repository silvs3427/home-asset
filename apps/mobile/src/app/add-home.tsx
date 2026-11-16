import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

/**
 * Thin “Add home” flow — name + full address for later contractor submit.
 * No tenants, portfolios, or staff roles.
 */
export default function AddHomeScreen() {
  const router = useRouter();
  const { user, addHome } = useAuth();
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await addHome({
        name: name.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || null,
        city: city.trim(),
        region: region.trim(),
        postalCode: postalCode.trim(),
        country: "US",
      });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add home.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
          <Text style={styles.brand}>Add home</Text>
          <View style={styles.backSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.copy}>
            Only you can see this home. We store the least needed to keep your
            record organized — no silent sharing.
          </Text>

          <Field label="Home name" value={name} onChangeText={setName} placeholder="e.g. Oak Street" />
          <Field
            label="Street address"
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="123 Main St"
            autoComplete="street-address"
          />
          <Field
            label="Apt / suite (optional)"
            value={addressLine2}
            onChangeText={setAddressLine2}
            placeholder="Unit 2"
          />
          <Field label="City" value={city} onChangeText={setCity} placeholder="Austin" />
          <View style={styles.row}>
            <View style={styles.half}>
              <Field
                label="State / region"
                value={region}
                onChangeText={setRegion}
                placeholder="TX"
              />
            </View>
            <View style={styles.half}>
              <Field
                label="Postal code"
                value={postalCode}
                onChangeText={setPostalCode}
                placeholder="78701"
                autoComplete="postal-code"
              />
            </View>
          </View>

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
              <Text style={styles.primaryLabel}>Save home</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoComplete?: "street-address" | "postal-code" | "off";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#7A8A82"
        autoComplete={props.autoComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F3F6F4",
  },
  flex: {
    flex: 1,
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
    marginBottom: 12,
  },
  field: {
    marginTop: 10,
  },
  label: {
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
  row: {
    flexDirection: "row",
    gap: 12,
  },
  half: {
    flex: 1,
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
