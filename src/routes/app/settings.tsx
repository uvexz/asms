import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { RiLogoutBoxRLine } from '@remixicon/react'

import { Avatar } from '@/components/base/avatar/avatar'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { AlertDialog } from '@/components/base/modal/modal'
import { toast } from '@/components/base/toast/toast'
import { PageHeader } from '@/components/app/page-header'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { providerLabel } from '@/lib/oauth-providers'
import { linkedAccountsQuery, queryKeys } from '@/lib/queries'
import { headTitle } from '@/lib/site'
import { useSignOut } from '@/lib/use-sign-out'

export const Route = createFileRoute('/app/settings')({
  head: headTitle('个人设置'),
  validateSearch: (
    search: Record<string, unknown>,
  ): { linked?: string; error?: string } => ({
    linked: typeof search.linked === 'string' ? search.linked : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  // Warm the query cache during the render pass, so the section below paints
  // with data and the same rows are not fetched a second time on mount.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(linkedAccountsQuery()),
  component: SettingsPage,
})

function SettingsPage() {
  const { session } = Route.useRouteContext()
  const { linked, error: redirectError } = Route.useSearch()
  const router = useRouter()
  const signOut = useSignOut()
  const user = session?.user

  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pending, setPending] = useState(false)
  // Strict mode runs effects twice; announce each callback outcome once.
  const announced = useRef<string | null>(null)

  // The OAuth callback lands back here with the outcome in the query string.
  useEffect(() => {
    if (!linked && !redirectError) return
    if (announced.current === `${linked}:${redirectError}`) return
    announced.current = `${linked}:${redirectError}`
    if (linked) toast.success(`已绑定 ${providerLabel(linked)}`)
    if (redirectError) {
      toast.error('绑定没有完成', {
        description: authErrorMessage({ code: redirectError }),
      })
    }
    void router.navigate({
      to: '/app/settings',
      search: (prev) => ({ ...prev, linked: undefined, error: undefined }),
      replace: true,
    })
  }, [linked, redirectError, router])

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
            name={user.email || user.name}
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

      <ThirdPartyAccounts />

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
            onClick={() => void signOut()}
          >
            退出登录
          </Button>
        </div>
      </section>
    </div>
  )
}

function ThirdPartyAccounts() {
  const queryClient = useQueryClient()
  const [pendingProvider, setPendingProvider] = useState<string | null>(null)
  const [unlinkTarget, setUnlinkTarget] = useState<{
    label: string
    accountId: string
  } | null>(null)

  // The loader already put this in the cache; the subscription only re-renders
  // when unbinding invalidates it.
  const query = useQuery(linkedAccountsQuery())
  const data = query.data?.ok ? query.data.data : null

  if (!data || data.items.length === 0) return null

  const linkedCount = data.items.filter((item) => item.accountId).length
  // Better Auth refuses to remove the last way in; say so before the request.
  const lastWayIn = !data.hasPassword && linkedCount === 1

  const bind = (provider: string) => {
    setPendingProvider(provider)
    void authClient
      .linkSocial({
        provider,
        callbackURL: `/app/settings?linked=${provider}`,
        errorCallbackURL: '/app/settings',
      })
      .then(({ error }) => {
        setPendingProvider(null)
        if (error) {
          toast.error('无法发起绑定', { description: authErrorMessage(error) })
        }
      })
  }

  const unbind = async (accountId: string) => {
    const { error } = await authClient.unlinkAccount({ accountId })
    if (error) {
      toast.error('解绑失败', {
        description: lastWayIn ? '这是唯一的登录方式' : authErrorMessage(error),
      })
      throw error
    }
    toast.success('已解绑')
    await queryClient.invalidateQueries({ queryKey: queryKeys.linkedAccounts })
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-3-semibold text-text-primary">第三方账号</h2>
        <p className="text-body-regular text-text-secondary">
          绑定后可以直接用这些账号登录。
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-separator-border">
        {data.items.map((item) => {
          const { accountId } = item
          return (
            <li
              key={item.provider}
              className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-col">
                <span className="text-body-medium text-text-primary">
                  {item.label}
                </span>
                <span className="text-caption-1-regular text-text-tertiary">
                  {accountId
                    ? lastWayIn
                      ? '已绑定 · 唯一的登录方式'
                      : '已绑定'
                    : '未绑定'}
                </span>
              </div>
              {accountId ? (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={lastWayIn}
                  onClick={() =>
                    setUnlinkTarget({ label: item.label, accountId })
                  }
                >
                  解绑
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={pendingProvider === item.provider}
                  onClick={() => bind(item.provider)}
                >
                  绑定
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <AlertDialog
        isOpen={Boolean(unlinkTarget)}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null)
        }}
        title={`解绑 ${unlinkTarget?.label ?? ''}`}
        description="解绑后不能再使用该账号登录。"
        confirmLabel="解绑"
        pendingLabel="解绑中…"
        onConfirm={async () => {
          if (unlinkTarget) await unbind(unlinkTarget.accountId)
        }}
      />
    </section>
  )
}
