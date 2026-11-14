import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { RiMailSendLine } from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { Select, SelectItem } from '@/components/base/select/select'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { Textarea } from '@/components/base/textarea/textarea'
import { toast } from '@/components/base/toast/toast'
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/app/page-header'
import {
  invalidateAfterSend,
  mailboxesQuery,
  sendUsageQuery,
} from '@/lib/queries'
import { useMailPolicy } from '@/lib/use-mail-policy'
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

const DRAFT_KEY = 'asms:compose-draft'

/**
 * A compose screen that loses a half-written letter on an accidental click is
 * worse than one that keeps it. The draft lives in `sessionStorage`: it
 * survives a navigation or a reload in this tab, and it never follows the
 * account to another device.
 *
 * The sender is deliberately not part of the draft — a mailbox can be deleted
 * while the draft waits, and restoring a stale id would make "send" fail with
 * nothing on screen explaining why.
 */
type ComposeDraft = {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}

function readDraft(): ComposeDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const source = parsed as Record<string, unknown>
    const pick = (key: keyof ComposeDraft) =>
      typeof source[key] === 'string' ? source[key] : ''

    const draft: ComposeDraft = {
      to: pick('to'),
      cc: pick('cc'),
      bcc: pick('bcc'),
      subject: pick('subject'),
      body: pick('body'),
    }
    return Object.values(draft).some(Boolean) ? draft : null
  } catch {
    // Unreadable storage is not worth failing the screen over.
    return null
  }
}

function writeDraft(draft: ComposeDraft | null) {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else window.sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage can be full or blocked; the draft is a convenience, not a gate.
  }
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
  const requestId = useRef<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [errors, setErrors] = useState<{
    to?: string
    cc?: string
    bcc?: string
    subject?: string
    body?: string
  }>({})

  const mailboxes = useQuery(mailboxesQuery())
  const usage = useQuery(sendUsageQuery())
  const {
    policy,
    isLoading: policyLoading,
    isError: policyError,
    refetch: refetchPolicy,
  } = useMailPolicy()

  const allMailboxes = mailboxes.data?.ok ? mailboxes.data.data : []
  const mailboxesError =
    mailboxes.data && !mailboxes.data.ok ? mailboxes.data.message : undefined
  const usable = allMailboxes.filter(
    (item) => item.kind === 'permanent' || policy?.allowTempSending,
  )
  const selected = mailboxId || usable[0]?.id || ''
  const quota = usage.data?.ok ? usage.data.data : null

  const validate = () => {
    const next: typeof errors = {}
    const recipients = parseRecipients(to)
    if (recipients.length === 0) next.to = '填写至少一个收件人'
    else if (recipients.length > 10) next.to = '收件人最多 10 个'
    if (parseRecipients(cc).length > 10) next.cc = '抄送最多 10 个收件人'
    if (parseRecipients(bcc).length > 10) next.bcc = '密送最多 10 个收件人'
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
          requestId: (requestId.current ??= crypto.randomUUID()),
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        // A new id for the next attempt: this one is known to be rejected.
        requestId.current = null
        toast.error('发送失败', { description: result.message })
        return
      }
      toast.success('已加入发送队列', {
        description: '投递状态会显示在「已发送」中。',
      })
      requestId.current = null
      setTo('')
      setCc('')
      setBcc('')
      setSubject('')
      setBody('')
      await invalidateAfterSend(queryClient)
    },
  })

  // Restore once, after mount: reading storage during render would make the
  // server's first paint and the client's disagree about the textarea.
  const restoreAttempted = useRef(false)
  useEffect(() => {
    // A double-invoked effect (Strict Mode) must not restore — or toast — twice.
    if (restoreAttempted.current) return
    restoreAttempted.current = true

    const draft = readDraft()
    if (draft) {
      setTo(draft.to)
      setCc(draft.cc)
      setBcc(draft.bcc)
      setSubject(draft.subject)
      setBody(draft.body)
      toast.info('已恢复上次未发送的草稿')
    }
    setRestored(true)
  }, [])

  // Autosave is gated on `restored`, or this first pass would overwrite the
  // draft with the empty state the restore above has not read into yet.
  useEffect(() => {
    if (!restored) return
    if (!to && !cc && !bcc && !subject && !body) {
      writeDraft(null)
      return
    }
    const timer = window.setTimeout(
      () => writeDraft({ to, cc, bcc, subject, body }),
      500,
    )
    return () => window.clearTimeout(timer)
  }, [restored, to, cc, bcc, subject, body])

  // A reload or a closed tab is the one exit the router cannot cover.
  useEffect(() => {
    if (!to && !cc && !bcc && !subject && !body) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [to, cc, bcc, subject, body])

  if (mailboxes.isLoading || policyLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-[440px] w-full" />
      </div>
    )
  }

  if (mailboxes.isError || Boolean(mailboxesError)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="写邮件" />
        <ErrorState
          title="无法加载发件邮箱"
          description={mailboxesError}
          onRetry={() => void mailboxes.refetch()}
        />
      </div>
    )
  }

  if (policyError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="写邮件" />
        <ErrorState
          title="无法加载发件规则"
          description="发件额度与临时邮箱规则暂时不可用。"
          onRetry={() => void refetchPolicy()}
        />
      </div>
    )
  }

  if (usable.length === 0) {
    const onlyTemporary = allMailboxes.length > 0
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="写邮件" />
        <EmptyState
          icon={RiMailSendLine}
          title="没有可用的发件邮箱"
          description={
            onlyTemporary
              ? '先创建一个长期邮箱。当前配置下临时邮箱仅支持收件。'
              : '先创建一个邮箱后即可发信。'
          }
          action={<ButtonLink href="/app/mailboxes">创建邮箱</ButtonLink>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="写邮件"
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

      <form
        className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (!validate()) return
          if (!send.isPending) send.mutate()
        }}
      >
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
          <Input
            label="抄送（可选）"
            value={cc}
            onChange={(value) => {
              setCc(value)
              if (errors.cc)
                setErrors((current) => ({ ...current, cc: undefined }))
            }}
            isInvalid={Boolean(errors.cc)}
            errorMessage={errors.cc}
          />
          <Input
            label="密送（可选）"
            value={bcc}
            onChange={(value) => {
              setBcc(value)
              if (errors.bcc)
                setErrors((current) => ({ ...current, bcc: undefined }))
            }}
            isInvalid={Boolean(errors.bcc)}
            errorMessage={errors.bcc}
          />
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
            收件人、抄送、密送各最多 10 个；附件暂不支持。
            {!quota?.unlimited && policy?.timezone
              ? ` 每日额度 ${policy.timezone} 00:00 重置。`
              : null}
          </p>
          <Button
            type="submit"
            leadingIcon={RiMailSendLine}
            disabled={send.isPending}
          >
            {send.isPending ? '发送中…' : '发送'}
          </Button>
        </div>
      </form>
    </div>
  )
}
