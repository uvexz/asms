import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  RiAddLine,
  RiFileCopyLine,
  RiInboxLine,
  RiMailLine,
  RiDeleteBin6Line,
  RiMore2Fill,
  RiShieldKeyholeLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@/components/base/dropdown/dropdown'
import { Input } from '@/components/base/input/input'
import {
  AlertDialog,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal'
import { Select, SelectItem } from '@/components/base/select/select'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { toast } from '@/components/base/toast/toast'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { formatRelative } from '@/lib/format'
import {
  createMailboxFn,
  deleteMailboxFn,
  listDomainsFn,
  listMailboxesFn,
} from '@/server/functions/mailboxes'

export const Route = createFileRoute('/app/mailboxes')({
  head: () => ({ meta: [{ title: '长期邮箱 · asms' }] }),
  component: MailboxesPage,
})

function MailboxesPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<{
    id: string
    address: string
  } | null>(null)

  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => listMailboxesFn(),
  })
  const domains = useQuery({
    queryKey: ['domains'],
    queryFn: () => listDomainsFn(),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteMailboxFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('邮箱已删除')
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      await queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const items = mailboxes.data?.ok ? mailboxes.data.data : []
  const permanent = items.filter((item) => item.kind === 'permanent')
  const availableDomains = domains.data?.ok ? domains.data.data : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="长期邮箱"
        description="长期有效，可收件与发件；数量受管理员配置的上限约束。"
        actions={
          <Button
            leadingIcon={RiAddLine}
            size="small"
            onClick={() => setCreateOpen(true)}
            disabled={availableDomains.length === 0}
          >
            创建邮箱
          </Button>
        }
      />

      {availableDomains.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4">
          <RiShieldKeyholeLine className="mt-0.5 size-5 text-foreground-icon-secondary" />
          <div className="flex flex-col gap-1">
            <p className="text-body-medium text-text-primary">还没有可用域名</p>
            <p className="text-body-regular text-text-secondary">
              管理员需要先添加并验证域名，之后才能创建邮箱地址。
            </p>
          </div>
        </div>
      ) : null}

      {mailboxes.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 w-full" />
          ))}
        </div>
      ) : permanent.length === 0 ? (
        <EmptyState
          icon={RiMailLine}
          title="还没有长期邮箱"
          description="前缀最短 3 位，支持小写字母、数字、点、下划线与连字符。"
          action={
            <Button
              leadingIcon={RiAddLine}
              onClick={() => setCreateOpen(true)}
              disabled={availableDomains.length === 0}
            >
              创建第一个邮箱
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-separator-border overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
          {permanent.map((mailbox) => (
            <div key={mailbox.id} className="flex items-center gap-3 px-4 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-background-secondary-default text-foreground-icon-secondary">
                <RiMailLine className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <Link
                    to="/app/inbox/$mailboxId"
                    params={{ mailboxId: mailbox.id }}
                    search={{ message: undefined }}
                    className="truncate text-body-medium text-text-primary hover:text-accent-600"
                  >
                    {mailbox.address}
                  </Link>
                  <Chip variant="caption" color="lime">
                    长期
                  </Chip>
                </div>
                <span className="text-caption-1-regular text-text-tertiary">
                  {mailbox.displayName ? `${mailbox.displayName} · ` : ''}
                  {mailbox.lastReceivedAt
                    ? `最近收件 ${formatRelative(mailbox.lastReceivedAt)}`
                    : '还没有收件'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="复制地址"
                  icon={RiFileCopyLine}
                  size="small"
                  onClick={async () => {
                    await navigator.clipboard.writeText(mailbox.address)
                    toast.success('地址已复制')
                  }}
                />
                <Dropdown>
                  <DropdownTrigger
                    aria-label="更多操作"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-foreground-icon-secondary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    <RiMore2Fill className="size-4" />
                  </DropdownTrigger>
                  <DropdownPopover aria-label="邮箱操作">
                    <DropdownItem
                      onSelect={() => {
                        void router.navigate({
                          to: '/app/inbox/$mailboxId',
                          params: { mailboxId: mailbox.id },
                          search: { message: undefined },
                        })
                      }}
                    >
                      <RiInboxLine className="size-4 text-foreground-icon-secondary" />
                      <span>打开收件箱</span>
                    </DropdownItem>
                    <DropdownItem
                      onSelect={() =>
                        setDeleting({
                          id: mailbox.id,
                          address: mailbox.address,
                        })
                      }
                    >
                      <RiDeleteBin6Line className="size-4 text-text-error-primary" />
                      <span className="text-text-error-primary">删除邮箱</span>
                    </DropdownItem>
                  </DropdownPopover>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateMailboxModal
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        domains={availableDomains.map((domain) => ({
          id: domain.id,
          name: domain.name,
          isDefault: domain.isDefault,
        }))}
      />

      <AlertDialog
        isOpen={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除邮箱？"
        description={
          deleting
            ? `${deleting.address} 及其全部邮件会被删除，地址将进入冷却期。`
            : ''
        }
        confirmLabel="删除"
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

function CreateMailboxModal({
  isOpen,
  onOpenChange,
  domains,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  domains: Array<{ id: string; name: string; isDefault: boolean }>
}) {
  const queryClient = useQueryClient()
  const defaultDomain =
    domains.find((domain) => domain.isDefault)?.id ?? domains[0]?.id ?? ''
  const [prefix, setPrefix] = useState('')
  const [domainId, setDomainId] = useState(defaultDomain)
  const [displayName, setDisplayName] = useState('')

  // The modal mounts while domains are still loading; adopt the default as
  // soon as it exists so the field never shows an empty placeholder.
  useEffect(() => {
    if (!domainId && defaultDomain) setDomainId(defaultDomain)
  }, [defaultDomain, domainId])

  const create = useMutation({
    mutationFn: () =>
      createMailboxFn({
        data: {
          localPart: prefix,
          domainId: domainId || undefined,
          kind: 'permanent',
          displayName: displayName || undefined,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('创建失败', { description: result.message })
        return
      }
      toast.success('邮箱已创建', {
        description: result.data.address,
      })
      setPrefix('')
      setDisplayName('')
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      await queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      {({ close }) => (
        <>
          <ModalHeader
            title="创建长期邮箱"
            description="前缀最短 3 位，创建后不可修改。"
          />
          <ModalBody className="flex flex-col gap-4">
            <Input
              label="前缀"
              placeholder="hello"
              value={prefix}
              onChange={(value) => setPrefix(value.toLowerCase())}
              hint={
                prefix
                  ? `${prefix}@${domains.find((domain) => domain.id === domainId)?.name ?? '…'}`
                  : '小写字母、数字、点、下划线、连字符'
              }
            />
            <Select
              label="域名"
              selectedKey={domainId}
              onSelectionChange={(key) => setDomainId(String(key))}
            >
              {domains.map((domain) => (
                <SelectItem
                  key={domain.id}
                  id={domain.id}
                  textValue={domain.name}
                >
                  {domain.name}
                </SelectItem>
              ))}
            </Select>
            <Input
              label="发件显示名（可选）"
              placeholder="例如：产品团队"
              value={displayName}
              onChange={setDisplayName}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close}>
              取消
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || prefix.trim().length === 0}
            >
              {create.isPending ? '创建中…' : '创建'}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  )
}
