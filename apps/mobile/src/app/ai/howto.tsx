import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
  aiAskHowto,
  listAssets,
  type AiHowToResponse,
  type PublicAsset,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";

/**
 * Grounded how-to Q&A against stored manuals + home asset facts.
 * Read-only — never writes the ledger.
 */
export default function AiHowtoScreen() {
  const { assetId: assetIdParam } = useLocalSearchParams<{
    assetId?: string;
  }>();
  const { user, accessToken, activeProperty } = useAuth();
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [assetId, setAssetId] = useState<string | null>(assetIdParam ?? null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AiHowToResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken || !activeProperty) {
        setLoadingAssets(false);
        return;
      }
      try {
        const res = await listAssets(accessToken, activeProperty.id);
        if (cancelled) return;
        setAssets(res.assets);
        // Keep deep-link assetId when valid; otherwise leave "all" / existing pick.
        if (
          assetIdParam &&
          res.assets.some((a) => a.id === assetIdParam)
        ) {
          setAssetId(assetIdParam);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load assets.");
        }
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeProperty, assetIdParam]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!activeProperty) return <Redirect href="/home" />;

  async function onAsk() {
    if (!accessToken || !activeProperty) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await aiAskHowto(accessToken, activeProperty.id, {
        question: question.trim(),
        assetId,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Ask how-to" />

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        {loadingAssets ? (
          <ActivityIndicator color="#002D72" />
        ) : (
          <>
            <Text style={styles.label}>Asset (optional filter)</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Pressable
                onPress={() => setAssetId(null)}
                style={[styles.chip, !assetId && styles.chipOn]}
              >
                <Text style={[styles.chipText, !assetId && styles.chipTextOn]}>
                  All on this home
                </Text>
              </Pressable>
              {assets.map((asset) => {
                const on = assetId === asset.id;
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => setAssetId(asset.id)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {asset.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={styles.label}>Your question</Text>
        <KeyboardAwareTextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="e.g. How do I start this safely outdoors?"
          placeholderTextColor="#8A9BB0"
          style={[styles.input, styles.multiline]}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy || question.trim().length < 3}
          onPress={() => {
            void onAsk();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            busy || question.trim().length < 3 ? styles.disabled : null,
          ]}
        >
          <Text style={styles.primaryLabel}>Ask</Text>
        </Pressable>

        {busy ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#002D72" />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result ? (
          <View style={styles.resultBox}>
            <Text style={styles.sectionLabel}>
              {result.refused
                ? "Outside Ask HomeAsset"
                : result.grounded
                  ? "Grounded answer"
                  : "Not enough sources"}{" "}
              · {result.mode}
            </Text>
            <Text style={styles.answer}>{result.answer}</Text>
            {result.citations.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Sources</Text>
                {result.citations.map((c) => (
                  <Text key={`${c.kind}-${c.id}`} style={styles.citation}>
                    · {c.title} ({c.kind})
                  </Text>
                ))}
              </>
            ) : null}
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
  copy: { fontSize: 16, lineHeight: 24, color: "#3D4F66", marginBottom: 12 },
  label: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    color: "#5C6E84",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chips: { gap: 8, paddingVertical: 10 },
  chip: {
    borderWidth: 1,
    borderColor: "#C5D0DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { borderColor: "#FF5910", backgroundColor: "#FF5910" },
  chipText: { color: "#FF5910", fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: "#FFFFFF" },
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
  multiline: { minHeight: 100 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#002D72",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
  error: { marginTop: 14, color: "#B42318", fontSize: 14 },
  resultBox: { marginTop: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5C6E84",
    marginBottom: 8,
  },
  answer: {
    fontSize: 15,
    lineHeight: 22,
    color: "#0B1B33",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D0DE",
    borderRadius: 10,
    padding: 14,
  },
  citation: { marginTop: 4, fontSize: 13, color: "#3D4F66" },
  privacy: { marginTop: 12, fontSize: 13, lineHeight: 18, color: "#5C6E84" },
  linkBtn: { marginTop: 24, paddingVertical: 8 },
  linkLabel: { color: "#1E4D96", fontSize: 14, fontWeight: "600" },
});
