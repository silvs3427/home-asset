import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { registerPushDevice } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Request permission and register an Expo push token with the API.
 * Safe to call on web / simulators — returns a clear reason instead of throwing.
 * Live delivery still needs EXPO_ACCESS_TOKEN on the API.
 */
export async function registerForPushNotifications(
  accessToken: string,
): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return {
      ok: false,
      reason: "Push is for the iPhone and Android apps, not the browser.",
    };
  }

  if (!Device.isDevice) {
    return {
      ok: false,
      reason:
        "Push tokens need a physical phone. Simulators can still use the in-app center.",
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") {
    return {
      ok: false,
      reason: "Notification permission was not granted.",
    };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("homeasset-reminders", {
      name: "HomeAsset reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  let token: string;
  try {
    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = result.data;
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error
          ? err.message
          : "Could not get an Expo push token on this build.",
    };
  }

  await registerPushDevice(accessToken, {
    expoPushToken: token,
    platform: Platform.OS,
    deviceName: Device.modelName,
  });

  return { ok: true, token };
}
