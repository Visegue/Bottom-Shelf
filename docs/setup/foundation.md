# Foundation setup and evidence

Scope: issue #3, specification #2 user stories 1, 2 and 40. This document records a test foundation, not completed production approval.

## Isolated resources

Created on 2026-10-12 in the existing free accounts:

- Neon organisation `org-square-snow-87638979` (`free`).
- Neon project **Bottom Shelf** (`blue-bar-96694914`), AWS Frankfurt (`aws-eu-central-1`).
- Branch `br-mute-art-baqyyyu3` (`test`), database `neondb`, fixed 0.25 CU compute. Free-plan scale-to-zero is managed by Neon; explicitly setting its suspend interval is disallowed on this account.
- Managed Better Auth endpoint: `https://ep-dawn-art-ba8u0dpl.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth`.
- Private bucket `foundation-checks` on that branch. Credentials have only `storage:read` and `storage:write`; no AI Gateway or Functions scope.
- Vercel project `visegue/bottom-shelf` on Hobby. `vercel.json` sets all functions to `fra1` (Frankfurt). Node.js 24.
- Approved Auth return origins: `http://localhost:3000` and `https://bottom-shelf.vercel.app`.

The dedicated Neon project has no real inventory data. `.env.local`, `.neon`, `.vercel`, browser authentication state and test reports are ignored by Git. `.vercelignore` excludes environment files and Auth fixtures from upload. All connection values are server-only; none use `NEXT_PUBLIC_`. A separate production project/branch, credentials, Auth configuration and bucket must be provisioned before storing real inventory. Never branch production data into this test project.

## Access boundary

Every connection check obtains a current session directly from Managed Auth, bypasses its signed session-data cache, and requires **all three**: the immutable `OWNER_USER_ID`, the matching `OWNER_EMAIL`, and a verified email. No client-provided identity is accepted. The page guard also checks ownership; middleware alone is insufficient.

An email can be configured before the immutable ID to permit the first Google sign-in. Private operations still fail closed until both are present. Take the ID from that user's Managed Auth record and pin it; do not change the app to trust any signed-in user.

The app proxy only exposes Google social sign-in, session restoration and sign-out. Email registration, email sign-in and other providers are denied. Disable unused login methods in the Neon branch as well. Other accounts may authenticate at the identity provider but cannot access the app's private operations. Auth responses and private API responses use `private, no-store`; no inventory data is placed in shared caches. POST requests require the same origin. The SDK handles its OAuth verifier through `/check` middleware.

`APP_ENV=test` and `FOUNDATION_CHECK_ENABLED=true` are both required for the probe. Set the flag to `false` when the foundation check is no longer needed. It does not run in a production data environment. Each request uses random row/object identifiers and owner predicates. Both cleanup operations are attempted after failures; success is reported only after the row and image are confirmed absent. Cleanup failures return `cleanup`; logs include only the random run ID so an operator can find `checks/<encoded owner ID>/<run ID>.png`. There is no arbitrary-file API.

## Reproducible migrations and checks

`npm run db:migrate` uses a separate direct owner connection and reads numbered SQL migrations in order. `schema_migrations` records a SHA-256 checksum. The applied history must be an unchanged prefix of the files; removed, reordered or edited applied migrations fail. All pending changes and their records run in a transaction under a database advisory lock. Add a new file for later schema changes. The first migration creates only the ephemeral `foundation_checks` table; migration 002 grants its required DML rights to the SQL-created `bottom_shelf_app_runtime` login. `npm run db:check` verifies that the app login cannot administer schema or migration history. Run migrations separately; deployment does not silently migrate a database.

`npm test` exercises Swedish/English persistence, Google failure/retry, denied private page access, direct anonymous access, mismatched user IDs/emails, unverified identity, origin checks and blocked registration/providers on mobile and desktop. The external Auth fixture runs on `127.0.0.1:4101`; it is not shipped or referenced by production code.

`npm run test:services` exercises the **app's server route through its browser UI** with actual isolated Postgres and actual private Object Storage. Its Auth response is deterministic at the external provider boundary; this is not proof of Google OAuth. It compares downloaded PNG bytes, requires unsigned GET to return 401/403, deletes both resources, and verifies absence. The 68-byte PNG is fixed app-owned test data, not an upload form. Image format/size limits for inventory uploads belong to later tickets.

For real deployed verification, capture a genuine Google session in an interactive browser:

```sh
npx playwright codegen --save-storage=tests/owner.auth-state.json https://bottom-shelf.vercel.app
```

Sign in manually, reach `/check`, and close the recorder browser so it saves the state. The ignored `*.auth-state.json` file contains session credentials; keep it local. Then run:

```sh
LIVE_BASE_URL=https://bottom-shelf.vercel.app \
LIVE_STORAGE_STATE=/absolute/path/owner.auth-state.json npm run test:live
```

This suite starts no mock services and uses the deployed app. It requires a genuine owner session and fails if it is missing or expired. Do not count it as passed until it has actually run. Signed-in checks cover both screen sizes; a fresh anonymous context must receive 401.

## Setup reference and remaining verification

