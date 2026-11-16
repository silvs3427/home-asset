import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `HomeAsset API listening on http://localhost:${info.port} (${config.nodeEnv})`,
  );
});
