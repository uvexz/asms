import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { RiShuffleLine } from '@remixicon/react'

import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal'
import { Select, SelectItem } from '@/components/base/select/select'
import { toast } from '@/components/base/toast/toast'
import { formatDuration } from '@/lib/format'
import { TEMP_MAILBOX_TTL_MINUTES } from '@/lib/temp-mailbox'
import { domainsQuery, invalidateMailData } from '@/lib/queries'
import { randomTempLocalPart } from '@/lib/temp-address'
import { useMailPolicy } from '@/lib/use-mail-policy'
import { createMailboxFn } from '@/server/functions/mailboxes'
import type { MailboxKind } from './types'

type DomainOption = {
  id: string
  name: string
  isDefault: boolean
  temporaryEnabled: boolean
}

export type CreatedMailbox = {
  id: string
  address: string
  kind: MailboxKind
}

function useAvailableDomains(isOpen: boolean) {
  // Cached for five minutes across every modal and the mailboxes page; the
  // `enabled` gate only skips the request while the dialog is closed.
  const query = useQuery({ ...domainsQuery(), enabled: isOpen })

  return {
    domains: query.data?.ok ? query.data.data : [],
    isLoading: query.isLoading,
    isError: query.isError || Boolean(query.data && !query.data.ok),
    refetch: query.refetch,
  }
}

function useDefaultDomain(domains: DomainOption[]) {
  const fallback = domains.find((domain) => domain.isDefault)?.id ?? domains[0]?.id ?? ''
  const [domainId, setDomainId] = useState(fallback)

  // The form mounts before the domain list arrives; adopt the default as soon
  // as it exists so the field never shows an empty placeholder.
  useEffect(() => {
    if (!domainId && fallback) setDomainId(fallback)
  }, [domainId, fallback])

  return [domainId, setDomainId] as const
}

function DomainField({
  domains,
  domainId,
  onDomainChange,
  isLoading,
  isError,
  onRetry,
  emptyHint,
}: {
  domains: DomainOption[]
  domainId: string
  onDomainChange: (id: string) => void
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  emptyHint: string
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-body-medium text-text-secondary">域名</span>
        <p className="text-body-regular text-text-tertiary">正在加载域名…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <span className="text-body-medium text-text-secondary">域名</span>
        <p className="text-body-regular text-text-error-primary">
          无法加载域名，请稍后重试。
        </p>
        <Button size="xs" variant="secondary" onClick={onRetry}>
          重试
        </Button>
      </div>
    )
  }

  if (domains.length === 0) {
    return <p className="text-body-regular text-text-tertiary">{emptyHint}</p>
  }

  return (
    <Select
      label="域名"
      selectedKey={domainId}
      onSelectionChange={(key) => onDomainChange(String(key))}
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
  )
}

function useCreateMailbox() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      localPart: string
      domainId: string
      kind: MailboxKind
      displayName?: string
    }) =>
      createMailboxFn({
        data: {
          localPart: input.localPart,
          domainId: input.domainId || undefined,
          kind: input.kind,
          displayName: input.displayName || undefined,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error('创建失败', { description: result.message })
        return
      }
      await invalidateMailData(queryClient)
    },
  })
}

