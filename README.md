# Diffmint

Diffmint is a local-first, policy-driven code review product.

- Primary experience: CLI and VS Code extension
- Web role: control plane for workspaces, providers, Polar billing, policies, history, audit, and docs
- Package manager: `pnpm`
- Production domain: [diffmint.io](https://diffmint.io)
- Local dev stack: `Docker Compose` with hot reload and Postgres

## Monorepo

```text
apps/
  web/       Next.js control plane and docs host
  cli/       dm CLI
  vscode/    VS Code extension companion
packages/
  contracts/      shared types and API contracts
  review-core/    local review runtime scaffold
  policy-engine/  policy bundle and prompt helpers
  docs-content/   git-managed MDX docs source
```

## Product surfaces

### CLI

Implemented command surface:

- `dm auth login`
- `dm auth logout`
- `dm config set-provider`
- `dm review`
- `dm explain`
- `dm tests`
- `dm history`
- `dm doctor`

Current status:

- command UX works
- device auth now includes browser approval, and bootstrap/history sync use approved client sessions
- local scaffold review works with offline fallback
- review commands now switch to Qwen headless mode automatically when a local `qwen` binary and
  compatible provider credentials are available
- offline sync queue preserves review uploads until the control plane is reachable again
- history is stored locally and can sync to the web control plane
- scaffold mode remains available through `DIFFMINT_REVIEW_RUNTIME=scaffold` for deterministic local
  runs and CI

### VS Code extension

Implemented command surface:

- Review Current Changes
- Review Staged Changes
- Review Selected Files
- Explain Current File
- Generate Tests
- Open History
- Open Team Rules
- Sign In

Current status:

- extension builds
- commands invoke the CLI
- production packaging and deeper IDE polish are still pending

### Web control plane

Active routes:

- `/dashboard/overview`
- `/dashboard/workspaces`
- `/dashboard/workspaces/team`
- `/dashboard/providers`
- `/dashboard/policies`
- `/dashboard/history`
- `/dashboard/audit`
- `/dashboard/billing`
- `/dashboard/docs`
- `/docs/[...slug]`
- `/install`

Removed starter/demo routes:

- products
- users
- chat
- notifications
- forms
- kanban
- react-query demo
- exclusive page
- starter overview charts

## Billing

Billing is now oriented around `Polar`.

Implemented billing pieces:

- Polar environment/config helpers
- Polar checkout route: `/api/polar/checkout`
- Polar customer portal route: `/api/polar/portal`
- Polar webhook route: `/api/polar/webhooks`
- Polar-backed billing control-plane page
- Admin doc: `/docs/admin/billing-with-polar`

Important:

- auth and workspace management still use Clerk
- billing and subscriptions use Polar
- billing state is wired into the shared control-plane service and persisted when `DATABASE_URL` is set
- Polar webhooks now update the billing snapshot and audit trail; signature validation and richer reconciliation remain to be hardened

## Getting started

### Local

```bash
pnpm install
cp apps/web/env.example.txt apps/web/.env.local
pnpm dev
```

If you want Postgres-backed control-plane state outside Docker, set `DATABASE_URL` and then run:

```bash
pnpm db:migrate
pnpm db:seed
```

For production-like environments, also set `DIFFMINT_REQUIRE_PERSISTENCE=true` so the control plane
fails fast when Postgres is unavailable instead of silently falling back to in-memory state.

### Docker

```bash
pnpm docker:dev
pnpm docker:dev:logs
pnpm docker:dev:down
pnpm docker:dev:reset
```

The Docker stack starts:

- Next.js web app on `http://localhost:3000`
- Postgres on `localhost:5432`
- migrations and seed data before the web server boots

Production builds use webpack for stability. Development keeps the normal `next dev` workflow for hot reload.

Runtime probes:

- live: `/api/health/live`
- ready: `/api/health/ready`

The Docker dev stack and production image now use the readiness endpoint for health checks.

## Environment

Core variables live in [apps/web/env.example.txt](/Users/bon/Documents/my-workspace/next-shadcn-dashboard-starter/apps/web/env.example.txt).

Main groups:

- Clerk auth: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Clerk local smoke override: `DIFFMINT_DISABLE_CLERK`, `NEXT_PUBLIC_DIFFMINT_DISABLE_CLERK`
- Postgres: `DATABASE_URL`
- strict persistence mode: `DIFFMINT_REQUIRE_PERSISTENCE`
- Polar billing: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID_*`, `POLAR_SERVER`
- App URL: `DIFFMINT_APP_URL`
- release signing: `DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY`, `DIFFMINT_RELEASE_SIGNING_KEY_ID`
- web security hardening: `DIFFMINT_ENABLE_HSTS`

The web app now emits baseline security headers for pages and APIs, including `X-Frame-Options`,
`Referrer-Policy`, and `Permissions-Policy`. `Strict-Transport-Security` is enabled in production
and can be forced on with `DIFFMINT_ENABLE_HSTS=true`.

For local production smoke tests, you can force public-mode auth behavior even if your machine has
Clerk keys in `apps/web/.env`:

```bash
DIFFMINT_DISABLE_CLERK=true NEXT_PUBLIC_DIFFMINT_DISABLE_CLERK=true pnpm start:web
```

The public release manifest endpoint can also sign CLI and VS Code release metadata when
`DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY` is set. Signed manifests include a stable `signature`
envelope with `algorithm`, `keyId`, `signedAt`, and `value`, which keeps updater and release
channel clients on a verifiable contract without changing the endpoint shape.

## Testing

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test:unit
pnpm test:e2e:install
pnpm test:e2e
pnpm test
pnpm check
```

What is covered now:

- docs-content loaders and navigation
- review-core request/session logic
- review-core runtime switching between scaffold mode and Qwen headless execution
- CLI login/provider/review/history flows
- control-plane service lifecycle for device auth, synced history, usage, and audit events
- approved client-session checks for bootstrap, policies, history, and usage routes
- dashboard access rules for authenticated and workspace-scoped pages
- Polar route guardrails and billing helpers
- public docs/install smoke flows
- client bootstrap API smoke

## Docs

Canonical docs live in `packages/docs-content/content`.

Key pages:

- `/docs/getting-started/5-minute-quickstart`
- `/docs/getting-started/docker-development`
- `/docs/admin/workspace-setup`
- `/docs/admin/billing-with-polar`
- `/docs/security/privacy-and-redaction`

## Current reality

This repo now looks like Diffmint instead of the original dashboard starter, but a few production-critical systems are still being hardened:

- advanced billing reconciliation beyond the current webhook snapshot updates
- extension packaging/release flow

The foundation, cleanup, docs, Docker flow, persistence-aware control plane, test harness, and
Polar billing direction are in place.
