import type { ReactNode } from 'react'
import {
  RiDeleteBin6Line,
  RiFileCopyLine,
  RiInboxLine,
  RiMore2Fill,
  RiRefreshLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@/components/base/dropdown/dropdown'
import { toast } from '@/components/base/toast/toast'
import {
  ScrollFade,
  useScrollFade,
} from '@/components/foundations/scroll-fade/scroll-fade'
import { countdown, formatRelative } from '@/lib/format'
import { cx } from '@/utils/cx'
import { PanelHeader } from './panel-header'
import type { MailboxSummary } from './types'

export function MailboxRail({
  mailboxes,
  selectedId,
  onSelect,
  onRenew,
  onDelete,
}: {
  mailboxes: MailboxSummary[]
  selectedId?: string
  onSelect: (id: string | undefined) => void
  onRenew: (id: string) => void
  onDelete: (mailbox: MailboxSummary) => void
}) {
  const fade = useScrollFade()

  const permanent = mailboxes
    .filter((mailbox) => mailbox.kind === 'permanent')
    .sort((a, b) => a.address.localeCompare(b.address))
  const temporary = mailboxes
    .filter((mailbox) => mailbox.kind === 'temporary')
    .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''))
  const unread = mailboxes.reduce((sum, mailbox) => sum + mailbox.unread, 0)

  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default xl:flex">
      <PanelHeader
        title="邮箱"
        actions={
          <span className="text-caption-1-regular text-text-tertiary">
            {mailboxes.length}
          </span>
        }
      />

      <div className="relative min-h-0 flex-1">
        <div
          onScroll={fade.onScroll}
          className="h-full overflow-y-auto py-1 [scrollbar-width:thin]"
        >
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            aria-current={!selectedId ? 'true' : undefined}
            className={cx(
              'flex w-full flex-col gap-0.5 border-s-2 py-2.5 ps-3 pe-4 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring',
              !selectedId
                ? 'border-accent-600 bg-accent-50 dark:bg-accent-950/40'
                : 'border-transparent hover:bg-background-secondary-hover',
            )}
          >
            <span className="flex items-center gap-2">
              <RiInboxLine className="size-4 shrink-0 text-foreground-icon-secondary" />
              <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">
                全部邮件
              </span>
              {unread > 0 ? (
                <span className="shrink-0 rounded-full bg-accent-600 px-1.5 text-caption-1-semibold text-white">
                  {unread}
                </span>
              ) : null}
            </span>
            <span className="ps-6 text-caption-1-regular text-text-tertiary">
              {mailboxes.length} 个邮箱
            </span>
          </button>

          {permanent.length > 0 ? (
            <SectionLabel>长期邮箱</SectionLabel>
          ) : null}
          {permanent.map((mailbox) => (
            <MailboxRow
              key={mailbox.id}
              mailbox={mailbox}
              active={mailbox.id === selectedId}
              onSelect={() => onSelect(mailbox.id)}
              onRenew={() => onRenew(mailbox.id)}
              onDelete={() => onDelete(mailbox)}
            />
          ))}

          {temporary.length > 0 ? (
            <SectionLabel>临时邮箱</SectionLabel>
          ) : null}
          {temporary.map((mailbox) => (
            <MailboxRow
              key={mailbox.id}
              mailbox={mailbox}
              active={mailbox.id === selectedId}
              onSelect={() => onSelect(mailbox.id)}
              onRenew={() => onRenew(mailbox.id)}
              onDelete={() => onDelete(mailbox)}
            />
          ))}
        </div>
        <ScrollFade progress={fade.progress} />
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 text-caption-1-semibold text-text-tertiary">
      {children}
    </div>
  )
}

function MailboxRow({
  mailbox,
  active,
  onSelect,
  onRenew,
  onDelete,
}: {
  mailbox: MailboxSummary
  active: boolean
  onSelect: () => void
  onRenew: () => void
  onDelete: () => void
}) {
  const temporary = mailbox.kind === 'temporary'
  const meta = temporary
    ? countdown(mailbox.expiresAt)
    : mailbox.lastReceivedAt
      ? `最近 ${formatRelative(mailbox.lastReceivedAt)}`
      : '长期邮箱'

  return (
    <div
      className={cx(
        'group flex items-start border-s-2 transition-colors',
        active
          ? 'border-accent-600 bg-accent-50 dark:bg-accent-950/40'
          : 'border-transparent hover:bg-background-secondary-hover',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1 py-2 ps-3 pe-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cx(
              'truncate text-body-regular',
              mailbox.unread > 0
                ? 'font-medium text-text-primary'
                : 'text-text-secondary',
            )}
          >
            {mailbox.address}
          </span>
          {mailbox.unread > 0 ? (
            <span className="shrink-0 rounded-full bg-accent-600 px-1.5 text-caption-1-semibold text-white">
              {mailbox.unread}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          {temporary ? (
            <Chip variant="caption" color="yellow">
              临时
            </Chip>
          ) : null}
          <span className="truncate text-caption-1-regular text-text-tertiary">
            {meta}
          </span>
        </span>
      </button>

      <Dropdown>
        <DropdownTrigger
          aria-label={`${mailbox.address} 的操作`}
          className="mt-1 me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-foreground-icon-tertiary outline-none transition-colors hover:bg-background-tertiary-default hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiMore2Fill className="size-3.5" />
        </DropdownTrigger>
        <DropdownPopover aria-label="邮箱操作">
          <DropdownItem
            onSelect={async () => {
              await navigator.clipboard.writeText(mailbox.address)
              toast.success('地址已复制')
            }}
          >
            <RiFileCopyLine className="size-4 text-foreground-icon-secondary" />
            <span>复制地址</span>
          </DropdownItem>
          {temporary ? (
            <DropdownItem onSelect={onRenew}>
              <RiRefreshLine className="size-4 text-foreground-icon-secondary" />
              <span>续期 1 小时</span>
            </DropdownItem>
          ) : null}
          <DropdownItem onSelect={onDelete}>
            <RiDeleteBin6Line className="size-4 text-text-error-primary" />
            <span className="text-text-error-primary">删除邮箱</span>
          </DropdownItem>
        </DropdownPopover>
      </Dropdown>
    </div>
  )
}
