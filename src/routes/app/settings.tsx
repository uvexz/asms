import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { RiLogoutBoxRLine } from '@remixicon/react'

import { Avatar } from '@/components/base/avatar/avatar'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { toast } from '@/components/base/toast/toast'
import { PageHeader } from '@/components/app/page-header'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'

export const Route = createFileRoute('/app/settings')({
  head: () => ({ meta: [{ title: '个人设置 · asms' }] }),
  component: SettingsPage,
})

function SettingsPage() {
  const { session } = Route.useRouteContext()
  const router = useRouter()
  const user = session?.user

  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState(false)

  if (!user) return null

  const saveName = async () => {
    if (!name.trim()) return
    setPending(true)
    const { error } = await authClient.updateUser({ name: name.trim() })
    setPending(false)
    if (error) {
      toast.error('保存失败', { description: authErrorMessage(error) })
      return
    }
    toast.success('昵称已更新')
    await router.invalidate()
  }

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    setPending(true)
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    setPending(false)
    if (error) {
      toast.error('修改失败', { description: authErrorMessage(error) })
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    toast.success('密码已更新')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="个人设置" description="账号资料与安全设置。" />

      <section className="flex flex-col gap-5 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
        <div className="flex items-center gap-3">
          <Avatar
            size="lg"
            color="neutral"
            initials={user.name.slice(0, 1).toUpperCase()}
            src={user.image ?? undefined}
          />
          <div className="flex flex-col">
            <span className="text-body-medium text-text-primary">
              {user.email}
            </span>
            <span className="text-caption-1-regular text-text-tertiary">
              {user.role === 'admin' ? '管理员' : '普通用户'} ·
              账号邮箱仅用于登录
            </span>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <Input
            label="昵称"
            value={name}
            onChange={setName}
            className="max-w-sm flex-1"
          />
          <Button variant="secondary" onClick={saveName} disabled={pending}>
            保存
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-3-semibold text-text-primary">修改密码</h2>
          <p className="text-body-regular text-text-secondary">
            修改后会撤销其他设备上的登录会话。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="当前密码"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <Input
            label="新密码"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
          />
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={changePassword}
            disabled={pending || !currentPassword || !newPassword}
          >
            更新密码
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-3-semibold text-text-primary">会话</h2>
          <p className="text-body-regular text-text-secondary">
            退出后需要重新登录才能访问邮箱。
          </p>
        </div>
        <div>
          <Button
            variant="danger"
            leadingIcon={RiLogoutBoxRLine}
            onClick={async () => {
              await authClient.signOut()
              await router.invalidate()
              await router.navigate({ to: '/login' })
            }}
          >
            退出登录
          </Button>
        </div>
      </section>
    </div>
  )
}
