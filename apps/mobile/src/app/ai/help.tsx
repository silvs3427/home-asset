import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

/**
 * Single AI help entry: picture scan or ask how-to.
 * Opened from the persistent FAB — not from Home button clutter.
 */
export default function AiHelpScreen() {
  const router = useRouter();
  const { user, activeProperty } = useAuth();

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  const canUseHomeTools =
    user.activeFace === "homeowner" && Boolean(activeProperty);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backLabel}>Close</Text>
        </Pressable>
        <Text style={styles.brand}>AI help</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.body}>
        {user.activeFace === "contractor" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/ai/contractor-format")}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryLabel}>Format notes</Text>
          </Pressable>
        ) : canUseHomeTools ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/ai/scan")}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryLabel}>Scan a picture</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/ai/howto")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Ask how-to</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.empty}>Add a home first to use AI help.</Text>
        )}
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
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#F3F6F4",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 16,
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
  empty: {
    fontSize: 16,
    lineHeight: 24,
    color: "#3D5349",
  },
});
