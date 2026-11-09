import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  RiAddLine,
  RiGlobalLine,
  RiRefreshLine,
  RiShieldCheckLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import {
  AlertDialog,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { Switch } from '@/components/base/switch/switch'
import { toast } from '@/components/base/toast/toast'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { domainStatusLabel } from '@/lib/admin-labels'
import { adminDomainsQuery, invalidateDomains } from '@/lib/queries'
import { headTitle } from '@/lib/site'
import {
  adminAddDomainFn,
  adminRefreshDomainFn,
  adminRemoveDomainFn,
  adminSetDefaultDomainFn,
  adminUpdateDomainFn,
  adminVerifyDomainFn,
} from '@/server/functions/admin'

export const Route = createFileRoute('/admin/domains')({
  head: headTitle('域名'),
  component: AdminDomainsPage,
})

type DnsRecord = {
  record?: string
  name?: string
  type?: string
  value?: string
  ttl?: string
  priority?: number
  status?: string
}

function parseRecords(value: string | null): DnsRecord[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function AdminDomainsPage() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const list = useQuery(adminDomainsQuery())

  const refreshAll = async () => {
    await invalidateDomains(queryClient)
  }

  const verify = useMutation({
    mutationFn: (id: string) => adminVerifyDomainFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('已触发验证', {
        description: `当前状态：${result.data.status}`,
      })
      await refreshAll()
    },
  })

  const refresh = useMutation({
    mutationFn: (id: string) => adminRefreshDomainFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('状态已刷新', { description: result.data.status })
      await refreshAll()
    },
  })

  const setDefault = useMutation({
    mutationFn: (id: string) => adminSetDefaultDomainFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('默认域名已更新')
      await refreshAll()
    },
  })

  const update = useMutation({
    mutationFn: (input: {
      id: string
      sendingEnabled?: boolean
      receivingEnabled?: boolean
    }) => adminUpdateDomainFn({ data: input }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      await refreshAll()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminRemoveDomainFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('域名已删除')
      await refreshAll()
    },
  })

  const items = list.data?.ok ? list.data.data.items : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="域名"
        description="域名同时承担收件（MX）与发件（SPF/DKIM）。"
        actions={
          <Button
            leadingIcon={RiAddLine}
            size="small"
            onClick={() => setAddOpen(true)}
          >
            添加域名
          </Button>
        }
      />

      {list.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-48 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={RiGlobalLine}
          title="还没有域名"
          description="域名需要同时承担收件与发件。已存在于 Resend 的域名会直接接入；已有邮箱服务的域名请使用子域。"
          action={
            <Button leadingIcon={RiAddLine} onClick={() => setAddOpen(true)}>
              添加域名
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((domain) => {
            const records = parseRecords(domain.records)
            return (
              <section
                key={domain.id}
                className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-title-3-semibold text-text-primary">
                        {domain.name}
                      </h2>
                      <Chip
                        variant="caption"
                        color={domain.status === 'verified' ? 'lime' : 'yellow'}
                      >
                        {domainStatusLabel(domain.status)}
                      </Chip>
                      {domain.isDefault ? (
                        <Chip variant="caption" color="blue">
                          默认
                        </Chip>
                      ) : null}
                    </div>
                    <span className="text-caption-1-regular text-text-tertiary">
                      {[
                        domain.resendDomainId
                          ? `Resend ID ${domain.resendDomainId}`
                          : null,
                        domain.region ? `区域 ${domain.region}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '尚未同步到 Resend'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="xs"
                      variant="secondary"
                      leadingIcon={RiShieldCheckLine}
                      onClick={() => verify.mutate(domain.id)}
                      disabled={verify.isPending}
                    >
                      验证
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      leadingIcon={RiRefreshLine}
                      onClick={() => refresh.mutate(domain.id)}
                      disabled={refresh.isPending}
                    >
                      刷新
                    </Button>
                    {!domain.isDefault ? (
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => setDefault.mutate(domain.id)}
                      >
                        设为默认
                      </Button>
                    ) : null}
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => setRemoving(domain.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <Switch
                    size="sm"
                    isSelected={domain.sendingEnabled}
                    onChange={(value) =>
                      update.mutate({ id: domain.id, sendingEnabled: value })
                    }
                  >
                    允许发件
                  </Switch>
                  <Switch
                    size="sm"
                    isSelected={domain.receivingEnabled}
                    onChange={(value) =>
                      update.mutate({ id: domain.id, receivingEnabled: value })
                    }
                  >
                    允许收件
                  </Switch>
                </div>

                {records.length > 0 ? (
                  <details className="rounded-2xl bg-background-secondary-default p-4">
                    <summary className="cursor-pointer text-body-medium text-text-primary">
                      DNS 记录（{records.length}）
                    </summary>
                    <div className="mt-3 flex flex-col gap-2">
                      {records.map((record, index) => (
                        <div
                          key={`${record.type}-${record.name}-${index}`}
                          className="grid gap-1 rounded-xl bg-background-primary-default p-3 text-caption-1-regular sm:grid-cols-[80px_1fr]"
                        >
                          <span className="text-text-tertiary">
                            {record.type}
                          </span>
                          <span className="break-all text-text-primary">
                            {record.name} → {record.value}
                            {record.priority !== undefined
                              ? ` · 优先级 ${record.priority}`
                              : ''}
                            {record.status ? ` · ${record.status}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-caption-1-regular text-text-tertiary">
                    暂无 DNS 记录，点击“刷新”从 Resend 拉取。
                  </p>
                )}
              </section>
            )
          })}
        </div>
      )}

      <AddDomainModal
        isOpen={addOpen}
        onOpenChange={setAddOpen}
        onAdded={refreshAll}
      />

      <AlertDialog
        isOpen={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="删除域名？"
        description="删除前请确保该域名下没有邮箱。Resend 侧的域名也会被移除。"
        confirmLabel="删除"
        onConfirm={async () => {
          if (!removing) return
          await remove.mutateAsync(removing)
          setRemoving(null)
        }}
      />
    </div>
  )
}

function AddDomainModal({
  isOpen,
  onOpenChange,
  onAdded,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => adminAddDomainFn({ data: { name } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('添加失败', { description: result.message })
        return
      }
      toast.success(result.data.adopted ? '已接入现有域名' : '域名已添加', {
        description: result.data.adopted
          ? '该域名已存在于 Resend，已直接接入；确认 DNS 记录后再验证。'
          : '请按 DNS 记录完成配置后点击验证。',
      })
      setName('')
      onOpenChange(false)
      await onAdded()
    },
  })

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      {({ close }) => (
        <>
          <ModalHeader
            title="添加域名"
            description="Resend 中已有同名域名时会直接接入，否则新建并返回 DNS 记录。"
          />
          <ModalBody>
            <Input
              label="域名"
              placeholder="mail.example.com"
              value={name}
              onChange={(value) => setName(value.toLowerCase())}
              hint="建议使用子域，避免影响现有邮箱服务"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close}>
              取消
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? '添加中…' : '添加'}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  )
}
