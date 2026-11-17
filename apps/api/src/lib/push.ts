import { config } from "../config.js";
import type { PushDeviceRecord } from "./types.js";

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushSendResult = {
  status: "sent" | "stubbed" | "failed" | "skipped";
  detail: string;
};

/**
 * Deliver a push to Expo tokens. When EXPO_ACCESS_TOKEN is unset, stubs the
 * send (logs + returns stubbed) so local / CI work without Expo credentials.
 * Set EXPO_ACCESS_TOKEN to go live against Expo's push API.
 */
export async function sendExpoPush(
  devices: PushDeviceRecord[],
  message: PushMessage,
): Promise<PushSendResult> {
  if (devices.length === 0) {
    return { status: "skipped", detail: "No push devices registered." };
  }

  const tokens = devices.map((d) => d.expoPushToken);
  const payload = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: "default" as const,
  }));

  if (!config.expoAccessToken) {
    console.info(
      "[push:stub]",
      JSON.stringify({
        recipients: tokens.length,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
      }),
    );
    return {
      status: "stubbed",
      detail:
        "EXPO_ACCESS_TOKEN unset — push stubbed. Set the token to deliver live.",
    };
  }

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${config.expoAccessToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[push:expo]", res.status, text.slice(0, 400));
      return {
        status: "failed",
        detail: `Expo push HTTP ${res.status}`,
      };
    }
    return { status: "sent", detail: `Delivered to ${tokens.length} device(s).` };
  } catch (err) {
    console.error("[push:expo]", err);
    return {
      status: "failed",
      detail: err instanceof Error ? err.message : "Push send failed.",
    };
  }
}
