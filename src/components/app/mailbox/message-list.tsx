import {
  RiDeleteBin6Line,
  RiFileCopyLine,
  RiInboxLine,
  RiMailLine,
  RiMore2Fill,
  RiRefreshLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@/components/base/dropdown/dropdown'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { toast } from '@/components/base/toast/toast'
import { EmptyState } from '@/components/app/page-header'
import {
  ScrollFade,
  useScrollFade,
} from '@/components/foundations/scroll-fade/scroll-fade'
import { countdown, formatRelative } from '@/lib/format'
import { cx } from '@/utils/cx'
import { PanelHeader } from './panel-header'
import type { MailboxSummary, MessageSummary } from './types'

export function MessageList({
  mailboxes,
  mailbox,
  items,
  total,
  page,
  pageSize,
  isLoading,
  error,
  selectedMessageId,
  detailOpen,
  onSelectMailbox,
  onSelectMessage,
  onRefresh,
  onRenew,
  onDeleteMailbox,
  onPageChange,
}: {
  mailboxes: MailboxSummary[]
  mailbox?: MailboxSummary
  items: MessageSummary[]
  total: number
  page: number
  pageSize: number
  isLoading: boolean
  error?: string
  selectedMessageId?: string
  detailOpen: boolean
  onSelectMailbox: (id: string | undefined) => void
  onSelectMessage: (id: string) => void
  onRefresh: () => void
  onRenew: () => void
  onDeleteMailbox: (mailbox: MailboxSummary) => void
  onPageChange: (page: number) => void
}) {
  const fade = useScrollFade()

  const subtitle = mailbox
    ? [
        mailbox.kind === 'temporary' ? countdown(mailbox.expiresAt) : null,
        total > 0 ? `共 ${total} 封` : '还没有收件',
      ]
        .filter(Boolean)
        .join(' · ')
    : total > 0
      ? `共 ${total} 封`
      : '所有邮箱的收件'

  const totalUnread = mailboxes.reduce((sum, item) => sum + item.unread, 0)

  return (
    <section
      className={cx(
        'min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default',
        detailOpen ? 'hidden md:flex' : 'flex',
      )}
    >
      <PanelHeader
        title={mailbox?.address ?? '全部邮件'}
        subtitle={subtitle}
        actions={
          <>
            {mailbox?.kind === 'temporary' ? (
              <Button
                size="xs"
                variant="secondary"
                leadingIcon={RiRefreshLine}
                onClick={onRenew}
              >
                续期
              </Button>
            ) : null}
            {mailbox ? (
              <Dropdown>
                <DropdownTrigger
                  aria-label={`${mailbox.address} 的操作`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-2lg text-foreground-icon-secondary outline-none transition-colors hover:bg-background-secondary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <RiMore2Fill className="size-4" />
                </DropdownTrigger>
                <DropdownPopover aria-label="邮箱操作">
                  {mailbox.kind === 'temporary' && mailbox.renewCount > 0 ? (
                    <p className="px-2 pb-1 text-caption-1-regular text-text-tertiary">
                      已续期 {mailbox.renewCount} 次
                    </p>
                  ) : null}
                  <DropdownItem
                    onSelect={async () => {
                      await navigator.clipboard.writeText(mailbox.address)
                      toast.success('地址已复制')
                    }}
                  >
                    <RiFileCopyLine className="size-4 text-foreground-icon-secondary" />
                    <span>复制地址</span>
                  </DropdownItem>
                  <DropdownItem onSelect={() => onDeleteMailbox(mailbox)}>
                    <RiDeleteBin6Line className="size-4 text-text-error-primary" />
                    <span className="text-text-error-primary">删除邮箱</span>
                  </DropdownItem>
                </DropdownPopover>
              </Dropdown>
            ) : null}
            <IconButton
              aria-label="刷新邮件"
              icon={RiRefreshLine}
              size="small"
              onClick={onRefresh}
            />
          </>
        }
      />

      {/* Below xl the rail is hidden, so these pills are the only way to switch
          mailboxes. They live outside the header: a second row inside it would
          make this header taller than the detail pane's and break the divider. */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-2 pb-1 [scrollbar-width:none] xl:hidden">
        <FilterPill
          active={!mailbox}
          label="全部"
          count={totalUnread}
          onClick={() => onSelectMailbox(undefined)}
        />
        {mailboxes.map((item) => (
          <FilterPill
            key={item.id}
            active={item.id === mailbox?.id}
            label={item.address}
            count={item.unread}
            temporary={item.kind === 'temporary'}
            onClick={() => onSelectMailbox(item.id)}
          />
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          onScroll={fade.onScroll}
          className="h-full overflow-y-auto xl:max-h-full"
        >
          {isLoading ? (
            <div className="flex flex-col gap-3 p-4">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-4">
              <EmptyState
                title="无法读取这些邮件"
                description={error}
                action={
                  mailbox ? (
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => onSelectMailbox(undefined)}
                    >
                      查看全部邮件
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={RiInboxLine}
                title="收件箱是空的"
                description={
                  mailbox
                    ? '把邮箱地址留给对方，新邮件会自动出现在这里。'
                    : '选中一个邮箱，或等待新邮件到达。'
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-separator-border">
              {items.map((item) => {
                const active = item.id === selectedMessageId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectMessage(item.id)}
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
                    {!mailbox ? (
                      <span className="flex min-w-0 items-center gap-1 text-caption-1-regular text-text-tertiary">
                        <RiMailLine className="size-3 shrink-0" />
                        <span className="truncate">{item.mailboxAddress}</span>
                        {item.mailboxKind === 'temporary' ? (
                          <Chip variant="caption" color="yellow">
                            临时
                          </Chip>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <ScrollFade progress={fade.progress} />
      </div>

      {total > pageSize ? (
        <div className="flex shrink-0 items-center justify-between border-t border-separator-border px-4 py-2">
          <Button
            size="xs"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            上一页
          </Button>
          <span className="text-caption-1-regular text-text-tertiary">
            第 {page} / {Math.ceil(total / pageSize)} 页
          </span>
          <Button
            size="xs"
            variant="secondary"
            disabled={page * pageSize >= total}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function FilterPill({
  active,
  label,
  count,
  temporary,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  temporary?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cx(
        'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-caption-1-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring',
        active
          ? 'border-accent-600 bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300'
          : 'border-border-button-default text-text-secondary hover:bg-background-secondary-hover',
      )}
    >
      <span className="max-w-[168px] truncate">{label}</span>
      {temporary ? (
        <span className={active ? 'text-accent-600' : 'text-status-yellow-text'}>
          临时
        </span>
      ) : null}
      {count > 0 ? (
        <span className="rounded-full bg-accent-600 px-1 text-caption-1-semibold text-white">
          {count}
        </span>
      ) : null}
    </button>
  )
}
