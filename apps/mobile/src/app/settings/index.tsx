import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

/**
 * Settings: Add home, guide (How to use / Privacy / Security),
 * alert delivery prefs, face switch, sign out.
 * AI scan/how-to: persistent FAB. Permits intake: not a primary CTA.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, setFace } = useAuth();
  const [faceBusy, setFaceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  const isHomeownerFace = user.activeFace === "homeowner";

  async function onToggleFace() {
    setError(null);
    setFaceBusy(true);
    try {
      await setFace(isHomeownerFace ? "contractor" : "homeowner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch face.");
    } finally {
      setFaceBusy(false);
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
        <Text style={styles.brand}>Settings</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {isHomeownerFace ? (
          <>
            <Text style={styles.sectionLabel}>Homes</Text>
            <NavRow
              label="Add another home"
              onPress={() => router.push("/add-home")}
            />
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Guide</Text>
        <NavRow
          label="How to use"
          onPress={() => router.push("/settings/how-to-use")}
        />
        <NavRow
          label="Privacy"
          onPress={() => router.push("/settings/privacy")}
        />
        <NavRow
          label="Security"
          onPress={() => router.push("/settings/security")}
        />

        <Text style={styles.sectionLabel}>Alert delivery</Text>
        <NavRow
          label="Push & in-app"
          onPress={() => router.push("/notifications/preferences")}
        />

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.meta}>
          <Text style={styles.metaLabel}>Signed in as</Text>
          <Text style={styles.metaValue}>{user.email}</Text>
          <Text style={styles.metaFace}>
            Face: {isHomeownerFace ? "Homeowner" : "Contractor"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={faceBusy}
          onPress={() => {
            void onToggleFace();
          }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
          ]}
        >
          {faceBusy ? (
            <ActivityIndicator color="#1B3A2F" />
          ) : (
            <Text style={styles.secondaryLabel}>
              {isHomeownerFace
                ? "Switch to contractor face"
                : "Switch to homeowner face"}
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            styles.signOutBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>Sign out</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NavRow(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
    >
      <Text style={styles.navLabel}>{props.label}</Text>
      <Text style={styles.navChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F3F6F4",
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
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  spacer: {
    minWidth: 56,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 88,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5A6E64",
  },
  navRow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C5D2CB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#14241D",
  },
  navChevron: {
    fontSize: 22,
    color: "#2F5B4A",
    fontWeight: "300",
  },
  meta: {
    gap: 4,
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5A6E64",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 16,
    color: "#14241D",
  },
  metaFace: {
    marginTop: 4,
    fontSize: 14,
    color: "#5A6E64",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutBtn: {
    marginTop: 12,
  },
  secondaryLabel: {
    color: "#1B3A2F",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  error: {
    marginTop: 16,
    color: "#8B2E2E",
    fontSize: 14,
  },
});
