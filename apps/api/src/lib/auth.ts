import { sign, verify } from "hono/jwt";
import { config } from "../config.js";
import type { JwtClaims, UserRecord } from "./types.js";

export const JWT_ISSUER = "homeasset-api";
export const JWT_AUDIENCE = "homeasset-app";

export async function issueAccessToken(user: UserRecord): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtClaims = {
    sub: user.id,
    email: user.email,
    faces: user.faces,
    activeFace: user.activeFace,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + config.jwtTtlSeconds,
  };
  return sign(payload, config.jwtSecret, "HS256");
}

export async function verifyAccessToken(token: string): Promise<JwtClaims> {
  const payload = (await verify(token, config.jwtSecret, "HS256")) as JwtClaims;
  if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) {
    throw new Error("INVALID_TOKEN_CLAIMS");
  }
  return payload;
}
