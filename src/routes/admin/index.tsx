import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  RiGlobalLine,
  RiInboxLine,
  RiMailLine,
  RiUserLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { ButtonLink } from '@/components/base/buttons/button'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { StatCards } from '@/components/application/dashboard/stat-cards'
import type { Stat } from '@/components/application/dashboard/stat-cards'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { domainStatusLabel } from '@/lib/admin-labels'
import { headTitle } from '@/lib/site'
import { adminOverviewFn } from '@/server/functions/admin'

export const Route = createFileRoute('/admin/')({
  head: headTitle('管理概览'),
  component: AdminOverview,
})

function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => adminOverviewFn(),
    refetchInterval: 30_000,
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
    return <EmptyState title="无法加载概览" description={data?.message} />
  }

  const overview = data.data
  const stats: Stat[] = [
    {
      icon: RiUserLine,
      label: '用户',
      value: String(overview.users),
      delta: '',
      deltaColor: 'neutral',
      tone: 'blue',
    },
    {
      icon: RiMailLine,
      label: '长期邮箱',
      value: String(overview.permanent),
      delta: '',
      deltaColor: 'neutral',
      tone: 'purple',
    },
    {
      icon: RiInboxLine,
      label: '临时邮箱',
      value: String(overview.temporary),
      delta: '',
      deltaColor: 'neutral',
      tone: 'orange',
    },
    {
      icon: RiGlobalLine,
      label: '已收邮件',
      value: String(overview.messages),
      delta: '',
      deltaColor: 'neutral',
      tone: 'emerald',
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="管理概览"
        description="站点运行状态与配置入口。"
        actions={
          <ButtonLink href="/admin/settings" size="small">
            站点设置
          </ButtonLink>
        }
      />

      <StatCards variant="footer" stats={stats} columns={4} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-title-3-semibold text-text-primary">域名</h2>
          <ButtonLink href="/admin/domains" size="small" variant="ghost">
            管理域名
          </ButtonLink>
        </div>

        {overview.domains.length === 0 ? (
          <EmptyState
            icon={RiGlobalLine}
            title="还没有配置域名"
            description="添加域名后会自动创建 Resend 域名，已存在则直接接入；再按 DNS 记录完成验证。"
            action={<ButtonLink href="/admin/domains">添加域名</ButtonLink>}
          />
        ) : (
          <div className="divide-y divide-separator-border overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
            {overview.domains.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-body-medium text-text-primary">
                    {domain.name}
                  </span>
                  {domain.isDefault ? (
                    <Chip variant="caption" color="blue">
                      默认
                    </Chip>
                  ) : null}
                </div>
                <Chip
                  variant="caption"
                  color={domain.status === 'verified' ? 'lime' : 'yellow'}
                >
                  {domainStatusLabel(domain.status)}
                </Chip>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/admin/users" label="用户管理" />
        <QuickLink href="/admin/mailboxes" label="邮箱管理" />
        <QuickLink href="/admin/settings" label="站点与邮件策略" />
        <QuickLink href="/admin/audit" label="审计日志" />
      </section>
    </div>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      to={href as never}
      className="rounded-2xl border border-border-button-default bg-background-primary-default px-4 py-3 text-body-medium text-text-primary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      {label}
    </Link>
  )
}
