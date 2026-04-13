import { PrismaClient } from './generated/index.js'

export { PrismaClient }
export type { Prisma } from './generated/index.js'

export function createPrismaClient(datasourceUrl: string) {
  return new PrismaClient({ datasourceUrl })
}

export type Db = ReturnType<typeof createPrismaClient>
