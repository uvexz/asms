import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Chip } from '@/components/base/badges/chip'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/base/table/table'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { TablePagination } from '@/components/app/table-pagination'
import { auditActionLabel, auditTargetLabel } from '@/lib/admin-labels'
import { formatFullDateTime } from '@/lib/format'
import { adminAuditQuery } from '@/lib/queries'
import { headTitle } from '@/lib/site'

const PAGE_SIZE = 30

export const Route = createFileRoute('/admin/audit')({
  head: headTitle('审计日志'),
  component: AdminAuditPage,
})

function AdminAuditPage() {
  const [page, setPage] = useState(1)

  const list = useQuery(adminAuditQuery(page))

  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="审计日志" description="管理操作与敏感读取记录。" />

      {list.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="还没有审计记录" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default p-2">
            <Table
              aria-label="审计日志"
              size="sm"
              containerClassName="[scrollbar-width:thin]"
            >
              <TableHeader>
                <TableColumn isRowHeader>时间</TableColumn>
                <TableColumn>动作</TableColumn>
                <TableColumn>操作者</TableColumn>
                <TableColumn>目标</TableColumn>
                <TableColumn className="hidden md:table-cell">IP</TableColumn>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} id={item.id}>
                    <TableCell>
                      <span className="whitespace-nowrap text-caption-1-regular text-text-tertiary">
                        {formatFullDateTime(item.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Chip variant="caption" color="neutral">
                        {auditActionLabel(item.action)}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-body-regular text-text-primary">
                          {item.actorName || item.actorEmail || '系统'}
                        </span>
                        {item.actorName && item.actorEmail ? (
                          <span className="truncate text-caption-1-regular text-text-tertiary">
                            {item.actorEmail}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-[16rem] truncate text-caption-1-regular text-text-secondary"
                        title={item.targetId ?? undefined}
                      >
                        {auditTargetLabel(item.targetType, item.targetId)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-caption-1-regular text-text-tertiary">
                        {item.ip ?? '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-2 end-2 w-10 rounded-e-2xl bg-linear-to-l from-background-primary-default to-transparent md:hidden"
            />
          </div>
          <p className="text-caption-1-regular text-text-tertiary md:hidden">
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
