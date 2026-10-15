import { defineConfig, devices } from "@playwright/test";

if (!process.env.LIVE_BASE_URL || !process.env.LIVE_STORAGE_STATE) {
  throw new Error(
    "LIVE_BASE_URL and LIVE_STORAGE_STATE are required; capture a real owner Google session first.",
  );
}
export default defineConfig({
  testDir: "./tests",
  testMatch: "live.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.LIVE_BASE_URL,
    storageState: process.env.LIVE_STORAGE_STATE,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
