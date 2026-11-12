# Automatic preview acceptance

Track actual GitHub evidence for #17 and #18 separately from local and operator
tests. Shared preview SQL and private images must survive every exercise.

## First automatic run (#17)

Open a non-draft, human-authored PR from this repository against protected
`main`. Its committed source must pass the existing quality and browser checks.
The `pull_request_target` preview must also complete candidate checks, scoped
migration/history and SQL/storage checks, deployment and PR-alias smoke.

Record the PR, full head SHA, control SHA, workflow run and preview URL. A manual
dispatch, operator deployment, skipped run or another revision's success does
not satisfy this acceptance criterion. Existing real Google owner login,
session restoration and SQL/private-image probe evidence is recorded in #17.

## Queue and stale revisions (#18)

Use two trusted PRs. Queue a second revision while another preview runs, then
advance the queued PR again. Verify that the obsolete head cannot move its
alias; the latest head must receive its own successful run. Verify both PR
addresses independently and confirm that updating one preserves the other's
deployment. Record GitHub run IDs and deployment/alias identities.

Do not reset shared data, roll back migrations, delete shared resources or
change stable Auth as part of these exercises. Use compatible, additive changes
only. Closing an acceptance PR preserves its preview address and data under
ADR 0005.

## Merge gates and recovery (#18)

Preview evidence must be reported on the exact PR head before it becomes a
required merge check. The main-context orchestration check alone is insufficient.
Bootstrap, upgrade, prior-version compatibility, skipped external contributions,
provider quota failures and failure after migration need explicit evidence;
do not enable a mandatory migration gate based only on successful SQL execution.
