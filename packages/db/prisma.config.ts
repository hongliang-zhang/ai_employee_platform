import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // DIRECT_URL is a direct (non-pooled) connection, required by prisma migrate.
    // Falls back to DATABASE_URL in CI where no pgbouncer is involved.
    // At runtime, DATABASE_URL (pgbouncer pooler) is used via the driver adapter in src/index.ts.
    url: (process.env.DIRECT_URL ?? process.env.DATABASE_URL)!,
  },
})
