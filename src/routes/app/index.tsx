import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  RiAddLine,
  RiInboxLine,
  RiMailSendLine,
  RiMailUnreadLine,
  RiTimeLine,
} from '@remixicon/react'

import { Avatar } from '@/components/base/avatar/avatar'
import { Chip } from '@/components/base/badges/chip'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { StatCards } from '@/components/application/dashboard/stat-cards'
import type { Stat } from '@/components/application/dashboard/stat-cards'
import {
  CreateMailboxModal,
  CreateTempMailboxModal,
} from '@/components/app/mailbox/create-modals'
import { DomainNotice } from '@/components/app/mailbox/domain-notice'
import type { MailboxKind } from '@/components/app/mailbox/types'
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/app/page-header'
import { formatRelative } from '@/lib/format'
import { headTitle } from '@/lib/site'
import { domainsQuery, overviewQuery } from '@/lib/queries'

export const Route = createFileRoute('/app/')({
  head: headTitle('概览'),
  component: OverviewPage,
})

function OverviewPage() {
  const router = useRouter()
  const [createKind, setCreateKind] = useState<MailboxKind | null>(null)
  const { data, isLoading, isError, refetch } = useQuery(overviewQuery())
  const domains = useQuery(domainsQuery())

  const canCreate = domains.data?.ok ? domains.data.data.length > 0 : true
  const missingDomains = domains.data?.ok && domains.data.data.length === 0
  const openMailbox = (id: string) => {
    void router.navigate({
      to: '/app/mailboxes',
      search: { mailbox: id, message: undefined },
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data?.ok) {
    return (
      <ErrorState
        title="无法加载概览"
        description={data && !data.ok ? data.message : undefined}
        onRetry={() => void refetch()}
      />
    )
  }

  const overview = data.data
  const stats: Stat[] = [
    {
      icon: RiInboxLine,
      label: '长期邮箱',
      value: String(overview.permanent),
      tone: 'blue',
    },
    {
      icon: RiTimeLine,
      label: '临时邮箱',
      value: String(overview.temporary),
      tone: 'purple',
    },
    {
      icon: RiMailUnreadLine,
      label: '未读邮件',
      value: String(overview.unread),
      tone: 'orange',
    },
    {
      icon: RiMailSendLine,
      label: '今日发件',
      value: overview.usage.unlimited
        ? '不限'
        : `${overview.usage.used} / ${overview.usage.limit}`,
      caption: overview.usage.unlimited ? '管理员不限额' : '每日额度',
      tone: 'emerald',
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="概览"
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
        {missingDomains ? <DomainNotice /> : null}
      </div>

      <StatCards variant="footer" stats={stats} columns={4} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title-3-semibold text-text-primary">最近收件</h2>
          <div className="flex items-center gap-1">
            <ButtonLink href="/app/compose" size="small" variant="ghost">
              写邮件
            </ButtonLink>
            <ButtonLink href="/app/mailboxes" size="small" variant="ghost">
              全部邮箱
            </ButtonLink>
          </div>
        </div>

        {overview.recent.length === 0 ? (
          <EmptyState
            icon={RiInboxLine}
            title="还没有收到邮件"
            description="创建一个邮箱后，把地址留给对方，新邮件会自动出现在这里。"
            action={
              <Button
                onClick={() => setCreateKind('permanent')}
                disabled={!canCreate}
              >
                创建邮箱
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-separator-border overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
            {overview.recent.map((item) => (
              <Link
                key={item.id}
                to="/app/mailboxes"
                search={{ mailbox: item.mailboxId, message: item.id }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background-secondary-hover"
              >
                <Avatar
                  size="lg"
                  animate="hover"
                  name={item.fromAddress || item.fromName || 'unknown sender'}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body-medium text-text-primary">
                      {item.subject || '(无主题)'}
                    </span>
                    {!item.isRead ? (
                      <Chip variant="caption" color="blue">
                        未读
                      </Chip>
                    ) : null}
                  </span>
                  <span className="truncate text-caption-1-regular text-text-tertiary">
                    {item.fromName || item.fromAddress} · 发往{' '}
                    {item.mailboxAddress}
                  </span>
                </span>
                <span className="shrink-0 text-caption-1-regular text-text-tertiary">
                  {formatRelative(item.receivedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <CreateMailboxModal
        isOpen={createKind === 'permanent'}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null)
        }}
        onCreated={(mailbox) => openMailbox(mailbox.id)}
      />
      <CreateTempMailboxModal
        isOpen={createKind === 'temporary'}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null)
        }}
        onCreated={(mailbox) => openMailbox(mailbox.id)}
      />
    </div>
  )
}
