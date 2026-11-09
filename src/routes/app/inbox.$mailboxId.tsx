import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RiArrowLeftLine,
  RiAttachment2,
  RiDeleteBin6Line,
  RiMailOpenLine,
  RiMailUnreadLine,
  RiRefreshLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { AlertDialog } from '@/components/base/modal/modal'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { Switch } from '@/components/base/switch/switch'
import { toast } from '@/components/base/toast/toast'
import { EmptyState } from '@/components/app/page-header'
import { formatBytes, formatFullDateTime, formatRelative } from '@/lib/format'
import { headTitle } from '@/lib/site'
import {
  deleteMessageFn,
  getMessageFn,
  listMessagesFn,
  markMessageFn,
} from '@/server/functions/messages'
import { listMailboxesFn } from '@/server/functions/mailboxes'
import { cx } from '@/utils/cx'

export const Route = createFileRoute('/app/inbox/$mailboxId')({
  head: headTitle('收件箱'),
  validateSearch: (search: Record<string, unknown>) => ({
    message: typeof search.message === 'string' ? search.message : undefined,
  }),
  component: InboxPage,
})

function InboxPage() {
  const { mailboxId } = Route.useParams()
  const { message: selectedId } = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [allowImages, setAllowImages] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => listMailboxesFn(),
  })
  const mailbox = mailboxes.data?.ok
    ? mailboxes.data.data.find((item) => item.id === mailboxId)
    : undefined

  const list = useQuery({
    queryKey: ['messages', mailboxId, page],
    queryFn: () => listMessagesFn({ data: { mailboxId, page, pageSize: 20 } }),
    refetchInterval: 15_000,
  })

  const detail = useQuery({
    queryKey: ['message', selectedId],
    queryFn: () => getMessageFn({ data: { id: selectedId! } }),
    enabled: Boolean(selectedId),
  })

  const mark = useMutation({
    mutationFn: (input: { id: string; isRead: boolean }) =>
      markMessageFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messages', mailboxId] })
      await queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteMessageFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('邮件已删除')
      await router.navigate({
        to: '/app/inbox/$mailboxId',
        params: { mailboxId },
        search: { message: undefined },
        replace: true,
      })
      await queryClient.invalidateQueries({ queryKey: ['messages', mailboxId] })
      await queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const message = detail.data?.ok ? detail.data.data : null

  useEffect(() => {
    if (message && !message.isRead) {
      mark.mutate({ id: message.id, isRead: true })
    }
  }, [message?.id])

  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0

  const selectMessage = (id: string | undefined) => {
    if (id && window.matchMedia('(max-width: 1279px)').matches) {
      window.scrollTo({ top: 0 })
    }
    void router.navigate({
      to: '/app/inbox/$mailboxId',
      params: { mailboxId },
      search: { message: id },
      replace: true,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton
            aria-label="返回邮箱列表"
            icon={RiArrowLeftLine}
            size="small"
            onClick={() => void router.navigate({ to: '/app/mailboxes' })}
          />
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-title-2-semibold text-text-primary">
              {mailbox?.address ?? '收件箱'}
            </h1>
            <span className="text-caption-1-regular text-text-tertiary">
              {mailbox?.kind === 'temporary'
                ? '临时邮箱 · 到期自动清理'
                : '长期邮箱'}
              {total > 0 ? ` · 共 ${total} 封` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            leadingIcon={RiRefreshLine}
            onClick={() => void list.refetch()}
          >
            刷新
          </Button>
          <Switch
            size="sm"
            isSelected={allowImages}
            onChange={setAllowImages}
            aria-label="显示远程图片"
          >
            显示图片
          </Switch>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section
          className={cx(
            'flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default',
            selectedId ? 'hidden xl:flex' : 'flex',
          )}
        >
          {list.isLoading ? (
            <div className="flex flex-col gap-3 p-4">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="收件箱是空的"
                description="把邮箱地址留给对方，新邮件会自动出现在这里。"
              />
            </div>
          ) : (
            <div className="divide-y divide-separator-border">
              {items.map((item) => {
                const active = item.id === selectedId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMessage(item.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cx(
                      'flex w-full flex-col gap-1 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring',
                      active
                        ? 'border-s-2 border-accent-600 bg-accent-50 pe-4 ps-[14px] dark:bg-accent-950/40'
                        : 'border-s-2 border-transparent px-4 hover:bg-background-secondary-hover',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        {!item.isRead ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-accent-600" />
                        ) : null}
                        <span
                          className={
                            item.isRead
                              ? 'truncate text-body-regular text-text-secondary'
                              : 'truncate text-body-medium text-text-primary'
                          }
                        >
                          {item.fromName || item.fromAddress}
                        </span>
                      </span>
                      <span className="shrink-0 text-caption-1-regular text-text-tertiary">
                        {formatRelative(item.receivedAt)}
                      </span>
                    </span>
                    <span
                      className={
                        item.isRead
                          ? 'truncate text-caption-1-regular text-text-tertiary'
                          : 'truncate text-caption-1-semibold text-text-primary'
                      }
                    >
                      {item.subject || '(无主题)'}
                    </span>
                    <span className="truncate text-caption-1-regular text-text-tertiary">
                      {item.snippet}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {total > 20 ? (
            <div className="flex items-center justify-between border-t border-separator-border px-4 py-3">
              <Button
                size="xs"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <span className="text-caption-1-regular text-text-tertiary">
                第 {page} 页
              </span>
              <Button
                size="xs"
                variant="secondary"
                disabled={page * 20 >= total}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </section>

        <section
          className={cx(
            'min-w-0 overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default',
            selectedId ? 'block' : 'hidden xl:block',
          )}
        >
          {!selectedId ? (
            <div className="p-8">
              <EmptyState
                icon={RiMailOpenLine}
                title="选择一封邮件"
                description="左侧列表中的邮件会在这里显示正文与附件。"
              />
            </div>
          ) : detail.isLoading ? (
            <div className="flex flex-col gap-4 p-6">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !message ? (
            <div className="p-8">
              <EmptyState title="邮件不存在" description="它可能已被删除。" />
            </div>
          ) : (
            <article className="flex flex-col">
              <header className="flex flex-col gap-3 border-b border-separator-border p-6">
                <Button
                  size="xs"
                  variant="ghost"
                  leadingIcon={RiArrowLeftLine}
                  onClick={() => selectMessage(undefined)}
                  className="self-start xl:hidden"
                >
                  返回列表
                </Button>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-title-3-semibold text-text-primary">
                    {message.subject || '(无主题)'}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      aria-label={message.isRead ? '标为未读' : '标为已读'}
                      icon={message.isRead ? RiMailUnreadLine : RiMailOpenLine}
                      size="small"
                      onClick={() =>
                        mark.mutate({ id: message.id, isRead: !message.isRead })
                      }
                    />
                    <IconButton
                      aria-label="删除邮件"
                      icon={RiDeleteBin6Line}
                      size="small"
                      onClick={() => setConfirmingDelete(true)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-regular text-text-tertiary">
                  <span className="break-all text-text-secondary">
                    {message.fromName
                      ? `${message.fromName} <${message.fromAddress}>`
                      : message.fromAddress}
                  </span>
                  <span>{formatFullDateTime(message.receivedAt)}</span>
                  {message.attachments.length > 0 ? (
                    <Chip variant="caption" color="neutral">
                      {message.attachments.length} 个附件
                    </Chip>
                  ) : null}
                </div>
                {message.to.some((address) => address !== mailbox?.address) ? (
                  <p className="text-caption-1-regular text-text-tertiary">
                    收件人：
                    {message.to
                      .filter((address) => address !== mailbox?.address)
                      .join(', ')}
                  </p>
                ) : null}
              </header>

              <div className="flex flex-col gap-3 p-6">
                {message.htmlBody && !allowImages && /<img/i.test(message.htmlBody) ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-button-default bg-background-secondary-default px-3 py-2">
                    <span className="text-caption-1-regular text-text-secondary">
                      远程图片已拦截，避免发件人追踪你的打开行为。
                    </span>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => setAllowImages(true)}
                    >
                      显示图片
                    </Button>
                  </div>
                ) : null}
                {message.htmlBody ? (
                  <EmailFrame
                    html={message.htmlBody}
                    allowImages={allowImages}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-sans text-body-regular text-text-primary">
                    {message.textBody || '(无正文)'}
                  </pre>
                )}
              </div>

              {message.attachments.length > 0 ? (
                <div className="flex flex-col gap-2 border-t border-separator-border p-6">
                  <h3 className="text-body-medium text-text-primary">附件</h3>
                  {message.attachments.map((file) => (
                    <a
                      key={file.id}
                      href={`/api/attachments/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-2xl border border-border-button-default px-3 py-2 transition-colors hover:bg-background-secondary-hover"
                    >
                      <RiAttachment2 className="size-4 text-foreground-icon-secondary" />
                      <span className="min-w-0 flex-1 truncate text-body-regular text-text-primary">
                        {file.filename}
                      </span>
                      <span className="text-caption-1-regular text-text-tertiary">
                        {formatBytes(file.size)}
                      </span>
                      {!file.stored ? (
                        <Chip variant="caption" color="neutral">
                          按需获取
                        </Chip>
                      ) : null}
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          )}
        </section>
      </div>

      <AlertDialog
        isOpen={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="删除这封邮件？"
        description={
          message
            ? `「${message.subject || '(无主题)'}」会被立即删除，无法恢复。`
            : ''
        }
        confirmLabel="删除"
        onConfirm={() => {
          if (!message) return
          remove.mutate(message.id)
          setConfirmingDelete(false)
        }}
      />
    </div>
  )
}

function EmailFrame({
  html,
  allowImages,
}: {
  html: string
  allowImages: boolean
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(320)

  const doc = useMemo(() => {
    const csp = allowImages
      ? ''
      : '<meta http-equiv="Content-Security-Policy" content="img-src data: cid:; object-src \'none\'; script-src \'none\';">'
    return `<!doctype html><html><head><meta charset="utf-8">${csp}<base target="_blank"><style>
      body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.65;color:#111;word-break:break-word}
      img{max-width:100%;height:auto}
      a{color:#2563eb}
      pre{white-space:pre-wrap}
      table{max-width:100%}
    </style></head><body>${html}</body></html>`
  }, [html, allowImages])

  // `allow-same-origin` (without `allow-scripts`) lets us measure the body so
  // the frame can hug short mail instead of leaving a fixed 60vh of white.
  const measure = useCallback(() => {
    const frame = frameRef.current
    const document = frame?.contentDocument
    if (!frame || !document) return
    const next = Math.min(
      Math.max(document.documentElement.scrollHeight, 120),
      Math.round(window.innerHeight * 0.7),
    )
    setHeight(next)
  }, [])

  const handleLoad = useCallback(() => {
    measure()
    const images = frameRef.current?.contentDocument?.images
    if (!images) return
    for (const image of Array.from(images)) {
      image.addEventListener('load', measure, { once: true })
    }
  }, [measure])

  useEffect(() => {
    const timer = window.setTimeout(measure, 120)
    return () => window.clearTimeout(timer)
  }, [doc, measure])

  return (
    <iframe
      ref={frameRef}
      title="邮件正文"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={handleLoad}
      style={{ height }}
      className="max-h-[70vh] w-full rounded-2xl border border-separator-border bg-white"
    />
  )
}
