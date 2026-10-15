import { defineConfig } from "@playwright/test";
import local from "./playwright.config";

export default defineConfig({
  ...local,
  testMatch: "services.spec.ts",
  workers: 1,
  timeout: 60000,
});
