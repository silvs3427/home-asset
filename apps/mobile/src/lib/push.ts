import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerPushDevice } from "./api";

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let notificationHandlerReady = false;

/**
 * Expo Go (store client) does not ship a reliable push path for our stack:
 * Android remote push was removed from Expo Go in SDK 53+, and loading
 * expo-notifications / ExpoApplication can crash the JS bundle.
 * Soft-disable so the app boots; in-app notification center still works.
 */
export function isPushSoftDisabled(): boolean {
  if (Platform.OS === "web") {
    return true;
  }

  try {
    // Prefer the official helper when the host `expo` package exposes it.
    // Dynamic require keeps this module from depending on a typed export.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expo = require("expo") as { isRunningInExpoGo?: () => boolean };
    if (typeof expo.isRunningInExpoGo === "function" && expo.isRunningInExpoGo()) {
      return true;
    }
  } catch {
    // fall through to Constants checks
  }

  return (
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient"
  );
}

export function pushUnavailableReason(): string {
  if (Platform.OS === "web") {
    return "Push is for the iPhone and Android apps, not the browser.";
  }
  if (isPushSoftDisabled()) {
    return "Push is soft-disabled in Expo Go so the app can boot. Use a development build for live push; the in-app notification center still works.";
  }
  return "Push is unavailable on this build.";
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

async function loadDevice(): Promise<DeviceModule | null> {
  try {
    return await import("expo-device");
  } catch {
    return null;
  }
}

async function ensureNotificationHandler(
  Notifications: NotificationsModule,
): Promise<void> {
  if (notificationHandlerReady || isPushSoftDisabled()) {
    return;
  }
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    notificationHandlerReady = true;
  } catch {
    // Handler is optional for token registration; ignore native gaps.
  }
}

/**
 * Request permission and register an Expo push token with the API.
 * Safe to call on web / Expo Go / simulators — returns a clear reason instead of throwing.
 * Never imports expo-notifications at module top-level (avoids Expo Go native crashes).
 * Live delivery still needs EXPO_ACCESS_TOKEN on the API.
 */
export async function registerForPushNotifications(
  accessToken: string,
): Promise<PushRegistrationResult> {
  if (Platform.OS === "web" || isPushSoftDisabled()) {
    return { ok: false, reason: pushUnavailableReason() };
  }

  const Device = await loadDevice();
  if (!Device) {
    return {
      ok: false,
      reason: "Device info is unavailable on this build.",
    };
  }

  if (!Device.isDevice) {
    return {
      ok: false,
      reason:
        "Push tokens need a physical phone. Simulators can still use the in-app center.",
    };
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return {
      ok: false,
      reason:
        "Push notifications native module is unavailable. Use a development build for live push.",
    };
  }

  await ensureNotificationHandler(Notifications);

  try {
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

    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = result.data;

    await registerPushDevice(accessToken, {
      expoPushToken: token,
      platform: Platform.OS,
      deviceName: Device.modelName,
    });

    return { ok: true, token };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not register for push.";
    // Native module gaps (e.g. ExpoApplication) surface here — degrade gracefully.
    if (
      /ExpoApplication|native module|Expo Go|development build/i.test(message)
    ) {
      return {
        ok: false,
        reason:
          "Push native modules are unavailable here. Soft-disabled — use a development build for live push; in-app notices still work.",
      };
    }
    return { ok: false, reason: message };
  }
}
