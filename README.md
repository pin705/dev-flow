# Diffmint

Local-first, policy-driven code review for teams that live in the CLI and VS Code.

Diffmint combines three surfaces:

- a CLI for local review flows
- a VS Code extension companion
- a web control plane for workspaces, policies, providers, history, audit, docs, and optional billing

Demo: [diffmint.deplio.app](https://diffmint.deplio.app)

## Why Diffmint

Most review tooling forces developers into a remote web UI too early. Diffmint keeps the primary loop local, then syncs the parts that matter operationally:

- review local diffs before a PR exists
- attach workspace policy to synced sessions
- keep audit, history, provider configuration, and docs in one control plane
- support self-hosted deployment with Postgres-backed persistence

## Status

Diffmint is an active open source monorepo and is usable for local evaluation and self-hosting.

Current maturity:

- CLI: working local-first review/auth/history flows
- Web control plane: working workspace, provider, policy, history, audit, docs, and billing surfaces
- VS Code: working command integration, with packaging and release polish still in progress

Production note:

- the web control plane requires persistent storage in production
- when `NODE_ENV=production`, the app now fails fast without `DATABASE_URL`

## Highlights

- `dm auth login` device flow with browser approval
- `dm review`, `dm explain`, `dm tests`, `dm history`, `dm doctor`
- workspace-scoped policies and provider configuration
- synced review history and audit trail
- public docs plus dashboard docs center from one MDX source
- optional Clerk auth and optional Polar billing integration
- Dokploy-ready Docker Compose deployment

## Monorepo Layout

```text
apps/
  web/       Next.js control plane and docs host
  cli/       dm CLI
  vscode/    VS Code extension companion
packages/
  contracts/      shared API contracts and types
  review-core/    local review runtime and orchestration
  policy-engine/  policy bundle generation and review rules
  docs-content/   versioned MDX documentation source
docs/
  project docs and implementation notes
```

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- pnpm workspaces
- Clerk for auth and organizations
- Postgres + Drizzle ORM for persistent control-plane state
- Polar for optional billing flows

## Quick Start

### Requirements

- Node.js 22+
- pnpm 10+
- Postgres 16+ for persistent local or production state

### Local Development

```bash
pnpm install
cp apps/web/env.example.txt apps/web/.env.local
pnpm dev
```

Default local surface:

- web app: `http://localhost:3000`

### Database Setup

If you want persistent control-plane state outside Docker:

```bash
pnpm db:migrate
pnpm db:seed
```

`db:seed` initializes the default control-plane records. It does not inject fake review history into the app.

### Docker Development

```bash
pnpm docker:dev
pnpm docker:dev:logs
pnpm docker:dev:down
pnpm docker:dev:reset
```

This starts:

- the web app on `http://localhost:3000`
- Postgres on `localhost:5432`
- migration and seed flow before app startup

Health endpoints:

- live: `/api/health/live`
- ready: `/api/health/ready`

## Deploying With Dokploy

Use [docker-compose.dokploy.yml](./docker-compose.dokploy.yml) for one-shot deployment on Dokploy.

Recommended flow:

```bash
cp dokploy.env.example .env.dokploy
docker compose -f docker-compose.dokploy.yml --env-file .env.dokploy config
```

Then add the values from [dokploy.env.example](./dokploy.env.example) into Dokploy and deploy the compose stack.

What the Dokploy stack does:

- starts Postgres with a persistent volume
- runs `pnpm --dir apps/web db:migrate` once before the app boots
- builds the production web image from `apps/web/Dockerfile`
- keeps the app listening on container port `3000` without binding that port on the host
- forces persistent control-plane storage with `DIFFMINT_REQUIRE_PERSISTENCE=true`

## Environment

Reference values live in [apps/web/env.example.txt](./apps/web/env.example.txt).

Main groups:

- Auth: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Database: `DATABASE_URL`
- Persistence policy: `DIFFMINT_REQUIRE_PERSISTENCE`
- Billing: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID_*`, `POLAR_SERVER`
- App URLs: `DIFFMINT_APP_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`
- Release signing: `DIFFMINT_RELEASE_SIGNING_PRIVATE_KEY`, `DIFFMINT_RELEASE_SIGNING_KEY_ID`
- Security headers: `DIFFMINT_ENABLE_HSTS`

Useful local override:

```bash
DIFFMINT_DISABLE_CLERK=true NEXT_PUBLIC_DIFFMINT_DISABLE_CLERK=true pnpm start:web
```

## Product Surfaces

### CLI

Implemented commands:

- `dm auth login`
- `dm auth logout`
- `dm config set-provider`
- `dm review`
- `dm explain`
- `dm tests`
- `dm history`
- `dm doctor`

### VS Code

Implemented commands:

- Review Current Changes
- Review Staged Changes
- Review Selected Files
- Explain Current File
- Generate Tests
- Open History
- Open Team Rules
- Sign In

### Web

Primary routes:

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

## Documentation

Canonical docs live in `packages/docs-content/content`.

Useful entry points:

- `/docs/getting-started/5-minute-quickstart`
- `/docs/getting-started/docker-development`
- `/docs/admin/workspace-setup`
- `/docs/admin/billing-with-polar`
- `/docs/security/privacy-and-redaction`

## Testing

```bash
pnpm test:unit
pnpm test:e2e:install
pnpm test:e2e
pnpm check
```

The test suite currently covers:

- docs-content loading and navigation
- review-core request/session logic
- CLI auth/provider/review/history flows
- control-plane service lifecycle
- client API auth and sync routes
- dashboard workspace scoping
- Polar helper and route guardrails
- public docs and install smoke flows

## Roadmap

Areas still being hardened:

- release manifest publishing and updater flow
- VS Code packaging and release polish
- deeper billing reconciliation beyond the current webhook-driven snapshot updates

## Contributing

Issues and pull requests are welcome.

Recommended contributor flow:

```bash
pnpm install
pnpm check
pnpm test:unit
```

If your change touches the web control plane and persistence-sensitive paths, also run:

```bash
pnpm db:migrate
pnpm build
```

## License

MIT. See [LICENSE](./LICENSE).
