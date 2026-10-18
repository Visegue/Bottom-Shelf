import { defineConfig } from "@playwright/test";
import local from "./playwright.config";

export default defineConfig({
  ...local,
  testMatch: "services.spec.ts",
  workers: 1,
  timeout: 60000,
  webServer: (Array.isArray(local.webServer)
    ? local.webServer
    : [local.webServer!]
  ).map((server, index) =>
    index === 1
      ? {
          ...server,
          env: { ...server.env, APP_ENV: process.env.APP_ENV ?? "test" },
        }
      : server,
  ),
});
