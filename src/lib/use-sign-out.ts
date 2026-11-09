import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { authClient } from '@/lib/auth-client'

/**
 * Signing out has to drop the query cache, not just the cookie. Everything in
 * `['mail', …]` belongs to the account that is leaving, and the next person to
 * sign in on this tab must never get a paint of it — not even for one frame.
 *
 * The router is invalidated afterwards so `fetchShell` re-reads the session;
 * that call is what actually flips the layout back to signed-out.
 */
export function useSignOut() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return async () => {
    await authClient.signOut()
    queryClient.clear()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }
}
