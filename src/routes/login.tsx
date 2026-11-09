import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthCard } from '@/components/application/auth/auth-card'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { fetchPublicConfig } from '@/server/functions/auth'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: '登录 · asms' }] }),
  loader: async () => fetchPublicConfig(),
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/app' })
  },
  component: LoginPage,
})

function LoginPage() {
  const config = Route.useLoaderData()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [remember, setRemember] = useState(true)

  const submit = async (form: FormData) => {
    if (pending) return
    setPending(true)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    const { error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: remember,
    })
    setPending(false)
    if (error) {
      toast.error('登录失败', { description: authErrorMessage(error) })
      return
    }
    await router.invalidate()
    await router.navigate({ to: '/app' })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background-full p-6">
      <div className="w-full max-w-md">
        <AuthCard
          mode="signin"
          title={`登录 ${config.siteName}`}
          description="使用你的账号进入邮箱面板。"
          providers={config.providers as never}
          rememberMe={remember}
          onRememberChange={setRemember}
          onSubmit={submit}
          onProvider={(provider) => {
            void authClient.signIn.social({ provider, callbackURL: '/app' })
          }}
          switchHref="/register"
          footnote={
            <span className="text-caption-1-regular text-text-tertiary">
              {config.siteDescription}
            </span>
          }
        />
      </div>
    </main>
  )
}
