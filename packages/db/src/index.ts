import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/index.js'

export { PrismaClient }
export type { Prisma } from './generated/index.js'

export function createPrismaClient(datasourceUrl: string) {
  const url = new URL(datasourceUrl)
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: url.searchParams.get('sslaccept') === 'strict' ? { rejectUnauthorized: true } : undefined,
    connectionLimit: 10,
    acquireTimeout: 20000,
    connectTimeout: 10000,
  })
  return new PrismaClient({ adapter })
}

export type Db = ReturnType<typeof createPrismaClient>
