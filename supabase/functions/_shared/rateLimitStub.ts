/**
 * Per-user rate limits for Ask HomeAsset (`ai-assist`) and Support (`support-assist`).
 *
 * Ask HomeAsset defaults (overridable via Edge secrets / env):
 *   AI_ASSIST_BURST_LIMIT=10
 *   AI_ASSIST_BURST_WINDOW_SECONDS=60
 *   AI_ASSIST_DAILY_CAP=40
 *
 * Support defaults (separate bucket — does not steal Ask HomeAsset quota):
 *   SUPPORT_ASSIST_BURST_LIMIT=8
 *   SUPPORT_ASSIST_BURST_WINDOW_SECONDS=60
 *   SUPPORT_ASSIST_DAILY_CAP=25
 *
 * Preferred backend: Postgres RPC (durable).
 * Fallback: in-memory Map (best-effort per isolate) when RPC is unavailable.
 * Optional: Upstash Redis REST when UPSTASH_REDIS_REST_URL + TOKEN are set.
 */

export type RateLimitInput = {
  key: string;
  route: string;
  /** When set, try durable RPC via this user-scoped Supabase client. */
  supabase?: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  limit?: number;
  windowSeconds?: number;
  dailyCap?: number;
  /** Skip consume (e.g. status checks). */
  skip?: boolean;
};

export type RateLimitReason = "burst" | "daily_cap" | "unauthorized" | null;

export type RateLimitResult = {
  allowed: boolean;
  backend: "postgres" | "memory" | "upstash" | "skip";
  reason: RateLimitReason;
  message: string | null;
  remaining: number | null;
  dailyRemaining: number | null;
  dailyCap: number;
  burstLimit: number;
  retryAfterSeconds: number | null;
};

type MemoryBucket = {
  burstWindowStartedAtMs: number;
  burstCount: number;
  dayKey: string;
  dayCount: number;
};

const memoryStore = new Map<string, MemoryBucket>();

export function defaultAiAssistLimits(): {
  burstLimit: number;
  windowSeconds: number;
  dailyCap: number;
} {
  return {
    burstLimit: readPositiveInt(Deno.env.get("AI_ASSIST_BURST_LIMIT"), 10),
    windowSeconds: readPositiveInt(
      Deno.env.get("AI_ASSIST_BURST_WINDOW_SECONDS"),
      60,
    ),
    dailyCap: readPositiveInt(Deno.env.get("AI_ASSIST_DAILY_CAP"), 40),
  };
}

export function defaultSupportAssistLimits(): {
  burstLimit: number;
  windowSeconds: number;
  dailyCap: number;
} {
  return {
    burstLimit: readPositiveInt(Deno.env.get("SUPPORT_ASSIST_BURST_LIMIT"), 8),
    windowSeconds: readPositiveInt(
      Deno.env.get("SUPPORT_ASSIST_BURST_WINDOW_SECONDS"),
      60,
    ),
    dailyCap: readPositiveInt(Deno.env.get("SUPPORT_ASSIST_DAILY_CAP"), 25),
  };
}

export function burstLimitMessage(route = "ai-assist"): string {
  if (route === "support-assist") {
    return "Support needs a short pause — too many messages in a minute. Try again in a moment.";
  }
  return "Ask HomeAsset needs a short pause — too many asks in a minute. Try again in a moment.";
}

export function dailyCapMessage(dailyCap: number, route = "ai-assist"): string {
  if (route === "support-assist") {
    return (
      `You've reached today's Support limit (${dailyCap} messages). ` +
      "It resets tomorrow (UTC). Support is for app help — not unlimited AI."
    );
  }
  return (
    `You've reached today's Ask HomeAsset limit (${dailyCap} asks). ` +
    "It resets tomorrow (UTC). Ask HomeAsset is for home help only — not unlimited AI."
  );
}

/** @deprecated Prefer enforceRateLimit — kept for older call sites. */
export async function enforceRateLimitStub(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  return enforceRateLimit(input);
}

