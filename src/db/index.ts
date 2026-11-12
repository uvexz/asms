import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import * as schema from './schema.ts'

const url = process.env.DATABASE_URL ?? 'file:dev.db'
const authToken = process.env.DATABASE_AUTH_TOKEN
const isFile = url.startsWith('file:')

function envInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(raw)))
}

/**
 * How long a statement waits for a competing writer before it fails.
 *
 * This has to be passed as a client option rather than issued as
 * `PRAGMA busy_timeout`: the local driver keeps a pool of connections
 * (up to `concurrency`) and a pragma only lands on whichever one served that
 * statement. Measured on this project, one of five pooled connections carried
 * the 5s timeout and the rest kept the SQLite default of 0, so a second
 * concurrent writer got `SQLITE_BUSY` immediately. `timeout` is forwarded to
 * every `new Database()` the pool opens, so all of them inherit it.
 */
const busyTimeoutMs = envInt('DATABASE_BUSY_TIMEOUT_MS', 5_000, 0, 60_000)

/**
 * Connections held open per process. Every one of them costs a native handle
 * and a page cache that is never returned to the OS while the process lives,
 * so a local file needs far fewer than the driver's default of 20.
 */
const concurrency = envInt('DATABASE_CONCURRENCY', isFile ? 8 : 20, 1, 100)

/** A statement that lost a write race was never applied, so replaying it is
 * safe. Anything else — a timeout, a 5xx — may have committed, and retrying it
 * could apply the write twice. */
const CONTENTION_CODE = /^(SQLITE_BUSY|SQLITE_LOCKED|BLOCKED|SERVER_BUSY)$/
const CONTENTION_MESSAGE =
  /SQLITE_BUSY|SQLITE_LOCKED|database (?:table )?is locked/i
const RETRY_ATTEMPTS = 3
const RETRY_BASE_MS = 25

function isContention(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && CONTENTION_CODE.test(code)) return true
  const message = error instanceof Error ? error.message : ''
  return CONTENTION_MESSAGE.test(message)
}

async function retryOnContention<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= RETRY_ATTEMPTS || !isContention(error)) throw error
      // Jittered backoff: several requests that lost the same lock should not
      // line up again on the next attempt.
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1) * (0.5 + Math.random())
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

type DbClient = ReturnType<typeof createClient>

/**
 * Statements inside `client.transaction()` go through the transaction object
 * and are deliberately left alone: replaying a statement in the middle of a
 * caller's transaction would be invisible to that caller's control flow.
 */
function withContentionRetry(client: DbClient): DbClient {
  return new Proxy(client, {
    get(target, property) {
      if (property === 'execute') {
        return (statement: Parameters<DbClient['execute']>[0]) =>
          retryOnContention(() => target.execute(statement))
      }
      if (property === 'batch') {
        return (
          statements: Parameters<DbClient['batch']>[0],
          mode?: Parameters<DbClient['batch']>[1],
        ) => retryOnContention(() => target.batch(statements, mode))
      }
      // Methods must stay bound to the real client: the driver uses private
      // fields, and those are not reachable through the proxy.
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createDatabase() {
  const client = withContentionRetry(
    createClient({
      url,
      ...(authToken ? { authToken } : {}),
      timeout: busyTimeoutMs,
      concurrency,
    }),
  )

  return { client, db: drizzle(client, { schema }) }
}

type DbInstance = ReturnType<typeof createDatabase>

/**
 * One pool per process, including across Vite HMR reloads in development: a
 * reload re-evaluates this module, and without the global the old pool would
 * keep its handles open for the lifetime of the dev server.
 */
const globalForDb = globalThis as typeof globalThis & {
  __asmsDatabase?: { url: string; instance: DbInstance }
}

let instance = globalForDb.__asmsDatabase
if (!instance || instance.url !== url) {
  const created = createDatabase()
  instance = { url, instance: created }
  globalForDb.__asmsDatabase = instance

  if (isFile) {
    try {
      // WAL is a property of the database file, not of a connection, so
      // setting it once here is enough and does reach every later reader.
      await created.client.execute('PRAGMA journal_mode = WAL')
    } catch (error) {
      console.warn('[asms] could not enable WAL on the local database', error)
    }
  }
}

export const db = instance.instance.db
