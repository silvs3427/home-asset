/**
 * Rate-limit stub (same pattern as LightLift).
 * Always allows today; wire Redis/Upstash before production AI spend.
 */

export type RateLimitInput = {
  key: string;
  route: string;
  limit?: number;
  windowSeconds?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  backend: "stub";
  remaining: number | null;
  retryAfterSeconds: number | null;
};

export async function enforceRateLimitStub(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const limit = input.limit ?? 60;
  console.info(
    JSON.stringify({
      msg: "rate_limit_stub_allow",
      route: input.route,
      keyHash: hashKey(input.key),
      limit,
      windowSeconds: input.windowSeconds ?? 60,
    }),
  );
  return {
    allowed: true,
    backend: "stub",
    remaining: null,
    retryAfterSeconds: null,
  };
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(hash)}`;
}
