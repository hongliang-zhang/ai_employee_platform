# z-mono — Agent Guide

This file is the entry point for all agent runs. It is a **map, not a manual** — read this first, then follow pointers to deeper sources.

## What is this project?

**Agent Runtime** — a platform for deploying and operating sandboxed AI agents across IM channels (Telegram, Feishu, etc.). Users configure an agent; the platform routes messages, manages sandboxes, and persists conversation history.

Current state: **MVP** — internal use, with Telegram and Feishu IM integrations and sandboxed agent runtimes configured via DB records.

## Repository layout

```
z-mono/
  packages/
    gateway/      # Trusted service: message history, LLM proxy, and actions proxy (Node.js/Express)
    dispatcher/   # Telegram/Feishu polling/events + sandbox lifecycle management (Node.js)
    actions/      # Trusted service for third-party API integrations (Node.js/Express)
    agent-sdk/    # Agent SDK for building agents that run on the Agent Runtime harness (Node.js/Express)
    db/           # Database package with Prisma schema and migrations
    sandbox-base/ # Base sandbox image/runtime support for agent templates
  scripts/        # setup.ts + doc-gardening / MR review automation
  docs/           # Design, architecture, product specs, plans, and operational knowledge
  README.md       # Human onboarding overview
  .env.example    # Local env template (MySQL/TiDB-backed local development)
```

## Where to find knowledge

| Topic | File |
|-------|------|
| Architecture + service boundaries | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Core design beliefs | [docs/design-docs/core-beliefs.md](./docs/design-docs/core-beliefs.md) |
| Database schema (generated) | [docs/generated/db-schema.md](./docs/generated/db-schema.md) |
| Product specs | [docs/product-specs/](./docs/product-specs/) |
| Active execution plans | [docs/exec-plans/active/](./docs/exec-plans/active/) |
| Completed plans | [docs/exec-plans/completed/](./docs/exec-plans/completed/) |
| Known tech debt | [docs/exec-plans/tech-debt-tracker.md](./docs/exec-plans/tech-debt-tracker.md) |
| Quality / coverage gaps | [docs/QUALITY_SCORE.md](./docs/QUALITY_SCORE.md) |
| Security model | [docs/SECURITY.md](./docs/SECURITY.md) |
| Reliability + error handling | [docs/RELIABILITY.md](./docs/RELIABILITY.md) |
| Local development setup | [docs/LOCAL-DEV.md](./docs/LOCAL-DEV.md) |
| CLI tools available | [docs/references/cli-tools.md](./docs/references/cli-tools.md) |

## Key environment variables

See `.env.example` for full reference. Critical ones:

- `DATABASE_URL` — MySQL/TiDB connection string
- `JWT_SECRET` — shared secret between gateway and dispatcher (min 32 chars)
- `BOT_TOKEN_ENC_KEY` — 32-byte hex key for encrypting bot tokens at rest
- `GATEWAY_URL` — **public** URL of gateway (used by e2b sandboxes; cannot be localhost)
- `GATEWAY_LOCAL_URL` — local URL of gateway (used by dispatcher on same machine)
- `E2B_API_KEY` — e2b/AGS API key
- `E2B_DOMAIN` — optional sandbox backend domain; use `ap-beijing.tencentags.com` for Tencent Cloud AGS
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` — optional object storage config for gateway file storage routes
- `INTERNAL_API_KEY` — shared service-to-service auth key for trusted internal HTTP calls; never expose to sandboxes
- `ACTIONS_SERVICE_URL` — gateway → Actions Service internal routing URL

Actions Service may require third-party API credentials depending on enabled actions; see `packages/actions/README.md` and `.env.example` for those optional per-action variables.

## Development workflow

```bash
# Reuse existing local env if present; only initialize from template when missing
test -f .env || cp .env.example .env

# Run migrations + seed DB
pnpm --filter @aaas/db migrate:deploy
pnpm tsx scripts/setup.ts

# Run all tests
pnpm test

# Run a single package's tests
pnpm --filter @aaas/gateway test
pnpm --filter @aaas/dispatcher test
```

## Git workflow

- **Remote GitLab**: `dev.aminer.cn` — direct pushes to `master` are blocked; all changes merge via MR
- See [docs/references/cli-tools.md](./docs/references/cli-tools.md) for available CLI tools (`glab`, `ags`, etc.)

## Agent operating principles

- **All knowledge lives in the repo.** Decisions made in chat or docs outside this repo do not exist to you. If something is architecturally important, encode it here.
- **Follow the architecture.** Gateway owns sandbox-facing conversation/file storage APIs, LLM access, and proxying to Actions Service. Actions Service owns third-party API credentials/integrations. Dispatcher owns IM integration, IM dedup/lease records, and sandbox lifecycle. Agent runtime code lives outside this repo (for example, in the agent-sub project). Do not introduce cross-boundary direct access.
- **Sandboxes are untrusted.** They receive a scoped JWT with a 24h expiry and `caller: 'sandbox'`. They must not receive platform secrets.
- **Migrations are append-only.** Never modify existing migration files. Add new numbered files.
- **Error responses follow the shape** `{ error: { code, message, retryable, details } }` — maintain this contract in all new routes.
- **Check `docs/QUALITY_SCORE.md`** before starting work — it lists known gaps and areas that need test coverage.