export function CreateMailboxModal({
  isOpen,
  onOpenChange,
  onCreated,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (mailbox: CreatedMailbox) => void
}) {
  const domainsState = useAvailableDomains(isOpen)
  const { domains, isLoading, isError, refetch } = domainsState
  const [domainId, setDomainId] = useDefaultDomain(domains)
  const [prefix, setPrefix] = useState('')
  const [displayName, setDisplayName] = useState('')
  const { policy } = useMailPolicy({ enabled: isOpen })
  const create = useCreateMailbox()

  const minPrefix = policy?.minPrefixPermanent
  const prefixTooShort =
    prefix.trim().length > 0 &&
    minPrefix !== undefined &&
    prefix.trim().length < minPrefix
  const canSubmit =
    !create.isPending &&
    prefix.trim().length > 0 &&
    !prefixTooShort &&
    domains.length > 0 &&
    !isLoading &&
    !isError

  const submit = () => {
    if (!domainId || !canSubmit) return
    create.mutate(
      { localPart: prefix, domainId, kind: 'permanent', displayName },
      {
        onSuccess: (result) => {
          if (!result.ok) return
          toast.success('邮箱已创建', { description: result.data.address })
          setPrefix('')
          setDisplayName('')
          onOpenChange(false)
          onCreated?.({
            id: result.data.id,
            address: result.data.address,
            kind: result.data.kind,
          })
        },
      },
    )
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      {({ close }) => (
        <>
          <ModalHeader
            title="创建邮箱"
            description={
              minPrefix
                ? `前缀最短 ${minPrefix} 位，创建后不可修改。`
                : '创建后不可修改。'
            }
          />
          <ModalBody className="flex flex-col gap-4">
            <Input
              label="前缀"
              placeholder="hello"
              value={prefix}
              onChange={(value) => setPrefix(value.toLowerCase())}
              isInvalid={prefixTooShort}
              errorMessage={prefixTooShort ? `至少 ${minPrefix} 位` : undefined}
              hint={
                prefix
                  ? `${prefix}@${
                      domains.find((domain) => domain.id === domainId)?.name ??
                      '…'
                    }`
                  : '小写字母、数字、点、下划线、连字符；以字母或数字开头结尾'
              }
            />
            <DomainField
              domains={domains}
              domainId={domainId}
              onDomainChange={setDomainId}
              isLoading={isLoading}
              isError={isError}
              onRetry={() => void refetch()}
              emptyHint="还没有可用域名，请联系管理员添加并验证域名。"
            />
            {policy && !policy.isAdmin ? (
              <p className="text-caption-1-regular text-text-tertiary">
                最多创建 {policy.maxPermanentMailboxes} 个长期邮箱。
              </p>
            ) : null}
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
            <Button onClick={submit} disabled={!canSubmit}>
              {create.isPending ? '创建中…' : '创建'}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  )
}

export function CreateTempMailboxModal({
  isOpen,
  onOpenChange,
  onCreated,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (mailbox: CreatedMailbox) => void
}) {
  const allDomains = useAvailableDomains(isOpen)
  // A domain can opt out of temporary mailboxes; the picker only offers the
  // ones that opted in.
  const domains = allDomains.domains.filter(
    (domain) => domain.temporaryEnabled,
  )
  const [domainId, setDomainId] = useDefaultDomain(domains)
  const [prefix, setPrefix] = useState(() => randomTempLocalPart())
  const { policy } = useMailPolicy({ enabled: isOpen })
  const create = useCreateMailbox()

  const minPrefix = policy?.minPrefixTemp
  const prefixTooShort =
    prefix.trim().length > 0 &&
    minPrefix !== undefined &&
    prefix.trim().length < minPrefix
  const canSubmit =
    !create.isPending &&
    prefix.trim().length > 0 &&
    !prefixTooShort &&
    domains.length > 0 &&
    !allDomains.isLoading &&
    !allDomains.isError

  const submit = () => {
    if (!domainId || !canSubmit) return
    create.mutate(
      { localPart: prefix, domainId, kind: 'temporary' },
      {
        onSuccess: (result) => {
          if (!result.ok) return
          toast.success('临时邮箱已创建', {
            description: result.data.address,
          })
          setPrefix(randomTempLocalPart(minPrefix))
          onOpenChange(false)
          onCreated?.({
            id: result.data.id,
            address: result.data.address,
            kind: result.data.kind,
          })
        },
      },
    )
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
      {({ close }) => (
        <>
          <ModalHeader
            title="创建临时邮箱"
            description={`有效期 ${formatDuration(TEMP_MAILBOX_TTL_MINUTES)}；期内收到邮件即保留，否则到期失效。`}
          />
          <ModalBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Input
                label="前缀"
                value={prefix}
                onChange={(value) => setPrefix(value.toLowerCase())}
                isInvalid={prefixTooShort}
                errorMessage={
                  prefixTooShort ? `至少 ${minPrefix} 位` : undefined
                }
                hint={
                  minPrefix
                    ? `至少 ${minPrefix} 位`
                    : '前缀最短长度由管理员配置'
                }
              />
              <Button
                size="xs"
                variant="ghost"
                leadingIcon={RiShuffleLine}
                onClick={() => setPrefix(randomTempLocalPart(minPrefix))}
                className="self-start"
              >
                换一个随机地址
              </Button>
            </div>
            <DomainField
              domains={domains}
              domainId={domainId}
              onDomainChange={setDomainId}
              isLoading={allDomains.isLoading}
              isError={allDomains.isError}
              onRetry={() => void allDomains.refetch()}
              emptyHint="当前没有开放临时邮箱的域名，请联系管理员。"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={close}>
              取消
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {create.isPending ? '创建中…' : '创建'}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  )
}
