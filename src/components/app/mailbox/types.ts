export type MailboxKind = 'permanent' | 'temporary'

/** The subset of the server's `MailboxDto` the three-pane mail view renders. */
export type MailboxSummary = {
  id: string
  address: string
  kind: MailboxKind
  displayName: string | null
  expiresAt: string | null
  renewCount: number
  lastReceivedAt: string | null
  unread: number
}

export type MessageSummary = {
  id: string
  mailboxId: string
  mailboxAddress: string
  mailboxKind: MailboxKind
  fromAddress: string
  fromName: string | null
  subject: string
  snippet: string
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
  receivedAt: string
}

export type MessageDetailData = MessageSummary & {
  to: string[]
  cc: string[]
  bcc: string[]
  textBody: string | null
  htmlBody: string | null
  attachments: Array<{
    id: string
    filename: string
    contentType: string
    size: number
    stored: boolean
  }>
}

/** A mailbox that has not expired yet, so it is still listed and readable. */
export function isMailboxVisible(mailbox: MailboxSummary, now = Date.now()) {
  if (mailbox.kind !== 'temporary') return true
  return Boolean(
    mailbox.expiresAt && new Date(mailbox.expiresAt).getTime() > now,
  )
}
