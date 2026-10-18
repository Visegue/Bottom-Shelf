# Requested isolated previews (#17)

## Status and trust boundary

The implementation on `codex/feat/17-trusted-preview` is based on main `9c6c17574dc949cdf90b2c8df4158d405e8869e4` and is being published for review. This workflow has **not** run in GitHub. No preview branch, credential, deployment, Auth origin or GitHub environment has been created by this work. A green local check is not CI migration evidence or a verified Google integration.

`.github/workflows/preview.yml` is explicitly dispatched from current protected main with an open, reviewed same-repository PR number and its full approved head SHA. It rechecks the PR immediately before provisioning and deployment; a moved head or main stops the operation. Fork and bot PRs are refused. The approved **head commit**, rather than a moving merge ref, is tested and uploaded byte-for-byte. The existing main deployment repair from #13 is already present in this baseline; #13 remains closed.

Only pinned main code and its lockfile run in the `preview-control` environment. Quality and migration jobs use separate GitHub-hosted runners. The migration runner receives only this preview's scoped SQL/S3 credentials, stable nonproduction Auth configuration and saved reference. Vercel installs/builds the approved source remotely with runtime credentials only. Trusted deployment uploads source bytes through the API; it does not execute that source. No management key is put in a PR checkout's installation, migration or build environment. Execution logs are withheld because PR code can print private credentials/reference data.

The non-git Vercel create-deployment API's documented default target is Preview; no `production`, `staging`, production alias or Git branch inference is used. The response is checked for the Preview target and the pinned project. Inherited project Preview variables are refused; configure none there. The deployment receives a complete per-deployment runtime/build environment instead. Existing Production/test configuration is preserved.

## One-time protected setup (after publication is authorized)

Use the existing Neon project `blue-bar-96694914` and Vercel project `prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6` / team `team_J9VXW7YbzLRuOTDPUyQTpEUP`. Preserve the #16 worktree, recovery file and private reference archive described in [development.md](development.md).

Create a GitHub environment named `preview-control`, restricted to the **main branch only**, and keep its management secrets out of repository-wide secrets. Configure these environment secrets privately:

