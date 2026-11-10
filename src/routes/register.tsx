import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthCard } from '@/components/application/auth/auth-card'
import { AuthClosed } from '@/components/application/auth/auth-closed'
import { AuthShell } from '@/components/application/auth/auth-shell'
import { ProviderButtons } from '@/components/application/auth/provider-buttons'
import { LinkButton } from '@/components/base/buttons/link-button'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { isBrandProvider } from '@/lib/oauth-providers'
import { headTitle } from '@/lib/site'
import { fetchPublicConfig, fetchSetupStatus } from '@/server/functions/auth'

export const Route = createFileRoute('/register')({
  head: headTitle('创建账号'),
  loader: async () => fetchPublicConfig(),
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/app' })
  },
  component: RegisterPage,
})

function RegisterPage() {
  const config = Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const submit = async (form: FormData) => {
    if (pending) return
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    if (!name) {
      toast.error('请填写昵称')
      return
    }
    if (password.length < 8) {
      toast.error('密码至少 8 位')
      return
    }

    setPending(true)
    const { error } = await authClient.signUp.email({ name, email, password })
    setPending(false)

    if (error) {
      toast.error('注册失败', { description: authErrorMessage(error) })
      return
    }

    await router.invalidate()
    const status = await fetchSetupStatus()
    await router.navigate({ to: status.needsSetup ? '/setup' : '/app' })
  }

  if (!config.registrationEnabled) {
    return (
      <AuthClosed
        title="注册暂未开放"
        description="站点管理员已关闭自助注册。如果你已有账号，可以直接登录。"
      />
    )
  }

  // Email + password is a sign-in method the admin can switch off. With it off
  // there is no credential to create here — the first third-party sign-in is
  // the sign-up — so the page keeps the providers and drops the form rather
  // than offering what the server would refuse.
  if (!config.emailPasswordEnabled) {
    return (
      <AuthShell
        title={`创建 ${config.siteName} 账号`}
        description={
          config.providers.length > 0
            ? '用第三方账号登录，首次登录即创建账号。'
            : undefined
        }
        footer={
          <>
            已有账号？{' '}
            <LinkButton href="/login" size="small" className="py-1">
              去登录
            </LinkButton>
          </>
        }
      >
        {config.providers.length > 0 ? (
          <ProviderButtons providers={config.providers} />
        ) : (
          <p className="text-body-regular text-text-secondary">
            站点还没有开启登录方式，请联系管理员。
          </p>
        )}
      </AuthShell>
    )
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background-full p-6">
      <div className="w-full max-w-md">
        <AuthCard
          mode="signup"
          title={`创建 ${config.siteName} 账号`}
          description="账号邮箱仅用于登录，不会作为收件地址。"
          // Only the brands the card ships a glyph for; a plain OIDC provider
          // signs up on first sign-in from the login screen instead.
          providers={config.providers.filter(isBrandProvider)}
          onSubmit={submit}
          onProvider={(provider) => {
            void authClient.signIn.social({
              provider,
              callbackURL: '/app',
              errorCallbackURL: '/login',
            })
          }}
          switchHref="/login"
        />
      </div>
    </main>
  )
}
