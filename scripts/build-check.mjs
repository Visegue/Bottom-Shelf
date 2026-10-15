import { spawnSync } from "node:child_process";

// This artifact verifies buildability only. Vercel builds with its own config.
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "",
      DATABASE_MIGRATION_URL: "",
      NEON_AUTH_BASE_URL: "",
      NEON_AUTH_COOKIE_SECRET: "",
      OWNER_EMAIL: "",
      OWNER_USER_ID: "",
      AWS_ACCESS_KEY_ID: "",
      AWS_SECRET_ACCESS_KEY: "",
      AWS_ENDPOINT_URL_S3: "",
      APP_ENV: "test",
      FOUNDATION_CHECK_ENABLED: "false",
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
