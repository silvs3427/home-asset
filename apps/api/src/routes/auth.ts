import { Hono } from "hono";
import { z } from "zod";
import { issueAccessToken } from "../lib/auth.js";
import { createUser, verifyCredentials } from "../lib/users.js";
import { toPublicUser, type AppFace } from "../lib/types.js";

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  /** Optional starting face for sign-up (defaults to homeowner). */
  startingFace: z.enum(["homeowner", "contractor"]).optional(),
});

/**
 * Auth stub: email + password suitable for normal app login later.
 * In-memory only for EPIC 0 — swap store in EPIC 1 without changing these routes.
 * No silent third-party sharing of credentials or profile data.
 */
export const authRoutes = new Hono();

authRoutes.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Use a valid email and a password of at least 8 characters.",
      },
      400,
    );
  }

  const { email, password, startingFace } = parsed.data;
  try {
    const user = await createUser({
      email,
      password,
      startingFace: startingFace as AppFace | undefined,
    });
    const accessToken = await issueAccessToken(user);
    return c.json(
      {
        accessToken,
        tokenType: "Bearer",
        expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 3600),
        user: toPublicUser(user),
      },
      201,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      return c.json(
        { error: "email_taken", message: "An account with that email already exists." },
        409,
      );
    }
    throw err;
  }
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = credentialsSchema
    .omit({ startingFace: true })
    .safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        message: "Use a valid email and password.",
      },
      400,
    );
  }

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    // Same message for missing user vs bad password — avoid account enumeration.
    return c.json(
      { error: "invalid_credentials", message: "Email or password is incorrect." },
      401,
    );
  }

  const accessToken = await issueAccessToken(user);
  return c.json({
    accessToken,
    tokenType: "Bearer",
    expiresIn: Number(process.env.JWT_TTL_SECONDS ?? 3600),
    user: toPublicUser(user),
  });
});
