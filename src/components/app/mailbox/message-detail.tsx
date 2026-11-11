import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RiArrowLeftLine,
  RiAttachment2,
  RiDeleteBin6Line,
  RiMailOpenLine,
  RiMailUnreadLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { EmptyState, ErrorState } from '@/components/app/page-header'
import {
  ScrollFade,
  useScrollFade,
} from '@/components/foundations/scroll-fade/scroll-fade'
import { formatBytes, formatFullDateTime } from '@/lib/format'
import { cx } from '@/utils/cx'
import { PanelHeader } from './panel-header'
import type { MessageDetailData } from './types'

export function MessageDetail({
  message,
  isLoading,
  error,
  selected,
  mailboxAddress,
  onRetry,
  onBack,
  onToggleRead,
  onDelete,
}: {
  message: MessageDetailData | null
  isLoading: boolean
  error?: string
  selected: boolean
  /** Set when no single mailbox is filtered, so the detail names its inbox. */
  mailboxAddress?: string
  onRetry: () => void
  onBack: () => void
  onToggleRead: () => void
  onDelete: () => void
}) {
  const fade = useScrollFade()
  const [allowImages, setAllowImages] = useState(false)

  useEffect(() => {
    setAllowImages(false)
  }, [message?.id])

  const recipients =
    message?.to.filter((address) => address !== message.mailboxAddress) ?? []

  return (
    <section
      className={cx(
        'min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default',
        selected ? 'flex' : 'hidden md:flex',
      )}
    >
      <PanelHeader
        title={selected && mailboxAddress ? `发往 ${mailboxAddress}` : '邮件详情'}
        leading={
          selected ? (
            <IconButton
              aria-label="返回邮件列表"
              icon={RiArrowLeftLine}
              size="small"
              onClick={onBack}
              className="md:hidden"
            />
          ) : null
        }
        actions={
          message ? (
            <>
              <IconButton
                aria-label={message.isRead ? '标为未读' : '标为已读'}
                icon={message.isRead ? RiMailUnreadLine : RiMailOpenLine}
                size="small"
                onClick={onToggleRead}
              />
              <IconButton
                aria-label="删除邮件"
                icon={RiDeleteBin6Line}
                size="small"
                onClick={onDelete}
              />
            </>
          ) : undefined
        }
      />

      <div className="relative min-h-0 flex-1">
        <div
          onScroll={fade.onScroll}
          className="h-full overflow-y-auto xl:max-h-full"
        >
          {!selected ? (
            <div className="p-4">
              <EmptyState
                icon={RiMailOpenLine}
                title="选择一封邮件"
                description="左侧列表中的邮件会在这里显示正文与附件。"
              />
            </div>
          ) : isLoading ? (
            <div className="flex flex-col gap-4 p-6">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorState
                title="无法加载邮件"
                description={error}
                onRetry={onRetry}
              />
            </div>
          ) : !message ? (
            <div className="p-4">
              <EmptyState
                title="邮件不存在"
                description="邮件可能已被删除，或随临时邮箱的保留期清理。"
              />
            </div>
          ) : (
            <article className="flex flex-col">
              <header className="flex flex-col gap-3 border-b border-separator-border p-5">
                <h2 className="text-title-3-semibold break-words text-text-primary">
                  {message.subject || '(无主题)'}
                </h2>
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
                  {message.mailboxKind === 'temporary' ? (
                    <Chip variant="caption" color="yellow">
                      临时邮箱
                    </Chip>
                  ) : null}
                </div>
                {recipients.length > 0 ? (
                  <p className="break-all text-caption-1-regular text-text-tertiary">
                    收件人：{recipients.join(', ')}
                  </p>
                ) : null}
              </header>

              <div className="flex flex-col gap-3 p-5">
                {message.htmlBody &&
                !allowImages &&
                /<img|background=|url\(/i.test(message.htmlBody) ? (
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
                <div className="flex flex-col gap-2 border-t border-separator-border p-5">
                  <h3 className="text-body-medium text-text-primary">附件</h3>
                  {message.attachments.map((file) => (
                    <a
                      key={file.id}
                      href={`/api/attachments/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-2xl border border-border-button-default px-3 py-2 transition-colors hover:bg-background-secondary-hover"
                    >
                      <RiAttachment2 className="size-4 shrink-0 text-foreground-icon-secondary" />
                      <span className="min-w-0 flex-1 truncate text-body-regular text-text-primary">
                        {file.filename}
                      </span>
                      <span className="shrink-0 text-caption-1-regular text-text-tertiary">
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
        </div>
        <ScrollFade progress={fade.progress} />
      </div>
    </section>
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
  // Measure the body, not the document: `documentElement.scrollHeight` never
  // drops below the frame's current viewport, so a short mail would keep the
  // previous (tall) height forever.
  const measure = useCallback(() => {
    const frame = frameRef.current
    const document = frame?.contentDocument
    if (!frame || !document) return
    const content = document.body?.scrollHeight ?? 0
    const next = Math.min(
      Math.max(content || 120, 120),
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
