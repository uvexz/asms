import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  RiAddLine,
  RiFileCopyLine,
  RiRefreshLine,
  RiTimeLine,
  RiDeleteBin6Line,
  RiShuffleLine,
} from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { IconButton } from '@/components/base/buttons/icon-button'
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
import { countdown, formatRelative } from '@/lib/format'
import { headTitle } from '@/lib/site'
import { randomTempLocalPart } from '@/lib/temp-address'
import {
  createMailboxFn,
  deleteMailboxFn,
  listDomainsFn,
  listMailboxesFn,
  renewMailboxFn,
} from '@/server/functions/mailboxes'

export const Route = createFileRoute('/app/temp')({
  head: headTitle('临时邮箱'),
  component: TempPage,
})

function TempPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<{
    id: string
    address: string
  } | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  const mailboxes = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => listMailboxesFn(),
    refetchInterval: 30_000,
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
      toast.success('临时邮箱已删除')
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      await queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  const renew = useMutation({
    mutationFn: (id: string) => renewMailboxFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('续期失败', { description: result.message })
        return
      }
      toast.success('已续期', {
        description: countdown(result.data.expiresAt),
      })
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
    },
  })

  const items = mailboxes.data?.ok ? mailboxes.data.data : []
  const temporary = items.filter((item) => item.kind === 'temporary')
  const availableDomains = domains.data?.ok ? domains.data.data : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="临时邮箱"
        description="默认 1 小时有效，可续期；到期后地址与邮件自动清理。"
        actions={
          <Button
            leadingIcon={RiAddLine}
            size="small"
            onClick={() => setCreateOpen(true)}
            disabled={availableDomains.length === 0}
          >
            创建临时邮箱
          </Button>
        }
      />

      {mailboxes.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-32 w-full" />
          ))}
        </div>
      ) : temporary.length === 0 ? (
        <EmptyState
          icon={RiTimeLine}
          title="还没有临时邮箱"
          description="用于注册验证、一次性收件等场景。"
          action={
            <Button
              leadingIcon={RiAddLine}
              onClick={() => setCreateOpen(true)}
              disabled={availableDomains.length === 0}
            >
              创建临时邮箱
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {temporary.map((mailbox) => (
            <div
              key={mailbox.id}
              className="flex flex-col gap-3 rounded-3xl border border-border-button-default bg-background-primary-default p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    to="/app/inbox/$mailboxId"
                    params={{ mailboxId: mailbox.id }}
                    search={{ message: undefined }}
                    className="truncate text-body-medium text-text-primary hover:text-accent-600"
                  >
                    {mailbox.address}
                  </Link>
                  <span className="text-caption-1-regular text-text-tertiary">
                    {mailbox.lastReceivedAt
                      ? `最近收件 ${formatRelative(mailbox.lastReceivedAt)}`
                      : '等待收件'}
                  </span>
                </div>
                <Chip variant="caption" color="yellow">
                  临时
                </Chip>
              </div>

              <div className="flex items-center gap-2 rounded-2xl bg-background-secondary-default px-3 py-2">
                <RiTimeLine className="size-4 text-foreground-icon-secondary" />
                <span className="text-caption-1-regular text-text-secondary">
                  {countdown(mailbox.expiresAt)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-caption-1-regular text-text-tertiary">
                  已续期 {mailbox.renewCount} 次
                </span>
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
                  <Button
                    size="xs"
                    variant="secondary"
                    leadingIcon={RiRefreshLine}
                    onClick={() => renew.mutate(mailbox.id)}
                    disabled={renew.isPending}
                  >
                    续期
                  </Button>
                  <IconButton
                    aria-label="删除"
                    icon={RiDeleteBin6Line}
                    size="small"
                    onClick={() =>
                      setDeleting({ id: mailbox.id, address: mailbox.address })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateTempModal
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
        title="删除临时邮箱？"
        description={
          deleting ? `${deleting.address} 及其邮件会被立即删除。` : ''
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

function CreateTempModal({
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
  const [prefix, setPrefix] = useState(() => randomTempLocalPart())
  const [domainId, setDomainId] = useState(defaultDomain)

  useEffect(() => {
    if (!domainId && defaultDomain) setDomainId(defaultDomain)
  }, [defaultDomain, domainId])

  const create = useMutation({
    mutationFn: () =>
      createMailboxFn({
        data: {
          localPart: prefix,
          domainId: domainId || undefined,
          kind: 'temporary',
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('创建失败', { description: result.message })
        return
      }
      toast.success('临时邮箱已创建', { description: result.data.address })
      setPrefix(randomTempLocalPart())
      onOpenChange(false)
      await queryClient.invalidateQueries({ queryKey: ['mailboxes'] })
      await queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      {({ close }) => (
        <>
          <ModalHeader title="创建临时邮箱" description="默认 1 小时后过期。" />
          <ModalBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Input
                label="前缀"
                value={prefix}
                onChange={(value) => setPrefix(value.toLowerCase())}
                hint="至少 8 位"
              />
              <Button
                size="xs"
                variant="ghost"
                leadingIcon={RiShuffleLine}
                onClick={() => setPrefix(randomTempLocalPart())}
                className="self-start"
              >
                换一个随机地址
              </Button>
            </div>
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
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close}>
              取消
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || prefix.trim().length < 8}
            >
              {create.isPending ? '创建中…' : '创建'}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  )
}
