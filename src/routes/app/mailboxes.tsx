import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { RiAddLine, RiInboxLine, RiTimeLine } from '@remixicon/react'

import { Button } from '@/components/base/buttons/button'
import { AlertDialog } from '@/components/base/modal/modal'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { toast } from '@/components/base/toast/toast'
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/app/page-header'
import {
  CreateMailboxModal,
  CreateTempMailboxModal,
} from '@/components/app/mailbox/create-modals'
import { DomainNotice } from '@/components/app/mailbox/domain-notice'
import { MailboxRail } from '@/components/app/mailbox/mailbox-rail'
import { MessageDetail } from '@/components/app/mailbox/message-detail'
import { MessageList } from '@/components/app/mailbox/message-list'
import { isMailboxVisible } from '@/components/app/mailbox/types'
import type {
  MailboxKind,
  MailboxSummary,
} from '@/components/app/mailbox/types'
import { countdown, formatDuration } from '@/lib/format'
import { useMailPolicy } from '@/lib/use-mail-policy'
import {
  REFRESH_INTERVAL,
  domainsQuery,
  invalidateMailData,
  mailboxesQuery,
  messageQuery,
  messagesQuery,
  queryKeys,
} from '@/lib/queries'
import type {
  MessageDetail as MessageDetailData,
  MessagePage,
} from '@/lib/queries'
import { headTitle } from '@/lib/site'
import { deleteMailboxFn, renewMailboxFn } from '@/server/functions/mailboxes'
import { deleteMessageFn, markMessageFn } from '@/server/functions/messages'
import type { Result } from '@/server/result'
import type { MailboxDto } from '@/server/services/mailboxes'

const PAGE_SIZE = 20

/**
 * Rewrites the payload of a cached `Result` without touching its success or
 * failure shape, so an optimistic edit can never turn an error into a hit.
 */
function patchResult<T>(
  current: Result<T> | undefined,
  map: (data: T) => T,
): Result<T> | undefined {
  return current?.ok ? { ...current, data: map(current.data) } : current
}

export const Route = createFileRoute('/app/mailboxes')({
  head: headTitle('邮箱'),
  validateSearch: (
    search: Record<string, unknown>,
  ): { mailbox?: string; message?: string } => ({
    mailbox:
      typeof search.mailbox === 'string' && search.mailbox
        ? search.mailbox
        : undefined,
    message:
      typeof search.message === 'string' && search.message
        ? search.message
        : undefined,
  }),
  component: MailboxesPage,
})

