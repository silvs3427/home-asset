import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { SECURITY_SECTIONS } from "@/lib/settingsContent";

/**
 * Security explanations in plain language (no stack jargon for homeowners).
 * Update `@/lib/settingsContent` SECURITY_SECTIONS when protections change.
 */
export default function SecurityScreen() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/sign-in" />;
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
        <Text style={styles.brand}>Security</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {SECURITY_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/privacy")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkLabel}>Related: Privacy</Text>
        </Pressable>
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
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#14241D",
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#3D5349",
  },
  linkBtn: {
    marginTop: 24,
    paddingVertical: 8,
  },
  linkLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
});
