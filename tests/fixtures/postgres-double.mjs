import { appendFileSync } from "node:fs";
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
    if (/^(SELECT|ROLLBACK)/i.test(query)) return { rows: [] };
    appendFileSync(process.env.TEST_DATABASE_WRITES, query + "\n");
    return { rows: [] };
  }
}
