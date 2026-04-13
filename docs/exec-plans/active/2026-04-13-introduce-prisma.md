# Introduce Prisma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `postgres.js` with Prisma ORM across `gateway` and `dispatcher`, enabling type-safe queries and future multi-database support (MySQL etc.).

**Architecture:** Create a shared `packages/db` package that owns the Prisma schema and exports a typed `PrismaClient` factory. Both `gateway` and `dispatcher` depend on `@aaas/db` and receive a `PrismaClient` instance via dependency injection (same pattern as the current `Db` type). Existing SQL-backed tests become Prisma-backed integration tests.

**Tech Stack:** `prisma` CLI, `@prisma/client`, pnpm workspaces, PostgreSQL (unchanged)

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `packages/db/package.json` | `@aaas/db` workspace package |
| `packages/db/prisma/schema.prisma` | Prisma schema mirroring existing DB tables |
| `packages/db/prisma/migrations/20240101000000_init/migration.sql` | Baseline migration (same SQL as `migrations/001_initial.sql`) |
| `packages/db/src/index.ts` | Exports `createPrismaClient()` and re-exports `PrismaClient`, `Prisma` |
| `packages/db/tsconfig.json` | TS config for the package |
| `packages/db/.gitignore` | Ignores `src/generated/` |

### Modified files
| File | Change |
|------|--------|
| `packages/gateway/package.json` | Add `@aaas/db`, remove `postgres` |
| `packages/gateway/src/db.ts` | Replace postgres.js wrapper with Prisma factory |
| `packages/gateway/src/routes/messages.ts` | Rewrite queries to Prisma API |
| `packages/gateway/tests/messages.test.ts` | Replace raw `postgres` fixtures with `PrismaClient` |
| `packages/dispatcher/package.json` | Add `@aaas/db`, remove `postgres` |
| `packages/dispatcher/src/db.ts` | Replace postgres.js wrapper with Prisma factory |
| `packages/dispatcher/src/conversation.ts` | Rewrite queries to Prisma API |
| `packages/dispatcher/src/inbound-jobs.ts` | Rewrite queries to Prisma API |
| `packages/dispatcher/src/index.ts` | Update startup queries to Prisma API |
| `packages/dispatcher/tests/conversation.test.ts` | Replace raw `postgres` fixtures with `PrismaClient` |
| `packages/dispatcher/tests/inbound-jobs.test.ts` | Replace raw `postgres` fixtures with `PrismaClient` |
| `scripts/setup.ts` | Replace `postgres` + manual migration with `prisma migrate deploy` + Prisma client |
| `scripts/package.json` | Add `prisma` dev dep, remove `postgres` |

### Deleted files
| File | Reason |
|------|--------|
| `migrations/001_initial.sql` | Superseded by `packages/db/prisma/migrations/20240101000000_init/migration.sql` |

---

## Task 1: Create `packages/db` package with Prisma schema

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/.gitignore`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@aaas/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/generated"]
}
```

- [ ] **Step 3: Create `packages/db/.gitignore`**

```
src/generated/
```

