import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
try {
  const [role] =
    await sql`SELECT current_user AS name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
    pg_has_role(current_user, 'neon_superuser', 'member') AS neon_admin
    FROM pg_roles WHERE rolname = current_user`;
  assert.equal(role.name, "bottom_shelf_app_runtime");
  for (const flag of [
    "rolsuper",
    "rolbypassrls",
    "rolcreatedb",
    "rolcreaterole",
    "neon_admin",
  ])
    assert.equal(role[flag], false, flag);
  const [permissions] = await sql`SELECT
    has_table_privilege(current_user, 'foundation_checks', 'SELECT') AS probe_select,
    has_table_privilege(current_user, 'foundation_checks', 'INSERT') AS probe_insert,
    has_table_privilege(current_user, 'foundation_checks', 'DELETE') AS probe_delete,
    has_table_privilege(current_user, 'schema_migrations', 'INSERT,UPDATE,DELETE') AS migration_write,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create`;
  for (const permission of ["probe_select", "probe_insert", "probe_delete"])
    assert.equal(permissions[permission], true, permission);
  assert.equal(permissions.migration_write, false);
  assert.equal(permissions.schema_create, false);
  console.log(
    "Runtime role verified: probe access only, no migration or schema administration.",
  );
} catch (error) {
  console.error(
    "Database permission check failed:",
    error instanceof assert.AssertionError
      ? error.message
      : (error.code ?? error.name),
  );
  process.exitCode = 1;
}
