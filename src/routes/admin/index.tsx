import { createFileRoute, Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  RiCheckLine,
  RiGlobalLine,
  RiInboxLine,
  RiMailLine,
  RiSubtractLine,
  RiUserLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { ButtonLink } from '@/components/base/buttons/button'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { StatCards } from '@/components/application/dashboard/stat-cards'
import type { Stat } from '@/components/application/dashboard/stat-cards'
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/app/page-header'
import { domainStatusColor, domainStatusLabel } from '@/lib/admin-labels'
import { adminOverviewQuery } from '@/lib/queries'
import { headTitle } from '@/lib/site'

export const Route = createFileRoute('/admin/')({
  head: headTitle('管理概览'),
  component: AdminOverview,
})

function AdminOverview() {
  const { data, isLoading, isError, refetch } = useQuery(adminOverviewQuery())

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
      icon: RiUserLine,
      label: '用户',
      value: String(overview.users),
      tone: 'blue',
    },
    {
      icon: RiMailLine,
      label: '长期邮箱',
      value: String(overview.permanent),
      tone: 'purple',
    },
    {
      icon: RiInboxLine,
      label: '临时邮箱',
      value: String(overview.temporary),
      tone: 'orange',
    },
    {
      icon: RiGlobalLine,
      label: '已收邮件',
      value: String(overview.messages),
      tone: 'emerald',
    },
  ]

  const checklist: Array<{
    label: string
    hint: string
    done: boolean
    /** `null` for a step with no page to send the reader to. */
    href: LinkProps['to'] | null
  }> = [
    {
      label: '配置 Resend API Key',
      hint: '站点设置 → Resend；发件与读取收件内容都依赖它',
      done: overview.health.resend,
      href: '/admin/settings',
    },
    {
      label: '配置 Webhook Secret',
      hint: '用于接收邮件与投递状态事件',
      done: overview.health.webhook,
      href: '/admin/settings',
    },
    {
      label: '配置系统发件地址',
      hint: '找回密码与注册验证等系统邮件会从这个地址发出',
      done: overview.health.systemFrom,
      href: '/admin/settings',
    },
    {
      label: '添加并验证域名',
      hint: '收件与发件都依赖已验证的域名',
      done: overview.health.domain,
      href: '/admin/domains',
    },
    {
      label: '配置清理定时任务',
      hint: '设置 CRON_SECRET，并定时请求 /api/cron/cleanup',
      done: overview.health.cron,
      href: null,
    },
  ]
  const pending = checklist.filter((item) => !item.done)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="管理概览"
        actions={
          <ButtonLink href="/admin/settings" size="small">
            站点设置
          </ButtonLink>
        }
      />

      {pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-title-3-semibold text-text-primary">
              开始使用
            </h2>
            <span className="text-caption-1-regular text-text-tertiary">
              还差 {pending.length} 项
            </span>
          </div>
          <div className="divide-y divide-separator-border overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
            {checklist.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={
                    item.done
                      ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-status-lime-background text-status-lime-text'
                      : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-foreground-icon-tertiary'
                  }
                >
                  {item.done ? (
                    <RiCheckLine className="size-4" aria-hidden />
                  ) : (
                    <RiSubtractLine className="size-4" aria-hidden />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={
                      item.done
                        ? 'text-body-regular text-text-tertiary line-through'
                        : 'text-body-medium text-text-primary'
                    }
                  >
                    {item.label}
                  </span>
                  <span className="text-caption-1-regular text-text-tertiary">
                    {item.hint}
                  </span>
                </div>
                {!item.done && item.href ? (
                  <Link
                    to={item.href}
                    className="shrink-0 text-caption-1-medium text-accent-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    去配置
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
            description="域名用于收件与发件。已存在于 Resend 的域名会直接接入；已有邮箱服务的域名请使用子域。"
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
                  color={domainStatusColor(domain.status)}
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

function QuickLink({ href, label }: { href: LinkProps['to']; label: string }) {
  return (
    <Link
      to={href}
      className="rounded-2xl border border-border-button-default bg-background-primary-default px-4 py-3 text-body-medium text-text-primary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      {label}
    </Link>
  )
}
