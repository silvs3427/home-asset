import { Redirect } from "expo-router";
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
import { aiAskSupport, type AiSupportResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * AI customer support — Settings → Support.
 * Warm app/account help; distinct from HomeAsset ledger entry.
 * No long instructional fluff — How to use owns the guide.
 */
export default function SupportScreen() {
  const { user, accessToken, activeProperty } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AiSupportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  async function onSend() {
    if (!accessToken) return;
    const question = prompt.trim();
    if (!question) {
      setError("Type a short message.");
      return;
    }

    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const homeLabel = activeProperty
        ? [
            activeProperty.addressLine1,
            activeProperty.city,
            activeProperty.region,
          ]
            .filter(Boolean)
            .join(", ")
        : null;
      const res = await aiAskSupport(accessToken, {
        question,
        propertyId: activeProperty?.id ?? null,
        homeLabel,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach Support.");
    } finally {
      setBusy(false);
    }
  }

  const sendDisabled = busy || !accessToken || !prompt.trim();

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Support" />

      <KeyboardAwareScroll contentContainerStyle={styles.body}>
        <Text style={styles.title}>We're listening</Text>

        <KeyboardAwareTextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What's going wrong? What were you trying to do?"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.multiline]}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />

        <Pressable
          accessibilityRole="button"
          disabled={sendDisabled}
          onPress={() => {
            void onSend();
          }}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            sendDisabled && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryLabel}>Send</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result ? (
          <View style={styles.answerBox}>
            <Text style={styles.answerLabel}>
              {result.refused
                ? "Outside Support"
                : result.escalate
                  ? "Need a person"
                  : "Reply"}
            </Text>
            <Text style={styles.answer}>{result.answer}</Text>
            {result.nextSteps.length > 0 ? (
              <View style={styles.steps}>
                <Text style={styles.answerLabel}>Next steps</Text>
                {result.nextSteps.map((step, index) => (
                  <Text key={`${index}-${step}`} style={styles.stepLine}>
                    {index + 1}. {step}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
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
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
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
  steps: {
    marginTop: 16,
  },
  stepLine: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: colors.copy,
  },
});
