import targets from "../config/environments.json" with { type: "json" };
import {
  PreviewError,
  previewProject,
  previewParent,
  vercelProject,
  requirePreviewCapacity,
} from "./preview-policy.mjs";
export function verifyPreviewRecord(record) {
  if (
    !Number.isSafeInteger(record.pr) ||
    record.pr < 1 ||
    !/^[a-f0-9]{16}$/.test(record.token) ||
    record.name !== `preview-${record.pr}-${record.token}` ||
    (record.branchId &&
      (!/^br-[a-z0-9-]+$/.test(record.branchId) ||
        Object.values(targets).some(
          (target) => target.branchId === record.branchId,
        )))
  )
    throw new PreviewError("Preview identity is invalid or protected");
}
export function verifyPreviewBranch(record, actual) {
  verifyPreviewRecord(record);
  if (
    !actual ||
    actual.id !== record.branchId ||
    actual.project_id !== previewProject ||
    actual.parent_id !== previewParent ||
    actual.name !== record.name ||
    actual.default ||
    actual.protected
  )
    throw new PreviewError("Preview branch identity verification failed");
}
export async function retirePreview(record, api) {
  verifyPreviewRecord(record);
  const found = await api.deployments(record.token);
  for (const deployment of found) {
    if (
      deployment.projectId !== vercelProject ||
      deployment.target != null ||
      deployment.meta?.bottomShelfPreview !== record.token ||
      !/^dpl_[a-zA-Z0-9]+$/.test(deployment.id) ||
      !/^[a-z0-9-]+\.vercel\.app$/.test(deployment.url)
    )
      throw new PreviewError("Preview deployment identity verification failed");
    if (!record.deployments.some((saved) => saved.id === deployment.id))
      record.deployments.push({ id: deployment.id, url: deployment.url });
  }
  // Persist direct addresses before destructive operations, including unknown-outcome deployments.
  await api.save(record);
  for (const deployment of record.deployments) {
    if (
      !/^dpl_[a-zA-Z0-9]+$/.test(deployment.id) ||
      !/^[a-z0-9-]+\.vercel\.app$/.test(deployment.url)
    )
      throw new PreviewError("Preview deployment identity verification failed");
    const actual = await api.deployment(deployment.id);
    if (actual) {
      if (
        actual.id !== deployment.id ||
        actual.url !== deployment.url ||
        actual.projectId !== vercelProject ||
        actual.target != null ||
        actual.meta?.bottomShelfPreview !== record.token
      )
        throw new PreviewError("Saved deployment identity verification failed");
      await api.removeDeployment(deployment.id);
    }
    if (
      (await api.deployment(deployment.id)) ||
      !(await api.retiredUrl(deployment.url))
    )
      throw new PreviewError(
        "Preview URL retirement is incomplete; preserve resources and retry",
      );
    await api.removeOrigin(`https://${deployment.url}`);
  }
  record.status = "retired";
  await api.save(record);
}
export async function cleanupPreview(record, api) {
  verifyPreviewRecord(record);
  if (!record.branchId) {
    const actual = await api.findBranch(record.name);
    if (actual) {
      record.branchId = actual.id;
      verifyPreviewBranch(record, actual);
      await api.save(record);
    }
  }
  if (record.branchId) {
    const actual = await api.branch(record.branchId);
    if (actual) {
      verifyPreviewBranch(record, actual);
      if ((await api.children(record.branchId)).length)
        throw new PreviewError(
          "Preview has descendants; inspect before cleanup",
        );
    }
  }
  await retirePreview(record, api);
  if (record.branchId && (await api.branch(record.branchId))) {
    if (record.storageKeyId)
      await api.revokeStorage(record.branchId, record.storageKeyId);
    await api.removeBranch(record.branchId);
    if (await api.branch(record.branchId))
      throw new PreviewError("Preview cleanup incomplete");
  }
  record.status = "deleted";
  await api.save(record);
}
export async function preparePreview(record, api) {
  verifyPreviewRecord(record);
  if (record.status === "deleted")
    throw new PreviewError(
      "Deleted preview requires a new registered generation",
    );
  await api.save(record);
  if (!record.branchId) {
    const capacity = await api.capacity();
    let actual = await api.findBranch(record.name);
    requirePreviewCapacity(capacity, actual ? 0 : 1);
    actual ??= await api.createBranch(record.name);
    record.branchId = actual.id;
    verifyPreviewBranch(record, actual);
    await api.save(record);
  }
  verifyPreviewBranch(record, await api.branch(record.branchId));
  if ((await api.children(record.branchId)).length)
    throw new PreviewError("Preview has descendants; inspect before reuse");
  await retirePreview(record, api);
  // Passwords are persisted by the trusted bootstrap adapter before CREATE ROLE.
  await api.bootstrap(record);
  if (!record.storageKeyId) {
    const credential = await api.storage(record);
    record.storageKeyId = credential.token_id;
    record.storageSecret = credential.s3_secret_access_key;
    await api.save(record);
  }
  record.status = "prepared";
  await api.save(record);
  return record;
}
