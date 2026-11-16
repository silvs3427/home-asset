import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

/**
 * Empty homeowner-facing shell.
 * Grows into assets, docs, recalls, and a switchable contractor face later.
 */
export default function HomeShellScreen() {
  const { user, signOut } = useAuth();

  if (!user) {
    return <Redirect href="/sign-in" />;
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

      <View style={styles.body}>
        <Text style={styles.eyebrow}>Homeowner</Text>
        <Text style={styles.title}>Your home ledger starts here</Text>
        <Text style={styles.copy}>
          This is an empty shell for EPIC 0. Next we&apos;ll add homes, assets,
          documents, and an easy way for contractors to submit work — always with
          your approval.
        </Text>

        <View style={styles.meta}>
          <Text style={styles.metaLabel}>Signed in as</Text>
          <Text style={styles.metaValue}>{user.email}</Text>
          <Text style={styles.metaLabel}>Active face</Text>
          <Text style={styles.metaValue}>{user.activeFace}</Text>
        </View>

        <Text style={styles.footnote}>
          Privacy: no silent sharing. Least ledger data to contractors. You decide
          what becomes official.
        </Text>
      </View>
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
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
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
  meta: {
    marginTop: 32,
    gap: 4,
  },
  metaLabel: {
    marginTop: 10,
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
  footnote: {
    marginTop: "auto",
    marginBottom: 24,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
});
