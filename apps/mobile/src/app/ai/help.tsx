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
import { ScreenHeader } from "@/components/ScreenHeader";
import { aiAskHowto, type AiHowToResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pickAudioFile } from "@/lib/documents";
import { colors } from "@/lib/theme";

/**
 * HomeAsset entry — Talk or Text steering wheel for home / ledger work.
 * Typed or voice-note → how-to answer. Never writes the ledger.
 * Photo / purchase-screenshot drafts go through asset intake (approve-before-official).
 * No AI persona name; How-to lives in Settings; Support is separate.
 */
export default function HomeAssetEntryScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [result, setResult] = useState<AiHowToResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  const canUseHomeTools = Boolean(activeProperty && accessToken);

  async function onAttachVoice() {
    setError(null);
    try {
      const picked = await pickAudioFile();
      if (!picked) return;
      setVoiceName(picked.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach audio.");
    }
  }

  async function onAsk() {
    if (!accessToken || !activeProperty) return;
    const typed = prompt.trim();
    if (!typed && !voiceName) {
      setError("Type what you want to do, or attach a voice note.");
      return;
    }
    const question = voiceName
      ? typed
        ? `${typed}\n\n[Voice note attached: ${voiceName}]`
        : `Homeowner attached a voice note (${voiceName}). Please help with their home or equipment question from that note.`
      : typed;

    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await aiAskHowto(accessToken, activeProperty.id, {
        question,
        assetId: null,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer.");
    } finally {
      setBusy(false);
    }
  }

  const askDisabled =
    busy || !canUseHomeTools || (!prompt.trim() && !voiceName);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="HomeAsset" backLabel="Close" />

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        {!canUseHomeTools ? (
          <Text style={styles.empty}>Add a home first to use HomeAsset.</Text>
        ) : (
          <>
            <Text style={styles.title}>Talk or Text</Text>

            <KeyboardAwareTextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="What do you want to do?"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.multiline]}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onAttachVoice();
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryLabel}>
                {voiceName ? "Change voice note" : "Attach voice note"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                router.push("/ai/asset-intake");
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryLabel}>
                Draft from photo or screenshot
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                router.push({
                  pathname: "/ai/asset-intake",
                  params: { mode: "purchase" },
                });
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.secondaryLabel}>
                Draft from order email or PDF
              </Text>
            </Pressable>
            {voiceName ? (
              <View style={styles.voiceRow}>
                <Text style={styles.meta} numberOfLines={1}>
                  {voiceName}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setVoiceName(null)}
                >
                  <Text style={styles.clearLabel}>Remove</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={askDisabled}
              onPress={() => {
                void onAsk();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                askDisabled && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.primaryLabel}>Ask</Text>
              )}
            </Pressable>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {result ? (
              <View style={styles.answerBox}>
                <Text style={styles.answerLabel}>
                  {result.refused ? "Outside HomeAsset" : "Answer"}
                </Text>
                <Text style={styles.answer}>{result.answer}</Text>
                {result.citations.length > 0 ? (
                  <View style={styles.sources}>
                    <Text style={styles.answerLabel}>Sources</Text>
                    {result.citations.map((citation) => (
                      <Text
                        key={`${citation.kind}-${citation.id}`}
                        style={styles.sourceLine}
                      >
                        · {citation.title} ({citation.kind})
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    paddingVertical: 8,
    paddingHorizontal: 4,
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
  spacer: {
    minWidth: 56,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: {
    minHeight: 140,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    marginTop: 12,
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
  voiceRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  meta: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
  },
  clearLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
  empty: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.copy,
  },
  error: {
    marginTop: 14,
    color: colors.danger,
    fontSize: 14,
  },
  answerBox: {
    marginTop: 24,
  },
  answerLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
  answer: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  sources: {
    marginTop: 16,
  },
  sourceLine: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.copy,
  },
});
