import { QueryClient } from '@tanstack/react-query'

/**
 * One client per request on the server, one per document in the browser;
 * `setupRouterSsrQueryIntegration` carries the dehydrated cache across so the
 * first paint never refetches what the server already read.
 *
 * The defaults are deliberately quiet: every read in `@/lib/queries` states its
 * own `staleTime`, and these only govern the fallback so a remount cannot turn
 * into a request storm. Server functions resolve a `Result` instead of
 * throwing, so a rejected promise here means transport — two retries rides out
 * a cold start without hammering a server that is actually down.
 */
export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Long enough for hopping across admin screens, short enough that a
        // forgotten tab does not hold one account's mail in memory all day.
        gcTime: 10 * 60_000,
        retry: 2,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0 },
    },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
