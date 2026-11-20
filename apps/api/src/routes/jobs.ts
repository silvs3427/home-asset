import { Hono } from "hono";
import { config } from "../config.js";
import { runDueReminderCheck } from "../lib/notifications.js";
import { runRecallMatchCheck } from "../lib/recalls.js";

/**
 * Cron / scheduler entry points. Protected by JOBS_SECRET in production.
 * In development with no secret set, the endpoint stays open for local try.
 * Never exposes homeowner ledger data — only aggregate counts.
 */
export const jobRoutes = new Hono();

function authorizeJob(c: { req: { header: (name: string) => string | undefined } }) {
  const secret = config.jobsSecret;
  if (!secret) {
    if (config.isProd) {
      return {
        ok: false as const,
        status: 503 as const,
        message: "JOBS_SECRET is not configured.",
      };
    }
    // Dev convenience: no secret required locally.
    return { ok: true as const };
  }

  const header =
    c.req.header("x-jobs-secret") ||
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!header || header !== secret) {
    return {
      ok: false as const,
      status: 401 as const,
      message: "Job secret required.",
    };
  }
  return { ok: true as const };
}

jobRoutes.post("/due-reminders", async (c) => {
  const auth = authorizeJob(c);
  if (!auth.ok) {
    return c.json({ error: "unauthorized", message: auth.message }, auth.status);
  }

  const result = await runDueReminderCheck();
  return c.json({
    ok: true,
    job: "due-reminders",
    result,
    privacy: {
      marketing: false,
      note: "Creates reminder-due notifications only for homeowners who opted in.",
    },
  });
});

jobRoutes.post("/recalls", async (c) => {
  const auth = authorizeJob(c);
  if (!auth.ok) {
    return c.json({ error: "unauthorized", message: auth.message }, auth.status);
  }

  const result = await runRecallMatchCheck();
  return c.json({
    ok: true,
    job: "recalls",
    result,
    privacy: {
      marketing: false,
      note: "Matches free public safety/recall lists to owned assets; notifies opted-in homeowners only.",
    },
  });
});
