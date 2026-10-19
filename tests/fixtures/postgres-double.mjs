import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
export class Client {
  async connect() {}
  async end() {}
  async query(query) {
    if (/neon\.branch_id/.test(query))
      return { rows: [JSON.parse(process.env.TEST_DATABASE_IDENTITY)] };
    if (
      /SELECT rolname FROM pg_roles/.test(query) &&
      process.env.TEST_EXISTING_ROLES
    )
      return { rows: [{ rolname: "bottom_shelf_dev_runtime" }] };
    if (/FROM pg_database/.test(query) && process.env.TEST_DATABASE_OWNER)
      return {
        rows: [
          {
            datname: "bottom_shelf_development",
            owner: process.env.TEST_DATABASE_OWNER,
          },
        ],
      };
    if (/FROM schema_migrations/i.test(query)) {
      const directory = new URL("../../migrations/", import.meta.url);
      return {
        rows: readdirSync(directory)
          .filter((name) => name.endsWith(".sql"))
          .sort()
          .map((name) => ({
            name,
            checksum: createHash("sha256")
              .update(readFileSync(new URL(name, directory)))
              .digest("hex"),
          })),
      };
    }
    if (/^(SELECT|ROLLBACK)/i.test(query)) return { rows: [] };
    appendFileSync(process.env.TEST_DATABASE_WRITES, query + "\n");
    return { rows: [] };
  }
}
