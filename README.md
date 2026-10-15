# Bottom Shelf

Minimal private Next.js/TypeScript foundation for [issue #3](https://github.com/Visegue/Botton-Shelf/issues/3), scoped by [specification #2](https://github.com/Visegue/Botton-Shelf/issues/2).

Requires Node.js 24 and npm. Local development and Vercel use the same Node.js major version. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
cp .env.example .env.local # only on a fresh checkout; preserve existing configuration
npm run db:provision # creates a non-admin SQL login in an isolated test DB
npm run db:migrate  # direct owner connection, separate from runtime
npm run db:check
npm run dev
```

Configure server-only variables using `.env.example`. Without configuration, the landing page remains available and protected operations fail closed. Swedish and English are selected with a persistent cookie.

```sh
npm run verify            # format, lint, types, script tests, synthetic build, browser tests
npm test                  # isolated external Auth fixture; no database needed
npm run test:services     # real isolated Neon database + storage; Auth fixture
npm run build
```

Run `npx playwright install chromium` once before browser tests. The service tests require the isolated credentials in `.env.local`; never use a production database or bucket. Tests do not provide a production login bypass: the Auth fixture runs separately, on loopback, and is excluded from deployment.

The app exposes Google sign-in, sign-out, and an owner-only connection check. The check writes, reads, and deletes a temporary Postgres row and an app-owned 1×1 PNG. It verifies unsigned storage access is denied and verifies cleanup. It accepts no upload, SQL, object key or user ID from callers. There is no inventory CRUD yet.

[Setup, exact remaining steps and verification evidence](docs/setup/foundation.md).

[CI/CD, GitHub settings, secrets and deployment runbook](docs/setup/delivery.md).
