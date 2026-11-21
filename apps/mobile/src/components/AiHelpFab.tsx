import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";

/**
 * Persistent AI help control — reachable from any signed-in screen.
 * Opens one entry point for product scan or how-to ask (no home clutter).
 */
export function AiHelpFab() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { ready, user } = useAuth();

  const onAiFlow =
    pathname === "/ai/help" ||
    pathname === "/ai/scan" ||
    pathname === "/ai/howto" ||
    pathname === "/ai/contractor-format";

  const hide =
    !ready ||
    !user ||
    pathname === "/" ||
    pathname === "/sign-in" ||
    onAiFlow;

  if (hide) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 8 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AI help"
        onPress={() => router.push("/ai/help")}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Text style={styles.fabLabel}>AI</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 20,
    zIndex: 50,
    elevation: 50,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1B3A2F",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#14241D",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabLabel: {
    color: "#F3F6F4",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.9,
  },
});
