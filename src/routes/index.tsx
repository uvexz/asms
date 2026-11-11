import { createFileRoute, Link } from '@tanstack/react-router'
import { RiArrowRightLine } from '@remixicon/react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { LoginPanel } from '@/components/application/auth/login-panel'
import { SiteMark } from '@/components/app/site-mark'
import { ButtonLink } from '@/components/base/buttons/button'
import { useReveal } from '@/lib/use-reveal'
import { fetchPublicConfig, fetchPublicDomains } from '@/server/functions/auth'
import landingCss from '@/styles/landing.css?url'

export const Route = createFileRoute('/')({
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.siteName ?? 'asms'} · ${loaderData?.siteDescription || '自托管邮箱'}`,
      },
      {
        name: 'description',
        content:
          '长期邮箱与临时邮箱并存。收件写入你自己的数据库，发件走 Resend。',
      },
    ],
    links: [{ rel: 'stylesheet', href: landingCss }],
  }),
  loader: async () => {
    const [config, domains] = await Promise.all([
      fetchPublicConfig(),
      fetchPublicDomains(),
    ])
    return { ...config, domains }
  },
  component: LandingPage,
})

const CAPABILITIES = [
  {
    term: '长期邮箱',
    detail: '地址长期归你，收到的邮件实时入库。',
  },
  {
    term: '临时邮箱',
    detail: '开一个临时地址，期内收到邮件即保留，否则到期失效。',
  },
  {
    term: '发件',
    detail: '用自己的域名发信，回信进同一个收件箱。',
  },
] as const

/** A word is typed out, held, erased, then the next one starts. */
const HOLD_MS = 2600
const TYPE_MS = 90
const DELETE_MS = 45
const SWITCH_MS = 240

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
            <SiteMark
              logoUrl={config.logoUrl}
              siteName={config.siteName}
              className="rounded-2lg"
            />
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
                <Headline domains={config.domains} />
              </span>
            </h1>

            <p className="landing-enter landing-d-3 max-w-[33rem] text-title-3-regular leading-7 text-text-secondary">
              收件实时入库，发件走 Resend，邮件保存在你自己的数据库里。
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

        <Capabilities />
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
 * The word after "该有自己的" is typed through what this site actually hands
 * out: the inbox itself, then each domain it can put in front of it. Every
 * word is kept invisibly in one grid cell, so the sentence is measured once at
 * its widest: characters can come and go without reflowing the headline or
 * moving anything below it. Motion lives in landing.css.
 */
function Headline({ domains }: { domains: string[] }) {
  const words = useMemo(
    () => ['收件箱', ...domains.map((name) => `@${name}`)],
    [domains],
  )
  // The full stop is part of the typed run, so the caret always sits at the
  // end of the sentence instead of trailing behind a stationary "。".
  const tokens = useMemo(() => words.map((word) => `${word}。`), [words])
  const state = useTypewriter(tokens)
  const visible = (tokens[state.index] ?? '').slice(0, state.length)

  return (
    <>
      <span
        aria-hidden
        className="landing-rotor inline-grid max-w-full items-baseline"
      >
        {tokens.map((token) => (
          <span key={token} className="invisible col-start-1 row-start-1">
            {token}
            {/* The caret takes space too; without it here the box would grow
                by a few pixels as a word is typed out in full. */}
            <span className="landing-caret" />
          </span>
        ))}
        <span className="col-start-1 row-start-1">
          {visible}
          <span
            className="landing-caret bg-accent-600"
            data-phase={state.phase}
          />
        </span>
      </span>
      <span className="sr-only">{words.join('、')}</span>
    </>
  )
}

type TypePhase = 'holding' | 'deleting' | 'switching' | 'typing'
type TypeState = { index: number; length: number; phase: TypePhase }

const TYPE_DELAYS: Record<TypePhase, number> = {
  holding: HOLD_MS,
  deleting: DELETE_MS,
  switching: SWITCH_MS,
  typing: TYPE_MS,
}

function advanceTypewriter(state: TypeState, tokens: string[]): TypeState {
  const token = tokens[state.index] ?? ''

  switch (state.phase) {
    case 'holding':
      return { ...state, phase: 'deleting' }
    case 'deleting':
      return state.length > 1
        ? { ...state, length: state.length - 1 }
        : {
            index: (state.index + 1) % tokens.length,
            length: 0,
            phase: 'switching',
          }
    case 'switching':
      return { ...state, length: 1, phase: 'typing' }
    case 'typing':
      return state.length < token.length
        ? { ...state, length: state.length + 1 }
        : { ...state, length: token.length, phase: 'holding' }
  }
}

function useTypewriter(tokens: string[]) {
  // SSR and hydration both start on the complete first word: no flash of an
  // empty headline, and no missing copy when JS never runs.
  const [state, setState] = useState<TypeState>({
    index: 0,
    length: tokens[0]?.length ?? 0,
    phase: 'holding',
  })

  useEffect(() => {
    if (tokens.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = window.setTimeout(
      () => setState((current) => advanceTypewriter(current, tokens)),
      TYPE_DELAYS[state.phase],
    )
    return () => window.clearTimeout(timer)
  }, [state, tokens])

  return state
}

/**
 * Three capabilities, not three parameter sheets: each row says what the thing
 * lets you do. Numbers (quotas, TTLs) live in the app where they can be acted
 * on — here they would only be trivia.
 */
function Capabilities() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-label="邮箱能力"
      className="border-t border-separator-border pt-8"
    >
      <dl className="grid gap-8 sm:grid-cols-3 sm:gap-12">
        {CAPABILITIES.map((capability, index) => (
          <div
            key={capability.term}
            data-reveal-item
            style={{ '--reveal-index': index } as CSSProperties}
            className="flex flex-col gap-2"
          >
            <dt className="text-title-3-medium text-text-primary">
              {capability.term}
            </dt>
            <dd className="text-body-regular text-text-secondary">
              {capability.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
