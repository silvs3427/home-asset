import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#1B3A2F" />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/sign-in" />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F6F4",
  },
});
