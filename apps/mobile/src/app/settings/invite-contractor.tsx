import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createContractorInvite,
  formatPropertyAddress,
  listContractorInvites,
  listContractorSubmissions,
  revokeContractorInvite,
  type PublicContractorInvite,
  type PublicProperty,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

/** Home name / address for share body + email subject. */
function workLocationLabel(property: PublicProperty): string {
  const name = property.name?.trim() || "";
  const address = formatPropertyAddress(property).trim();
  if (name && address) {
    const nameInAddress = address.toLowerCase().includes(name.toLowerCase());
    return nameInAddress ? address : `${name} — ${address}`;
  }
  return address || name || "your home";
}

function shareInvite(property: PublicProperty, inviteUrl: string) {
  const where = workLocationLabel(property);
  const subject = `HomeAsset work submit — ${where}`;
  return Share.share(
    {
      message: `Submit finished work for ${where} in HomeAsset:\n${inviteUrl}`,
      url: inviteUrl,
      title: subject,
    },
    {
      subject,
      dialogTitle: "Share contractor invite",
    },
  );
}

/**
 * Homeowner creates/shares a submission link for a non-LightLift pro.
 * Pros open the link in a browser — no contractor face in this app.
 */
export default function InviteContractorScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [label, setLabel] = useState("");
  const [invites, setInvites] = useState<PublicContractorInvite[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty || !SUPABASE_CONFIGURED) {
      setInvites([]);
      setPendingCount(0);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [inviteRes, subRes] = await Promise.all([
        listContractorInvites(accessToken, activeProperty.id),
        listContractorSubmissions(accessToken, activeProperty.id, {
          status: "pending",
        }),
      ]);
      setInvites(inviteRes.invites);
      setPendingCount(subRes.submissions.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invites.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeProperty]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onCreate() {
    if (!accessToken || !activeProperty) return;
    setBusy(true);
    setError(null);
    try {
      const { invite } = await createContractorInvite(
        accessToken,
        activeProperty.id,
        { label: label.trim() || null, expiresInDays: 14 },
      );
      setLabel("");
      await shareInvite(activeProperty, invite.inviteUrl);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create invite link.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onShare(invite: PublicContractorInvite) {
    if (!activeProperty) return;
    try {
      await shareInvite(activeProperty, invite.inviteUrl);
    } catch {
      // user cancelled
    }
  }

  function confirmRevoke(invite: PublicContractorInvite) {
    Alert.alert(
      "Revoke this link?",
      "The contractor will not be able to submit with it anymore.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => {
            void onRevoke(invite);
          },
        },
      ],
    );
  }

  async function onRevoke(invite: PublicContractorInvite) {
    if (!accessToken || !activeProperty) return;
    setBusy(true);
    setError(null);
    try {
      await revokeContractorInvite(
        accessToken,
        activeProperty.id,
        invite.id,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke.");
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
        <Text style={styles.brand}>Invite a contractor</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!SUPABASE_CONFIGURED ? (
          <Text style={styles.error}>
            Invite links need the cloud connection on this phone (Supabase URL
            + key). Local demo mode does not host the submit page.
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/contractor-submissions")}
          style={({ pressed }) => [
            styles.pendingBanner,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.pendingTitle}>
            {pendingCount > 0
              ? `${pendingCount} waiting for your review`
              : "No pending submissions"}
          </Text>
          <Text style={styles.pendingHint}>Review drafts ›</Text>
        </Pressable>

        <Text style={styles.label}>Optional note on the link</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. HVAC tune-up"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          maxLength={80}
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy || !SUPABASE_CONFIGURED}
          onPress={() => {
            void onCreate();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            (busy || !SUPABASE_CONFIGURED) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryLabel}>Create & share link</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionLabel}>Your links</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : invites.length === 0 ? (
          <Text style={styles.empty}>No invite links yet.</Text>
        ) : (
          invites.map((invite) => {
            const revoked = Boolean(invite.revokedAt);
            const expired =
              Boolean(invite.expiresAt) &&
              new Date(invite.expiresAt!).getTime() < Date.now();
            return (
              <View key={invite.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {invite.label || "Submission link"}
                </Text>
                <Text style={styles.cardMeta}>
                  {revoked
                    ? "Revoked"
                    : expired
                      ? "Expired"
                      : invite.expiresAt
                        ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        : "Active"}
                </Text>
                {!revoked && !expired ? (
                  <View style={styles.cardActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void onShare(invite);
                      }}
                      style={styles.secondaryBtn}
                    >
                      <Text style={styles.secondaryLabel}>Share</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => confirmRevoke(invite)}
                      style={styles.dangerBtn}
                    >
                      <Text style={styles.dangerLabel}>Revoke</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
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
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  pendingBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  pendingTitle: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  pendingHint: { color: colors.brandMuted, marginTop: 4, fontWeight: "600" },
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
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryLabel: { color: colors.onBrand, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  error: { color: colors.danger, marginBottom: 12 },
  sectionLabel: {
    marginTop: 12,
    marginBottom: 8,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  empty: { color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  cardMeta: { color: colors.muted, marginTop: 4, fontSize: 13 },
  cardActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  secondaryLabel: { color: colors.brand, fontWeight: "600" },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  dangerLabel: { color: colors.danger, fontWeight: "600" },
});
