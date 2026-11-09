import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { AlertDialog } from '@/components/base/modal/modal'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/base/segmented-control/segmented-control'
import { Skeleton } from '@/components/base/skeleton/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/base/table/table'
import { toast } from '@/components/base/toast/toast'
import { EmptyState, PageHeader } from '@/components/app/page-header'
import { TablePagination } from '@/components/app/table-pagination'
import { formatFullDateTime } from '@/lib/format'
import { adminMailboxesQuery, queryKeys } from '@/lib/queries'
import { headTitle } from '@/lib/site'
import { adminDeleteMailboxFn } from '@/server/functions/admin'

const PAGE_SIZE = 20

export const Route = createFileRoute('/admin/mailboxes')({
  head: headTitle('邮箱管理'),
  component: AdminMailboxesPage,
})

function AdminMailboxesPage() {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'all' | 'permanent' | 'temporary'>('all')
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<{
    id: string
    address: string
  } | null>(null)

  const list = useQuery(
    adminMailboxesQuery({ kind: kind === 'all' ? undefined : kind, page }),
  )

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteMailboxFn({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('邮箱已删除')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.adminMailboxes,
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminOverview })
    },
  })

  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="邮箱管理"
        description="全部用户的长期与临时邮箱。"
        actions={
          <SegmentedControl
            aria-label="邮箱类型"
            selectedKeys={new Set([kind])}
            onSelectionChange={(keys) => {
              const next = [...keys][0]
              if (next) {
                setKind(next as typeof kind)
                setPage(1)
              }
            }}
          >
            <SegmentedControlItem id="all">全部</SegmentedControlItem>
            <SegmentedControlItem id="permanent">长期</SegmentedControlItem>
            <SegmentedControlItem id="temporary">临时</SegmentedControlItem>
          </SegmentedControl>
        }
      />

      {list.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="没有邮箱" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all text-body-medium text-text-primary">
                    {item.address}
                  </span>
                  <Chip
                    variant="caption"
                    color={item.kind === 'permanent' ? 'lime' : 'yellow'}
                  >
                    {item.kind === 'permanent' ? '长期' : '临时'}
                  </Chip>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption-1-regular text-text-tertiary">
                    所属用户
                  </span>
                  <span className="break-all text-caption-1-regular text-text-secondary">
                    {item.ownerEmail}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-caption-1-regular text-text-tertiary">
                      过期时间
                    </span>
                    <span className="text-caption-1-regular text-text-secondary">
                      {item.expiresAt
                        ? formatFullDateTime(item.expiresAt)
                        : '长期'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption-1-regular text-text-tertiary">
                      创建时间
                    </span>
                    <span className="text-caption-1-regular text-text-secondary">
                      {formatFullDateTime(item.createdAt)}
                    </span>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  className="self-start text-text-error-primary"
                  onClick={() =>
                    setDeleting({ id: item.id, address: item.address })
                  }
                >
                  删除邮箱
                </Button>
              </div>
            ))}
          </div>

          <div className="relative hidden overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default p-2 md:block">
            <Table
              aria-label="邮箱列表"
              size="sm"
              containerClassName="[scrollbar-width:thin]"
            >
              <TableHeader>
                <TableColumn isRowHeader>地址</TableColumn>
                <TableColumn>类型</TableColumn>
                <TableColumn>所属用户</TableColumn>
                <TableColumn>过期时间</TableColumn>
                <TableColumn>创建时间</TableColumn>
                <TableColumn>操作</TableColumn>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} id={item.id}>
                    <TableCell>
                      <span className="text-body-medium text-text-primary">
                        {item.address}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Chip
                        variant="caption"
                        color={item.kind === 'permanent' ? 'lime' : 'yellow'}
                      >
                        {item.kind === 'permanent' ? '长期' : '临时'}
                      </Chip>
                    </TableCell>
                    <TableCell>{item.ownerEmail}</TableCell>
                    <TableCell>
                      {item.expiresAt
                        ? formatFullDateTime(item.expiresAt)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <span className="text-caption-1-regular text-text-tertiary">
                        {formatFullDateTime(item.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="xs"
                        variant="danger"
                        onClick={() =>
                          setDeleting({ id: item.id, address: item.address })
                        }
                      >
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={setPage}
          />
        </div>
      )}

      <AlertDialog
        isOpen={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除邮箱？"
        description={
          deleting
            ? `${deleting.address} 及其全部邮件会被删除，长期地址将进入冷却期。`
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
