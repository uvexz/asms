import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { AuthShell } from '@/components/application/auth/auth-shell'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { LinkButton } from '@/components/base/buttons/link-button'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, authErrorMessage } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'
import { useSignOut } from '@/lib/use-sign-out'

export const Route = createFileRoute('/verify-email')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { verified?: boolean; error?: string } => ({
    // Router JSON-parses query values, so `?verified=1` arrives as a number.
    verified:
      search.verified === 1 ||
      search.verified === '1' ||
      search.verified === true ||
      undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  head: headTitle('验证邮箱'),
  beforeLoad: ({ context, search }) => {
    // The mailed link lands here with the outcome in the query, even when it
    // was opened in a browser that has no session yet.
    if (search.verified || search.error) return
    if (!context.session) throw redirect({ to: '/login' })
    if (
      !context.emailVerificationRequired ||
      context.session.user.emailVerified
    ) {
      throw redirect({ to: '/app' })
    }
  },
  component: VerifyEmailPage,
})

const RESEND_COOLDOWN_SECONDS = 60

const LINK_ERRORS: Record<string, string> = {
  TOKEN_EXPIRED: '验证链接已过期。',
  INVALID_TOKEN: '验证链接无效。',
  USER_NOT_FOUND: '账号不存在或已被删除。',
}

function VerifyEmailPage() {
  const { verified, error } = Route.useSearch()
  const { session } = Route.useRouteContext()
  const router = useRouter()
  const signOut = useSignOut()
  const [pending, setPending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const email = session?.user.email ?? ''

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(
      () => setCooldown((value) => value - 1),
      1000,
    )
    return () => window.clearTimeout(timer)
  }, [cooldown])

  // A session cookie can still hold the pre-verification user for a moment
  // after the link is consumed; re-read it before the gated routes look.
  const enterApp = async () => {
    await authClient.getSession({ query: { disableCookieCache: true } })
    await router.invalidate()
    await router.navigate({ to: '/app' })
  }

  const resend = async () => {
    if (!email || pending || cooldown > 0) return
    setPending(true)
    try {
      const { error: failed } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/verify-email?verified=1`,
      })

      if (failed) {
        if (failed.code === 'EMAIL_ALREADY_VERIFIED') {
          toast.success('邮箱已验证')
          await enterApp()
          return
        }
        toast.error('发送失败', { description: authErrorMessage(failed) })
        return
      }

      setCooldown(RESEND_COOLDOWN_SECONDS)
      toast.success('验证邮件已发送', {
        description: `请查收 ${email} 的收件箱。`,
      })
    } catch {
      toast.error('发送失败', { description: NETWORK_ERROR_MESSAGE })
    } finally {
      setPending(false)
    }
  }

  const check = async () => {
    if (checking) return
    setChecking(true)
    try {
      const { data } = await authClient.getSession({
        query: { disableCookieCache: true },
      })

      if (data?.user.emailVerified) {
        await router.invalidate()
        await router.navigate({ to: '/app' })
        return
      }
      toast.info('还没有完成验证', {
        description: '请打开邮件里的链接完成验证。',
      })
    } catch {
      toast.error('检查失败', { description: NETWORK_ERROR_MESSAGE })
    } finally {
      setChecking(false)
    }
  }

  // The endpoint appends `error` to the callback, so a failure arrives with
  // both markers; the error wins.
  if (error) {
    return (
      <AuthShell
        title="验证链接失效"
        description={`${LINK_ERRORS[error] ?? '验证链接无法使用。'}请重新发送一封验证邮件。`}
      >
        {session && !session.user.emailVerified ? (
          <Button onClick={resend} disabled={pending || cooldown > 0}>
            {pending
              ? '发送中…'
              : cooldown > 0
                ? `${cooldown} 秒后可重发`
                : '重新发送验证邮件'}
          </Button>
        ) : (
          <ButtonLink href="/login">去登录</ButtonLink>
        )}
      </AuthShell>
    )
  }

  if (verified) {
    return (
      <AuthShell
        title="邮箱已验证"
        description="这个邮箱已经完成验证，现在可以正常使用了。"
      >
        {session ? (
          <Button onClick={enterApp}>进入邮箱面板</Button>
        ) : (
          <ButtonLink href="/login">去登录</ButtonLink>
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="验证邮箱"
      description={`验证邮件已发送到 ${email}。打开邮件里的链接即可完成验证，链接 1 小时内有效。`}
      footer={
        <LinkButton onClick={() => void signOut()} className="py-1">
          换个账号
        </LinkButton>
      }
    >
      <Button onClick={resend} disabled={pending || cooldown > 0}>
        {pending
          ? '发送中…'
          : cooldown > 0
            ? `${cooldown} 秒后可重发`
            : '重新发送验证邮件'}
      </Button>
      <Button variant="secondary" onClick={check} disabled={checking}>
        {checking ? '检查中…' : '我已验证'}
      </Button>
    </AuthShell>
  )
}
