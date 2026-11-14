import { count, eq, sql } from 'drizzle-orm'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '#/db'
import { user } from '#/db/schema'
import { getEnabledProviderIds, resetAuthCache } from '#/lib/auth'
import { RATE_LIMITS, enforceRateLimit } from '../rate-limit'
import { assert, run } from '../result'
import { getSession, requestIp, requireUser } from '../session'
import { publicDomainNames } from '../services/domains'
import { getSiteConfig } from '../settings'
import { audit } from '../services/audit'

function tokenMatches(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

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
              emailVerified: session.user.emailVerified,
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
        // The one clock every timestamp in the interface is rendered against.
        timezone: site.timezone,
      },
      emailVerificationRequired: site.emailVerificationRequired,
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
      emailVerificationRequired: site.emailVerificationRequired,
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
      production: process.env.NODE_ENV === 'production',
    }
  },
)

export const claimAdmin = createServerFn({ method: 'POST' })
  .validator(z.object({ token: z.string().max(200).optional() }))
  .handler(async ({ data }) =>
    run(async () => {
      const session = await requireUser()
      // The setup token is the only secret at this point; count by IP so
      // creating extra accounts does not reset the brute-force budget.
      await enforceRateLimit(
        RATE_LIMITS.setupClaim,
        requestIp() ?? session.user.id,
      )

      const expected = process.env.SETUP_TOKEN
      assert(
        expected || process.env.NODE_ENV !== 'production',
        'SETUP_TOKEN_REQUIRED',
        '生产环境必须配置 SETUP_TOKEN 才能初始化管理员',
      )
      if (expected) {
        assert(
          data.token && tokenMatches(data.token, expected),
          'SETUP_TOKEN_INVALID',
          '初始化口令不正确',
        )
      }

      // One statement makes "no admin yet" and the promotion atomic; two
      // simultaneous claims can no longer both win the race. The claimer is
      // the site owner, so the claim also settles their address — otherwise
      // the first admin could be locked out by the verification gate.
      const promoted = await db
        .update(user)
        .set({ role: 'admin', emailVerified: true, updatedAt: new Date() })
        .where(
          sql`${user.id} = ${session.user.id} and (select count(*) from "user" where "role" = 'admin') = 0`,
        )
        .returning({ id: user.id })

      assert(promoted.length > 0, 'SETUP_CLOSED', '管理员已存在')

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
