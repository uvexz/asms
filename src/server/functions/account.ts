import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

import { getAuth, getEnabledProviderIds } from '#/lib/auth'
import { providerLabel } from '#/lib/oauth-providers'
import { asUser } from '../session'

/**
 * The third-party accounts a signed-in user can bind, plus which of them are
 * already bound. `credential` is the email/password account: without one there
 * is no way back in after unlinking the last provider.
 */
export const linkedAccountsFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    asUser(async () => {
      const auth = await getAuth()
      const [accounts, providers] = await Promise.all([
        auth.api.listUserAccounts({ headers: getRequestHeaders() }),
        getEnabledProviderIds(),
      ])

      return {
        hasPassword: accounts.some(
          (account) => account.providerId === 'credential',
        ),
        items: providers.map((provider) => ({
          provider,
          label: providerLabel(provider),
          accountId:
            accounts.find((account) => account.providerId === provider)?.id ??
            null,
        })),
      }
    }),
)