export async function enforceRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const defaults =
    input.route === "support-assist"
      ? defaultSupportAssistLimits()
      : defaultAiAssistLimits();
  const burstLimit = input.limit ?? defaults.burstLimit;
  const windowSeconds = input.windowSeconds ?? defaults.windowSeconds;
  const dailyCap = input.dailyCap ?? defaults.dailyCap;

  if (input.skip) {
    return {
      allowed: true,
      backend: "skip",
      reason: null,
      message: null,
      remaining: null,
      dailyRemaining: null,
      dailyCap,
      burstLimit,
      retryAfterSeconds: null,
    };
  }

  // Namespace by route so send-push, ai-assist, and support-assist do not share one bucket.
  const storeKey = `${input.route}:${input.key}`;

  const upstash = await tryUpstash(
    storeKey,
    input.route,
    burstLimit,
    windowSeconds,
    dailyCap,
  );
  if (upstash) return upstash;

  // Durable Postgres quotas (Ask HomeAsset vs Support).
  const rpcName =
    input.route === "support-assist"
      ? "consume_support_assist_quota"
      : input.route === "ai-assist"
        ? "consume_ai_assist_quota"
        : null;
  if (input.supabase && rpcName) {
    try {
      const { data, error } = await input.supabase.rpc(rpcName, {
        p_burst_limit: burstLimit,
        p_burst_window_seconds: windowSeconds,
        p_daily_cap: dailyCap,
      });
      if (!error && data && typeof data === "object") {
        const row = data as Record<string, unknown>;
        const allowed = row.allowed === true;
        const reason = normalizeReason(row.reason);
        const message =
          typeof row.message === "string" && row.message.trim()
            ? row.message.trim()
            : allowed
              ? null
              : reason === "daily_cap"
                ? dailyCapMessage(dailyCap, input.route)
                : burstLimitMessage(input.route);
        console.info(
          JSON.stringify({
            msg: allowed ? "rate_limit_allow" : "rate_limit_deny",
            backend: "postgres",
            route: input.route,
            keyHash: hashKey(storeKey),
            reason,
            burstLimit,
            dailyCap,
          }),
        );
        return {
          allowed,
          backend: "postgres",
          reason,
          message,
          remaining:
            typeof row.burst_remaining === "number" ? row.burst_remaining : null,
          dailyRemaining:
            typeof row.daily_remaining === "number" ? row.daily_remaining : null,
          dailyCap,
          burstLimit,
          retryAfterSeconds:
            typeof row.retry_after_seconds === "number"
              ? row.retry_after_seconds
              : null,
        };
      }
      console.warn(
        JSON.stringify({
          msg: "rate_limit_rpc_fallback_memory",
          route: input.route,
          detail: error?.message ?? "empty rpc payload",
        }),
      );
    } catch (err) {
      console.warn(
        JSON.stringify({
          msg: "rate_limit_rpc_error_fallback_memory",
          route: input.route,
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return consumeMemory(storeKey, input.route, burstLimit, windowSeconds, dailyCap);
}

function consumeMemory(
  key: string,
  route: string,
  burstLimit: number,
  windowSeconds: number,
  dailyCap: number,
): RateLimitResult {
  const now = Date.now();
  const today = utcDayKey(now);
  let bucket = memoryStore.get(key);
  if (!bucket) {
    bucket = {
      burstWindowStartedAtMs: now,
      burstCount: 0,
      dayKey: today,
      dayCount: 0,
    };
    memoryStore.set(key, bucket);
  }

  if (bucket.dayKey !== today) {
    bucket.dayKey = today;
    bucket.dayCount = 0;
  }
  const windowMs = windowSeconds * 1000;
  if (now - bucket.burstWindowStartedAtMs >= windowMs) {
    bucket.burstWindowStartedAtMs = now;
    bucket.burstCount = 0;
  }

  if (bucket.dayCount >= dailyCap) {
    console.info(
      JSON.stringify({
        msg: "rate_limit_deny",
        backend: "memory",
        route,
        keyHash: hashKey(key),
        reason: "daily_cap",
        dailyCap,
      }),
    );
    return {
      allowed: false,
      backend: "memory",
      reason: "daily_cap",
      message: dailyCapMessage(dailyCap, route),
      remaining: Math.max(burstLimit - bucket.burstCount, 0),
      dailyRemaining: 0,
      dailyCap,
      burstLimit,
      retryAfterSeconds: null,
    };
  }

  if (bucket.burstCount >= burstLimit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.burstWindowStartedAtMs + windowMs - now) / 1000),
    );
    console.info(
      JSON.stringify({
        msg: "rate_limit_deny",
        backend: "memory",
        route,
        keyHash: hashKey(key),
        reason: "burst",
        burstLimit,
      }),
    );
    return {
      allowed: false,
      backend: "memory",
      reason: "burst",
      message: burstLimitMessage(route),
      remaining: 0,
      dailyRemaining: Math.max(dailyCap - bucket.dayCount, 0),
      dailyCap,
      burstLimit,
      retryAfterSeconds,
    };
  }

  bucket.burstCount += 1;
  bucket.dayCount += 1;
  console.info(
    JSON.stringify({
      msg: "rate_limit_allow",
      backend: "memory",
      route,
      keyHash: hashKey(key),
      burstRemaining: Math.max(burstLimit - bucket.burstCount, 0),
      dailyRemaining: Math.max(dailyCap - bucket.dayCount, 0),
    }),
  );
  return {
    allowed: true,
    backend: "memory",
    reason: null,
    message: null,
    remaining: Math.max(burstLimit - bucket.burstCount, 0),
    dailyRemaining: Math.max(dailyCap - bucket.dayCount, 0),
    dailyCap,
    burstLimit,
    retryAfterSeconds: null,
  };
}

async function tryUpstash(
  key: string,
  route: string,
  burstLimit: number,
  windowSeconds: number,
  dailyCap: number,
): Promise<RateLimitResult | null> {
  const url = (Deno.env.get("UPSTASH_REDIS_REST_URL") ?? "").trim();
  const token = (Deno.env.get("UPSTASH_REDIS_REST_TOKEN") ?? "").trim();
  if (!url || !token) return null;

  const day = utcDayKey(Date.now());
  const burstKey = `ha:ai:burst:${key}`;
  const dayKey = `ha:ai:day:${key}:${day}`;

  try {
    const dayCount = await upstashCommand<number>(url, token, [
      "INCR",
      dayKey,
    ]);
    if (dayCount === 1) {
      await upstashCommand(url, token, ["EXPIRE", dayKey, 60 * 60 * 36]);
    }
    if (dayCount > dailyCap) {
      return {
        allowed: false,
        backend: "upstash",
        reason: "daily_cap",
        message: dailyCapMessage(dailyCap, route),
        remaining: null,
        dailyRemaining: 0,
        dailyCap,
        burstLimit,
        retryAfterSeconds: null,
      };
    }

    const burstCount = await upstashCommand<number>(url, token, [
      "INCR",
      burstKey,
    ]);
    if (burstCount === 1) {
      await upstashCommand(url, token, ["EXPIRE", burstKey, windowSeconds]);
    }
    if (burstCount > burstLimit) {
      const ttl = await upstashCommand<number>(url, token, ["TTL", burstKey]);
      return {
        allowed: false,
        backend: "upstash",
        reason: "burst",
        message: burstLimitMessage(route),
        remaining: 0,
        dailyRemaining: Math.max(dailyCap - dayCount, 0),
        dailyCap,
        burstLimit,
        retryAfterSeconds: typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds,
      };
    }

    return {
      allowed: true,
      backend: "upstash",
      reason: null,
      message: null,
      remaining: Math.max(burstLimit - burstCount, 0),
      dailyRemaining: Math.max(dailyCap - dayCount, 0),
      dailyCap,
      burstLimit,
      retryAfterSeconds: null,
    };
  } catch (err) {
    console.warn(
      JSON.stringify({
        msg: "rate_limit_upstash_failed",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

async function upstashCommand<T = unknown>(
  baseUrl: string,
  token: string,
  command: Array<string | number>,
): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`Upstash HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: T };
  return body.result as T;
}

function normalizeReason(raw: unknown): RateLimitReason {
  if (raw === "burst" || raw === "daily_cap" || raw === "unauthorized") {
    return raw;
  }
  return null;
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function readPositiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(hash)}`;
}

/** Test helper — clears in-memory buckets. */
export function __resetRateLimitMemoryForTests(): void {
  memoryStore.clear();
}