- [ ] **Step 4: Create `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@map("users")
}

model Agent {
  id            String   @id
  name          String
  status        String
  e2bTemplateId String   @map("e2b_template_id")
  port          Int      @default(8080)
  idleTimeoutMs Int      @default(300000) @map("idle_timeout_ms")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz()

  imConfigs     ImConfig[]
  conversations Conversation[]

  @@map("agents")
}

model ImConfig {
  id             String    @id
  agentId        String    @map("agent_id")
  platform       String    @default("telegram")
  botTokenEnc    String    @map("bot_token_enc")
  chatScope      String    @default("all") @map("chat_scope")
  status         String
  leaseOwner     String?   @map("lease_owner")
  leaseExpiresAt DateTime? @map("lease_expires_at") @db.Timestamptz()
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()

  agent Agent @relation(fields: [agentId], references: [id])

  @@map("im_configs")
}

model Conversation {
  id                String    @id
  agentId           String    @map("agent_id")
  channelKey        String    @map("channel_key")
  externalChatId    String    @map("external_chat_id")
  externalThreadKey String    @default("") @map("external_thread_key")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  lastMessageAt     DateTime? @map("last_message_at") @db.Timestamptz()

  agent       Agent        @relation(fields: [agentId], references: [id])
  messages    Message[]
  inboundJobs InboundJob[]

  @@unique([channelKey, externalChatId, externalThreadKey])
  @@map("conversations")
}

model Message {
  id                String   @id
  conversationId    String   @map("conversation_id")
  role              String
  contentJson       Json     @map("content_json")
  source            String
  externalMessageId String?  @map("external_message_id")
  metadataJson      Json     @default("{}") @map("metadata_json")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz()

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@map("messages")
}

model InboundJob {
  id                String    @id
  channelKey        String    @map("channel_key")
  externalMessageId String    @map("external_message_id")
  conversationId    String    @map("conversation_id")
  status            String
  leaseOwner        String?   @map("lease_owner")
  leaseExpiresAt    DateTime? @map("lease_expires_at") @db.Timestamptz()
  receivedAt        DateTime  @default(now()) @map("received_at") @db.Timestamptz()

  conversation Conversation @relation(fields: [conversationId], references: [id])

  @@unique([channelKey, externalMessageId])
  @@map("inbound_jobs")
}
```

- [ ] **Step 5: Create `packages/db/src/index.ts`**

```ts
export { PrismaClient } from './generated/index.js'
export type { Prisma } from './generated/index.js'

export function createPrismaClient(datasourceUrl: string) {
  const { PrismaClient } = require('./generated/index.js')
  return new PrismaClient({ datasources: { db: { url: datasourceUrl } } })
}
```

Wait — ESM doesn't allow `require`. Use:

```ts
import { PrismaClient } from './generated/index.js'

export { PrismaClient }
export type { Prisma } from './generated/index.js'

export function createPrismaClient(datasourceUrl: string) {
  return new PrismaClient({ datasourceUrl })
}

export type Db = ReturnType<typeof createPrismaClient>
```

- [ ] **Step 6: Install deps and generate client**

Run from the **monorepo root** (required to wire pnpm workspace links):

```bash
pnpm install
DATABASE_URL=postgresql://aaas:aaas@localhost:5432/aaas pnpm --filter @aaas/db generate
```

Expected: Prisma generates `packages/db/src/generated/` with the typed client.

- [ ] **Step 7: Verify generated types exist**

```bash
ls packages/db/src/generated/
```

Expected: `index.js`, `index.d.ts`, `runtime/`, etc.

- [ ] **Step 8: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add @aaas/db shared Prisma package"
```

---

## Task 2: Set up Prisma migrations

**Files:**
- Create: `packages/db/prisma/migrations/20240101000000_init/migration.sql`
- Create: `packages/db/prisma/migrations/migration_lock.toml`
- Delete: `migrations/001_initial.sql`

The goal is to make `prisma migrate deploy` idempotent — safe to run on a fresh or already-migrated DB.

- [ ] **Step 1: Create `packages/db/prisma/migrations/migration_lock.toml`**

```toml
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

- [ ] **Step 2: Create baseline migration SQL**

Create `packages/db/prisma/migrations/20240101000000_init/migration.sql` with the exact content of `migrations/001_initial.sql`:

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('active','paused','deleted')),
  e2b_template_id TEXT NOT NULL,
  port            INT  NOT NULL DEFAULT 8080,
  idle_timeout_ms INT  NOT NULL DEFAULT 300000,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE im_configs (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id),
  platform         TEXT NOT NULL DEFAULT 'telegram',
  bot_token_enc    TEXT NOT NULL,
  chat_scope       TEXT NOT NULL DEFAULT 'all',
  status           TEXT NOT NULL CHECK (status IN ('active','paused','disabled')),
  lease_owner      TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversations (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  channel_key         TEXT NOT NULL,
  external_chat_id    TEXT NOT NULL,
  external_thread_key TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_message_at     TIMESTAMPTZ,
  UNIQUE (channel_key, external_chat_id, external_thread_key)
);

