import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { RiMailSendLine } from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { Select, SelectItem } from '@/components/base/select/select'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { Textarea } from '@/components/base/textarea/textarea'
import { toast } from '@/components/base/toast/toast'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import {
  invalidateAfterSend,
  mailboxesQuery,
  sendUsageQuery,
} from '@/lib/queries'
import { headTitle } from '@/lib/site'
import { sendMailFn } from '@/server/functions/send'

export const Route = createFileRoute('/app/compose')({
  head: headTitle('写邮件'),
  component: ComposePage,
})

function parseRecipients(value: string) {
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function ComposePage() {
  const queryClient = useQueryClient()
  const [mailboxId, setMailboxId] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  // Reuse the id across a transport retry so Resend can deduplicate a request
  // whose response was lost. A definite failure starts a fresh attempt.
  const requestId = useRef(crypto.randomUUID())
  const [errors, setErrors] = useState<{
    to?: string
    subject?: string
    body?: string
  }>({})

  const mailboxes = useQuery(mailboxesQuery())
  const usage = useQuery(sendUsageQuery())

  const usable = (mailboxes.data?.ok ? mailboxes.data.data : []).filter(
    (item) => item.kind === 'permanent',
  )
  const selected = mailboxId || usable[0]?.id || ''
  const quota = usage.data?.ok ? usage.data.data : null

  const validate = () => {
    const next: typeof errors = {}
    const recipients = parseRecipients(to)
    if (recipients.length === 0) next.to = '填写至少一个收件人'
    else if (recipients.length > 10) next.to = '单封最多 10 个收件人'
    if (!subject.trim()) next.subject = '填写邮件主题'
    if (!body.trim()) next.body = '写点正文再发送'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const send = useMutation({
    mutationFn: () =>
      sendMailFn({
        data: {
          mailboxId: selected,
          to: parseRecipients(to),
          cc: parseRecipients(cc),
          bcc: parseRecipients(bcc),
          subject,
          text: body,
          requestId: requestId.current,
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        requestId.current = crypto.randomUUID()
        toast.error('发送失败', { description: result.message })
        return
      }
      toast.success('邮件已提交', {
        description: `Resend 已接受，状态：${result.data.status}`,
      })
      requestId.current = crypto.randomUUID()
      setTo('')
      setCc('')
      setBcc('')
      setSubject('')
      setBody('')
      await invalidateAfterSend(queryClient)
    },
  })

  if (mailboxes.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-[440px] w-full" />
      </div>
    )
  }

  if (usable.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="写邮件" description="从你的长期邮箱发出。" />
        <EmptyState
          icon={RiMailSendLine}
          title="没有可用的发件邮箱"
          description="先创建一个长期邮箱，临时邮箱默认仅支持收件。"
          action={<ButtonLink href="/app/mailboxes">创建邮箱</ButtonLink>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="写邮件"
        description="通过 Resend API 发送，纯文本会自动转换为 HTML。"
        actions={
          quota ? (
            <Chip
              variant="caption"
              color={quota.unlimited ? 'neutral' : 'blue'}
            >
              {quota.unlimited
                ? '管理员 · 不限额'
                : `今日 ${quota.used} / ${quota.limit}`}
            </Chip>
          ) : null
        }
      />

      <div className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="发件邮箱"
            selectedKey={selected}
            onSelectionChange={(key) => setMailboxId(String(key))}
          >
            {usable.map((mailbox) => (
              <SelectItem
                key={mailbox.id}
                id={mailbox.id}
                textValue={mailbox.address}
              >
                {mailbox.address}
              </SelectItem>
            ))}
          </Select>
          <Input
            label="收件人"
            placeholder="a@example.com, b@example.com"
            value={to}
            onChange={(value) => {
              setTo(value)
              if (errors.to)
                setErrors((current) => ({ ...current, to: undefined }))
            }}
            isInvalid={Boolean(errors.to)}
            errorMessage={errors.to}
            isRequired
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="抄送（可选）" value={cc} onChange={setCc} />
          <Input label="密送（可选）" value={bcc} onChange={setBcc} />
        </div>

        <Input
          label="主题"
          placeholder="邮件主题"
          value={subject}
          onChange={(value) => {
            setSubject(value)
            if (errors.subject)
              setErrors((current) => ({ ...current, subject: undefined }))
          }}
          isInvalid={Boolean(errors.subject)}
          errorMessage={errors.subject}
          isRequired
        />

        <Textarea
          label="正文"
          placeholder="写点什么…"
          value={body}
          onChange={(value) => {
            setBody(value)
            if (errors.body)
              setErrors((current) => ({ ...current, body: undefined }))
          }}
          hint={errors.body}
          isInvalid={Boolean(errors.body)}
          fieldClassName={
            errors.body ? '!bg-background-secondary-default' : undefined
          }
          rows={12}
          isRequired
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-caption-1-regular text-text-tertiary">
            单封最多 10 个收件人；附件暂不支持。
          </p>
          <Button
            leadingIcon={RiMailSendLine}
            onClick={() => {
              if (!validate()) return
              send.mutate()
            }}
            disabled={send.isPending}
          >
            {send.isPending ? '发送中…' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  )
}
