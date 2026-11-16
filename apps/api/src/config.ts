/**
 * Runtime configuration with secure defaults.
 * Secrets must come from the environment — never hardcode production values.
 */

function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production`);
  }
  return fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  jwtSecret: requiredInProduction(
    "JWT_SECRET",
    "dev-only-jwt-secret-replace-before-deploy",
  ),
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 3600),
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
