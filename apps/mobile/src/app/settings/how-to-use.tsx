import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { HOW_TO_USE_SECTIONS } from "@/lib/settingsContent";
import { colors } from "@/lib/theme";

/**
 * In-app “How to use” — documents current phone features in plain language.
 * Content lives in `@/lib/settingsContent` so agents update one place when
 * shipping user-facing features.
 */
export default function HowToUseScreen() {
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
        <Text style={styles.brand}>How to use</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {HOW_TO_USE_SECTIONS.map((section) => (
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
          <Text style={styles.linkLabel}>Read Privacy</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/settings/security")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkLabel}>Read Security</Text>
        </Pressable>
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
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.copy,
  },
  linkBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  linkLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
});
