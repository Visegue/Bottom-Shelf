# Report preview evidence on the approved PR head

The protected-main preview controller publishes the commit status
`Preview / verified` on the exact approved PR head. It marks that head pending
before candidate execution and successful only after quality/browser checks,
scoped real SQL/storage verification, deployment and PR-alias smoke pass.
Publication rechecks the current PR, writer permission and control-main SHA.
Failure, cancellation, skipped deployment, missing URL and stale heads never
produce success. The status links to the actual GitHub run.

Only trusted host code receives `statuses: write`; candidate execution still
receives no GitHub, Vercel or management token. Repository writers and reviewers
remain trusted. Protect workflow/control-code changes through the repository's
review rules: an Actions status is not a cryptographic attestation against an
administrator or a writer allowed to replace the required workflows.

Human same-repository PRs run automatically. After reviewing a bot PR, a human
writer may dispatch protected main with its PR number and exact full SHA. This
explicit route gets the same tests and status; the bot cannot dispatch itself
through this controller. Forks receive no preview credentials: import reviewed
changes into a human-owned same-repository replacement PR and link the original.
Never treat a skipped fork/bot deployment as verification.

A separate unprivileged CI job runs the real migration transaction runner on
disposable local Postgres. It bootstraps empty schema, repeats migrations,
upgrades the pinned previous schema with retained data, and executes the actual
previous and current foundation app modules against real SQL after upgrade and
new writes. S3 is a deterministic fixture in this compatibility job; real private
S3/Neon target boundaries remain the scoped preview checks. The migration job
receives only synthetic local credentials and gates the existing test deployment.

The pinned foundation baseline in `config/compatibility.json` must remain an
available supported release, not be moved to hide an incompatible migration.
The current app has no inventory CRUD. Add representative contracts and all
distinct supported app/schema versions as those features and production/rollback
releases arrive; this probe does not establish future production compatibility.

Activate required checks only after their real GitHub evidence exists on the
current protected main: existing quality/end-to-end plus
`migration-compatibility` and `Preview / verified`. Verify the actual check names
and GitHub Actions source in the ruleset, with an up-to-date branch requirement.
The main-context `preview` job itself is not the PR-head gate. Keep an authorized
maintainer recovery path; do not weaken missing/failed evidence into success.

Provider capacity/payment failures stop deployment without upgrades or resets.
Before alias publication a failure leaves the old address intact. If smoke fails
after publication, restore the previous deployment, or remove only the failed
first alias; verify recovery and report an explicit manual-recovery error if it
cannot be confirmed. This is failed-publication recovery, not PR-close cleanup.
Database migrations are never reversed by an app/alias rollback.

Before deployment, snapshot every other registered PR alias in this project's
domain list; after publication and smoke, verify its project/deployment ID is
unchanged. This provides provider evidence for the shared queue's cross-PR
address boundary. A mismatch fails the run and recovers only this run's own
alias, never another PR's. Incomplete domain listing (more than 100 domains)
fails closed pending an explicit capacity/design review; no broader token or
automatic cleanup/upgrade is introduced.
