import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { RiSendPlaneLine } from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button, ButtonLink } from '@/components/base/buttons/button'
import { Modal, ModalBody, ModalHeader } from '@/components/base/modal/modal'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { formatFullDateTime } from '@/lib/format'
import { sentDetailQuery, sentQuery } from '@/lib/queries'
import { headTitle } from '@/lib/site'

export const Route = createFileRoute('/app/sent')({
  head: headTitle('已发送'),
  component: SentPage,
})

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  sent: '已提交',
  delivered: '已送达',
  delivery_delayed: '延迟',
  bounced: '退信',
  complained: '投诉',
  failed: '失败',
}

const STATUS_COLOR: Record<
  string,
  'neutral' | 'lime' | 'yellow' | 'rose' | 'blue'
> = {
  queued: 'neutral',
  sent: 'blue',
  delivered: 'lime',
  delivery_delayed: 'yellow',
  bounced: 'rose',
  complained: 'rose',
  failed: 'rose',
}

function SentPage() {
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const list = useQuery(sentQuery(page))

  const detail = useQuery(sentDetailQuery(openId))

  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0
  const email = detail.data?.ok ? detail.data.data : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="已发送" description="发件记录与 Resend 投递状态。" />

      {list.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={RiSendPlaneLine}
          title="还没有发过邮件"
          description="发件成功后，这里会显示投递状态。"
          action={<ButtonLink href="/app/compose">写第一封邮件</ButtonLink>}
        />
      ) : (
        <div className="divide-y divide-separator-border overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenId(item.id)}
              className="flex w-full flex-col gap-1 px-4 py-3 text-start transition-colors hover:bg-background-secondary-hover"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-body-medium text-text-primary">
                  {item.subject || '(无主题)'}
                </span>
                <Chip
                  variant="caption"
                  color={STATUS_COLOR[item.status] ?? 'neutral'}
                >
                  {STATUS_LABEL[item.status] ?? item.status}
                </Chip>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-caption-1-regular text-text-tertiary">
                  {item.fromAddress} → {item.to.join(', ')}
                </span>
                <span className="shrink-0 text-caption-1-regular text-text-tertiary">
                  {formatFullDateTime(item.createdAt)}
                </span>
              </div>
              {item.errorMessage ? (
                <span className="truncate text-caption-1-regular text-text-error-primary">
                  {item.errorMessage}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {total > 20 ? (
        <div className="flex items-center justify-between">
          <Button
            size="xs"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <span className="text-caption-1-regular text-text-tertiary">
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <Button
            size="xs"
            variant="secondary"
            disabled={page * 20 >= total}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}

      <Modal
        isOpen={Boolean(openId)}
        onOpenChange={(open) => {
          if (!open) setOpenId(null)
        }}
        size="lg"
      >
        <ModalHeader
          title={email?.subject || '发送详情'}
          description={email ? formatFullDateTime(email.createdAt) : ''}
        />
        <ModalBody className="flex flex-col gap-4">
          {email ? (
            <>
              <div className="flex flex-col gap-1 text-caption-1-regular text-text-tertiary">
                <span>发件人：{email.fromAddress}</span>
                <span>收件人：{email.to.join(', ')}</span>
                {email.cc.length > 0 ? (
                  <span>抄送：{email.cc.join(', ')}</span>
                ) : null}
                {email.bcc.length > 0 ? (
                  <span>密送：{email.bcc.join(', ')}</span>
                ) : null}
                <span>
                  状态：{STATUS_LABEL[email.status] ?? email.status}
                  {email.errorMessage ? ` · ${email.errorMessage}` : ''}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-2xl bg-background-secondary-default p-4 font-sans text-body-regular text-text-primary">
                {email.textBody}
              </pre>
            </>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </ModalBody>
      </Modal>
    </div>
  )
}
