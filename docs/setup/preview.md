# Shared preview

[ADR 0005](../adr/0005-shared-persistent-preview.md) records the user-approved simplification of #17. One persistent preview database and private bucket are separate from development and the existing deployed test app. All reviewed PR revisions share these data and one stable address, `https://bottom-shelf-preview.vercel.app`. Closing a PR leaves them intact. The latest successful requested deployment owns that address; earlier direct deployment URLs are not separate data environments.

## Configuration

The fixed target is pinned in `config/environments.json`: Neon project `blue-bar-96694914`, branch `br-holy-bird-barhw055` (`preview`), database `bs_preview`, SQL roles `bs_preview_migrator` / `bs_preview_runtime`, and private bucket `preview-images`. The access-key identifier is checked against a SHA-256 fingerprint; credentials are never committed. Stable test Auth and its verified owner are reused. The copied parent database/admin credentials are used only for initial operator provisioning, never by CI or the app.

GitHub environment `preview-control` is restricted to the exact `main` branch. It contains the four existing stable Auth/owner secrets plus `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and project-scoped `VERCEL_TOKEN`. Its variable `AWS_ENDPOINT_URL_S3` points to the fixed branch. Runtime SQL cannot administer schema or write migration history. Only runtime credentials reach Vercel; the migration credential remains in the isolated execution container.

No `NEON_API_KEY`, `PREVIEW_ADMIN_TOKEN`, `PREVIEW_STATE_KEY`, `PREVIEW_REFERENCE`, dynamic GitHub environment, per-PR resource registry or CI resource-deletion step is required. The two old state/reference secrets may remain unused in GitHub until removed; preserve their private recovery material. Do not create broader Vercel credentials: deployment reads the pinned project and uses its APIs, without a team/billing-profile lookup. Vercel quota/API errors fail the run; no plan upgrades are requested. Before initial provisioning, the actual Neon Free allowance was 10 branches with two in use and Vercel was Hobby.

Initial setup is an operator action: provision fresh SQL roles/database on this branch, migrate once, load the saved #16 reference once and verify real SQL/private S3. Preserve private credential and reference files outside Git. Register only the fixed preview origin on stable test Auth. Existing Production-target Vercel variables describe the deployed test app; keep Preview-target shared variables empty because each deployment receives its complete runtime configuration explicitly.

## Requested deployment

After this workflow exists on protected main, dispatch `Requested shared preview` from current `main` with an open reviewed same-repository PR number and full approved head SHA. Forks, bots, drafts, moved heads and non-writer operators are rejected. Jobs are serialized across all PRs and never canceled mid-migration.

The trusted main checkout approves the revision, tests candidate source in a pinned Docker container, then runs migrations and real database/storage checks in a container with only scoped preview input. Candidate code cannot access host cache/repository tokens, runner files, Docker socket or the Vercel token. Trusted code uploads from a fresh `source` checkout that is never mounted into candidate execution (including its Git metadata), using the exact committed source to the Vercel API, checks Preview target/project/SHA/readiness, performs landing-page and anonymous-access smoke, rechecks approval, then assigns and verifies the fixed preview alias. The ordinary read-only `GITHUB_TOKEN` only reads approval metadata; GitHub configuration is not mutated by CI.

Migrations preserve existing data and reject removed/edited applied history. If a run fails before alias assignment, the previous app keeps the shared address, but its database may already be migrated: use backward-compatible expand/contract changes. Deployment failure never resets data or rolls migrations back. Old PR revisions lacking current migrations are rejected. Explicit reset or teardown is a separate operator action, never triggered by closing a PR.

## Acceptance and remaining work

Local automated tests and initial SQL/S3 provisioning are recorded separately from a real GitHub preview run. The earlier dynamic design's tests/CI are not evidence for this replacement. A complete acceptance result still needs a dispatched run from protected main, actual Vercel Preview creation/alias, and Google owner sign-in on the fixed address. `npm run test:live` can verify a genuine saved session; Auth-fixture service tests do not prove Google login. Check session restoration, owner-bound database/image access, foreign-origin rejection, anonymous image denial and probe cleanup.

Per-PR resources, automatic PR-triggered deployment, branch lifecycle, disposable migration-bootstrap databases and automatic resource deletion are deferred. Existing development/test data, stable Auth and production settings remain separate from the shared preview.

## Verified on 19 October 2026

The fixed preview branch, private bucket and fresh SQL roles/database were provisioned through the operator path. Migration/history and non-admin runtime permission checks passed. The initial S3 probe returned `403 InvalidAccessKeyId` because the credential's bearer `api_token` was used; switching to the documented S3 `token_id` with the same saved secret fixed the same probe. Saved reference import and repeat read passed without replacing existing data/images. Both desktop/mobile service probes passed against real preview SQL/S3 using fixture Auth.

The simplified code passed `npm run check` (35 script tests, format, lint, types, production build), 22 browser tests and actionlint. A reviewer found a Git replacement attack against the writable candidate checkout; a separate pristine source checkout fixes it, and the real attack is covered by a passing regression test. Re-review: zero remaining Standards/Spec findings. Scoped SQL/S3 and stable test Auth secrets are configured in the main-only GitHub environment; the dedicated Vercel secret is present. No Neon management API key or GitHub admin token was created. Actual dispatched CI, Preview alias and Google owner acceptance are recorded separately when performed.
