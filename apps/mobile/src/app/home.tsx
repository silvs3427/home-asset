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
 * Homeowner home shell: current home, thin switcher, and path to Add home.
 * Ledger content (assets/docs) arrives in later epics — always property-scoped.
 */
export default function HomeShellScreen() {
  const router = useRouter();
  const {
    user,
    properties,
    activeProperty,
    signOut,
    selectHome,
    setFace,
  } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
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
        <Text style={styles.brand}>HomeAsset</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut();
          }}
          style={styles.signOut}
        >
          <Text style={styles.signOutLabel}>Sign out</Text>
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
                <Text style={styles.copy}>
                  {formatPropertyAddress(activeProperty)}
                </Text>
                <Text style={styles.ledgerNote}>
                  This home&apos;s ledger is empty for now. Assets, documents, and
                  recalls will live here — scoped to this home only.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Add your first home</Text>
                <Text style={styles.copy}>
                  HomeAsset keeps each home&apos;s record separate. Start with one
                  address; you can add another later.
                </Text>
              </>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/add-home")}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>
                {activeProperty ? "Add another home" : "Add home"}
              </Text>
            </Pressable>

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
            <Text style={styles.title}>Contractor face</Text>
            <Text style={styles.copy}>
              CRM-lite submit tools come later. Your homes stay on the homeowner
              face — switch back anytime on this same login.
            </Text>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.meta}>
          <Text style={styles.metaLabel}>Signed in as</Text>
          <Text style={styles.metaValue}>{user.email}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={faceBusy}
          onPress={() => {
            void onToggleFace();
          }}
          style={styles.faceSwitch}
        >
          {faceBusy ? (
            <ActivityIndicator color="#2F5B4A" />
          ) : (
            <Text style={styles.faceSwitchLabel}>
              {isHomeownerFace
                ? "Switch to contractor face"
                : "Switch to homeowner face"}
            </Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Privacy: signed-in only. Each home&apos;s data stays scoped to that home.
          No silent sharing. You decide what becomes official.
        </Text>
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
  signOut: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  signOutLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
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
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#3D5349",
    maxWidth: 420,
  },
  ledgerNote: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: "#5A6E64",
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
  meta: {
    marginTop: 28,
    gap: 4,
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
  faceSwitch: {
    marginTop: 16,
    paddingVertical: 10,
  },
  faceSwitchLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  footnote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
});
