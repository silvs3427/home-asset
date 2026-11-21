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
import type { AppFace } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Settings: Add home, guide (How to use / Privacy / Security),
 * alert delivery prefs, role switch or enroll, sign out.
 * Face switch only when both roles are enrolled; otherwise enroll first.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, setFace, enrollFace } = useAuth();
  const [faceBusy, setFaceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  const isHomeownerFace = user.activeFace === "homeowner";
  const faces = user.faces ?? [];
  const hasHomeowner = faces.includes("homeowner");
  const hasContractor = faces.includes("contractor");
  const hasBothRoles = hasHomeowner && hasContractor;
  const otherFace: AppFace = isHomeownerFace ? "contractor" : "homeowner";

  async function onToggleFace() {
    setError(null);
    setFaceBusy(true);
    try {
      await setFace(otherFace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch face.");
    } finally {
      setFaceBusy(false);
    }
  }

  async function onEnrollOtherRole() {
    setError(null);
    setFaceBusy(true);
    try {
      await enrollFace(otherFace);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not enroll that role.",
      );
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
            Role: {isHomeownerFace ? "Homeowner" : "Contractor"}
            {hasBothRoles ? " (both enrolled)" : ""}
          </Text>
        </View>

        {hasBothRoles ? (
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
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Text style={styles.secondaryLabel}>
                {isHomeownerFace
                  ? "Switch to contractor"
                  : "Switch to homeowner"}
              </Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.enrollBlock}>
            <Text style={styles.enrollCopy}>
              Homeowner and contractor are separate roles. You signed up as{" "}
              {isHomeownerFace ? "homeowner" : "contractor"} only. Enroll the
              other role here when you need it — then you can switch back and
              forth.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={faceBusy}
              onPress={() => {
                void onEnrollOtherRole();
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              {faceBusy ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Text style={styles.secondaryLabel}>
                  {isHomeownerFace
                    ? "Enroll as contractor"
                    : "Enroll as homeowner"}
                </Text>
              )}
            </Pressable>
          </View>
        )}

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
    paddingTop: 12,
    paddingBottom: 40,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  navRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.ink,
  },
  navChevron: {
    fontSize: 22,
    color: colors.brandMuted,
    fontWeight: "300",
  },
  meta: {
    gap: 4,
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 16,
    color: colors.ink,
  },
  metaFace: {
    marginTop: 4,
    fontSize: 14,
    color: colors.muted,
  },
  enrollBlock: {
    gap: 12,
  },
  enrollCopy: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutBtn: {
    marginTop: 12,
  },
  secondaryLabel: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  error: {
    marginTop: 16,
    color: colors.danger,
    fontSize: 14,
  },
});
