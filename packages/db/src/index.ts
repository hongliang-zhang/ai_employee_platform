import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/index.js'

export { PrismaClient }
export type { Prisma } from './generated/index.js'

export function createPrismaClient(datasourceUrl: string) {
  const adapter = new PrismaPg({ connectionString: datasourceUrl })
  return new PrismaClient({ adapter })
}

export type Db = ReturnType<typeof createPrismaClient>
