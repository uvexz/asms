import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthClosed } from '@/components/application/auth/auth-closed'
import { AuthShell } from '@/components/application/auth/auth-shell'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'
import { fetchPublicConfig } from '@/server/functions/auth'

export const Route = createFileRoute('/forgot-password')({
  head: headTitle('找回密码'),
  loader: async () => fetchPublicConfig(),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const config = Route.useLoaderData()
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

  // Nothing to recover when the site signs people in through a provider:
  // there is no password on file, and the server would refuse the request.
  if (!config.emailPasswordEnabled) {
    return (
      <AuthClosed
        title="找回密码"
        description="站点已关闭邮箱密码登录，账号通过第三方登录进入，没有可重置的密码。"
      />
    )
  }

  return (
    <AuthShell
      title="找回密码"
      description="输入账号邮箱，我们会发送一封重置邮件。没收到请检查垃圾邮件，或联系管理员。"
    >
      {sent ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-background-secondary-default p-4 text-body-regular text-text-secondary">
            如果 {email.trim()}{' '}
            已注册，重置邮件会在几分钟内送达。没收到请检查垃圾邮件。
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setSent(false)}>
              换个邮箱
            </Button>
            <Button variant="secondary" onClick={submit} disabled={pending}>
              {pending ? '发送中…' : '重新发送'}
            </Button>
          </div>
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
