import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'] })

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const isRemote = url.startsWith('libsql://') || url.startsWith('https://')
const authToken = process.env.DATABASE_AUTH_TOKEN

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: isRemote ? 'turso' : 'sqlite',
  dbCredentials: (isRemote ? { url, authToken } : { url }) as never,
})
