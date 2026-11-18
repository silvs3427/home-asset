import { Hono } from "hono";
import { supabaseStatus } from "../lib/supabase/client.js";

export const healthRoutes = new Hono();

healthRoutes.get("/", (c) =>
  c.json({
    ok: true,
    service: "homeasset-api",
    version: "0.2.0",
    backends: supabaseStatus(),
  }),
);
