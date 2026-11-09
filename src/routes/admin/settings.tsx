import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { RiPlugLine, RiSaveLine } from '@remixicon/react'

import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { Switch } from '@/components/base/switch/switch'
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs'
import { toast } from '@/components/base/toast/toast'
import { PageHeader } from '@/components/app/page-header'
import {
  DEFAULT_OIDC_SCOPES,
  isOidcProvider,
  providerLabel,
} from '@/lib/oauth-providers'
import type { ManagedProvider } from '@/lib/oauth-providers'
import {
  adminOAuthFn,
  adminSaveOAuthFn,
  adminSaveSettingsFn,
  adminSettingsFn,
  adminTestResendFn,
} from '@/server/functions/admin'

const SECRET_KEYS = new Set([
  'resend.apiKey',
  'resend.webhookSecret',
  'storage.s3.accessKeyId',
  'storage.s3.secretAccessKey',
])

export const Route = createFileRoute('/admin/settings')({
  head: () => ({ meta: [{ title: '站点设置 · asms' }] }),
  component: AdminSettingsPage,
})

function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('site')
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminSettingsFn(),
  })
  const oauth = useQuery({
    queryKey: ['admin-oauth'],
    queryFn: () => adminOAuthFn(),
  })

  const rows = settings.data?.ok ? settings.data.data.rows : []
  const oauthItems = oauth.data?.ok ? oauth.data.data.items : []
  const callbackBase = oauth.data?.ok ? oauth.data.data.callbackBase : ''

  useEffect(() => {
    if (!rows.length) return
    const next: Record<string, unknown> = {}
    for (const row of rows) {
      if (!row.isSecret) next[row.key] = row.value
    }
    setDraft((current) => ({ ...next, ...current }))
  }, [settings.dataUpdatedAt])

  const save = useMutation({
    mutationFn: (keys: string[]) => {
      const entries = keys
        .map((key) => ({ key, value: draft[key] }))
        .filter((entry) => entry.value !== undefined)
      return adminSaveSettingsFn({ data: { entries } })
    },
    onSuccess: async (result, keys) => {
      if (!result.ok) {
        toast.error('保存失败', { description: result.message })
        return
      }
      toast.success('设置已保存', {
        description: `更新 ${result.data.changed.length} 项`,
      })
      setDraft((current) => {
        const next = { ...current }
        // Only clear the secrets that were actually submitted; a key typed
        // while editing another tab must survive that tab's save.
        for (const key of keys) {
          if (SECRET_KEYS.has(key)) next[key] = ''
        }
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
    },
  })

  const test = useMutation({
    mutationFn: () => adminTestResendFn(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error('连接失败', { description: result.message })
        return
      }
      toast.success('连接正常', {
        description: `当前账号可见 ${result.data.domains} 个域名`,
      })
    },
  })

  const set = (key: string, value: unknown) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const text = (key: string) => String(draft[key] ?? '')
  const bool = (key: string) => Boolean(draft[key])
  const num = (key: string) => String(draft[key] ?? '')

  const originals = useMemo(
    () =>
      Object.fromEntries(
        rows.filter((row) => !row.isSecret).map((row) => [row.key, row.value]),
      ) as Record<string, unknown>,
    [rows],
  )
  const dirtyKeys = useMemo(() => {
    const changed = Object.keys(originals).filter(
      (key) =>
        key in draft &&
        JSON.stringify(draft[key]) !== JSON.stringify(originals[key]),
    )
    const secrets = rows
      .filter((row) => row.isSecret)
      .map((row) => row.key)
      .filter((key) => typeof draft[key] === 'string' && draft[key] !== '')
    return [...changed, ...secrets]
  }, [draft, originals, rows])

  const discard = () => {
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(originals)) next[key] = originals[key]
    setDraft({
      ...next,
      'resend.apiKey': '',
      'resend.webhookSecret': '',
      'storage.s3.accessKeyId': '',
      'storage.s3.secretAccessKey': '',
    })
  }

  if (settings.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="站点设置"
          description="站点信息、邮件策略、Resend 与登录方式。"
        />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="站点设置"
        description="站点信息、邮件策略、Resend 与登录方式。"
      />

      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <TabList aria-label="设置分组">
          <Tab id="site">站点</Tab>
          <Tab id="mail">邮件策略</Tab>
          <Tab id="resend">Resend</Tab>
          <Tab id="storage">存储</Tab>
          <Tab id="auth">登录</Tab>
        </TabList>

        <TabPanel id="site" className="pt-5">
          <SettingsCard
            title="站点信息"
            description="展示在落地页、登录页与侧边栏。"
            onSave={() =>
              save.mutate([
                'site.name',
                'site.description',
                'site.logoUrl',
                'site.footerText',
                'site.timezone',
                'site.registrationEnabled',
              ])
            }
            pending={save.isPending}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="站点名称"
                value={text('site.name')}
                onChange={(v) => set('site.name', v)}
              />
              <Input
                label="时区"
                value={text('site.timezone')}
                onChange={(v) => set('site.timezone', v)}
                hint="如 Asia/Shanghai"
              />
            </div>
            <Input
              label="副标题"
              value={text('site.description')}
              onChange={(v) => set('site.description', v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Logo URL"
                value={text('site.logoUrl')}
                onChange={(v) => set('site.logoUrl', v)}
              />
              <Input
                label="页脚文字"
                value={text('site.footerText')}
                onChange={(v) => set('site.footerText', v)}
              />
            </div>
            <Switch
              size="sm"
              isSelected={bool('site.registrationEnabled')}
              onChange={(v) => set('site.registrationEnabled', v)}
            >
              开放自助注册
            </Switch>
          </SettingsCard>
        </TabPanel>

        <TabPanel id="mail" className="pt-5">
          <SettingsCard
            title="邮件策略"
            description="配额、临时邮箱有效期与地址规则。管理员不受配额限制。"
            onSave={() =>
              save.mutate([
                'mail.maxPermanentMailboxes',
                'mail.dailySendLimit',
                'mail.tempTtlMinutes',
                'mail.tempMaxLifetimeMinutes',
                'mail.permanentCooldownDays',
                'mail.retentionDays',
                'mail.minPrefixPermanent',
                'mail.minPrefixTemp',
                'mail.maxPrefixLength',
                'mail.allowTempSending',
              ])
            }
            pending={save.isPending}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="长期邮箱上限"
                value={num('mail.maxPermanentMailboxes')}
                onChange={(v) => set('mail.maxPermanentMailboxes', Number(v))}
              />
              <NumberField
                label="每日发件额度"
                value={num('mail.dailySendLimit')}
                onChange={(v) => set('mail.dailySendLimit', Number(v))}
              />
              <NumberField
                label="邮件保留天数"
                value={num('mail.retentionDays')}
                onChange={(v) => set('mail.retentionDays', Number(v))}
              />
              <NumberField
                label="临时邮箱时长（分钟）"
                value={num('mail.tempTtlMinutes')}
                onChange={(v) => set('mail.tempTtlMinutes', Number(v))}
              />
              <NumberField
                label="临时邮箱最长寿命（分钟）"
                value={num('mail.tempMaxLifetimeMinutes')}
                onChange={(v) => set('mail.tempMaxLifetimeMinutes', Number(v))}
              />
              <NumberField
                label="地址冷却天数"
                value={num('mail.permanentCooldownDays')}
                onChange={(v) => set('mail.permanentCooldownDays', Number(v))}
              />
              <NumberField
                label="长期前缀最短"
                value={num('mail.minPrefixPermanent')}
                onChange={(v) => set('mail.minPrefixPermanent', Number(v))}
              />
              <NumberField
                label="临时前缀最短"
                value={num('mail.minPrefixTemp')}
                onChange={(v) => set('mail.minPrefixTemp', Number(v))}
              />
              <NumberField
                label="前缀最长"
                value={num('mail.maxPrefixLength')}
                onChange={(v) => set('mail.maxPrefixLength', Number(v))}
              />
            </div>
            <Switch
              size="sm"
              isSelected={bool('mail.allowTempSending')}
              onChange={(v) => set('mail.allowTempSending', v)}
            >
              允许临时邮箱发件
            </Switch>
          </SettingsCard>
        </TabPanel>

        <TabPanel id="resend" className="pt-5">
          <SettingsCard
            title="Resend"
            description="密钥加密保存，仅服务端读取。留空的密钥字段表示保持不变。"
            onSave={() =>
              save.mutate([
                ...(text('resend.apiKey') ? ['resend.apiKey'] : []),
                ...(text('resend.webhookSecret')
                  ? ['resend.webhookSecret']
                  : []),
                'resend.fromName',
                'resend.systemFromAddress',
              ])
            }
            pending={save.isPending}
            extra={
              <Button
                variant="secondary"
                leadingIcon={RiPlugLine}
                onClick={() => test.mutate()}
                disabled={test.isPending}
              >
                {test.isPending ? '测试中…' : '测试连接'}
              </Button>
            }
          >
            <Input
              label="API Key"
              type="password"
              placeholder={masked(rows, 'resend.apiKey')}
              value={text('resend.apiKey')}
              onChange={(v) => set('resend.apiKey', v)}
            />
            <Input
              label="Webhook Secret"
              type="password"
              placeholder={masked(rows, 'resend.webhookSecret')}
              value={text('resend.webhookSecret')}
              onChange={(v) => set('resend.webhookSecret', v)}
              hint="Resend Dashboard → Webhooks 的签名密钥"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="发件显示名"
                value={text('resend.fromName')}
                onChange={(v) => set('resend.fromName', v)}
              />
              <Input
                label="系统发件地址"
                placeholder="no-reply@mail.example.com"
                value={text('resend.systemFromAddress')}
                onChange={(v) => set('resend.systemFromAddress', v)}
                hint="用于找回密码等系统邮件"
              />
            </div>
            <div className="rounded-2xl bg-background-secondary-default p-4 text-caption-1-regular text-text-secondary">
              Webhook 地址：
              <code className="break-all">/api/webhooks/resend</code>
              <br />
              请订阅 <code>email.received</code> 与投递状态事件。
            </div>
          </SettingsCard>
        </TabPanel>

        <TabPanel id="storage" className="pt-5">
          <SettingsCard
            title="对象存储"
            description="仅用于收件附件。未配置时只保留附件元数据，下载时按需向 Resend 获取。"
            onSave={() =>
              save.mutate([
                'storage.s3.endpoint',
                'storage.s3.region',
                'storage.s3.bucket',
                ...(text('storage.s3.accessKeyId')
                  ? ['storage.s3.accessKeyId']
                  : []),
                ...(text('storage.s3.secretAccessKey')
                  ? ['storage.s3.secretAccessKey']
                  : []),
                'storage.s3.forcePathStyle',
              ])
            }
            pending={save.isPending}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Endpoint"
                placeholder="https://xxx.r2.cloudflarestorage.com"
                value={text('storage.s3.endpoint')}
                onChange={(v) => set('storage.s3.endpoint', v)}
              />
              <Input
                label="Region"
                placeholder="auto"
                value={text('storage.s3.region')}
                onChange={(v) => set('storage.s3.region', v)}
              />
              <Input
                label="Bucket"
                value={text('storage.s3.bucket')}
                onChange={(v) => set('storage.s3.bucket', v)}
              />
              <Input
                label="Access Key ID"
                type="password"
                placeholder={masked(rows, 'storage.s3.accessKeyId')}
                value={text('storage.s3.accessKeyId')}
                onChange={(v) => set('storage.s3.accessKeyId', v)}
              />
              <Input
                label="Secret Access Key"
                type="password"
                placeholder={masked(rows, 'storage.s3.secretAccessKey')}
                value={text('storage.s3.secretAccessKey')}
                onChange={(v) => set('storage.s3.secretAccessKey', v)}
              />
            </div>
            <Switch
              size="sm"
              isSelected={bool('storage.s3.forcePathStyle')}
              onChange={(v) => set('storage.s3.forcePathStyle', v)}
            >
              Force path style（MinIO / R2 建议开启）
            </Switch>
          </SettingsCard>
        </TabPanel>

        <TabPanel id="auth" className="pt-5">
          <SettingsCard
            title="登录方式"
            description="邮箱密码与第三方 OAuth。回调地址需在对应平台登记。"
            onSave={() => save.mutate(['auth.emailPasswordEnabled'])}
            pending={save.isPending}
          >
            <Switch
              size="sm"
              isSelected={bool('auth.emailPasswordEnabled')}
              onChange={(v) => set('auth.emailPasswordEnabled', v)}
            >
              启用邮箱密码登录
            </Switch>
          </SettingsCard>

          <div className="mt-4 flex flex-col gap-4">
            {oauthItems.map((item) => (
              <OAuthEditor
                key={`${item.provider}-${item.clientId}-${item.issuer}`}
                provider={item.provider}
                label={providerLabel(item.provider)}
                callbackBase={callbackBase}
                initial={item}
                onSaved={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ['admin-oauth'],
                  })
                }
              />
            ))}
          </div>
        </TabPanel>
      </Tabs>

      {dirtyKeys.length > 0 ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-3 shadow-dropdown">
          <span className="text-body-regular text-text-secondary">
            有 {dirtyKeys.length} 项修改尚未保存
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="small" onClick={discard}>
              放弃
            </Button>
            <Button
              size="small"
              leadingIcon={RiSaveLine}
              onClick={() => save.mutate(dirtyKeys)}
              disabled={save.isPending}
            >
              {save.isPending ? '保存中…' : '保存全部'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SettingsCard({
  title,
  description,
  children,
  onSave,
  pending,
  extra,
}: {
  title: string
  description: string
  children: React.ReactNode
  onSave: () => void
  pending: boolean
  extra?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
          <p className="text-body-regular text-text-secondary">{description}</p>
        </div>
        {extra}
      </div>
      {children}
      <div className="flex justify-end">
        <Button leadingIcon={RiSaveLine} onClick={onSave} disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </section>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return <Input label={label} type="number" value={value} onChange={onChange} />
}

function masked(
  rows: Array<{
    key: string
    isSecret: boolean
    hasValue: boolean
    preview: string
  }>,
  key: string,
) {
  const row = rows.find((item) => item.key === key)
  return row?.hasValue ? `已配置 ${row.preview}` : '未配置'
}

function OAuthEditor({
  provider,
  label,
  callbackBase,
  initial,
  onSaved,
}: {
  provider: ManagedProvider
  label: string
  callbackBase: string
  initial?: {
    enabled: boolean
    clientId: string
    issuer: string
    scopes: string
    hasSecret: boolean
    source: 'db' | 'env' | 'none'
  }
  onSaved: () => void
}) {
  const oidc = isOidcProvider(provider)
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [clientId, setClientId] = useState(initial?.clientId ?? '')
  const [issuer, setIssuer] = useState(initial?.issuer ?? '')
  const [scopes, setScopes] = useState(initial?.scopes ?? '')
  const [clientSecret, setClientSecret] = useState('')

  const save = useMutation({
    mutationFn: () =>
      adminSaveOAuthFn({
        data: {
          provider,
          enabled,
          clientId,
          issuer,
          scopes,
          ...(clientSecret ? { clientSecret } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error('保存失败', { description: result.message })
        return
      }
      toast.success(`${label} 登录已更新`)
      setClientSecret('')
      onSaved()
    },
  })

  const callback = useMemo(
    () => `${callbackBase}/${provider}`,
    [callbackBase, provider],
  )

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-body-large-medium text-text-primary">{label}</h3>
          <span className="text-caption-1-regular text-text-tertiary">
            回调地址：{callback}
          </span>
          {initial?.source === 'env' ? (
            <span className="text-caption-1-regular text-text-tertiary">
              当前由 OIDC_* 环境变量提供，保存后以这里为准
            </span>
          ) : null}
        </div>
        <Switch size="sm" isSelected={enabled} onChange={setEnabled}>
          启用
        </Switch>
      </div>
      {oidc ? (
        <Input
          label="Issuer"
          placeholder="https://sb.sb/oidc"
          value={issuer}
          onChange={setIssuer}
          hint="其余端点由 <issuer>/.well-known/openid-configuration 自动发现"
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Client ID" value={clientId} onChange={setClientId} />
        <Input
          label="Client Secret"
          type="password"
          placeholder={initial?.hasSecret ? '已配置，留空保持不变' : '未配置'}
          value={clientSecret}
          onChange={setClientSecret}
        />
      </div>
      {oidc ? (
        <Input
          label="Scopes"
          placeholder={DEFAULT_OIDC_SCOPES}
          value={scopes}
          onChange={setScopes}
          hint="留空使用默认值；没有 email 就取不到登录邮箱"
        />
      ) : null}
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? '保存中…' : '保存'}
        </Button>
      </div>
    </section>
  )
}
