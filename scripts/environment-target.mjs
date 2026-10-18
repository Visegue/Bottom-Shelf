import targets from "../config/environments.json" with { type: "json" };

export function environmentTarget(env = process.env) {
  const target = Object.hasOwn(targets, env.APP_ENV) && targets[env.APP_ENV];
  if (!target) throw new Error("Environment target is not provisioned");
  const region = "eu-central-1";
  return {
    ...target,
    region,
    storageEndpoint: `https://${target.branchId}.storage.c-8.${region}.aws.neon.tech`,
  };
}

export async function verifyDatabaseTarget(
  client,
  permission = "migrator",
  env = process.env,
) {
  const {
    rows: [actual],
  } = await client.query(`SELECT
    current_setting('neon.project_id', true) AS project_id,
    current_setting('neon.branch_id', true) AS branch_id,
    current_database() AS database, current_user AS role`);
  return assertDatabaseIdentity(actual, permission, env);
}

export function assertDatabaseIdentity(
  actual,
  permission = "runtime",
  env = process.env,
) {
  const target = environmentTarget(env);
  if (
    !actual ||
    actual.project_id !== target.projectId ||
    actual.branch_id !== target.branchId ||
    actual.database !==
      (permission === "bootstrap"
        ? target.bootstrapDatabase
        : target.database) ||
    actual.role !== target[permission]
  )
    throw new Error("Database target verification failed");
  return target;
}

export function verifyStorageTarget(env = process.env) {
  const target = environmentTarget(env);
  if (
    env.AWS_ENDPOINT_URL_S3 !== target.storageEndpoint ||
    env.AWS_REGION !== target.region ||
    env.STORAGE_BUCKET !== target.bucket ||
    (target.storageKeyId && env.AWS_ACCESS_KEY_ID !== target.storageKeyId)
  )
    throw new Error("Storage target verification failed");
  return target;
}
