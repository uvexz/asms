import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthClosed } from '@/components/application/auth/auth-closed'
import { AuthShell } from '@/components/application/auth/auth-shell'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { NETWORK_ERROR_MESSAGE, authErrorMessage } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'
import { fetchPublicConfig } from '@/server/functions/auth'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  head: headTitle('设置新密码'),
  loader: async () => fetchPublicConfig(),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const config = Route.useLoaderData()
  const { token } = Route.useSearch()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!token) {
      toast.error('重置链接无效', { description: '请重新发起找回密码' })
      return
    }
    if (password.length < 8) {
      toast.error('密码至少 8 位')
      return
    }
    if (password !== confirm) {
      toast.error('两次输入的密码不一致')
      return
    }

    setPending(true)
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      })
      if (error) {
        toast.error('重置失败', { description: authErrorMessage(error) })
        return
      }

      toast.success('密码已重置，请重新登录')
      await router.navigate({ to: '/login' })
    } catch {
      toast.error('重置失败', { description: NETWORK_ERROR_MESSAGE })
    } finally {
      setPending(false)
    }
  }

  // An old reset mail can still be opened after the admin turns password
  // sign-in off. Say so instead of showing fields the server would reject.
  if (!config.emailPasswordEnabled) {
    return (
      <AuthClosed
        title="设置新密码"
        description="站点已关闭邮箱密码登录，此重置链接不再可用，请改用第三方账号登录。"
      />
    )
  }

  if (!token) {
    return (
      <AuthShell
        title="重置链接无效"
        description="这个链接不完整或已失效。请重新发起找回密码，我们会再发一封邮件。"
      >
        <ButtonLink href="/forgot-password">重新发起找回密码</ButtonLink>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="设置新密码"
      description="重置链接 1 小时内有效，提交后其他设备会退出登录。"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Input
          label="新密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="至少 8 位"
        />
        <Input
          label="确认新密码"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <Button type="submit" disabled={pending || !password || !confirm}>
          {pending ? '提交中…' : '重置密码'}
        </Button>
      </form>

      <Link
        to="/login"
        className="rounded text-center text-body-regular text-accent-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        返回登录
      </Link>
    </AuthShell>
  )
}
