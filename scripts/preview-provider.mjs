// Trusted orchestration only. Never import this module from PR-controlled execution.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import {
  PreviewError,
  previewProject,
  previewParent,
  vercelProject,
  vercelTeam,
  repository,
} from "./preview-policy.mjs";
import { verifyPreviewBranch } from "./preview-lifecycle.mjs";

export function previewProvider(env = process.env) {
  const variable = `BS_PREVIEW_${env.PREVIEW_PR}`;
  const key = Buffer.from(env.PREVIEW_STATE_KEY ?? "", "hex");
  if (key.length !== 32)
    throw new PreviewError("Private preview registry key required");
  const githubBase = `https://api.github.com/repos/${repository}`;
  const neonBase = `https://console.neon.tech/api/v2/projects/${previewProject}`;
  async function request(base, token, path, method = "GET", body) {
    const url = new URL(base + path);
    if (url.hostname === "api.vercel.com")
      url.searchParams.set("teamId", vercelTeam);
    const response = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new PreviewError(
        `Provider request failed (${url.hostname}, ${response.status}); registry preserved`,
      );
    return response.status === 204 ? {} : response.json().catch(() => ({}));
  }
  const gh = (path, method, body) =>
    request(githubBase, env.GH_TOKEN, path, method, body);
  const neon = (path, method, body) =>
    request(neonBase, env.NEON_API_KEY, path, method, body);
  const vercel = (path, method, body) =>
    request("https://api.vercel.com", env.VERCEL_TOKEN, path, method, body);
  async function branches() {
    const result = await neon("/branches?limit=100");
    if (!result || result.pagination?.next)
      throw new PreviewError("Branch capacity is unknown");
    return result.branches;
  }
  function encrypt(record) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(variable));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(record)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }
  const api = {
    gh,
    neon,
    vercel,
    async load() {
      const saved = await gh(`/actions/variables/${variable}`);
      if (!saved) return null;
      const bytes = Buffer.from(saved.value, "base64");
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      cipher.setAAD(Buffer.from(variable));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          cipher.update(bytes.subarray(28)),
          cipher.final(),
        ]).toString(),
      );
    },
    async save(record) {
      const exists = await gh(`/actions/variables/${variable}`);
      const result = await gh(
        exists ? `/actions/variables/${variable}` : "/actions/variables",
        exists ? "PATCH" : "POST",
        { name: variable, value: encrypt(record) },
      );
      if (!result)
        throw new PreviewError("Cannot persist private preview registry");
    },
    async capacity() {
      const [{ project }, all, team, deployments] = await Promise.all([
        neon(""),
        branches(),
        vercel(`/v2/teams/${vercelTeam}`),
        vercel(`/v6/deployments?limit=100&since=${Date.now() - 86400000}`),
      ]);
      return {
        neonPlan: project.owner?.subscription_type,
        branchLimit: project.owner?.branches_limit,
        branches: all.length,
        vercelPlan: team?.billing?.plan,
        vercelDaily: Array.isArray(deployments?.deployments)
          ? deployments.deployments.length
          : undefined,
        vercelActive: deployments?.deployments?.filter((deployment) =>
          ["BUILDING", "INITIALIZING", "QUEUED"].includes(deployment.state),
        ).length,
      };
    },
    async findBranch(name) {
      return (await branches()).find((branch) => branch.name === name);
    },
    async createBranch(name) {
      const result = await neon("/branches", "POST", {
        branch: { name, parent_id: previewParent },
        endpoints: [
          {
            type: "read_write",
            autoscaling_limit_min_cu: 0.25,
            autoscaling_limit_max_cu: 0.25,
            suspend_timeout_seconds: 300,
          },
        ],
      });
      return result.branch;
    },
    async branch(id) {
      return (await neon(`/branches/${id}`))?.branch ?? null;
    },
    async children(id) {
      return (await branches()).filter((branch) => branch.parent_id === id);
    },
    async removeBranch(id) {
      await neon(`/branches/${id}`, "DELETE");
    },
    async storage(record) {
      const path = `/branches/${record.branchId}`;
      const existing = await neon(path + "/credentials");
      if (
        existing.credentials?.some(
          (credential) => credential.name === record.name,
        )
      )
        throw new PreviewError(
          "Storage credential response was lost; explicit cleanup is required, never rotate silently",
        );
      const buckets = await neon(path + "/buckets");
      if (!buckets.buckets?.some((bucket) => bucket.name === "preview-images"))
        await neon(path + "/buckets", "POST", {
          name: "preview-images",
          access_level: "private",
        });
      const credential = await neon(path + "/credentials", "POST", {
        name: record.name,
        principal_type: "user",
        scopes: ["storage:read", "storage:write"],
      });
      if (credential.branch_id !== record.branchId)
        throw new PreviewError(
          "Storage credential identity verification failed",
        );
      return credential;
    },
    async revokeStorage(branchId, id) {
      if (!/^nak_live_[a-zA-Z0-9]+$/.test(id))
        throw new PreviewError("Invalid registered storage credential");
      await neon(`/branches/${branchId}/credentials/${id}`, "DELETE");
    },
    async deployments(token) {
      const result = await vercel(
        `/v6/deployments?projectId=${vercelProject}&limit=100&meta-bottomShelfPreview=${token}`,
      );
      if (!result || result.pagination?.next)
        throw new PreviewError("Deployment inventory incomplete; refuse reuse");
      // List endpoint omits some identity fields; verify each actual deployment.
      return Promise.all(
        result.deployments.map((item) => api.deployment(item.uid)),
      );
    },
    async deployment(id) {
      return vercel(`/v13/deployments/${id}`);
    },
    async removeDeployment(id) {
      await vercel(`/v13/deployments/${id}`, "DELETE");
    },
    async retiredUrl(host) {
      const response = await fetch(`https://${host}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      await response.body?.cancel();
      return [404, 410].includes(response.status);
    },
    async removeOrigin(domain) {
      const path = `/branches/${previewParent}/auth/domains`;
      const result = await neon(path);
      if (
        result.domains?.some(
          (item) => (typeof item === "string" ? item : item.domain) === domain,
        )
      )
        await neon(path, "DELETE", {
          auth_provider: "better_auth",
          domains: [{ domain }],
        });
    },
    async addOrigin(domain) {
      await neon(`/branches/${previewParent}/auth/domains`, "POST", {
        auth_provider: "better_auth",
        domain,
      });
    },
    async bootstrap(record) {
      verifyPreviewBranch(record, await api.branch(record.branchId));
      const { uri } = await neon(
        `/connection_uri?branch_id=${record.branchId}&database_name=neondb&role_name=neondb_owner&pooled=false`,
      );
      const source = new URL(uri);
      source.searchParams.set("sslmode", "verify-full");
      if (source.hostname.includes("-pooler"))
        throw new PreviewError("Bootstrap requires a direct target");
      const client = new Client({
        connectionString: source.toString(),
        connectionTimeoutMillis: 10000,
      });
      try {
        await client.connect();
        const {
          rows: [identity],
        } = await client.query(
          "SELECT current_setting('neon.project_id',true) AS project, current_setting('neon.branch_id',true) AS branch, current_database() AS database, current_user AS role",
        );
        if (
          identity.project !== previewProject ||
          identity.branch !== record.branchId ||
          identity.database !== "neondb" ||
          identity.role !== "neondb_owner"
        )
          throw new PreviewError(
            "Bootstrap database identity verification failed",
          );
        const names = ["bs_preview_migrator", "bs_preview_runtime"];
        if (!record.passwords) {
          const { rows } = await client.query(
            "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])",
            [names],
          );
          if (rows.length)
            throw new PreviewError(
              "Existing preview credentials missing; inspect registry, never rotate",
            );
          record.passwords = Object.fromEntries(
            names.map((name) => [name, randomBytes(32).toString("hex")]),
          );
          await api.save(record);
        }
        for (const name of names) {
          const password = record.passwords[name];
          if (!/^[a-f0-9]{64}$/.test(password))
            throw new PreviewError("Invalid registered SQL credential");
          const { rows } = await client.query(
            "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,pg_has_role(oid,'neon_superuser','member') AS admin FROM pg_roles WHERE rolname=$1",
            [name],
          );
          if (rows.length && Object.values(rows[0]).some(Boolean))
            throw new PreviewError("Preview role is privileged");
          if (!rows.length)
            await client.query(
              `CREATE ROLE "${name}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
            );
        }
        await client.query('GRANT "bs_preview_migrator" TO CURRENT_USER');
        for (const database of ["bs_preview", "bs_probe"]) {
          const { rows } = await client.query(
            "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
            [database],
          );
          if (rows.length && rows[0].owner !== "bs_preview_migrator")
            throw new PreviewError("Preview database owner differs");
          // Only the registered probe database is disposable; preview app data persist.
          if (database === "bs_probe" && rows.length)
            await client.query('DROP DATABASE "bs_probe" WITH (FORCE)');
          if (!rows.length || database === "bs_probe")
            await client.query(
              `CREATE DATABASE "${database}" OWNER "bs_preview_migrator"`,
            );
          await client.query(
            `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`,
          );
          await client.query(
            `GRANT CONNECT ON DATABASE "${database}" TO "bs_preview_runtime"`,
          );
        }
        record.sqlHost = source.hostname;
        await api.save(record);
      } finally {
        await client.end();
      }
    },
    async executionEnvironment(name, input) {
      await gh(`/environments/${name}`, "PUT", {
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
        },
      });
      const rules = await gh(
        `/environments/${name}/deployment-branch-policies`,
      );
      for (const rule of rules.branch_policies ?? [])
        if (rule.name !== "main" || rule.type !== "branch")
          await gh(
            `/environments/${name}/deployment-branch-policies/${rule.id}`,
            "DELETE",
          );
      if (
        !rules.branch_policies?.some(
          (rule) => rule.name === "main" && rule.type === "branch",
        )
      )
        await gh(`/environments/${name}/deployment-branch-policies`, "POST", {
          name: "main",
          type: "branch",
        });
      const result = spawnSync(
        "gh",
        ["secret", "set", "PREVIEW_INPUT", "--repo", repository, "--env", name],
        {
          input: JSON.stringify(input),
          encoding: "utf8",
          env: { ...process.env, GH_TOKEN: env.GH_TOKEN },
        },
      );
      if (result.error || result.status !== 0)
        throw new PreviewError("Cannot store scoped execution input");
    },
  };
  return api;
}

