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
import { formatPropertyAddress } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Homeowner home:
 * Ask HomeAsset → View Assets → Add or Update an Asset → Notifications → Settings.
 * HomeAsset is homeowner-only — no contractor face / mode on this screen.
 */
export default function HomeShellScreen() {
  const router = useRouter();
  const { user, properties, activeProperty, selectHome } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  async function onSelectHome(propertyId: string) {
    if (propertyId === activeProperty?.id) return;
    setError(null);
    setSwitchingId(propertyId);
    try {
      await selectHome(propertyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch homes.");
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>HomeAsset</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>Homeowner</Text>

        {activeProperty ? (
          <>
            <Text style={styles.title}>{activeProperty.name}</Text>
            <Text style={styles.address}>
              {formatPropertyAddress(activeProperty)}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/ai/help")}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>Ask HomeAsset</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/assets")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>View Assets</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/ai/add-update")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Add or Update an Asset</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/reminders")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Notifications</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/settings")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Settings</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Add your first home</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/add-home")}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>Add home</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/settings")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Settings</Text>
            </Pressable>
          </>
        )}

        {properties.length > 1 ? (
          <View style={styles.switcher}>
            <Text style={styles.sectionLabel}>Your homes</Text>
            {properties.map((property) => {
              const selected = property.id === activeProperty?.id;
              const busy = switchingId === property.id;
              return (
                <Pressable
                  key={property.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onSelectHome(property.id);
                  }}
                  style={[
                    styles.homeRow,
                    selected && styles.homeRowSelected,
                  ]}
                >
                  <View style={styles.homeRowText}>
                    <Text style={styles.homeRowName}>{property.name}</Text>
                    <Text style={styles.homeRowAddress}>
                      {formatPropertyAddress(property)}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : selected ? (
                    <Text style={styles.homeRowBadge}>Current</Text>
                  ) : (
                    <Text style={styles.homeRowAction}>Switch</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brand: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.brand,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  address: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
    color: colors.copy,
  },
  primaryBtn: {
    marginTop: 24,
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
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  switcher: {
    marginTop: 28,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 4,
  },
  homeRow: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  homeRowSelected: {
    borderColor: colors.brand,
  },
  homeRowText: {
    flex: 1,
    gap: 2,
  },
  homeRowName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  homeRowAddress: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  homeRowBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
  },
  homeRowAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  error: {
    marginTop: 16,
    color: colors.danger,
    fontSize: 14,
  },
});