CREATE TABLE messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id),
  role                TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content_json        JSONB NOT NULL,
  source              TEXT NOT NULL CHECK (source IN ('im','sandbox')),
  external_message_id TEXT,
  metadata_json       JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inbound_jobs (
  id                  TEXT PRIMARY KEY,
  channel_key         TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id),
  status              TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
  lease_owner         TEXT,
  lease_expires_at    TIMESTAMPTZ,
  received_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_key, external_message_id)
);

CREATE INDEX idx_inbound_jobs_recovery ON inbound_jobs (status, lease_expires_at)
  WHERE status = 'processing';
```

- [ ] **Step 3: Mark baseline migration as already applied (for existing DBs)**

Run this against the dev DB to tell Prisma "this migration was already applied externally":

```bash
cd packages/db
DATABASE_URL=postgresql://aaas:aaas@localhost:5432/aaas npx prisma migrate resolve --applied 20240101000000_init
```

Expected: `Migration 20240101000000_init marked as applied.`

For fresh DBs (CI, new dev machines), `prisma migrate deploy` will apply the migration normally.

- [ ] **Step 4: Verify `prisma migrate status` is clean**

```bash
cd packages/db
DATABASE_URL=postgresql://aaas:aaas@localhost:5432/aaas npx prisma migrate status
```

Expected: `All migrations have been applied.`

- [ ] **Step 5: Delete old migration file**

```bash
rm migrations/001_initial.sql
rmdir migrations
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/migrations/ migrations/
git commit -m "feat(db): add Prisma baseline migration, remove raw SQL migrations/"
```

---

## Task 3: Update `packages/gateway` to use Prisma

**Files:**
- Modify: `packages/gateway/package.json`
- Modify: `packages/gateway/src/db.ts`
- Modify: `packages/gateway/src/routes/messages.ts`
- Modify: `packages/gateway/tests/messages.test.ts`

- [ ] **Step 1: Update `packages/gateway/package.json`**

Replace `"postgres": "^3.4.4"` with `"@aaas/db": "workspace:*"` in `dependencies`:

```json
{
  "name": "@aaas/gateway",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@aaas/db": "workspace:*",
    "@paralleldrive/cuid2": "^3.3.0",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.0.0",
    "@types/supertest": "^7.2.0",
    "supertest": "^7.2.2",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Run `pnpm install` to wire workspace dep**

```bash
pnpm install
```

Expected: `@aaas/db` linked in `packages/gateway/node_modules/`.

- [ ] **Step 3: Rewrite `packages/gateway/src/db.ts`**

Replace entire file:

```ts
import { createPrismaClient } from '@aaas/db'

export { createPrismaClient as createDb }
export type { Db } from '@aaas/db'
```

Wait — `Db` is exported from `@aaas/db` as `ReturnType<typeof createPrismaClient>`, which is `PrismaClient`. Confirm `packages/db/src/index.ts` exports `Db`. If so, this works. The rest of the codebase imports `Db` from `./db.js` — no other file needs to change its import path.

- [ ] **Step 4: Write failing test to confirm messages route still works**

Run existing tests — they should fail because `db` no longer has the `postgres.js` interface:

```bash
cd packages/gateway && pnpm test
```

Expected: TypeScript errors or runtime failures in `routes/messages.ts` (calls to `` db`...` `` template literal).

- [ ] **Step 5: Rewrite `packages/gateway/src/routes/messages.ts`**

Replace entire file:

```ts
import { Router } from 'express'
import { createId } from '@paralleldrive/cuid2'
import type { Db } from '../db.js'

export function createMessagesRouter(db: Db) {
  const router = Router()

  router.post('/load', async (req, res) => {
    const { conversation_id } = req.jwtPayload
    const { after_message_id } = req.body ?? {}
    try {
      let rows
      if (after_message_id) {
        const anchor = await db.message.findUnique({
          where: { id: after_message_id },
          select: { createdAt: true },
        })
        if (!anchor) {
          res.status(404).json({ error: { code: 'not_found', message: 'after_message_id not found', retryable: false, details: {} } })
          return
        }
        rows = await db.message.findMany({
          where: { conversationId: conversation_id, createdAt: { gt: anchor.createdAt } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, contentJson: true, source: true, externalMessageId: true, metadataJson: true, createdAt: true },
        })
      } else {
        rows = await db.message.findMany({
          where: { conversationId: conversation_id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, contentJson: true, source: true, externalMessageId: true, metadataJson: true, createdAt: true },
        })
      }

      const formatted = rows.map(r => ({
        id: r.id,
        role: r.role,
        content: r.contentJson,
        source: r.source,
        external_message_id: r.externalMessageId,
        metadata: r.metadataJson,
        created_at: r.createdAt,
      }))
      const last = formatted.length > 0 ? formatted[formatted.length - 1].id : null
      res.json({ conversation_id, messages: formatted, last_message_id: last })
    } catch (err) {
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  router.post('/append', async (req, res) => {
    const { conversation_id, caller } = req.jwtPayload
    const { expected_last_message_id, messages } = req.body

    // Validate caller/source alignment
    const allowedSource = caller === 'dispatcher' ? 'im' : 'sandbox'
    for (const m of messages) {
      if (m.source !== allowedSource) {
        res.status(400).json({ error: { code: 'invalid_request', message: `caller '${caller}' must use source '${allowedSource}'`, retryable: false, details: {} } })
        return
      }
    }

    try {
      // Check current head
      const head = await db.message.findFirst({
        where: { conversationId: conversation_id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      const actualHead = head?.id ?? null

      if (actualHead !== (expected_last_message_id ?? null)) {
        res.status(409).json({
          error: {
            code: 'stale_write',
            message: 'expected_last_message_id does not match current history head',
            retryable: false,
            details: { actual_last_message_id: actualHead },
          },
        })
        return
      }

      // Insert messages sequentially to preserve order
      const now = new Date()
      const inserted = []
      for (const m of messages) {
        const id = 'msg_' + createId()
        await db.message.create({
          data: {
            id,
            conversationId: conversation_id,
            role: m.role,
            contentJson: m.content,
            source: m.source,
            externalMessageId: m.external_message_id ?? null,
            metadataJson: m.metadata ?? {},
            createdAt: new Date(now),
          },
        })
        inserted.push({ id, role: m.role, created_at: now.toISOString() })
        now.setMilliseconds(now.getMilliseconds() + 1)
      }

      const lastId = inserted[inserted.length - 1].id
      res.json({ conversation_id, appended: inserted, last_message_id: lastId })
    } catch (err) {
      res.status(500).json({ error: { code: 'internal_error', message: String(err), retryable: true, details: {} } })
    }
  })

  return router
}
```

- [ ] **Step 6: Rewrite `packages/gateway/tests/messages.test.ts`**

Replace raw `postgres` client with `PrismaClient` for setup/teardown:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createPrismaClient } from '@aaas/db'
import app from '../src/index.js'

