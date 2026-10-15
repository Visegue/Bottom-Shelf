import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "foundation.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node tests/fixtures/auth-server.mjs",
      url: "http://127.0.0.1:4101/get-session",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
      env: {
        OWNER_EMAIL: "owner@example.test",
        OWNER_USER_ID: "test-owner",
        NEON_AUTH_BASE_URL: "http://127.0.0.1:4101",
        NEON_AUTH_COOKIE_SECRET:
          "deterministic-test-secret-only-not-for-production-12345",
        APP_ENV: "test",
        FOUNDATION_CHECK_ENABLED: "true",
      },
    },
  ],
});