1. Configure your own Google OAuth client (Web application) in [Google Cloud Console](https://console.cloud.google.com/auth/clients). Configure branding, support email and test users in Google Auth Platform; use only the required identity scopes. Google can require its own account/consent verification; an agent cannot complete that sign-in for you.
2. Add this exact **authorized redirect URI** to that Google client:

   `https://ep-dawn-art-ba8u0dpl.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth/callback/google`

   The Google redirect is the Neon URL, not the Vercel homepage. App origins are `http://localhost:3000` and `https://bottom-shelf.vercel.app`.

3. Update the existing Google provider in [the Neon test branch](https://console.neon.tech/app/projects/blue-bar-96694914/branches/br-mute-art-baqyyyu3) using the Neon OAuth-provider API/MCP and your development Client ID and secret. The checked Console dialog currently shows shared-key information without credential inputs. Put handoff values only in private, ignored `.env.google.local`; never commit them or include them in chat/screenshots. On 2026-10-14, the connected Neon plugin saved the supplied development credentials. Read-back verified provider type `standard`, matching Client ID and a present secret. The owner has since completed Google sign-in and its verified Google user ID is configured. On 2026-10-15, the user supplied a screenshot of the deployed owner session and successful database/private-image probe; independent reads confirmed zero probe rows and an empty bucket.
4. Configure `OWNER_EMAIL` locally and in Vercel. Sign in with that account, then copy its immutable ID from Neon Auth → Users to `OWNER_USER_ID` locally and in Vercel. Until the ID is pinned, no private check can run. Use a test account in Google's consent screen if the client is in Testing status. For a local test, restart the dev server after environment changes.
5. Server configuration must be transferred to [Vercel environment settings](https://vercel.com/visegue/bottom-shelf/settings/environment-variables), scoped to this test app (runtime role only; never `DATABASE_MIGRATION_URL`): `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`, `APP_ENV`, `FOUNDATION_CHECK_ENABLED`, and owner identity. Mark database/password/signing-key values sensitive. Values are already held in the ignored local `.env.local`; don't print or paste them into source control. The user explicitly approved this Vercel destination on 2026-10-13 and the runtime configuration was transferred successfully; owner email and immutable Google user ID are now configured. Redeploy after configuration using `vercel deploy --prod --yes --scope visegue`; this Vercel deployment target still uses the **test** Neon environment. No Git commit or push is needed.
6. Sign in on the deployed URL, reload `/check`, run the connection check and verify successful cleanup. Check that an anonymous context and another Google account cannot run it. Verify real sign-out and session restoration. Run `test:live` with that genuine session and record its result.
7. Custom Resend SMTP is configured on the test branch with its preview key. A real production environment requires its separate credentials and Google project. No paid service or architecture change has been approved.

## Current free-plan requirements (verified 2026-10-12)

The [current Neon pricing page](https://neon.com/pricing) lists Free as permanent with no credit card: 100 projects, 10 branches/project, 100 CU-hours/project, 1 GB Postgres storage/project (20 GB total), 5 GB Object Storage/project, 5 GB public network transfer/project shared by storage, and up to 60,000 Auth monthly active users. Compute/egress exhaustion suspends compute; database storage exhaustion blocks writes. No paid upgrade or billing change was made.

[Vercel Hobby](https://vercel.com/docs/plans/hobby) is appropriate for this personal app. Current included allowances: 100 GB fast data transfer, 10 GB fast origin transfer, 1 million CDN requests, 1 million function invocations, 4 active CPU hours and 360 GB-hours provisioned memory. Hobby has a single function region and up to 100 deployments/day. Exceeding most usage limits pauses the feature until its window resets. No Pro trial, payment method or automatic upgrade was enabled.

## Google-only SMTP question

The [Managed Auth production checklist](https://neon.com/docs/auth/production-checklist) tells production applications to replace shared SMTP with a custom email provider. It does **not** document an exception for Google-only applications. Verification links require custom SMTP; codes work with shared SMTP. The [OAuth guide](https://neon.com/docs/auth/guides/setup-oauth) independently requires own Google credentials for production.

The app has no email login or password-recovery flow and does not send mail itself, but that does not establish an exemption from the provider's checklist. The user chose Resend and supplied separate preview/production keys. Custom SMTP is saved and read-back verified on the test branch, using the preview key. SMTP TLS authentication passed; no email was sent, and end-to-end email delivery is unverified. A Google-only exemption is no longer needed for this setup. Production itself still needs a separate environment and its own supplied key; no alternative Auth architecture or paid plan was selected.

## Evidence and outstanding acceptance criteria

Verified locally under Node.js 24: lockfile-based dependency installation, typecheck, production build, 22 browser/server access tests, both real database/storage browser probes, repeat migration without changes, and empty private bucket after probes. Vercel deployment is READY at https://bottom-shelf.vercel.app; deployment inspection confirms server functions in fra1. The deployed landing page, language switching, mobile layout and missing-configuration message were checked in a browser. A direct anonymous POST to the deployed /api/foundation returned HTTP 401 with private, no-store. Independent post-test checks confirmed zero probe rows and an empty bucket. An automated accessibility scan found no violations; the decorative brand dot required manual contrast review and is hidden from assistive technology. Deterministic Auth test identities have never been provisioned as production app logins.

On 2026-10-15, the user supplied a screenshot showing the expected owner signed in and the successful deployed connection check: database and private image storage verified, temporary data and image removed. Independent reads confirmed zero rows in `foundation_checks` and no objects in the private bucket. This is manual deployed-flow evidence, not a run of `test:live`. The user also confirmed successful sign-out followed by a fresh Google sign-in on 2026-10-15. The manual deployed auth/probe flow is verified. The optional automated deployed suite with a captured genuine session has not run. Publication and first CI verification follow the completed manual checks; inventory features, paid plans and pull requests are outside this implementation scope.

The quality gates, GitHub changes and updated handoff from 2026-10-13 are documented in [delivery.md](delivery.md). Use its staged deploy procedure instead of direct promotion for future changes.