export function previewRuntime(
  record,
  env = process.env,
  database = "bs_preview",
) {
  const target = {
    projectId: previewProject,
    branchId: record.branchId,
    database,
    migrator: "bs_preview_migrator",
    runtime: "bs_preview_runtime",
    bucket: "preview-images",
    storageKeyId: record.storageKeyId,
  };
  const url = (role) => {
    const connection = new URL(
      `postgresql://${record.sqlHost}/${database}?sslmode=verify-full`,
    );
    connection.username = role;
    connection.password = record.passwords[role];
    return connection.toString();
  };
  const runtime = {
    APP_ENV: "preview",
    PREVIEW_TARGET: JSON.stringify(target),
    DATABASE_URL: url(target.runtime),
    AWS_ENDPOINT_URL_S3: `https://${record.branchId}.storage.c-8.eu-central-1.aws.neon.tech`,
    AWS_REGION: "eu-central-1",
    AWS_ACCESS_KEY_ID: record.storageKeyId,
    AWS_SECRET_ACCESS_KEY: record.storageSecret,
    STORAGE_BUCKET: target.bucket,
    FOUNDATION_CHECK_ENABLED: "true",
  };
  for (const name of [
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "OWNER_USER_ID",
    "OWNER_EMAIL",
  ]) {
    if (!env[name])
      throw new PreviewError(
        "Stable nonproduction Auth configuration required",
      );
    runtime[name] = env[name];
  }
  return {
    runtime,
    migration: {
      APP_ENV: "preview",
      PREVIEW_TARGET: runtime.PREVIEW_TARGET,
      DATABASE_MIGRATION_URL: url(target.migrator),
    },
  };
}
