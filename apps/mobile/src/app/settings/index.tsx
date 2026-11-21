import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Settings: Add home, guide (How to use / Privacy / Security),
 * alert delivery prefs, sign out.
 * HomeAsset is homeowner-only — no face switch.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel}>Homes</Text>
        <NavRow
          label="Add another home"
          onPress={() => router.push("/add-home")}
        />

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
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>Sign out</Text>
        </Pressable>
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
  secondaryBtn: {
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
  pressed: {
    opacity: 0.9,
  },
});
