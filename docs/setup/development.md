# Isolated local development

Use Node 24 (`.node-version`). The app runs locally; PostgreSQL and private images stay on Neon. The existing deployed test app and its Google configuration are preserved.

## Current environment matrix

All Neon resources below belong to project `blue-bar-96694914` (Bottom Shelf, Frankfurt). Vercel project `prj_9mmJV4XIqdZyvhtpwh2amkiQS2k6` remains unchanged.

| Purpose                    | Actual resource                                                                                                                           | Configuration                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Local app data             | `development`, `br-lingering-water-bawa84pd`; endpoint `ep-purple-pond-ba9o3ow8`; database `bottom_shelf_development`                     | `APP_ENV=development`, `DATABASE_URL`; runtime `bottom_shelf_dev_runtime`                           |
| Local migrations           | Same database, direct endpoint                                                                                                            | `DATABASE_MIGRATION_URL`; `bottom_shelf_dev_migrator`, never injected into the app                  |
| Local private images       | Development branch; bucket `development-images`                                                                                           | `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` |
| Stable test Auth           | `test`, `br-mute-art-baqyyyu3`; `neondb`                                                                                                  | `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `OWNER_USER_ID`, `OWNER_EMAIL`                     |
| Existing deployed test app | Same test branch; database `neondb`; bucket `foundation-checks`                                                                           | Existing Vercel `test` GitHub environment / Vercel Production target, `APP_ENV=test`                |
| Saved reference            | Private `.env.reference.local/reference.json`; seeded image under `reference/<verified-owner>/<fixture-id>.png` in the development bucket | `REFERENCE_DATA_FILE` optionally selects a privately transferred archive                            |
| PR previews                | Not provisioned; #17–18                                                                                                                   | No implicit fallback to development/test credentials                                                |
| Real production            | Not provisioned; #19                                                                                                                      | Separate Auth and credentials required; `APP_ENV=production` currently fails closed                 |

`config/environments.json` pins actual identities and the non-secret development storage credential **identifier**. The S3 secret is kept only in ignored files. A branch name or `.env` marker is not proof of identity: scripts query Neon's postmaster-only `neon.project_id` / `neon.branch_id`, plus `current_database()` and `current_user`, before their first write.

## Start and migrate

Private configuration is already prepared in the issue #16 worktree. Transfer it privately if using another checkout; keep file permissions `600`. Never paste credentials in chat, issues or logs.

```sh
npm ci
npm run dev:bootstrap # explicit provisioning; never part of startup/deployment
npm run dev:migrate   # explicit additive migrations; never run by the app
npm run dev:check     # actual identity, runtime permissions, scoped storage access
npm run dev:seed      # explicit, idempotent saved-reference import
npm run dev
```

Next.js reads `.env.development.local` before `.env.local`; inherited shell variables override both. Do not export old test credentials in the shell. The runtime file contains no migration or bootstrap password. The separate `.env.development.admin.local` contains only the scoped migrator, while `.env.bootstrap.local` is an operator-only input. Do not upload either admin file to Vercel or PR code.

Initial operator setup uses the Neon connector: create the development branch from nonproduction `test`, create its private `development-images` bucket and issue a storage read/write credential **on the development branch**. In an ignored, mode-600 `.env.bootstrap.local`, set `APP_ENV=development`, `DATABASE_BOOTSTRAP_URL` (direct `neondb_owner` connection to the development branch's `neondb`, `sslmode=verify-full`), the existing stable Auth/verified owner variables and the development S3 variables. Pin newly created actual IDs in the registry before running bootstrap; do not substitute environment names. No management token is required by the app.

Bootstrap creates fresh development-only SQL roles and a separate app database. It persists generated passwords before role creation so retries preserve them. It rejects a database owned by another role, never resets passwords, and refuses to overwrite differing private configuration. Do not delete its `.env.development.credentials.local` recovery file; losing it requires operator investigation, not automatic rotation. It revokes public database access and grants the runtime only connection plus probe table permissions. The copied `neondb`/Auth schema on the child is unused by the app.

## Saved reference and persistence

The private reference archive contains `version: 1`, the actual verified stable-Auth `ownerId`, that service's `sourceAuthUrl`, UUID `id` and `nonce`, and the base64 app-owned 1×1 PNG in `image`. It contains no production inventory. The initial archive was prepared after checking the configured owner ID, email and verified status against the stable Auth database; it was not derived from an email guess. Preserve this archive outside Git and transfer it privately to bootstrap another reviewed nonproduction target.

The seed command rejects another owner or Auth source and existing conflicting rows/images. It never clears tables or replaces existing images. Ordinary startup and migrations do not seed or reset data. Export, deliberate reset and reference-update tooling remain #20.

```sh
node --env-file=.env.development.local scripts/seed-development.mjs --check
npm run dev:migrate
node --env-file=.env.development.local scripts/seed-development.mjs --check
```

`--check` only reads; it fails instead of recreating missing data. This proves the saved row and image survive migration.

## Verification on 18 October 2026

- Bootstrap and migration rerun successfully without credential rotation; the saved row/image pass check-only verification before and after migration.
- `dev:check` proves non-admin runtime, no schema creation or migration-table writes, and access to the intended storage bucket.
- Real Google SSO in the app browser returns the verified owner using stable test Auth; the local connection check passes against the separate development database and private images, including anonymous denial and cleanup.
- Service tests independently exercise real development PostgreSQL/S3 with an external Auth fixture. They are not evidence of Google login by themselves: `APP_ENV=development npm run test:services`.
- Development SQL and S3 credentials are denied on the parent test branch. A copied parent administrator password authenticates on the child, but a migration configured for test rejects the actual child branch before any write; table/history counts remain unchanged.
- A parent storage key can access a descendant bucket at the provider level. The development app, bootstrap and storage command reject that key by its pinned identifier before writing. Development's own key cannot access the parent. Parent/operator credentials remain higher trust; the application guard does not revoke their provider-level access. Future branches must provision their own roles/keys and registry identities, rather than copying `.env` files.

The existing test branch, deployed test credentials and OAuth settings were not modified. No paid capacity upgrade was made. The existing CI deployment repair from PR #13 is included in this delivery so main can deploy with its scoped token. Preview/production pipelines in #17–19 remain separate work.
