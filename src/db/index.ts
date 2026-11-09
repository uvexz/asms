import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from './schema.ts'

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const authToken = process.env.DATABASE_AUTH_TOKEN

export const client = createClient({
  url,
  ...(authToken ? { authToken } : {}),
})

export const db = drizzle(client, { schema })

export { schema }
export type Db = typeof db
