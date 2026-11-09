import { createFileRoute } from '@tanstack/react-router'
import {
  RiArrowRightLine,
  RiInboxLine,
  RiMailSendLine,
  RiTimeLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { ButtonLink } from '@/components/base/buttons/button'
import { fetchPublicConfig } from '@/server/functions/auth'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'asms · 自托管邮箱' }] }),
  loader: async () => fetchPublicConfig(),
  component: LandingPage,
})

function LandingPage() {
  const config = Route.useLoaderData()
  const { session } = Route.useRouteContext()

  return (
    <main className="min-h-dvh bg-background-full px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.logoUrl ? (
              <img
                src={config.logoUrl}
                alt={config.siteName}
                className="size-9 rounded-xl object-cover"
              />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent-600 text-body-medium text-white">
                {config.siteName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="flex flex-col">
              <span className="text-body-medium text-text-primary">
                {config.siteName}
              </span>
              <span className="text-caption-1-regular text-text-tertiary">
                自托管邮件服务
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            {session ? (
              <ButtonLink
                href={session.user.role === 'admin' ? '/admin' : '/app'}
                size="small"
                trailingIcon={RiArrowRightLine}
              >
                进入面板
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="small">
                  登录
                </ButtonLink>
                <ButtonLink
                  href="/register"
                  size="small"
                  trailingIcon={RiArrowRightLine}
                >
                  开始使用
                </ButtonLink>
              </>
            )}
          </nav>
        </header>

        <section className="flex flex-col items-start gap-6">
          <Chip variant="caption" color="blue">
            基于 Resend 的自托管邮箱
          </Chip>
          <h1 className="max-w-3xl text-display-1-semibold text-text-primary">
            给你的项目一个
            <span className="whitespace-nowrap">
              <span className="text-accent-600">真正可用</span>的收件箱。
            </span>
          </h1>
          <p className="max-w-2xl text-body-large-regular text-text-secondary">
            创建长期邮箱或一次性临时地址。收件实时入库，发件走 Resend
            API，数据全部留在你自己的服务器上。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {session ? (
              <ButtonLink
                href="/app"
                size="medium"
                trailingIcon={RiArrowRightLine}
              >
                进入用户面板
              </ButtonLink>
            ) : (
              <>
                <ButtonLink
                  href="/register"
                  size="medium"
                  trailingIcon={RiArrowRightLine}
                >
                  创建账号
                </ButtonLink>
                <ButtonLink href="/login" size="medium" variant="secondary">
                  已有账号，登录
                </ButtonLink>
              </>
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Feature
            icon={RiInboxLine}
            title="长期邮箱"
            description="前缀最短 3 位，数量由管理员按用户配置，默认 5 个。"
          />
          <Feature
            icon={RiTimeLine}
            title="临时邮箱"
            description="前缀最短 8 位，默认 1 小时有效，可续期，到期自动清理。"
          />
          <Feature
            icon={RiMailSendLine}
            title="Resend 发件"
            description="每日额度可配置，默认 5 封，管理员不受限制。"
          />
        </section>

        <footer className="border-t border-separator-border pt-6 text-caption-1-regular text-text-tertiary">
          {config.footerText || `${config.siteName} · 由 Resend 提供投递`}
        </footer>
      </div>
    </main>
  )
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
        <Icon className="size-5" />
      </span>
      <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
      <p className="text-body-regular text-text-secondary">{description}</p>
    </div>
  )
}
