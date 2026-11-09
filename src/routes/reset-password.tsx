import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthShell } from '@/components/application/auth/auth-shell'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  head: headTitle('设置新密码'),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
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
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    })
    setPending(false)

    if (error) {
      toast.error('重置失败', { description: authErrorMessage(error) })
      return
    }

    toast.success('密码已重置，请重新登录')
    await router.navigate({ to: '/login' })
  }

  return (
    <AuthShell
      title="设置新密码"
      description="重置链接 1 小时内有效，提交后其他设备会退出登录。"
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
      <Button onClick={submit} disabled={pending || !password || !confirm}>
        {pending ? '提交中…' : '重置密码'}
      </Button>

      <Link
        to="/login"
        className="rounded text-center text-body-regular text-accent-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        返回登录
      </Link>
    </AuthShell>
  )
}
