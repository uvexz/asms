import { count, eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '#/db'
import { user } from '#/db/schema'
import { getEnabledProviderIds, resetAuthCache } from '#/lib/auth'
import { AppError, assert, run } from '../result'
import { getSession, requireUser } from '../session'
import { publicDomainNames } from '../services/domains'
import { getSiteConfig } from '../settings'
import { audit } from '../services/audit'

/**
 * Everything the shell needs for a render: who is signed in, and how the site
 * names itself. One call, because the root route runs it on every navigation.
 */
export const fetchShell = createServerFn({ method: 'GET' }).handler(
  async () => {
    const [session, site] = await Promise.all([getSession(), getSiteConfig()])

    return {
      session: session
        ? {
            user: {
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
              image: session.user.image ?? null,
              role: (session.user as { role?: string }).role ?? 'user',
            },
          }
        : null,
      site: {
        siteName: site.siteName,
        siteDescription: site.siteDescription,
        logoUrl: site.logoUrl,
        footerText: site.footerText,
      },
    }
  },
)

export const fetchPublicConfig = createServerFn({ method: 'GET' }).handler(
  async () => {
    const [site, providers] = await Promise.all([
      getSiteConfig(),
      getEnabledProviderIds(),
    ])

    return {
      siteName: site.siteName,
      siteDescription: site.siteDescription,
      logoUrl: site.logoUrl,
      footerText: site.footerText,
      registrationEnabled: site.registrationEnabled,
      emailPasswordEnabled: site.emailPasswordEnabled,
      providers,
    }
  },
)

/**
 * The landing hero rotates over the domains this site hands out, so it needs
 * the names. Kept out of `fetchPublicConfig` on purpose: the four auth screens
 * read that call on every visit and never look at a domain.
 */
export const fetchPublicDomains = createServerFn({ method: 'GET' }).handler(
  async () => publicDomainNames(),
)

export const fetchSetupStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const admins =
      (
        await db
          .select({ value: count() })
          .from(user)
          .where(eq(user.role, 'admin'))
          .get()
      )?.value ?? 0
    return {
      needsSetup: admins === 0,
      requiresToken: Boolean(process.env.SETUP_TOKEN),
    }
  },
)

export const claimAdmin = createServerFn({ method: 'POST' })
  .validator(z.object({ token: z.string().optional() }))
  .handler(async ({ data }) =>
    run(async () => {
      const session = await requireUser()
      const admins =
        (
          await db
            .select({ value: count() })
            .from(user)
            .where(eq(user.role, 'admin'))
            .get()
        )?.value ?? 0

      assert(admins === 0, 'SETUP_CLOSED', '管理员已存在')

      const expected = process.env.SETUP_TOKEN
      if (expected) {
        if (!data.token || data.token !== expected) {
          throw new AppError('SETUP_TOKEN_INVALID', '初始化口令不正确')
        }
      }

      await db
        .update(user)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(user.id, session.user.id))

      await audit({
        actorId: session.user.id,
        action: 'setup.claim_admin',
        targetType: 'user',
        targetId: session.user.id,
      })

      resetAuthCache()
      return { promoted: true }
    }),
  )