function MailboxesPage() {
  const { mailbox: mailboxParam, message: messageId } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [createKind, setCreateKind] = useState<MailboxKind | null>(null)
  const [deletingMailbox, setDeletingMailbox] = useState<MailboxSummary | null>(
    null,
  )
  const [deletingMessage, setDeletingMessage] = useState(false)
  const [page, setPage] = useState(1)
  const [, setTick] = useState(0)

  // Re-render every 30s so countdowns move and expired temporary mailboxes
  // leave the rail even before the next poll lands.
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  // The rail polls; the query itself stays poll-free because the compose page
  // shares it and must not refresh a picker while someone is writing.
  const mailboxes = useQuery({
    ...mailboxesQuery(),
    refetchInterval: REFRESH_INTERVAL.mailboxes,
  })
  const domains = useQuery(domainsQuery())
  const { policy } = useMailPolicy()

  const all = mailboxes.data?.ok ? mailboxes.data.data : []
  const mailboxesError =
    mailboxes.data && !mailboxes.data.ok ? mailboxes.data.message : undefined
  const now = Date.now()
  const active = all
    .filter((mailbox) => isMailboxVisible(mailbox, now))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'permanent' ? -1 : 1
      return a.kind === 'permanent'
        ? a.address.localeCompare(b.address)
        : (a.expiresAt ?? '').localeCompare(b.expiresAt ?? '')
    })
  const selectedMailbox = active.find((mailbox) => mailbox.id === mailboxParam)
  const mailboxId = selectedMailbox?.id

  const list = useQuery(messagesQuery({ mailboxId, page, pageSize: PAGE_SIZE }))

  const detail = useQuery(messageQuery(messageId))

  const mark = useMutation({
    mutationFn: (input: { id: string; mailboxId: string; isRead: boolean }) =>
      markMessageFn({ data: { id: input.id, isRead: input.isRead } }),
    // Opening a message flips one flag. Patching the caches that show it
    // keeps the whole list from being re-read just to repaint one row; the
    // 15s/30s polls reconcile the server-owned unread sums.
    onMutate: ({ id, mailboxId: targetMailboxId, isRead }) => {
      const previous = queryClient.getQueryData<Result<MessageDetailData>>(
        queryKeys.message(id),
      )
      const wasRead = previous?.ok ? previous.data.isRead : isRead
      const delta = wasRead === isRead ? 0 : isRead ? -1 : 1

      queryClient.setQueryData<Result<MessageDetailData>>(
        queryKeys.message(id),
        (current) =>
          patchResult(current, (message) => ({ ...message, isRead })),
      )
      queryClient.setQueriesData<Result<MessagePage>>(
        { queryKey: queryKeys.messages },
        (current) =>
          patchResult(current, (payload) => ({
            ...payload,
            items: payload.items.map((item) =>
              item.id === id ? { ...item, isRead } : item,
            ),
          })),
      )
      if (delta !== 0) {
        queryClient.setQueryData<Result<MailboxDto[]>>(
          queryKeys.mailboxes,
          (current) =>
            patchResult(current, (items) =>
              items.map((mailbox) =>
                mailbox.id === targetMailboxId
                  ? { ...mailbox, unread: Math.max(0, mailbox.unread + delta) }
                  : mailbox,
              ),
            ),
        )
      }
    },
    onError: () => {
      // A failed write invalidates the optimistic patches; let the next poll
      // paint the authoritative counters.
      void queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
    },
  })

  const removeMessage = useMutation({
    mutationFn: (id: string) => deleteMessageFn({ data: { id } }),
    onSuccess: async (result, id) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('邮件已删除')
      void router.navigate({
        to: '/app/mailboxes',
        search: { mailbox: mailboxId, message: undefined },
        replace: true,
      })
      queryClient.removeQueries({ queryKey: queryKeys.message(id) })
      await invalidateMailData(queryClient)
    },
  })

  const removeMailbox = useMutation({
    mutationFn: (id: string) => deleteMailboxFn({ data: { id } }),
    onSuccess: async (result, id) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('邮箱已删除')
      if (id === mailboxId) {
        void router.navigate({
          to: '/app/mailboxes',
          search: { mailbox: undefined, message: undefined },
          replace: true,
        })
      }
      await invalidateMailData(queryClient)
    },
  })

  const renew = useMutation({
    mutationFn: (id: string) => renewMailboxFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('续期失败', { description: result.message })
        return
      }
      toast.success('已续期', { description: countdown(result.data.expiresAt) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes })
    },
  })

  const message = detail.data?.ok ? detail.data.data : null
  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0
  const listError = list.data && !list.data.ok ? list.data.message : undefined
  const detailError = detail.isError
    ? '请检查网络后重试。'
    : detail.data && !detail.data.ok
      ? detail.data.message
      : undefined
  useEffect(() => {
    setPage(1)
  }, [mailboxId])

  // A temporary mailbox can disappear from the list while it is selected.
  // Drop the stale search param so the view falls back to every mailbox.
  useEffect(() => {
    if (!mailboxParam || !mailboxes.data?.ok) return
    const stillListed = mailboxes.data.data.some(
      (mailbox) => mailbox.id === mailboxParam,
    )
    if (stillListed) return
    void router.navigate({
      to: '/app/mailboxes',
      search: { mailbox: undefined, message: undefined },
      replace: true,
    })
  }, [mailboxParam, mailboxes.data, router])

  useEffect(() => {
    if (message && !message.isRead) {
      mark.mutate({
        id: message.id,
        mailboxId: message.mailboxId,
        isRead: true,
      })
    }
  }, [message?.id])

  const selectMailbox = (id: string | undefined) => {
    setPage(1)
    void router.navigate({
      to: '/app/mailboxes',
      search: { mailbox: id, message: undefined },
      replace: true,
    })
  }

  const selectMessage = (id: string | undefined) => {
    if (id && window.matchMedia('(max-width: 767px)').matches) {
      window.scrollTo({ top: 0 })
    }
    void router.navigate({
      to: '/app/mailboxes',
      search: { mailbox: mailboxId, message: id },
      replace: true,
    })
  }

  const canCreate = domains.data?.ok ? domains.data.data.length > 0 : true
  const missingDomains = domains.data?.ok && domains.data.data.length === 0

  const header = (
    <PageHeader
      title="邮箱"
      description="长期与临时邮箱统一收件；到期的临时邮箱会从列表隐藏，并由定时任务清理。"
      actions={
        <>
          <Button
            size="small"
            variant="secondary"
            leadingIcon={RiTimeLine}
            onClick={() => setCreateKind('temporary')}
            disabled={!canCreate}
          >
            创建临时邮箱
          </Button>
          <Button
            size="small"
            leadingIcon={RiAddLine}
            onClick={() => setCreateKind('permanent')}
            disabled={!canCreate}
          >
            创建邮箱
          </Button>
        </>
      }
    />
  )

  const modals = (
    <>
      <CreateMailboxModal
        isOpen={createKind === 'permanent'}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null)
        }}
        onCreated={(created) => {
          void router.navigate({
            to: '/app/mailboxes',
            search: { mailbox: created.id, message: undefined },
            replace: true,
          })
        }}
      />
      <CreateTempMailboxModal
        isOpen={createKind === 'temporary'}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null)
        }}
        onCreated={(created) => {
          void router.navigate({
            to: '/app/mailboxes',
            search: { mailbox: created.id, message: undefined },
            replace: true,
          })
        }}
      />
      <AlertDialog
        isOpen={Boolean(deletingMailbox)}
        onOpenChange={(open) => {
          if (!open) setDeletingMailbox(null)
        }}
        title={
          deletingMailbox?.kind === 'temporary'
            ? '删除临时邮箱？'
            : '删除邮箱？'
        }
        description={
          deletingMailbox
            ? `${deletingMailbox.address} 及其全部邮件会被删除。${
                deletingMailbox.kind === 'permanent'
                  ? policy?.permanentCooldownDays
                    ? `地址将进入 ${policy.permanentCooldownDays} 天冷却期。`
                    : '地址将进入冷却期。'
                  : ''
              }`
            : ''
        }
        confirmLabel="删除"
        onConfirm={async () => {
          if (!deletingMailbox) return
          await removeMailbox.mutateAsync(deletingMailbox.id)
          setDeletingMailbox(null)
        }}
      />
      <AlertDialog
        isOpen={deletingMessage}
        onOpenChange={setDeletingMessage}
        title="删除这封邮件？"
        description={
          message
            ? `「${message.subject || '(无主题)'}」会被立即删除，无法恢复。`
            : ''
        }
        confirmLabel="删除"
        onConfirm={() => {
          if (!message) return
          removeMessage.mutate(message.id)
          setDeletingMessage(false)
        }}
      />
    </>
  )

  if (mailboxes.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="grid gap-3 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[248px_336px_minmax(0,1fr)]">
          <Skeleton className="hidden h-[520px] w-full xl:block" />
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="hidden h-[520px] w-full md:block" />
        </div>
        {modals}
      </div>
    )
  }

  if (mailboxes.isError || Boolean(mailboxesError)) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState
          title="无法加载邮箱"
          description={mailboxesError}
          onRetry={() => void mailboxes.refetch()}
        />
        {modals}
      </div>
    )
  }

  if (active.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        {missingDomains ? <DomainNotice /> : null}
        <EmptyState
          icon={RiInboxLine}
          title="还没有邮箱"
          description="创建一个长期邮箱用于日常收发，或创建临时邮箱用于一次性收件。"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="secondary"
                leadingIcon={RiTimeLine}
                onClick={() => setCreateKind('temporary')}
                disabled={!canCreate}
              >
                创建临时邮箱
              </Button>
              <Button
                leadingIcon={RiAddLine}
                onClick={() => setCreateKind('permanent')}
                disabled={!canCreate}
              >
                创建邮箱
              </Button>
            </div>
          }
        />
        {modals}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Reading a message on a phone gets the whole viewport; the detail
          toolbar carries the way back. */}
      <div className={messageId ? 'hidden md:block' : undefined}>{header}</div>
      {missingDomains ? <DomainNotice /> : null}

      <div className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:h-[calc(100dvh-10rem)] xl:grid-cols-[248px_336px_minmax(0,1fr)]">
        <MailboxRail
          mailboxes={active}
          selectedId={mailboxId}
          renewLabel={
            policy ? `续期 ${formatDuration(policy.tempTtlMinutes)}` : '续期'
          }
          onSelect={selectMailbox}
          onRenew={(id) => renew.mutate(id)}
          onDelete={setDeletingMailbox}
        />
        <MessageList
          mailboxes={active}
          mailbox={selectedMailbox}
          items={items}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          isLoading={list.isLoading}
          error={listError}
          selectedMessageId={messageId}
          detailOpen={Boolean(messageId)}
          onSelectMailbox={selectMailbox}
          onSelectMessage={selectMessage}
          onRefresh={() => void list.refetch()}
          onRenew={() => {
            if (selectedMailbox) renew.mutate(selectedMailbox.id)
          }}
          onDeleteMailbox={setDeletingMailbox}
          onPageChange={setPage}
        />
        <MessageDetail
          message={message}
          isLoading={detail.isLoading}
          error={detailError}
          selected={Boolean(messageId)}
          mailboxAddress={mailboxId ? undefined : message?.mailboxAddress}
          onRetry={() => void detail.refetch()}
          onBack={() => selectMessage(undefined)}
          onToggleRead={() => {
            if (message) {
              mark.mutate({
                id: message.id,
                mailboxId: message.mailboxId,
                isRead: !message.isRead,
              })
            }
          }}
          onDelete={() => setDeletingMessage(true)}
        />
      </div>

      {modals}
    </div>
  )
}
