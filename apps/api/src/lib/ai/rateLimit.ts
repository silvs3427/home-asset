/**
 * Local-API parity for Ask HomeAsset rate / daily caps.
 * Same defaults as the edge function (in-memory for SQLite demo / CI).
 */

export type AiRateLimitReason = "burst" | "daily_cap";

export type AiRateLimitResult = {
  allowed: boolean;
  reason: AiRateLimitReason | null;
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

export function getAiAssistLimits(): {
  burstLimit: number;
  windowSeconds: number;
  dailyCap: number;
} {
  return {
    burstLimit: readPositiveInt(process.env.AI_ASSIST_BURST_LIMIT, 10),
    windowSeconds: readPositiveInt(
      process.env.AI_ASSIST_BURST_WINDOW_SECONDS,
      60,
    ),
    dailyCap: readPositiveInt(process.env.AI_ASSIST_DAILY_CAP, 40),
  };
}

export function burstLimitMessage(): string {
  return "Ask HomeAsset needs a short pause — too many asks in a minute. Try again in a moment.";
}

export function dailyCapMessage(dailyCap: number): string {
  return (
    `You've reached today's Ask HomeAsset limit (${dailyCap} asks). ` +
    "It resets tomorrow (UTC). Ask HomeAsset is for home help only — not unlimited AI."
  );
}

export function consumeAiAssistQuota(userId: string): AiRateLimitResult {
  const { burstLimit, windowSeconds, dailyCap } = getAiAssistLimits();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  let bucket = memoryStore.get(userId);
  if (!bucket) {
    bucket = {
      burstWindowStartedAtMs: now,
      burstCount: 0,
      dayKey: today,
      dayCount: 0,
    };
    memoryStore.set(userId, bucket);
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
    return {
      allowed: false,
      reason: "daily_cap",
      message: dailyCapMessage(dailyCap),
      remaining: Math.max(burstLimit - bucket.burstCount, 0),
      dailyRemaining: 0,
      dailyCap,
      burstLimit,
      retryAfterSeconds: null,
    };
  }

  if (bucket.burstCount >= burstLimit) {
    return {
      allowed: false,
      reason: "burst",
      message: burstLimitMessage(),
      remaining: 0,
      dailyRemaining: Math.max(dailyCap - bucket.dayCount, 0),
      dailyCap,
      burstLimit,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.burstWindowStartedAtMs + windowMs - now) / 1000),
      ),
    };
  }

  bucket.burstCount += 1;
  bucket.dayCount += 1;
  return {
    allowed: true,
    reason: null,
    message: null,
    remaining: Math.max(burstLimit - bucket.burstCount, 0),
    dailyRemaining: Math.max(dailyCap - bucket.dayCount, 0),
    dailyCap,
    burstLimit,
    retryAfterSeconds: null,
  };
}

/** Test helper. */
export function __resetAiAssistRateLimitForTests(): void {
  memoryStore.clear();
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
