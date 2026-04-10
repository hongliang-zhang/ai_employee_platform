import postgres from 'postgres'

export function createDb(connectionString: string) {
  return postgres(connectionString)
}

export type Db = ReturnType<typeof createDb>
