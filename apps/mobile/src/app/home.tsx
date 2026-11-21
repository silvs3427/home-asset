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

/**
 * Current home + primary next steps. Secondary tools and Add another home
 * live in Settings; AI scan/how-to via the persistent FAB.
 */
export default function HomeShellScreen() {
  const router = useRouter();
  const { user, properties, activeProperty, selectHome } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  const isHomeownerFace = user.activeFace === "homeowner";

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
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings")}
          style={styles.settingsBtn}
        >
          <Text style={styles.settingsLabel}>Settings</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>
          {isHomeownerFace ? "Homeowner" : "Contractor"}
        </Text>

        {isHomeownerFace ? (
          <>
            {activeProperty ? (
              <>
                <Text style={styles.title}>{activeProperty.name}</Text>
                <Text style={styles.address}>
                  {formatPropertyAddress(activeProperty)}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/assets")}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryLabel}>Assets</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/documents")}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryLabel}>Documents</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/reminders")}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryLabel}>Alerts</Text>
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
                        <ActivityIndicator color="#1B3A2F" />
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
          </>
        ) : (
          <>
            <Text style={styles.title}>Contractor</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/ai/contractor-format")}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>Format notes</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F3F6F4",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  settingsBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  settingsLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 88,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#5A6E64",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: "#14241D",
    letterSpacing: -0.4,
  },
  address: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
    color: "#3D5349",
  },
  primaryBtn: {
    marginTop: 24,
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
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#1B3A2F",
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
    color: "#5A6E64",
    marginBottom: 4,
  },
  homeRow: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  homeRowSelected: {
    borderColor: "#1B3A2F",
  },
  homeRowText: {
    flex: 1,
    gap: 2,
  },
  homeRowName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#14241D",
  },
  homeRowAddress: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  homeRowBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  homeRowAction: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2F5B4A",
  },
  error: {
    marginTop: 16,
    color: "#8B2E2E",
    fontSize: 14,
  },
});
