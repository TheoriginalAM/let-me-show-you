import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  // Fail fast with a clear message instead of silently connecting to a local
  // default (postgres.js treats an empty string as "use PG* defaults").
  throw new Error('DATABASE_URL is not set — add it to apps/web/.env.local')
}

// Local Postgres usually has no TLS; hosted providers (Railway, etc.) require it.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(connectionString)

// Reuse a single client across dev/HMR reloads to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  __lmsyPgClient?: ReturnType<typeof postgres>
}

const client =
  globalForDb.__lmsyPgClient ??
  postgres(connectionString, {
    ssl: isLocal ? false : 'require',
    max: 10,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__lmsyPgClient = client
}

export const db = drizzle(client, { schema })

export type Database = typeof db
