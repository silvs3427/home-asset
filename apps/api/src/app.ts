import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger } from "hono/logger";
import { config } from "./config.js";
import { getDb } from "./db/client.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { propertyRoutes } from "./routes/properties.js";

export function createApp() {
  // Ensure schema exists before handling traffic.
  getDb();

  const app = new Hono();

  app.use("*", secureHeaders());
  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (origin) => {
        // No CORS_ORIGINS set → allow local Expo / browsers in development only.
        if (config.corsOrigins.length === 0) {
          return config.isProd ? null : origin || "*";
        }
        if (!origin) return null;
        return config.corsOrigins.includes(origin) ? origin : null;
      },
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
      credentials: false,
    }),
  );

  // Never echo secrets or dump stack traces to clients.
  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json(
      { error: "internal", message: "Something went wrong. Please try again." },
      500,
    );
  });

  app.route("/health", healthRoutes);
  app.route("/auth", authRoutes);
  app.route("/me", meRoutes);
  app.route("/properties", propertyRoutes);

  app.get("/", (c) =>
    c.json({
      name: "HomeAsset API",
      docs: "See repository README for local run instructions.",
      privacy:
        "Homeowner controls the ledger. Homes, assets, and documents are property-scoped. No silent data sharing. Auth required for personal data.",
    }),
  );

  app.notFound((c) =>
    c.json({ error: "not_found", message: "No such endpoint." }, 404),
  );

  return app;
}
