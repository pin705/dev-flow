# Devflow

Devflow is a local-first, policy-driven code review product.

- Primary experience: CLI and VS Code extension
- Web role: control plane for workspaces, providers, Polar billing, policies, history, audit, and docs
- Package manager: `pnpm`
- Local dev stack: `Docker Compose` with hot reload and Postgres

## Monorepo

```text
apps/
  web/       Next.js control plane and docs host
  cli/       devflow CLI
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

- `devflow auth login`
- `devflow auth logout`
- `devflow config set-provider`
- `devflow review`
- `devflow explain`
- `devflow tests`
- `devflow history`
- `devflow doctor`

Current status:

- command UX works
- device auth, bootstrap, history sync, and remote history reads now go through control-plane APIs
- local scaffold review works with offline fallback
- history is stored locally and can sync to the web control plane
- real Qwen execution is still pending

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
- billing state is wired into the shared control-plane service, but webhook reconciliation and DB persistence are still pending

## Getting started

### Local

```bash
pnpm install
cp apps/web/env.example.txt apps/web/.env.local
pnpm dev
```

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

## Environment

Core variables live in [apps/web/env.example.txt](/Users/bon/Documents/my-workspace/next-shadcn-dashboard-starter/apps/web/env.example.txt).

Main groups:

- Clerk auth: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Postgres: `DATABASE_URL`
- Polar billing: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID_*`, `POLAR_SERVER`
- App URL: `DEVFLOW_APP_URL`
- Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

## Testing

```bash
pnpm test:unit
pnpm test:e2e:install
pnpm test:e2e
pnpm test
pnpm check
```

What is covered now:

- docs-content loaders and navigation
- review-core request/session logic
- CLI login/provider/review/history flows
- control-plane service lifecycle for device auth, synced history, usage, and audit events
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

This repo now looks like Devflow instead of the original dashboard starter, but a few production-critical systems are still scaffolded:

- real DB persistence for client APIs
- browser approval UI for device auth on top of Clerk sessions
- real Qwen headless execution
- billing webhook persistence and reconciliation
- extension packaging/release flow

The foundation, cleanup, docs, Docker flow, test harness, and Polar billing direction are in place.
