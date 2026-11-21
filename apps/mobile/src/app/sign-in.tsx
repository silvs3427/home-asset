import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { API_BASE_URL, SUPABASE_CONFIGURED } from "@/lib/config";
import { colors } from "@/lib/theme";

/**
 * Everyday email + password sign-in.
 * HomeAsset is homeowner-only — signup never offers a contractor role.
 * With Supabase URL + anon key: phone uses Supabase Auth directly (LightLift-style;
 * no LAN API). Without Supabase: local Hono + SQLite demo path.
 */
export default function SignInScreen() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"network" | "auth" | "other" | null>(
    null,
  );

  if (user) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    setError(null);
    setErrorKind(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, "homeowner");
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorKind(
          err.kind === "network" || err.kind === "auth" ? err.kind : "other",
        );
        setError(err.message);
      } else {
        setErrorKind("other");
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
      >
        <Text style={styles.brand}>HomeAsset</Text>
        <Text style={styles.tagline}>
          Your home&apos;s lasting record — on your phone, under your control.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#7A8A82"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            secureTextEntry
            autoComplete={mode === "signup" ? "new-password" : "password"}
            placeholder="At least 8 characters"
            placeholderTextColor="#7A8A82"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorKind}>
                {errorKind === "network"
                  ? SUPABASE_CONFIGURED
                    ? "Network — phone cannot reach Supabase"
                    : "Network — phone cannot reach the API"
                  : errorKind === "auth"
                    ? "Sign-in rejected"
                    : "Could not continue"}
              </Text>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onSubmit}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryLabel}>
                {mode === "signup" ? "Create account" : "Sign in"}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setMode(mode === "signup" ? "login" : "signup");
            }}
            style={styles.switchBtn}
          >
            <Text style={styles.switchLabel}>
              {mode === "signup"
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.apiHint}>
          {SUPABASE_CONFIGURED
            ? "Cloud account (Supabase). No laptop API or Wi‑Fi IP needed for sign-up / sign-in / AI. For testing, Confirm email should be OFF in the Supabase Auth settings."
            : API_BASE_URL
              ? `Local demo API (no Supabase on this install). Target: ${API_BASE_URL}\nPhone preview should use Supabase instead — set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY in Expo preview env and rebuild. Never use localhost on a phone.`
              : "No cloud connection on this install. Add EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY to the Expo preview environment and rebuild the preview APK."}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    justifyContent: "center",
  },
  brand: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.brand,
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: colors.copy,
    maxWidth: 320,
  },
  form: {
    marginTop: 36,
    gap: 8,
  },
  label: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
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
  errorBox: {
    marginTop: 8,
    gap: 4,
  },
  errorKind: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryBtn: {
    marginTop: 16,
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
  switchBtn: {
    marginTop: 16,
    alignItems: "center",
    padding: 8,
  },
  switchLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  apiHint: {
    marginTop: 24,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
});
