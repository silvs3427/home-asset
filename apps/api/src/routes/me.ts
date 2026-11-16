import { Hono } from "hono";
import { getUserById } from "../lib/users.js";
import { toPublicUser } from "../lib/types.js";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth.js";

export const meRoutes = new Hono<{ Variables: AuthVariables }>();

meRoutes.use("*", requireAuth);

meRoutes.get("/", (c) => {
  const claims = c.get("claims");
  const user = getUserById(claims.sub);
  if (!user) {
    return c.json(
      { error: "not_found", message: "Account no longer exists." },
      404,
    );
  }
  return c.json({
    user: toPublicUser(user),
    privacy: {
      // Explicit product stance for clients / future faces.
      ledgerOwner: "homeowner",
      silentSharing: false,
      approveBeforeOfficial: true,
    },
  });
});
