import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  approveContractorSubmission,
  categoryLabel,
  declineContractorSubmission,
  getContractorSubmission,
  type PublicContractorSubmission,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Approve / decline an invite-link draft. Never auto-writes the ledger.
 */
export default function ContractorSubmissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken, activeProperty } = useAuth();
  const [submission, setSubmission] =
    useState<PublicContractorSubmission | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!accessToken || !activeProperty || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getContractorSubmission(
          accessToken,
          activeProperty.id,
          id,
        );
        if (cancelled) return;
        setSubmission(res.submission);
        const next: Record<number, boolean> = {};
        res.submission.draft.assetsSuggested.forEach((_, idx) => {
          next[idx] = true;
        });
        setSelected(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load submission.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeProperty, id]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onApprove() {
    if (!accessToken || !activeProperty || !submission) return;
    setBusy(true);
    setError(null);
    try {
      const res = await approveContractorSubmission(
        accessToken,
        activeProperty.id,
        submission.id,
        {
          selectedAssetIndexes: selectedIndexes,
          storeSummaryDocument: true,
        },
      );
      if (res.assets[0]) {
        router.replace(`/assets/${res.assets[0].id}`);
      } else {
        router.replace("/contractor-submissions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDecline() {
    Alert.alert(
      "Decline this submission?",
      "Nothing will be added to your ledger.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => {
            void onDecline();
          },
        },
      ],
    );
  }

  async function onDecline() {
    if (!accessToken || !activeProperty || !submission) return;
    setBusy(true);
    setError(null);
    try {
      await declineContractorSubmission(
        accessToken,
        activeProperty.id,
        submission.id,
      );
      router.replace("/contractor-submissions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decline failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Review submit" />

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : !submission ? (
          <Text style={styles.error}>{error || "Not found."}</Text>
        ) : (
          <>
            <Text style={styles.status}>
              Status: {submission.status}
              {submission.aiMode === "mock" ? " · draft (mock AI)" : " · AI draft"}
            </Text>
            <Text style={styles.title}>{submission.draft.summary}</Text>
            <Text style={styles.meta}>
              {submission.contractorName ||
                submission.draft.contractorName ||
                "Contractor"}
              {submission.companyName ? ` · ${submission.companyName}` : ""}
            </Text>

            <Text style={styles.section}>Work performed</Text>
            <Text style={styles.copy}>{submission.draft.workPerformed}</Text>

            {submission.notesText ? (
              <>
                <Text style={styles.section}>Original notes</Text>
                <Text style={styles.copy}>{submission.notesText}</Text>
              </>
            ) : null}

            {submission.media.length > 0 ? (
              <>
                <Text style={styles.section}>Attachments</Text>
                {submission.media.map((m) => (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    disabled={!m.signedUrl}
                    onPress={() => {
                      if (m.signedUrl) void Linking.openURL(m.signedUrl);
                    }}
                    style={styles.mediaRow}
                  >
                    <Text style={styles.mediaLabel}>
                      {m.kind === "audio" ? "Voice" : "Photo"} ·{" "}
                      {m.originalFilename}
                    </Text>
                    <Text style={styles.mediaHint}>
                      {m.signedUrl ? "Open ›" : "Unavailable"}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}

            <Text style={styles.section}>Suggested assets</Text>
            {submission.draft.assetsSuggested.length === 0 ? (
              <Text style={styles.copy}>
                No assets suggested. You can still approve to keep the summary
                note, or decline.
              </Text>
            ) : (
              submission.draft.assetsSuggested.map((asset, idx) => {
                const on = selected[idx] !== false;
                return (
                  <Pressable
                    key={`${asset.name}-${idx}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    disabled={submission.status !== "pending"}
                    onPress={() =>
                      setSelected((prev) => ({ ...prev, [idx]: !on }))
                    }
                    style={[styles.assetRow, on && styles.assetRowOn]}
                  >
                    <Text style={styles.assetCheck}>{on ? "✓" : "○"}</Text>
                    <View style={styles.assetText}>
                      <Text style={styles.assetName}>{asset.name}</Text>
                      <Text style={styles.assetMeta}>
                        {categoryLabel(
                          (asset.category || "other") as Parameters<
                            typeof categoryLabel
                          >[0],
                        )}
                        {asset.manufacturer ? ` · ${asset.manufacturer}` : ""}
                        {asset.model ? ` ${asset.model}` : ""}
                      </Text>
                      {asset.notes ? (
                        <Text style={styles.assetNotes}>{asset.notes}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {submission.status === "pending" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onApprove();
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
                    <Text style={styles.primaryLabel}>
                      Approve & save selected
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={confirmDecline}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryLabel}>Decline</Text>
                </Pressable>
              </>
            ) : null}
          </>
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
  body: { paddingHorizontal: 20, paddingBottom: 48 },
  status: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "capitalize",
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  meta: { color: colors.copy, marginBottom: 16 },
  section: {
    marginTop: 14,
    marginBottom: 6,
    color: colors.brandMuted,
    fontWeight: "700",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  copy: { color: colors.copy, lineHeight: 22 },
  mediaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  mediaLabel: { color: colors.ink, fontWeight: "600", flex: 1 },
  mediaHint: { color: colors.brandMuted, fontWeight: "600" },
  assetRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  assetRowOn: { borderColor: colors.brand },
  assetCheck: {
    color: colors.brand,
    fontWeight: "700",
    fontSize: 16,
    width: 20,
  },
  assetText: { flex: 1 },
  assetName: { color: colors.ink, fontWeight: "600" },
  assetMeta: { color: colors.muted, marginTop: 2, fontSize: 13 },
  assetNotes: { color: colors.copy, marginTop: 4, fontSize: 13 },
  error: { color: colors.danger, marginVertical: 12 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: colors.onBrand, fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryLabel: { color: colors.danger, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.88 },
});
