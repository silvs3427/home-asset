import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../lib/auth.js";
import type { JwtClaims } from "../lib/types.js";

export type AuthVariables = {
  claims: JwtClaims;
};

/**
 * Requires a Bearer access token. Least privilege: handlers only see claims,
 * never the raw password or hash.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
    }
    try {
      const claims = await verifyAccessToken(token);
      c.set("claims", claims);
      await next();
    } catch {
      return c.json(
        { error: "unauthorized", message: "Session expired or invalid. Sign in again." },
        401,
      );
    }
  },
);