const SECRET = process.env.JWT_SECRET ?? 'test-secret-32-chars-minimum-len'
const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'
const prisma = createPrismaClient(DB_URL)

function sandboxToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'sandbox' }, SECRET, { expiresIn: '24h' })
}
function dispatcherToken(convId: string, agentId: string) {
  return jwt.sign({ conversation_id: convId, agent_id: agentId, caller: 'dispatcher' }, SECRET, { expiresIn: '60s' })
}

const AGENT_ID = 'agt_test01'
const CONV_ID = 'conv_test01'
const CFG_ID = 'cfg_test01'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
  await prisma.conversation.upsert({
    where: { id: CONV_ID },
    create: { id: CONV_ID, agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '123' },
    update: {},
  })
})

afterAll(async () => {
  await prisma.message.deleteMany({ where: { conversationId: CONV_ID } })
  await prisma.conversation.deleteMany({ where: { id: CONV_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.message.deleteMany({ where: { conversationId: CONV_ID } })
})

describe('POST /gateway/messages/load', () => {
  it('returns empty list for new conversation', async () => {
    const res = await request(app)
      .post('/gateway/messages/load')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([])
    expect(res.body.last_message_id).toBeNull()
  })

  it('returns messages in order', async () => {
    const MSG_ID = 'msg_test01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'hello' }], source: 'im' },
    })
    const res = await request(app)
      .post('/gateway/messages/load')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
    expect(res.body.messages[0].role).toBe('user')
    expect(res.body.last_message_id).toBe(MSG_ID)
  })
})

describe('POST /gateway/messages/append', () => {
  it('appends a message with null expected_last_message_id for empty history', async () => {
    const res = await request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: null,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], source: 'im' }],
      })
    expect(res.status).toBe(200)
    expect(res.body.appended).toHaveLength(1)
    expect(res.body.last_message_id).toBeTruthy()
  })

  it('returns 409 on stale_write', async () => {
    const MSG_ID = 'msg_stale01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId: CONV_ID, role: 'user', contentJson: [{ type: 'text', text: 'hi' }], source: 'im' },
    })
    const res = await request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${sandboxToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: 'msg_wrong_id',
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hey' }], source: 'sandbox' }],
      })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('stale_write')
  })

  it('returns 400 when caller=dispatcher uses source=sandbox', async () => {
    const res = await request(app)
      .post('/gateway/messages/append')
      .set('Authorization', `Bearer ${dispatcherToken(CONV_ID, AGENT_ID)}`)
      .send({
        expected_last_message_id: null,
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'oops' }], source: 'sandbox' }],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })
})
```

- [ ] **Step 7: Run gateway tests**

```bash
cd packages/gateway && pnpm test
```

Expected: All 5 tests pass (requires postgres running via docker compose).

- [ ] **Step 8: Commit**

```bash
git add packages/gateway/
git commit -m "feat(gateway): migrate from postgres.js to Prisma"
```

---

## Task 4: Update `packages/dispatcher` to use Prisma

**Files:**
- Modify: `packages/dispatcher/package.json`
- Modify: `packages/dispatcher/src/db.ts`
- Modify: `packages/dispatcher/src/conversation.ts`
- Modify: `packages/dispatcher/src/inbound-jobs.ts`
- Modify: `packages/dispatcher/src/index.ts`
- Modify: `packages/dispatcher/tests/conversation.test.ts`
- Modify: `packages/dispatcher/tests/inbound-jobs.test.ts`

- [ ] **Step 1: Update `packages/dispatcher/package.json`**

Replace `"postgres": "^3.4.4"` with `"@aaas/db": "workspace:*"`:

```json
{
  "name": "@aaas/dispatcher",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@aaas/db": "workspace:*",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.2",
    "@paralleldrive/cuid2": "^2.2.2",
    "@e2b/code-interpreter": "^1.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Run `pnpm install`**

```bash
pnpm install
```

- [ ] **Step 3: Rewrite `packages/dispatcher/src/db.ts`**

```ts
import { createPrismaClient } from '@aaas/db'

export { createPrismaClient as createDb }
export type { Db } from '@aaas/db'
```

- [ ] **Step 4: Write failing test before rewriting conversation.ts**

```bash
cd packages/dispatcher && pnpm test 2>&1 | head -30
```

Expected: TypeScript errors because `db` no longer is a postgres.js template function.

- [ ] **Step 5: Rewrite `packages/dispatcher/src/conversation.ts`**

```ts
import { createId } from '@paralleldrive/cuid2'
import type { Db } from './db.js'

export function createConversationManager(db: Db) {
  const lastMessageIdCache = new Map<string, string | null>()

  return {
    async upsert(params: {
      agentId: string
      channelKey: string
      externalChatId: string
      externalThreadKey: string
    }): Promise<{ conversationId: string; lastMessageId: string | null }> {
      const { agentId, channelKey, externalChatId, externalThreadKey } = params
      const id = 'conv_' + createId()

      const conversation = await db.conversation.upsert({
        where: { channelKey_externalChatId_externalThreadKey: { channelKey, externalChatId, externalThreadKey } },
        create: { id, agentId, channelKey, externalChatId, externalThreadKey },
        update: { lastMessageAt: new Date() },
        select: { id: true },
      })

      const conversationId = conversation.id
      if (!lastMessageIdCache.has(conversationId)) {
        const lastMsg = await db.message.findFirst({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        lastMessageIdCache.set(conversationId, lastMsg?.id ?? null)
      }
      return { conversationId, lastMessageId: lastMessageIdCache.get(conversationId) ?? null }
    },

    getLastMessageId(conversationId: string): string | null {
      return lastMessageIdCache.get(conversationId) ?? null
    },

    setLastMessageId(conversationId: string, messageId: string | null): void {
      lastMessageIdCache.set(conversationId, messageId)
    },
  }
}
```

- [ ] **Step 6: Rewrite `packages/dispatcher/src/inbound-jobs.ts`**

Note: `createMany` with `skipDuplicates: true` returns `{ count: number }` — this is how we detect whether the insert succeeded without a race condition.

```ts
import { createId } from '@paralleldrive/cuid2'
import type { Db } from './db.js'

export function createInboundJobsManager(db: Db, instanceId: string) {
  return {
    /** Returns true if inserted (new message), false if duplicate. */
    async tryInsert(channelKey: string, externalMessageId: string, conversationId: string): Promise<boolean> {
      const id = 'job_' + createId()
      const result = await db.inboundJob.createMany({
        data: [{ id, channelKey, externalMessageId, conversationId, status: 'pending' }],
        skipDuplicates: true,
      })
      return result.count === 1
    },

    async markProcessing(channelKey: string, externalMessageId: string): Promise<void> {
      await db.inboundJob.updateMany({
        where: { channelKey, externalMessageId },
        data: { status: 'processing', leaseOwner: instanceId, leaseExpiresAt: new Date(Date.now() + 60_000) },
      })
    },

    async markDone(channelKey: string, externalMessageId: string): Promise<void> {
      await db.inboundJob.updateMany({
        where: { channelKey, externalMessageId },
        data: { status: 'done' },
      })
    },

    async markFailed(channelKey: string, externalMessageId: string): Promise<void> {
      await db.inboundJob.updateMany({
        where: { channelKey, externalMessageId },
        data: { status: 'failed' },
      })
    },
  }
}
```

- [ ] **Step 7: Update startup queries in `packages/dispatcher/src/index.ts`**

Replace the two raw SQL queries in `main()`:

```ts
// Replace:
const [agent] = await db`SELECT id, e2b_template_id, port, idle_timeout_ms FROM agents WHERE status = 'active' LIMIT 1`
if (!agent) throw new Error('No active agent found — run setup.ts first')

const [cfg] = await db`SELECT id, bot_token_enc FROM im_configs WHERE agent_id = ${agent.id} AND status = 'active' LIMIT 1`
if (!cfg) throw new Error('No active im_config found — run setup.ts first')

// With:
const agent = await db.agent.findFirst({
  where: { status: 'active' },
  select: { id: true, e2bTemplateId: true, port: true, idleTimeoutMs: true },
})
if (!agent) throw new Error('No active agent found — run setup.ts first')

const cfg = await db.imConfig.findFirst({
  where: { agentId: agent.id, status: 'active' },
  select: { id: true, botTokenEnc: true },
})
if (!cfg) throw new Error('No active im_config found — run setup.ts first')
```

Also update property access downstream — `agent.e2b_template_id` → `agent.e2bTemplateId`, `agent.idle_timeout_ms` → `agent.idleTimeoutMs`, `cfg.bot_token_enc` → `cfg.botTokenEnc`.

Grep for usages to find all spots:

```bash
grep -n "e2b_template_id\|idle_timeout_ms\|bot_token_enc" packages/dispatcher/src/
```

- [ ] **Step 8: Rewrite `packages/dispatcher/tests/conversation.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createPrismaClient } from '@aaas/db'
import { createConversationManager } from '../src/conversation.js'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'
const prisma = createPrismaClient(DB_URL)
const AGENT_ID = 'agt_convtest'
const CFG_ID = 'cfg_convtest'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
})
afterAll(async () => {
  await prisma.conversation.deleteMany({ where: { agentId: AGENT_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})

describe('ConversationManager', () => {
  it('creates a new conversation and returns id with null lastMessageId', async () => {
    const mgr = createConversationManager(prisma)
    const result = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '111', externalThreadKey: '' })
    expect(result.conversationId).toMatch(/^conv_/)
    expect(result.lastMessageId).toBeNull()
  })

  it('returns same conversation id on second upsert', async () => {
    const mgr = createConversationManager(prisma)
    const r1 = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '222', externalThreadKey: '' })
    const r2 = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '222', externalThreadKey: '' })
    expect(r1.conversationId).toBe(r2.conversationId)
  })

  it('updates lastMessageId cache after setLastMessageId', async () => {
    const mgr = createConversationManager(prisma)
    const { conversationId } = await mgr.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '333', externalThreadKey: '' })
    mgr.setLastMessageId(conversationId, 'msg_xyz')
    expect(mgr.getLastMessageId(conversationId)).toBe('msg_xyz')
  })

  it('seeds lastMessageId from DB on cache miss (simulates dispatcher restart)', async () => {
    const mgr1 = createConversationManager(prisma)
    const { conversationId } = await mgr1.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '444', externalThreadKey: '' })
    const MSG_ID = 'msg_restart01'
    await prisma.message.create({
      data: { id: MSG_ID, conversationId, role: 'user', contentJson: [{ type: 'text', text: 'hi' }], source: 'im' },
    })

    const mgr2 = createConversationManager(prisma)
    const result = await mgr2.upsert({ agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '444', externalThreadKey: '' })
    expect(result.lastMessageId).toBe(MSG_ID)

    await prisma.message.delete({ where: { id: MSG_ID } })
  })
})
```

- [ ] **Step 9: Rewrite `packages/dispatcher/tests/inbound-jobs.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createPrismaClient } from '@aaas/db'
import { createInboundJobsManager } from '../src/inbound-jobs.js'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://aaas:aaas@localhost:5432/aaas'
const prisma = createPrismaClient(DB_URL)
const AGENT_ID = 'agt_jobtest'
const CFG_ID = 'cfg_jobtest'
const CONV_ID = 'conv_jobtest'
const INSTANCE_ID = 'dispatcher-test-01'

beforeAll(async () => {
  await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: { id: AGENT_ID, name: 'test', status: 'active', e2bTemplateId: 'tpl_x' },
    update: {},
  })
  await prisma.conversation.upsert({
    where: { id: CONV_ID },
    create: { id: CONV_ID, agentId: AGENT_ID, channelKey: `im:${CFG_ID}`, externalChatId: '456' },
    update: {},
  })
})
afterAll(async () => {
  await prisma.inboundJob.deleteMany({ where: { conversationId: CONV_ID } })
  await prisma.conversation.deleteMany({ where: { id: CONV_ID } })
  await prisma.agent.deleteMany({ where: { id: AGENT_ID } })
  await prisma.$disconnect()
})
beforeEach(async () => {
  await prisma.inboundJob.deleteMany({ where: { conversationId: CONV_ID } })
})

describe('InboundJobsManager', () => {
  it('inserts a new job and returns true', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    expect(await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_1', CONV_ID)).toBe(true)
  })

  it('returns false on duplicate (dedup)', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)
    expect(await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_2', CONV_ID)).toBe(false)
  })

  it('marks job as processing', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_3', CONV_ID)
    await mgr.markProcessing(`im:${CFG_ID}`, 'ext_msg_3')
    const row = await prisma.inboundJob.findFirst({ where: { channelKey: `im:${CFG_ID}`, externalMessageId: 'ext_msg_3' } })
    expect(row?.status).toBe('processing')
  })

  it('marks job as done', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_4', CONV_ID)
    await mgr.markDone(`im:${CFG_ID}`, 'ext_msg_4')
    const row = await prisma.inboundJob.findFirst({ where: { channelKey: `im:${CFG_ID}`, externalMessageId: 'ext_msg_4' } })
    expect(row?.status).toBe('done')
  })

  it('marks job as failed', async () => {
    const mgr = createInboundJobsManager(prisma, INSTANCE_ID)
    await mgr.tryInsert(`im:${CFG_ID}`, 'ext_msg_5', CONV_ID)
    await mgr.markFailed(`im:${CFG_ID}`, 'ext_msg_5')
    const row = await prisma.inboundJob.findFirst({ where: { channelKey: `im:${CFG_ID}`, externalMessageId: 'ext_msg_5' } })
    expect(row?.status).toBe('failed')
  })
})
```

- [ ] **Step 10: Run dispatcher tests**

```bash
cd packages/dispatcher && pnpm test
```

Expected: All tests pass.

- [ ] **Step 11: Commit**

```bash
git add packages/dispatcher/
git commit -m "feat(dispatcher): migrate from postgres.js to Prisma"
```

---

## Task 5: Update `scripts/setup.ts` to use Prisma

**Files:**
- Modify: `scripts/setup.ts`
- Modify: `scripts/package.json`

The setup script currently manually runs `migrations/001_initial.sql` (now deleted). Replace with `prisma migrate deploy` run as a subprocess, then use `PrismaClient` for seeding.

- [ ] **Step 1: Update `scripts/package.json`**

Replace `"postgres": "..."` with `"@aaas/db": "workspace:*"` and add `"prisma"` as dev dep:

```json
{
  "name": "@aaas/scripts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "tsx setup.ts"
  },
  "dependencies": {
    "@aaas/db": "workspace:*",
    "@paralleldrive/cuid2": "^3.3.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Run `pnpm install`**

```bash
pnpm install
```

- [ ] **Step 3: Rewrite `scripts/setup.ts`**

```ts
import { execSync } from 'child_process'
import { createInterface } from 'readline'
import { createId } from '@paralleldrive/cuid2'
import { createCipheriv, randomBytes } from 'crypto'
import { createPrismaClient } from '@aaas/db'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const DATABASE_URL = process.env.DATABASE_URL!
const BOT_TOKEN_ENC_KEY = process.env.BOT_TOKEN_ENC_KEY!
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID!

if (!DATABASE_URL || !BOT_TOKEN_ENC_KEY || !E2B_TEMPLATE_ID) {
  console.error('Required env vars: DATABASE_URL, BOT_TOKEN_ENC_KEY, E2B_TEMPLATE_ID')
  process.exit(1)
}

// Run Prisma migrations
console.log('Running migrations...')
const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(__dirname, '../packages/db/prisma/schema.prisma')
execSync(`pnpm --filter @aaas/db exec prisma migrate deploy --schema=${schemaPath}`, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL },
})
console.log('Migrations complete.')

