import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthShell } from '@/components/application/auth/auth-shell'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'
import { claimAdmin, fetchSetupStatus } from '@/server/functions/auth'

export const Route = createFileRoute('/setup')({
  beforeLoad: async ({ context }) => {
    if (context.session?.user.role === 'admin') {
      throw redirect({ to: '/admin' })
    }
    const status = await fetchSetupStatus()
    if (!status.needsSetup) {
      throw redirect({ to: context.session ? '/app' : '/login' })
    }
    return { setup: status }
  },
  head: headTitle('初始化'),
  component: SetupPage,
})

function SetupPage() {
  const { setup, session, site } = Route.useRouteContext()
  const router = useRouter()
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)
  const blocked = setup.production && !setup.requiresToken

  const submit = async () => {
    if (pending) return
    setPending(true)
    try {
      const result = await claimAdmin({ data: { token: token.trim() } })

      if (!result.ok) {
        toast.error('初始化失败', { description: result.message })
        return
      }
      if (!result.data.promoted) {
        toast.error('初始化失败', { description: '当前实例已存在管理员' })
        return
      }

      toast.success('初始化完成', { description: '你已成为管理员' })
      // The claim changed role and verification behind a cached session cookie;
      // re-read it so the admin gates see the new values on the first try.
      await authClient.getSession({ query: { disableCookieCache: true } })
      await router.invalidate()
      await router.navigate({ to: '/admin' })
    } catch {
      toast.error('初始化失败', { description: NETWORK_ERROR_MESSAGE })
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title={`初始化 ${site.siteName}`}
      description="当前实例还没有管理员。第一个账号可以在这里领取管理员权限，之后请在管理后台配置 Resend、域名与站点信息。"
    >
      {blocked ? (
        <p className="text-caption-1-regular text-text-error-primary">
          生产环境必须设置 SETUP_TOKEN，否则无法完成初始化。
        </p>
      ) : !setup.requiresToken ? (
        <p className="text-caption-1-regular text-text-warning">
          开发环境可以直接领取；公网部署请设置
          SETUP_TOKEN，避免初始化窗口被他人抢占。
        </p>
      ) : null}

      {!session ? (
        <>
          <p className="text-body-regular text-text-secondary">
            你需要先注册一个账号，再用该账号完成初始化。
          </p>
          <ButtonLink href="/register">去注册</ButtonLink>
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-background-secondary-default p-4">
            <p className="text-caption-1-regular text-text-tertiary">
              当前账号
            </p>
            <p className="text-body-medium text-text-primary">
              {session.user.name}
            </p>
            <p className="text-caption-1-regular text-text-tertiary">
              {session.user.email}
            </p>
          </div>

          {setup.requiresToken ? (
            <Input
              label="初始化口令"
              placeholder="SETUP_TOKEN"
              type="password"
              value={token}
              onChange={setToken}
            />
          ) : null}

          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? '处理中…' : '领取管理员权限'}
          </Button>
        </>
      )}
    </AuthShell>
  )
}
