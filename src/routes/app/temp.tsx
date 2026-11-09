import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Temporary mailboxes are part of the unified mailbox view now. The old route
 * stays as a redirect so existing bookmarks keep working.
 */
export const Route = createFileRoute('/app/temp')({
  beforeLoad: () => {
    throw redirect({ to: '/app/mailboxes', replace: true })
  },
})
