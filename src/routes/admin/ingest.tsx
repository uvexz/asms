import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Chip } from '@/components/base/badges/chip'
import type { ChipColor } from '@/components/base/badges/chip'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/base/table/table'
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/app/page-header'
import { TablePagination } from '@/components/app/table-pagination'
import { formatRecipients, ingestResultLabel } from '@/lib/admin-labels'
import { formatFullDateTime } from '@/lib/format'
import { adminIngestQuery } from '@/lib/queries'
import { headTitle } from '@/lib/site'

const PAGE_SIZE = 30

export const Route = createFileRoute('/admin/ingest')({
  head: headTitle('收件日志'),
  component: AdminIngestPage,
})

const RESULT_COLOR: Record<string, ChipColor> = {
  stored: 'lime',
  duplicate: 'neutral',
  no_mailbox: 'yellow',
  mailbox_expired: 'yellow',
  mailbox_disabled: 'rose',
  content_fetch_failed: 'rose',
}

function AdminIngestPage() {
  const [page, setPage] = useState(1)

  const list = useQuery(adminIngestQuery(page))

  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0
  const listError = list.data && !list.data.ok ? list.data.message : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="收件日志"
        description="用于排查“邮件为什么没收到”：未命中邮箱、已过期、重复投递等。"
      />

      {list.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.isError || Boolean(listError) ? (
        <ErrorState
          title="无法加载收件日志"
          description={listError}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="还没有收件记录" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default p-2">
            <Table
              aria-label="收件日志"
              size="sm"
              containerClassName="[scrollbar-width:thin]"
            >
              <TableHeader>
                <TableColumn isRowHeader>时间</TableColumn>
                <TableColumn>结果</TableColumn>
                <TableColumn>收件人</TableColumn>
                <TableColumn className="hidden sm:table-cell">详情</TableColumn>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const result = ingestResultLabel(item.result)
                  return (
                    <TableRow key={item.id} id={item.id}>
                      <TableCell>
                        <span className="whitespace-nowrap text-caption-1-regular text-text-tertiary">
                          {formatFullDateTime(item.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-col items-start gap-0.5">
                          <Chip
                            variant="caption"
                            color={RESULT_COLOR[item.result] ?? 'neutral'}
                          >
                            {result.label}
                          </Chip>
                          <span className="max-w-[10rem] truncate text-caption-1-regular text-text-tertiary">
                            {result.hint}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[16rem] break-all text-caption-1-regular text-text-secondary">
                          {formatRecipients(item.recipientsJson)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-caption-1-regular text-text-tertiary">
                          {item.detail ?? '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-2 end-2 w-10 rounded-e-2xl bg-linear-to-l from-background-primary-default to-transparent sm:hidden"
            />
          </div>
          <p className="text-caption-1-regular text-text-tertiary sm:hidden">
            左右滑动查看全部列
          </p>
          <TablePagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={setPage}
          />
        </div>
      )}
    </div>
  )
}
