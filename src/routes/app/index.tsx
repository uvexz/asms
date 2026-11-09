import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  RiArrowRightLine,
  RiInboxLine,
  RiMailSendLine,
  RiMailUnreadLine,
  RiTimeLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { ButtonLink } from '@/components/base/buttons/button'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { StatCards } from '@/components/application/dashboard/stat-cards'
import type { Stat } from '@/components/application/dashboard/stat-cards'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { formatRelative } from '@/lib/format'
import { headTitle } from '@/lib/site'
import { fetchOverview } from '@/server/functions/dashboard'

export const Route = createFileRoute('/app/')({
  head: headTitle('概览'),
  component: OverviewPage,
})

function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchOverview(),
    refetchInterval: 15_000,
  })

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

  if (!data?.ok) {
    return (
      <EmptyState
        title="无法加载概览"
        description={data && !data.ok ? data.message : '请刷新页面重试'}
      />
    )
  }

  const overview = data.data
  const stats: Stat[] = [
    {
      icon: RiInboxLine,
      label: '长期邮箱',
      value: String(overview.permanent),
      delta: '',
      deltaColor: 'neutral',
      tone: 'blue',
    },
    {
      icon: RiTimeLine,
      label: '临时邮箱',
      value: String(overview.temporary),
      delta: '',
      deltaColor: 'neutral',
      tone: 'purple',
    },
    {
      icon: RiMailUnreadLine,
      label: '未读邮件',
      value: String(overview.unread),
      delta: '',
      deltaColor: 'neutral',
      tone: 'orange',
    },
    {
      icon: RiMailSendLine,
      label: '今日发件',
      value: overview.usage.unlimited
        ? '不限'
        : `${overview.usage.used} / ${overview.usage.limit}`,
      delta: '',
      deltaColor: 'neutral',
      caption: overview.usage.unlimited ? '管理员不限额' : '每日额度',
      tone: 'emerald',
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="概览"
        description="邮箱、收件与发件额度一览。"
        actions={
          <ButtonLink
            href="/app/compose"
            size="small"
            trailingIcon={RiArrowRightLine}
          >
            写邮件
          </ButtonLink>
        }
      />

      <StatCards variant="footer" stats={stats} columns={4} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-title-3-semibold text-text-primary">最近收件</h2>
          <ButtonLink href="/app/mailboxes" size="small" variant="ghost">
            全部邮箱
          </ButtonLink>
        </div>

        {overview.recent.length === 0 ? (
          <EmptyState
            icon={RiInboxLine}
            title="还没有收到邮件"
            description="创建一个邮箱后，把地址留给对方，新邮件会自动出现在这里。"
            action={<ButtonLink href="/app/mailboxes">创建邮箱</ButtonLink>}
          />
        ) : (
          <div className="divide-y divide-separator-border overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
            {overview.recent.map((item) => (
              <Link
                key={item.id}
                to="/app/inbox/$mailboxId"
                params={{ mailboxId: item.mailboxId }}
                search={{ message: item.id }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background-secondary-hover"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-caption-1-semibold text-text-secondary">
                  {(item.fromName || item.fromAddress)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
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
    </div>
  )
}
