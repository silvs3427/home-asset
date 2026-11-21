/**
 * Expo push delivery for Edge Functions.
 * EXPO_ACCESS_TOKEN stays in Supabase secrets — never on the phone.
 */

export type ExpoPushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type ExpoPushSendResult = {
  status: "sent" | "stubbed" | "failed" | "skipped";
  detail: string;
};

export async function sendExpoPushMessages(
  tokens: string[],
  message: ExpoPushMessage,
  expoAccessToken: string | undefined,
): Promise<ExpoPushSendResult> {
  const clean = tokens.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) {
    return { status: "skipped", detail: "No push devices registered." };
  }

  const payload = clean.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: "default" as const,
  }));

  if (!expoAccessToken?.trim()) {
    console.info(
      JSON.stringify({
        msg: "push_stub",
        recipients: clean.length,
        title: message.title,
      }),
    );
    return {
      status: "stubbed",
      detail:
        "EXPO_ACCESS_TOKEN unset — push stubbed. Set the secret to deliver live.",
    };
  }

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${expoAccessToken.trim()}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        JSON.stringify({
          msg: "push_expo_http_error",
          status: res.status,
          body: text.slice(0, 400),
        }),
      );
      return {
        status: "failed",
        detail: `Expo push HTTP ${res.status}`,
      };
    }
    return {
      status: "sent",
      detail: `Delivered to ${clean.length} device(s).`,
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "push_expo_fetch_error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return {
      status: "failed",
      detail: err instanceof Error ? err.message : "Push send failed.",
    };
  }
}
