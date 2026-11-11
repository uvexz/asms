import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from './schema.ts'

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const authToken = process.env.DATABASE_AUTH_TOKEN

const client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
})

// A local file database is the default Docker setup. WAL lets readers run
// while a webhook writes, and the busy timeout turns lock contention into a
// short wait instead of an immediate SQLITE_BUSY.
if (url.startsWith('file:')) {
  try {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA busy_timeout = 5000')
  } catch (error) {
    console.warn('[asms] could not configure SQLite pragmas', error)
  }
}

export const db = drizzle(client, { schema })
