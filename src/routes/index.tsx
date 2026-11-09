import { createFileRoute, Link } from '@tanstack/react-router'
import { RiArrowRightLine } from '@remixicon/react'
import type { CSSProperties } from 'react'

import { LoginPanel } from '@/components/application/auth/login-panel'
import { ButtonLink } from '@/components/base/buttons/button'
import { useReveal } from '@/lib/use-reveal'
import { fetchPublicConfig } from '@/server/functions/auth'
import landingCss from '@/styles/landing.css?url'

export const Route = createFileRoute('/')({
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.siteName ?? 'asms'} · 自托管邮箱` },
      {
        name: 'description',
        content:
          '长期邮箱和一次性地址并存。收件实时入库，发件走 Resend，数据留在你自己的服务器上。',
      },
    ],
    links: [{ rel: 'stylesheet', href: landingCss }],
  }),
  loader: async () => fetchPublicConfig(),
  component: LandingPage,
})

const SPECS = [
  {
    term: '长期邮箱',
    value: '前缀 3 位起',
    note: '默认每人 5 个，上限由管理员配置。',
  },
  {
    term: '临时邮箱',
    value: '60 分钟到期',
    note: '可续期，总寿命 24 小时，到期自动清理。',
  },
  {
    term: '发件',
    value: '走 Resend',
    note: '每日额度按人配置，管理员不受限。',
  },
] as const

function LandingPage() {
  const config = Route.useLoaderData()
  const { session } = Route.useRouteContext()
  const isAdmin = session?.user.role === 'admin'

  return (
    <main className="flex min-h-dvh flex-col bg-background-full">
      <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-6 sm:px-8">
        <header className="landing-enter flex h-16 shrink-0 items-center sm:h-20">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            {config.logoUrl ? (
              <img
                src={config.logoUrl}
                alt=""
                className="size-8 rounded-2lg object-cover"
              />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-2lg bg-accent-600 text-body-medium text-text-white">
                {config.siteName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-body-medium text-text-primary">
              {config.siteName}
            </span>
          </Link>
        </header>

        <section className="grid flex-1 content-center items-center gap-12 py-10 sm:py-14 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20 lg:py-16">
          <div className="flex flex-col gap-6">
            <h1 className="text-display-4-semibold text-text-primary sm:text-display-3-medium lg:text-display-2-medium">
              <span className="landing-enter landing-d-1 block">
                你的项目，
              </span>
              <span className="landing-enter landing-d-2 block">
                该有自己的
                <span className="relative inline-block">
                  收件箱
                  <span
                    aria-hidden
                    className="landing-rule absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-accent-600"
                  />
                </span>
                。
              </span>
            </h1>

            <p className="landing-enter landing-d-3 max-w-[33rem] text-title-3-regular leading-7 text-text-secondary">
              长期地址和一次性地址并存。收件实时入库，发件走
              Resend，数据只留在你自己的服务器上。
            </p>
          </div>

          <div className="w-full max-w-[420px] lg:max-w-none lg:justify-self-end">
            {session ? (
              <div className="landing-panel rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-sm sm:p-8">
                <span className="text-caption-1-medium text-text-tertiary">
                  已登录
                </span>
                <p className="mt-3 text-title-1-medium break-words text-text-primary">
                  {session.user.name}
                </p>
                <p className="mt-1 text-body-regular break-all text-text-secondary">
                  {session.user.email}
                </p>
                <ButtonLink
                  href={isAdmin ? '/admin' : '/app'}
                  className="mt-7 h-11 w-full"
                  trailingIcon={RiArrowRightLine}
                >
                  {isAdmin ? '进入管理后台' : '进入邮箱面板'}
                </ButtonLink>
              </div>
            ) : (
              <LoginPanel
                providers={config.providers}
                registrationEnabled={config.registrationEnabled}
                emailPasswordEnabled={config.emailPasswordEnabled}
              />
            )}
          </div>
        </section>

        <Specs />
      </div>

      <footer className="mx-auto mt-8 w-full max-w-[1120px] px-6 sm:px-8">
        <div className="flex flex-col gap-1 border-t border-separator-border py-8 text-caption-1-regular text-text-tertiary sm:flex-row sm:items-center sm:justify-between">
          <span>{config.siteName}</span>
          <span>{config.footerText || '由 Resend 提供投递'}</span>
        </div>
      </footer>
    </main>
  )
}

/**
 * The spec sheet. Rows, not cards: three boxes would read as marketing, and
 * this product's honest shape is a table of what you actually get.
 */
function Specs() {
  const ref = useReveal<HTMLElement>()

  return (
    <section ref={ref} aria-label="服务规格">
      <dl className="divide-y divide-separator-border border-t border-separator-border">
        {SPECS.map((spec, index) => (
          <div
            key={spec.term}
            data-reveal-item
            style={{ '--reveal-index': index } as CSSProperties}
            className="grid gap-1 py-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-baseline sm:gap-8"
          >
            <dt className="text-caption-1-medium text-text-tertiary">
              {spec.term}
            </dt>
            <dd className="text-body-regular text-text-secondary">
              <span className="text-text-primary">{spec.value}</span>
              <span aria-hidden> · </span>
              {spec.note}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
