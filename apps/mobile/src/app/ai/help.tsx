import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/**
 * Ask HomeAsset — single AI entry: picture scan or how-to.
 * Opened from Home’s top button (not a floating FAB).
 */
export default function AskHomeAssetScreen() {
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
        <Text style={styles.brand}>Ask HomeAsset</Text>
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
          <Text style={styles.empty}>Add a home first to use Ask HomeAsset.</Text>
        )}
      </View>
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
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 16,
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
  empty: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.copy,
  },
});
