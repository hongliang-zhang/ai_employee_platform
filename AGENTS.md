# z-mono — Agent Guide

This file is the entry point for all agent runs. It is a **map, not a manual** — read this first, then follow pointers to deeper sources.

## What is this project?

**Agent as a Service (AaaS)** — a platform that lets users deploy AI agents accessible via IM channels (Telegram, etc.). Users configure an agent; the platform routes messages, manages sandboxes, and persists conversation history.

Current state: **MVP** — single-agent, Telegram only, internal use.

## Repository layout

<!-- DOC-GARDENING-CHANGE: 2026-04-16
  - Added agent-sdk to repository layout: The packages/ directory contains agent-sdk which was not listed
-->
<!-- DOC-GARDENING-FLAG: Database provider inconsistency detected. AGENTS.md and .env.example mention PostgreSQL/Supabase, but schema.prisma declares `provider = "mysql"` and migrations use MySQL/TiDB syntax. Cannot determine which is correct without human confirmation. -->
```
z-mono/
  packages/
    gateway/      # Trusted service: message history + LLM proxy (Node.js/Express)
    dispatcher/   # Telegram polling + sandbox lifecycle management (Node.js)
    agent-sdk/    # Agent SDK for building agents that run on the AaaS harness (Node.js/Express)
    demo-agent/   # Reference agent runtime packaged as e2b template (Python/Flask)
    db/           # Database package with Prisma schema and migrations
  scripts/        # setup.ts + doc-gardening automation
  docs/           # All design, architecture, and operational knowledge (see below)
  .env.example    # Local env template (Supabase-backed local development)
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

## Key environment variables

See `.env.example` for full reference. Critical ones:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — shared secret between gateway and dispatcher (min 32 chars)
- `BOT_TOKEN_ENC_KEY` — 32-byte hex key for encrypting bot tokens at rest
- `GATEWAY_URL` — **public** URL of gateway (used by e2b sandboxes; cannot be localhost)
- `GATEWAY_LOCAL_URL` — local URL of gateway (used by dispatcher on same machine)
- `E2B_API_KEY` — e2b cloud API key

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

## Agent operating principles

- **All knowledge lives in the repo.** Decisions made in chat or docs outside this repo do not exist to you. If something is architecturally important, encode it here.
- **Follow the architecture.** gateway owns storage and LLM access. dispatcher owns sandbox lifecycle. demo-agent owns agent logic. Do not introduce cross-boundary direct access.
- **Sandboxes are untrusted.** They receive a scoped JWT with a 24h expiry and `caller: 'sandbox'`. They must not receive platform secrets.
- **Migrations are append-only.** Never modify existing migration files. Add new numbered files.
- **Error responses follow the shape** `{ error: { code, message, retryable, details } }` — maintain this contract in all new routes.
- **Check `docs/QUALITY_SCORE.md`** before starting work — it lists known gaps and areas that need test coverage.
