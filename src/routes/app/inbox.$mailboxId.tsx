import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The per-mailbox inbox folded into the three-pane mailbox view. Deep links
 * (including `?message=`) carry over to the merged page.
 */
export const Route = createFileRoute('/app/inbox/$mailboxId')({
  validateSearch: (search: Record<string, unknown>) => ({
    message:
      typeof search.message === 'string' && search.message
        ? search.message
        : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/app/mailboxes',
      search: { mailbox: params.mailboxId, message: search.message },
      replace: true,
    })
  },
})
