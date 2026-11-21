import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth";
import { SessionLockProvider } from "@/lib/sessionLock";

export default function RootLayout() {
  return (
    <AuthProvider>
      <SessionLockProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SessionLockProvider>
    </AuthProvider>
  );
}
