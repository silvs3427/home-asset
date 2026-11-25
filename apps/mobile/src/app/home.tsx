import { Redirect, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
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
 * Lived-in homeowner home (craft, not SaaS):
 * soft atmosphere + home name + HomeAsset primary entry + quiet rows.
 * HomeAsset → View Assets → Add or Update an Asset → Notifications → Settings.
 * Contractors live under Settings. No contractor face / mode.
 */
export default function HomeShellScreen() {
  const router = useRouter();
  const { user, properties, activeProperty, selectHome } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [homesOpen, setHomesOpen] = useState(false);
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
      setHomesOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch homes.");
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.atmosphere} pointerEvents="none">
        <View style={styles.atmosphereGlow} />
        <View style={styles.atmosphereWarm} />
        <View style={styles.atmosphereFloor} />
      </View>

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.houseMark} accessibilityElementsHidden>
              <View style={styles.houseRoof} />
              <View style={styles.houseBody} />
            </View>
            <Text style={styles.brand}>
              <Text style={styles.brandHome}>Home</Text>
              <Text style={styles.brandAsset}>Asset</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.menuBtn,
              pressed && styles.pressed,
            ]}
            hitSlop={8}
          >
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </Pressable>
        </View>

        {activeProperty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              properties.length > 1
                ? `Current home ${activeProperty.name}. Tap to switch.`
                : activeProperty.name
            }
            disabled={properties.length < 2}
            onPress={() => {
              if (properties.length > 1) setHomesOpen((open) => !open);
            }}
            style={({ pressed }) => [
              styles.homeNameHit,
              pressed && properties.length > 1 && styles.pressed,
            ]}
          >
            <View style={styles.pin}>
              <View style={styles.pinHead} />
              <View style={styles.pinPoint} />
            </View>
            <Text style={styles.homeName} numberOfLines={1}>
              {activeProperty.name}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            {activeProperty ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="HomeAsset"
                  onPress={() => router.push("/ai/help")}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.chatIcon}>
                    <View style={styles.chatDot} />
                    <View style={styles.chatDot} />
                    <View style={styles.chatDot} />
                  </View>
                  <Text style={styles.primaryLabel}>HomeAsset</Text>
                </Pressable>

                <View style={styles.rowList}>
                  <QuietRow
                    label="View Assets"
                    icon={<HomeGlyph />}
                    onPress={() => router.push("/assets")}
                  />
                  <QuietRow
                    label="Add or Update an Asset"
                    icon={<SeatGlyph />}
                    onPress={() => router.push("/ai/add-update")}
                  />
                  <QuietRow
                    label="Notifications"
                    icon={<BellGlyph />}
                    onPress={() => router.push("/reminders")}
                  />
                  <QuietRow
                    label="Settings"
                    icon={<GearGlyph />}
                    onPress={() => router.push("/settings")}
                    last
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Add your first home</Text>
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
                <View style={styles.rowList}>
                  <QuietRow
                    label="Settings"
                    icon={<GearGlyph />}
                    onPress={() => router.push("/settings")}
                    last
                  />
                </View>
              </>
            )}

            {homesOpen && properties.length > 1 ? (
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
        </View>
      </SafeAreaView>
    </View>
  );
}

function QuietRow(props: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.quietRow,
        !props.last && styles.quietRowBorder,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.quietIcon}>{props.icon}</View>
      <Text style={styles.quietLabel}>{props.label}</Text>
      <Text style={styles.quietChevron}>›</Text>
    </Pressable>
  );
}

function HomeGlyph() {
  return (
    <View style={styles.glyphHome}>
      <View style={styles.glyphRoof} />
      <View style={styles.glyphBody} />
    </View>
  );
}

function SeatGlyph() {
  return (
    <View style={styles.glyphSeat}>
      <View style={styles.glyphSeatBack} />
      <View style={styles.glyphSeatBase} />
    </View>
  );
}

function BellGlyph() {
  return (
    <View style={styles.glyphBell}>
      <View style={styles.glyphBellDome} />
      <View style={styles.glyphBellClapper} />
    </View>
  );
}

function GearGlyph() {
  return (
    <View style={styles.glyphGear}>
      <View style={styles.glyphGearRing} />
      <View style={styles.glyphGearHub} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand,
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0A234F",
  },
  atmosphereGlow: {
    position: "absolute",
    top: "8%",
    right: "12%",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255, 186, 92, 0.28)",
  },
  atmosphereWarm: {
    position: "absolute",
    top: "22%",
    left: "-8%",
    width: 220,
    height: 180,
    borderRadius: 110,
    backgroundColor: "rgba(0, 45, 114, 0.55)",
  },
  atmosphereFloor: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "42%",
    backgroundColor: "rgba(11, 27, 51, 0.35)",
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  houseMark: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  houseRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.accent,
    marginBottom: -1,
  },
  houseBody: {
    width: 16,
    height: 11,
    backgroundColor: colors.accent,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  brand: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  brandHome: {
    color: colors.onBrand,
  },
  brandAsset: {
    color: colors.accent,
  },
  menuBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  menuLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.onBrand,
  },
  homeNameHit: {
    marginTop: 18,
    marginHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.55)",
    paddingBottom: 4,
    maxWidth: "78%",
  },
  pin: {
    width: 12,
    height: 16,
    alignItems: "center",
  },
  pinHead: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.onBrand,
  },
  pinPoint: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.onBrand,
  },
  homeName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.onBrand,
  },
  sheet: {
    flex: 1,
    marginTop: 28,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  sheetBody: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 40,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  chatIcon: {
    width: 28,
    height: 22,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1.5,
    borderColor: colors.onAccent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  chatDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.onAccent,
  },
  primaryLabel: {
    color: colors.onAccent,
    fontSize: 17,
    fontWeight: "700",
  },
  rowList: {
    marginTop: 10,
  },
  quietRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    gap: 14,
  },
  quietRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  quietIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  quietLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  quietChevron: {
    fontSize: 22,
    fontWeight: "300",
    color: colors.accent,
    marginTop: -2,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.88,
  },
  switcher: {
    marginTop: 22,
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
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  homeRowSelected: {
    borderColor: colors.accent,
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
    color: colors.accent,
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
  glyphHome: {
    width: 22,
    height: 20,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  glyphRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.brand,
    marginBottom: -1,
  },
  glyphBody: {
    width: 16,
    height: 10,
    backgroundColor: colors.brand,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  glyphSeat: {
    width: 22,
    height: 18,
    justifyContent: "flex-end",
  },
  glyphSeatBack: {
    width: 8,
    height: 12,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: colors.brand,
    marginLeft: 2,
  },
  glyphSeatBase: {
    width: 20,
    height: 7,
    borderRadius: 3,
    backgroundColor: colors.brand,
    marginTop: -2,
  },
  glyphBell: {
    width: 18,
    height: 20,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  glyphBellDome: {
    width: 16,
    height: 14,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: colors.brand,
  },
  glyphBellClapper: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand,
    marginTop: 1,
  },
  glyphGear: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphGearRing: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.brand,
  },
  glyphGearHub: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
});
