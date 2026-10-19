import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { parseEnv } from "node:util";
import {
  verifyDatabaseTarget,
  verifyStorageTarget,
} from "./environment-target.mjs";

function serialize(env) {
  return (
    Object.entries(env)
      .map(([name, value]) => name + "=" + JSON.stringify(value))
      .join("\n") + "\n"
  );
}
async function savePrivate(file, env) {
  const content = serialize(env);
  try {
    await writeFile(file, content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (
      (await stat(file)).mode & 0o077 ||
      (await readFile(file, "utf8")) !== content
    )
      throw new Error(
        "Existing private configuration differs; preserve it and inspect locally",
        { cause: error },
      );
  }
}
const environment = process.env.APP_ENV;
const credentialsFile = `.env.${environment}.credentials.local`;
let client;
try {
  if (
    !["development", "preview"].includes(environment) ||
    !process.env.DATABASE_BOOTSTRAP_URL
  )
    throw new Error("Nonproduction target configuration required");
  const source = new URL(process.env.DATABASE_BOOTSTRAP_URL);
  if (
    source.hostname.includes("-pooler") ||
    source.searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error("Use a direct TLS-verified bootstrap target");
  client = new Client({
    connectionString: source.toString(),
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  const target = await verifyDatabaseTarget(client, "bootstrap");
  verifyStorageTarget();
  // Only fixed repository-controlled identifiers reach DDL. Never interpolate env names.
  for (const name of [target.runtime, target.migrator, target.database])
    if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid target identifier");
  const { rows: databases } = await client.query(
    "SELECT datname, pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
    [target.database],
  );
  if (databases.length && databases[0].owner !== target.migrator)
    throw new Error("Existing database owner differs; nothing changed");
  let credentials;
  try {
    if ((await stat(credentialsFile)).mode & 0o077)
      throw new Error("Private credential file permissions are too broad");
    credentials = parseEnv(await readFile(credentialsFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const { rows: existingRoles } = await client.query(
      "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])",
      [[target.migrator, target.runtime]],
    );
    if (existingRoles.length)
      throw new Error(
        "Existing development roles require their saved credentials; inspect locally",
        { cause: error },
      );
    credentials = {
      runtime: randomBytes(32).toString("hex"),
      migrator: randomBytes(32).toString("hex"),
    };
    // Durable before CREATE ROLE: an interrupted run must never rotate a saved password.
    await savePrivate(credentialsFile, credentials);
  }
  for (const kind of ["migrator", "runtime"]) {
    const name = target[kind],
      password = credentials[kind];
    if (!/^[a-f0-9]{64}$/.test(password))
      throw new Error("Invalid saved credential");
    const { rows } = await client.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=$1",
      [name],
    );
    if (rows.length) {
      if (Object.values(rows[0]).some(Boolean))
        throw new Error("Existing development role is privileged");
    } else
      await client.query(
        `CREATE ROLE "${name}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
  }
  await client.query(`GRANT "${target.migrator}" TO CURRENT_USER`);
  if (!databases.length)
    await client.query(
      `CREATE DATABASE "${target.database}" OWNER "${target.migrator}"`,
    );
  await client.query(`REVOKE ALL ON DATABASE "${target.database}" FROM PUBLIC`);
  await client.query(
    `GRANT CONNECT ON DATABASE "${target.database}" TO "${target.runtime}"`,
  );
  const urls = {};
  for (const kind of ["migrator", "runtime"]) {
    const url = new URL(source);
    url.username = target[kind];
    url.password = credentials[kind];
    url.pathname = "/" + target.database;
    urls[kind] = url.toString();
  }
  const runtime = { APP_ENV: environment, DATABASE_URL: urls.runtime };
  for (const name of [
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "OWNER_USER_ID",
    "OWNER_EMAIL",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ]) {
    if (!process.env[name])
      throw new Error("Missing private development configuration");
    runtime[name] = process.env[name];
  }
  Object.assign(runtime, {
    AWS_ENDPOINT_URL_S3: target.storageEndpoint,
    AWS_REGION: target.region,
    STORAGE_BUCKET: target.bucket,
    FOUNDATION_CHECK_ENABLED: "true",
  });
  await savePrivate(`.env.${environment}.local`, runtime);
  await savePrivate(`.env.${environment}.admin.local`, {
    APP_ENV: environment,
    DATABASE_MIGRATION_URL: urls.migrator,
  });
  console.log(
    "Nonproduction roles and private configuration ready; migrate then verify SQL/storage. Existing data and credentials preserved.",
  );
} catch (error) {
  console.error(
    "Development bootstrap failed:",
    error.message?.includes("target") || error.message?.startsWith("Existing")
      ? error.message
      : (error.code ?? error.name),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