// Read bot token from stdin
const rl = createInterface({ input: process.stdin, output: process.stderr })
const botToken: string = await new Promise(resolve => {
  rl.question('Enter Telegram bot token: ', answer => {
    rl.close()
    resolve(answer.trim())
  })
})

function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map(b => b.toString('base64')).join(':')
}

const botTokenEnc = encrypt(botToken, BOT_TOKEN_ENC_KEY)

// Seed agent and im_config
const prisma = createPrismaClient(DATABASE_URL)
const agentId = 'agt_' + createId()
const cfgId = 'cfg_' + createId()

await prisma.agent.create({
  data: { id: agentId, name: 'Demo Agent', status: 'active', e2bTemplateId: E2B_TEMPLATE_ID, port: 8080, idleTimeoutMs: 300000 },
})

await prisma.imConfig.create({
  data: { id: cfgId, agentId, platform: 'telegram', botTokenEnc, chatScope: 'all', status: 'active' },
})

await prisma.$disconnect()

console.log(`\nSetup complete.`)
console.log(`  agent_id:   ${agentId}`)
console.log(`  im_config:  ${cfgId}`)
console.log(`  channel_key: im:${cfgId}`)
console.log('\nStart dispatcher and gateway to go live.')
```

- [ ] **Step 4: Run setup script dry-run (schema only)**

```bash
cd scripts && DATABASE_URL=postgresql://aaas:aaas@localhost:5432/aaas BOT_TOKEN_ENC_KEY=00000000000000000000000000000000000000000000000000000000000000 E2B_TEMPLATE_ID=tpl_test npx tsx setup.ts <<< "fake-token"
```

Expected: Migrations applied (or skipped if already applied), agent and im_config rows inserted.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat(scripts): migrate setup.ts from postgres.js to Prisma"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests across gateway and dispatcher pass.

- [ ] **Step 2: Verify no `postgres` imports remain**

```bash
grep -r "from 'postgres'" packages/ scripts/
```

Expected: No output.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd packages/gateway && pnpm build
cd packages/dispatcher && pnpm build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: verify Prisma migration complete — all tests green"
```
