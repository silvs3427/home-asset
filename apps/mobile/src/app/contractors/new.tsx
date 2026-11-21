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
import { createHomeContractor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

/** Manual add to the homeowner's past-contractor directory. */
export default function NewContractorScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onSave() {
    if (!accessToken || !activeProperty) return;
    setBusy(true);
    setError(null);
    try {
      const { contractor } = await createHomeContractor(
        accessToken,
        activeProperty.id,
        {
          displayName,
          companyName,
          phone,
          email,
          website,
          servicesOffered: services,
          notes,
        },
      );
      router.replace(`/contractors/${contractor.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
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
        <Text style={styles.brand}>Add contractor</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {!SUPABASE_CONFIGURED ? (
          <Text style={styles.error}>
            Needs the cloud connection on this phone.
          </Text>
        ) : null}

        <Field label="Name" value={displayName} onChangeText={setDisplayName} />
        <Field
          label="Company"
          value={companyName}
          onChangeText={setCompanyName}
        />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" />
        <Field
          label="Other services (comma-separated)"
          value={services}
          onChangeText={setServices}
          placeholder="HVAC, plumbing…"
        />
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy || !SUPABASE_CONFIGURED || !displayName.trim()}
          onPress={() => {
            void onSave();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            (busy || !SUPABASE_CONFIGURED || !displayName.trim()) &&
              styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryLabel}>Save</Text>
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
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "sentences";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, props.multiline && styles.inputMulti]}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
        multiline={props.multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 56 },
  backLabel: { color: colors.brandMuted, fontSize: 14, fontWeight: "600" },
  brand: { color: colors.brand, fontSize: 17, fontWeight: "700" },
  spacer: { minWidth: 56 },
  body: { paddingHorizontal: 20, paddingBottom: 48 },
  field: { marginBottom: 12 },
  label: {
    color: colors.brandMuted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 16,
  },
  inputMulti: { minHeight: 88, textAlignVertical: "top" },
  error: { color: colors.danger, marginBottom: 12 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.88 },
});
