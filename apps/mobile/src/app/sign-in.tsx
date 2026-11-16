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

/**
 * Everyday email + password sign-in stub (D13).
 * Starting face defaults to homeowner; contractor face comes in EPIC 1.
 */
export default function SignInScreen() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Redirect href="/home" />;
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email.trim(), password, "homeowner");
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

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
              <ActivityIndicator color="#F3F6F4" />
            ) : (
              <Text style={styles.primaryLabel}>
                {mode === "signup" ? "Create homeowner account" : "Sign in"}
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

        <Text style={styles.privacyNote}>
          We don&apos;t silently share your home data. You approve what becomes
          official. Contractor tools come later on the same login.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F3F6F4",
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
    color: "#1B3A2F",
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: "#3D5349",
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
    color: "#1B3A2F",
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
  error: {
    marginTop: 8,
    color: "#8B2E2E",
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 16,
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
  switchBtn: {
    marginTop: 16,
    alignItems: "center",
    padding: 8,
  },
  switchLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "500",
  },
  privacyNote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
});
