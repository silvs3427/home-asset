import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

type Props = {
  title: string;
  /** Defaults to "Back". Use "Close" or "Skip" when that matches the screen. */
  backLabel?: string;
  onBack?: () => void;
  /** Optional action shown to the left of Home (e.g. Save, Edit, +). */
  right?: ReactNode;
};

/**
 * Shared top bar: Back · title · Home (Mets orange).
 * Home always returns to the homeowner home screen from anywhere.
 */
export function ScreenHeader({
  title,
  backLabel = "Back",
  onBack,
  right,
}: Props) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack ?? (() => router.back())}
        style={styles.side}
      >
        <Text style={styles.backLabel}>{backLabel}</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>
        {right}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Home"
          onPress={() => {
            router.replace("/home");
          }}
          style={styles.homeBtn}
        >
          <Text style={styles.homeLabel}>Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  side: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 56,
  },
  backLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.brand,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    minWidth: 56,
  },
  homeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  homeLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
  },
});
