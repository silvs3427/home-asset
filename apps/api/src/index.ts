import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

// Bind all interfaces so a phone on the same LAN can reach the API.
// (localhost-only would make physical-device signup fail even with the right env.)
serve(
  { fetch: app.fetch, port: config.port, hostname: "0.0.0.0" },
  (info) => {
    console.log(
      `HomeAsset API listening on http://0.0.0.0:${info.port} (${config.nodeEnv})`,
    );
    console.log(
      `Local:  http://localhost:${info.port}  |  Phone: set EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:${info.port}`,
    );
  },
);
