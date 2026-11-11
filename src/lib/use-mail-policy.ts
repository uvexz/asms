import { useQuery } from '@tanstack/react-query'

import { mailPolicyQuery } from '@/lib/queries'

/** The admin-configured limits the app phrases its own copy with. */
export function useMailPolicy(options?: { enabled?: boolean }) {
  const query = useQuery({
    ...mailPolicyQuery(),
    enabled: options?.enabled ?? true,
  })
  return {
    policy: query.data?.ok ? query.data.data : null,
    isLoading: query.isLoading,
    isError: query.isError || Boolean(query.data && !query.data.ok),
    refetch: query.refetch,
  }
}
