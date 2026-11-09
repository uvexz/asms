import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { count, eq } from 'drizzle-orm'

import { db } from '#/db'
import * as schema from '#/db/schema'
import { decryptSecret } from '#/server/crypto'
import { sendSystemMail } from '#/server/services/system-mail'
import { getSetting } from '#/server/settings'

type Providers = Record<string, { clientId: string; clientSecret: string }>

async function loadSocialProviders(): Promise<Providers> {
  const rows = await db
    .select()
    .from(schema.oauthProviders)
    .where(eq(schema.oauthProviders.enabled, true))

  const providers: Providers = {}
  for (const row of rows) {
    if (!row.clientId || !row.clientSecretEnc) continue
    try {
      providers[row.provider] = {
        clientId: row.clientId,
        clientSecret: decryptSecret(row.clientSecretEnc),
      }
    } catch {
      // A rotated encryption key should not take the whole auth endpoint down.
    }
  }
  return providers
}

function createAuth(providers: Providers, emailPasswordEnabled: boolean) {
  const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

  return betterAuth({
    appName: 'asms',
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    trustedOrigins: [baseURL],
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: emailPasswordEnabled,
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendSystemMail({
          to: user.email,
          subject: '重置你的密码',
          text: `请打开以下链接重置密码（1 小时内有效）：\n${url}`,
          html: `<p>请打开以下链接重置密码（1 小时内有效）：</p><p><a href="${url}">${url}</a></p>`,
        })
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            const enabled = await getSetting('site.registrationEnabled')
            if (enabled) return
            const total =
              (await db.select({ value: count() }).from(schema.user).get())
                ?.value ?? 0
            if (total > 0) {
              throw new APIError('FORBIDDEN', {
                message: '站点已关闭注册',
              })
            }
          },
        },
      },
    },
    socialProviders: providers,
    plugins: [admin(), tanstackStartCookies()],
  })
}

type AuthInstance = ReturnType<typeof createAuth>

let cached: { key: string; auth: AuthInstance } | null = null

/**
 * The OAuth client id/secret live in the database, so the auth instance is
 * rebuilt whenever that configuration changes (checked per request, cached).
 */
export async function getAuth(): Promise<AuthInstance> {
  const providers = await loadSocialProviders()
  const enabled = await getSetting('auth.emailPasswordEnabled')
  const key = JSON.stringify({ providers, enabled })

  const next =
    cached && cached.key === key
      ? cached
      : { key, auth: createAuth(providers, enabled) }

  cached = next
  return next.auth
}

export function resetAuthCache() {
  cached = null
}
