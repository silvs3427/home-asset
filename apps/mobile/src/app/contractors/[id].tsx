import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  addHomeContractorWork,
  deleteHomeContractor,
  getHomeContractor,
  updateHomeContractor,
  type PublicHomeContractor,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/** Past contractor detail: contact, services, work history, edit. */
export default function ContractorDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken, activeProperty } = useAuth();
  const [contractor, setContractor] = useState<PublicHomeContractor | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState("");
  const [notes, setNotes] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getHomeContractor(accessToken, activeProperty.id, id);
      setContractor(res.contractor);
      setDisplayName(res.contractor.displayName);
      setCompanyName(res.contractor.companyName ?? "");
      setPhone(res.contractor.phone ?? "");
      setEmail(res.contractor.email ?? "");
      setWebsite(res.contractor.website ?? "");
      setServices(res.contractor.servicesOffered.join(", "));
      setNotes(res.contractor.notes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
      setContractor(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeProperty, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onSave() {
    if (!accessToken || !activeProperty || !id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateHomeContractor(
        accessToken,
        activeProperty.id,
        id,
        {
          displayName,
          companyName,
          phone,
          email,
          website,
          servicesOffered: services,
          notes,
          lastWorkedAt: contractor?.lastWorkedAt,
        },
      );
      setContractor(res.contractor);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function onAddWork() {
    if (!accessToken || !activeProperty || !id) return;
    setBusy(true);
    setError(null);
    try {
      await addHomeContractorWork(accessToken, activeProperty.id, id, {
        summary: workSummary,
        workDate: workDate.trim() || null,
      });
      setWorkSummary("");
      setWorkDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add work.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Remove this contractor?",
      "Their work history for this home will be removed too. Ledger assets stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void onDelete();
          },
        },
      ],
    );
  }

  async function onDelete() {
    if (!accessToken || !activeProperty || !id) return;
    setBusy(true);
    try {
      await deleteHomeContractor(accessToken, activeProperty.id, id);
      router.replace("/contractors/directory");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
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
        <Text style={styles.brand}>Contractor</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing((v) => !v)}
          style={styles.add}
        >
          <Text style={styles.addLabel}>{editing ? "Cancel" : "Edit"}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : !contractor ? (
          <Text style={styles.error}>{error || "Not found."}</Text>
        ) : editing ? (
          <>
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
            <Field
              label="Website"
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
            />
            <Field
              label="Other services (comma-separated)"
              value={services}
              onChangeText={setServices}
            />
            <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onSave();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.primaryLabel}>Save changes</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={confirmDelete}
              style={styles.dangerBtn}
            >
              <Text style={styles.dangerLabel}>Remove from directory</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>{contractor.displayName}</Text>
            {contractor.companyName ? (
              <Text style={styles.meta}>{contractor.companyName}</Text>
            ) : null}

            <Text style={styles.section}>Contact</Text>
            {contractor.phone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${contractor.phone}`)}
              >
                <Text style={styles.link}>{contractor.phone}</Text>
              </Pressable>
            ) : (
              <Text style={styles.copy}>No phone</Text>
            )}
            {contractor.email ? (
              <Pressable
                onPress={() =>
                  void Linking.openURL(`mailto:${contractor.email}`)
                }
              >
                <Text style={styles.link}>{contractor.email}</Text>
              </Pressable>
            ) : (
              <Text style={styles.copy}>No email</Text>
            )}
            {contractor.website ? (
              <Pressable
                onPress={() => {
                  const url = contractor.website!.startsWith("http")
                    ? contractor.website!
                    : `https://${contractor.website}`;
                  void Linking.openURL(url);
                }}
              >
                <Text style={styles.link}>{contractor.website}</Text>
              </Pressable>
            ) : null}

            <Text style={styles.section}>Other services</Text>
            <Text style={styles.copy}>
              {contractor.servicesOffered.length > 0
                ? contractor.servicesOffered.join(" · ")
                : "None listed"}
            </Text>

            {contractor.notes ? (
              <>
                <Text style={styles.section}>Notes</Text>
                <Text style={styles.copy}>{contractor.notes}</Text>
              </>
            ) : null}

            <Text style={styles.section}>Work for this home</Text>
            {contractor.work.length === 0 ? (
              <Text style={styles.copy}>No work logged yet.</Text>
            ) : (
              contractor.work.map((w) => (
                <View key={w.id} style={styles.workCard}>
                  <Text style={styles.workTitle}>{w.summary}</Text>
                  {w.workDate ? (
                    <Text style={styles.workMeta}>{w.workDate}</Text>
                  ) : null}
                  {w.workPerformed ? (
                    <Text style={styles.workBody}>{w.workPerformed}</Text>
                  ) : null}
                </View>
              ))
            )}

            <Text style={styles.section}>Add work</Text>
            <Field
              label="Summary"
              value={workSummary}
              onChangeText={setWorkSummary}
              placeholder="e.g. Furnace tune-up"
            />
            <Field
              label="Date (YYYY-MM-DD)"
              value={workDate}
              onChangeText={setWorkDate}
              placeholder="2026-11-21"
              autoCapitalize="none"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy || !workSummary.trim()}
              onPress={() => {
                void onAddWork();
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                (busy || !workSummary.trim()) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Add to history</Text>
            </Pressable>
          </>
        )}
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
  add: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 56,
    alignItems: "flex-end",
  },
  addLabel: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  body: { paddingHorizontal: 20, paddingBottom: 48 },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  meta: { color: colors.copy, marginBottom: 12 },
  section: {
    marginTop: 16,
    marginBottom: 6,
    color: colors.brandMuted,
    fontWeight: "700",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  copy: { color: colors.copy, lineHeight: 22 },
  link: {
    color: colors.brand,
    fontWeight: "600",
    marginBottom: 4,
    fontSize: 16,
  },
  workCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  workTitle: { color: colors.ink, fontWeight: "600" },
  workMeta: { color: colors.muted, marginTop: 4, fontSize: 13 },
  workBody: { color: colors.copy, marginTop: 6, lineHeight: 20 },
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
  error: { color: colors.danger, marginVertical: 12 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: colors.onBrand, fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryLabel: { color: colors.accent, fontWeight: "700" },
  dangerBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerLabel: { color: colors.danger, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.88 },
});
