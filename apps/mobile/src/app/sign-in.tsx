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
import { ApiError, type AppFace } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

/**
 * Everyday email + password sign-in (D13).
 * Talks to the HomeAsset API. When Supabase is configured on the API,
 * Auth uses Supabase email/password; otherwise local SQLite bcrypt.
 * Sign-up asks homeowner or contractor on the same login path.
 */
export default function SignInScreen() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [startingFace, setStartingFace] = useState<AppFace>("homeowner");
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
        await signUp(email.trim(), password, startingFace);
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

          {mode === "signup" ? (
            <View style={styles.faceBlock}>
              <Text style={styles.label}>I&apos;m signing up as</Text>
              <View style={styles.faceRow}>
                {(
                  [
                    ["homeowner", "Homeowner"],
                    ["contractor", "Contractor"],
                  ] as const
                ).map(([value, label]) => {
                  const selected = startingFace === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      onPress={() => setStartingFace(value)}
                      style={[styles.faceChip, selected && styles.faceChipOn]}
                    >
                      <Text
                        style={[
                          styles.faceChipLabel,
                          selected && styles.faceChipLabelOn,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorKind}>
                {errorKind === "network"
                  ? "Network — phone cannot reach the API"
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
              <ActivityIndicator color="#F3F6F4" />
            ) : (
              <Text style={styles.primaryLabel}>
                {mode === "signup"
                  ? startingFace === "homeowner"
                    ? "Create homeowner account"
                    : "Create contractor account"
                  : "Sign in"}
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
          Local SQLite API (no Supabase). Target: {API_BASE_URL}
          {"\n"}
          Physical phone? Set EXPO_PUBLIC_API_URL to your PC&apos;s LAN IP in
          apps/mobile/.env, then restart Expo with npx expo start --go -c.
        </Text>

        <Text style={styles.privacyNote}>
          We don&apos;t silently share your home data. You approve what becomes
          official. One login can use both faces later.
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
  faceBlock: {
    marginTop: 4,
  },
  faceRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  faceChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  faceChipOn: {
    borderColor: "#1B3A2F",
    backgroundColor: "#1B3A2F",
  },
  faceChipLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1B3A2F",
  },
  faceChipLabelOn: {
    color: "#F3F6F4",
  },
  errorBox: {
    marginTop: 8,
    gap: 4,
  },
  errorKind: {
    color: "#8B2E2E",
    fontSize: 13,
    fontWeight: "700",
  },
  error: {
    color: "#8B2E2E",
    fontSize: 14,
    lineHeight: 20,
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
  apiHint: {
    marginTop: 24,
    fontSize: 12,
    lineHeight: 17,
    color: "#5A6E64",
  },
  privacyNote: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
});