- `PREVIEW_ADMIN_TOKEN`: repository-scoped operator credential able to read PR/actor metadata, manage Actions variables, environments and environment secrets. The ordinary execution `GITHUB_TOKEN` stays read-only.
- `NEON_API_KEY`, `VERCEL_TOKEN`: existing project/operator management credentials, never copied to execution environments. The Vercel token must read team billing-plan metadata as well as project/deployment APIs. Read-only probes confirmed that the locally authenticated operator can do this, while the existing `.env.ci.local` deployment token receives 403 for the team endpoint. Do not replace or widen the existing test environment token; configure the suitable operator credential only in `preview-control`. No token was rotated, copied to CI or published during this work.
- `PREVIEW_STATE_KEY`: independently generated 32 random bytes encoded as 64 hex characters. Preserve a private recovery copy. Changing or losing this key makes the registry unreadable; never delete the registry to get past a failure.
- `PREVIEW_REFERENCE`: the exact private saved #16 reference JSON, not an export of current development or production data.
- `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `OWNER_USER_ID`, `OWNER_EMAIL`: the existing verified stable **test** Auth configuration. Never substitute production Auth or invent an owner ID.

Verify the actual Vercel account is Hobby and the project has no Preview variables, including any integration/shared variables that might inject unrelated credentials. Disable automatic Vercel Git PR deployments while using this requested path; automatic PR lifecycle is #18. Keep the project's existing Production environment and ruleset unchanged. Do not require new preview merge checks yet.

The trusted job creates `preview-<PR>-migration`, with an exact `main` deployment-branch policy, and stores only scoped `PREVIEW_INPUT` there. A PR workflow cannot use it from its own branch. There are no management secrets in this environment.

## Run and verify

After the trusted workflow exists on protected main, dispatch `Requested isolated preview` there with `action=deploy`, `pr=<number>` and `sha=<full approved head SHA>`. Review that revision before dispatching. Do not approve a new head implicitly after it moves.

A new preview is a child of stable nonproduction test, **never development or production**. Copied parent schemas/credentials are not treated as an isolation boundary. Fresh `bs_preview_migrator` and `bs_preview_runtime` passwords, a new private `preview-images` bucket and a credential anchored on this exact branch establish the app's boundary. The copied `neondb` and Auth are unused. Only the operator retains the copied bootstrap administrator credential. App database `bs_preview` persists between deployments; disposable `bs_probe` is rebuilt explicitly for migration bootstrap tests.

The repository Actions variable (written only by trusted orchestration) `BS_PREVIEW_<PR>` stores an AES-256-GCM encrypted registry (authenticated to its variable name): generation token, actual resource IDs, SQL passwords, branch-scoped storage key/secret, deployment IDs/addresses and code identity. Treat the state key and encrypted registry together as recovery material. Registration precedes resource creation; an uncertain create is recovered by the unique recorded name, not by adopting an arbitrary existing branch. Never manually edit ciphertext or copy credentials between previews.

Before migrating a reused preview, old registered deployments are deleted and their direct addresses must return 404/410; Auth origins are removed. Resources are not reused while retirement is incomplete. The execution job then:

1. Initializes a new persistent database from the previous app schema and saved reference; it does not reset an existing database.
2. Boots candidate migrations into empty `bs_probe`, checks complete checksummed history and imports the saved reference.
3. Upgrades persistent `bs_preview`, checks history/permissions and preserves the saved reference. Runtime can read migration names/checksums but cannot change migration history or create schema objects. Applied SQL is never rewritten.
4. Runs the existing previous/candidate app service probes against real SQL/private S3, including the previous app after candidate migrations and writes. Its external Auth fixture is deliberately not Google-login evidence. For the previous app only, its non-secret development target registry is adapted to the preview; application code is unchanged.
5. Uploads the exact approved source to Vercel Preview, checks deployment identity/readiness and landing-page/anonymous-access smoke, and registers only that exact direct origin on stable Auth.

A smoke-passed deployment is recorded as **`awaiting-google-integration`**, not an accepted preview. On that exact address, complete real Google login as the verified owner, verify the current session, and run the connection check. It must report owner-bound database write/read, private image write/read, anonymous image denial and cleanup. Verify a foreign Origin is denied, cookies remain host-scoped, and an arbitrary origin is absent from stable Auth's allowlist. Save a real browser session only in an ignored private file; never upload Google passwords, cookies, storage state or OAuth credentials to CI.

Existing `npm run test:live` can repeat the authenticated connection probe with `LIVE_BASE_URL` and a private `LIVE_STORAGE_STATE` after interactive Google login. Record the exact deployment URL, approved SHA, GitHub run, Google/session result and private-data/image result here once actually performed. This local iteration has no such result to record.

## Free capacity and recovery

On 18 October 2026 the actual Neon project reports `free_v3`, a 10-branch allowance and **2 existing branches** (test and development). Official published Free allowances are 100 CU-hours/project/month, 1 GB Postgres/project, 5 GB object storage/project and 5 GB public transfer/project/month. Vercel Hobby allows 100 deployments per rolling 24 hours and one concurrent build; provider quota responses must stop the run. These are shared allowances, not a promise that eight previews always fit.

The provisioning adapter queries the current Neon plan/branch count/allowance and Vercel billing plan before a new branch is made. It refuses unknown/non-free plans and full branch capacity. GitHub serializes requested preview operations. Quota errors preserve registered state and fail; there is no upgrade, paid-capacity request or shared-database fallback. A read-only API check on 18 October confirmed the actual Vercel team is Hobby and all 12 project variables target Production only; none target Preview. The adapter also checks the 100-deployment rolling day and occupied free build slot before branch creation and again before deployment. Consumed quotas and real provisioning/deployment behavior are rechecked by the published run.

For a transient failure, redispatch the same PR/SHA from current main. Inspect retained registered resources privately. Stored passwords are not rotated on retry. If a storage-credential response was lost, stop and explicitly clean this generation up; do not guess the secret or silently rotate it. Candidate-migration failures stop deployment and leave resources/data available for inspection. If an applied migration is absent/edited in a later candidate, restore that file and add a new backward-compatible migration. Never clear `schema_migrations` or reverse data transitions to get green.

For explicit deletion, dispatch `action=cleanup` for the PR (the PR may be closed; a SHA is unnecessary). It verifies the branch's actual project, parent, name, protection status and absence of descendants; verifies each deployment's actual project/generation; deletes deployments, verifies old direct addresses are inaccessible, removes their exact Auth origins, revokes its storage key and deletes only the registered child branch. Repeating cleanup is safe. Partial failure retains registry/address history and stops before resource reuse. A deleted generation is retained as a tombstone until a later explicit deployment creates a fresh generation. Never reuse a deleted branch ID or bucket secret. Stable Auth, development, reference data and production cannot be selected as cleanup targets.

Automatic PR triggers/close cleanup and required merge checks remain #18. Automatic production release remains #19. Full reference export/reset remains #20.

## Local evidence and remaining acceptance

Local TDD boundaries are the approval/capacity policy, registered target identity, lifecycle/provider boundary and complete migration-history validation. Each following targeted test was run to a completed nonzero behavioral failure before its dependent implementation, then passed with the same command:

| Targeted command                                       | Observed red                                                                                                                                                                                               | Green             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `node --test tests/scripts/preview-policy.test.mjs`    | Missing rejection of a moved/untrusted PR; later missing Neon/Vercel capacity rejection; later `unprovisioned` instead of the registered branch                                                            | Each slice exit 0 |
| `node --test tests/scripts/preview-lifecycle.test.mjs` | Old URL stayed live; missing retirement/protected-target rejection; missing new branch identity; foreign saved deployment deleted before identity check; orphan branch remained after lost create response | Each slice exit 0 |
| `node --test tests/scripts/migration-history.test.mjs` | Missing rejection of incomplete current schema before reference import                                                                                                                                     | Exit 0            |

The concrete HTTP/SQL adapters and workflow wiring were added after these policy/lifecycle tests. They do not yet have an executed real-provider CI acceptance result; the local fake-provider tests must not be described as that result. Supplementary adapter tests verify encrypted registry recovery/PR binding and exclusion of management/migration credentials from runtime configuration; these were written after adapter implementation and are not claimed as earlier TDD-red.

Review found that runtime could not read the newly validated migration history. A read-only real development reference check reproduced PostgreSQL `42501` before the fix. A narrow `SELECT` grant was then added to the scoped nonproduction runtime; the same check passed, and the real runtime permission command verified that migration writes/schema creation remain denied. No inventory rows, saved images, credentials, stable Auth or production settings were reset. This additive permission change was applied to the existing development database only.

Local results: 40 script tests passed; 22 browser tests passed using an ignored temporary configuration on port 3017 because another session owns port 3000; 2 service browser tests passed against existing real development PostgreSQL/private S3 with fixture Auth. `actionlint` 1.7.12 accepted the new workflow. The final `npm run check` passed after the review fixes: formatting, lint, typecheck, all 40 script tests and production build. These service tests are development evidence, not per-preview CI or real Google-login evidence.

### Standards

The independent Standards review found no remaining documented-rule violations or significant smells. Its additional P1 permission finding was fixed and re-reviewed; zero correctness findings remain.

### Spec

The independent Spec review found no remaining actionable implementation findings after the permission fix. Published CI and real preview/Google acceptance remain pending rather than inferred from local tests.

Totals after re-review: Standards 0 findings; Spec 0 findings. Publication was subsequently authorized; commits and a PR do not establish provider acceptance. No merge is authorized by that publication request. #17 was assigned to `alefr` under the repository's start-work routine. Existing main CI [39121878970](https://github.com/Visegue/Bottom-Shelf/actions/runs/39121878970) was independently confirmed successful for the baseline; it verifies existing main code, not this local workflow.

Remaining acceptance requires protected-secret setup, trusted-main workflow availability, an actual approved PR/SHA run, real Neon SQL/S3 isolation and migration/compatibility evidence from that run, Vercel Preview/readiness/smoke, real Google/session/owner/image checks, and repeated cleanup including direct-address denial. #17 is not complete until those pass.

## Provider references checked on 18 October 2026

- [Neon plans and limits](https://neon.com/docs/introduction/plans)
- [Neon storage credential lineage/scopes](https://neon.com/docs/storage/authentication)
- [Neon official API schema](https://neon.com/api_spec/release/v2.json), including branches, private buckets, scoped credentials and exact Auth-domain add/remove requests
- [Vercel create-deployment API and Preview default](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)
- [Vercel limits](https://vercel.com/docs/limits)
- [Vercel official client deployment types](https://github.com/vercel/vercel/blob/main/packages/client/src/types.ts), including separate runtime/build environment payloads
- [GitHub secure workflow guidance](https://docs.github.com/en/actions/reference/security/secure-use)
