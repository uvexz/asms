import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { RouteError, RouteNotFound } from '@/components/app/route-state'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { getContext } from './integrations/tanstack-query/root-provider'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context: {
      ...context,
      session: null,
      emailVerificationRequired: false,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // A hover should warm the route, not re-run its loader on every pass. Zero
    // here meant each crossing of the sidebar cost a `fetchShell` round trip.
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
