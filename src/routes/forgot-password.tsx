import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthShell } from '@/components/application/auth/auth-shell'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'

export const Route = createFileRoute('/forgot-password')({
  head: () => ({ meta: [{ title: '找回密码 · asms' }] }),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (!email.trim() || pending) return
    setPending(true)
    const { error } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setPending(false)
    if (error) {
      toast.error('发送失败', { description: authErrorMessage(error) })
      return
    }
    setSent(true)
  }

  return (
    <AuthShell
      title="找回密码"
      description="输入账号邮箱，我们会发送一封重置邮件。若未收到，请确认管理员已配置 Resend 与系统发件地址。"
    >
      {sent ? (
        <div className="rounded-2xl bg-background-secondary-default p-4 text-body-regular text-text-secondary">
          如果该邮箱已注册，重置邮件会在几分钟内送达。
        </div>
      ) : (
        <>
          <Input
            label="邮箱"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <Button onClick={submit} disabled={pending || !email.trim()}>
            {pending ? '发送中…' : '发送重置邮件'}
          </Button>
        </>
      )}

      <Link
        to="/login"
        className="rounded text-center text-body-regular text-accent-600 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        返回登录
      </Link>
    </AuthShell>
  )
}
