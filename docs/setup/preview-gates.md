# Preview evidence, compatibility and recovery

[ADR 0006](../adr/0006-exact-head-preview-evidence.md) defines the exact-head status
and trusted contribution paths. [Acceptance protocol](preview-acceptance.md)
defines the separate GitHub queue exercises.

## Exact-head evidence

`Preview / verified` is pending while the trusted controller tests the approved
head. It succeeds only after deployment and PR-alias smoke. Failure/cancellation
reports failure when the request remains current; a stale request cannot write
a success. A newer head starts with no successful status of its own. A killed
runner may leave pending evidence; a fresh exact-head run is the recovery.

Human repository writers can retry from Actions → PR preview → Run workflow on
`main`, supplying PR number and full current SHA. This also verifies reviewed
same-repository Dependabot PRs; automatic bot previews stay excluded. Review
package/lockfile and workflow changes before dispatch. For a fork, review and
import into a same-repository replacement PR, linking the original; do not
change a fork's trust classification or pass it secrets.

Before requiring new checks, verify the actual GitHub contexts for quality,
end-to-end, `migration-compatibility`, and `Preview / verified`; require current
branches and preserve existing reviews/other checks. Verify missing, failing and
skipped previews cannot merge. Rule activation is a repository setting, separate
from committing the workflow. Do not mark #18 complete until that behavior and
the real queue/stale-head exercises are recorded.

## Local migration compatibility

Use a fresh local Postgres 17 fixture, with synthetic credentials, on loopback:

```sh
TEST_DATABASE_URL=postgresql://postgres:synthetic-ci-only@127.0.0.1:55432/postgres \
  npm run test:migrations
```

This command does not load `.env` or use application credentials. It refuses
non-loopback hosts and Neon identities and creates its own databases/roles;
pre-existing names fail instead of being cleared. Its own resources are cleaned
after success or failure. It uses the same migration transaction runner as the
target-verifying deployment CLI; the CLI's target checks remain mandatory.

The current foundation baseline is `6eb5104410a2b0c770472fa423af2c24fbe0429d`.
CI checks out history so the test reads its actual SQL and application source.
Old/current app probes execute real Postgres queries under a restricted runtime
role. Only the copied test environment uses a synthetic storage-key fingerprint;
real environment configuration is unchanged. S3 is a deterministic adapter here,
so this is not new evidence for Google OAuth or actual private object storage.
Future inventory schemas need their own representative data/contracts and every
distinct supported release; production compatibility remains part of #14/#19.

## Failure recovery

- **Quota/payment failure (HTTP 429/402):** stop, inspect provider limits and
  wait/retry from current main and head. Never upgrade a plan automatically.
- **Migration failure:** the transaction rolls back pending SQL/history. Fix with
  an additional migration where needed; never edit applied history.
- **Build/direct smoke failure after migration:** the previous alias stays served.
  Database changes remain, so the previous app must remain compatible.
- **Alias smoke failure:** restore and verify the old deployment, or remove only
  the controller's failed first alias. No database/data reset occurs.
- **Unconfirmed alias recovery:** inspect project/PR/deployment IDs and restore a
  known compatible deployment manually. A run remains failed even after recovery.

Regression tests inject 402/429, failed builds, alias smoke failure and failed
recovery through the real deploy orchestrator. They do not exhaust paid/live
provider quotas. The local SQL test also proves transaction rollback on a failing
pending migration and that previous app code still operates afterward.
