import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { RiSearchLine } from '@remixicon/react'

import { Chip } from '@/components/base/badges/chip'
import { Button } from '@/components/base/buttons/button'
import { Input } from '@/components/base/input/input'
import { AlertDialog } from '@/components/base/modal/modal'
import { Select, SelectItem } from '@/components/base/select/select'
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
import { headTitle } from '@/lib/site'
import {
  adminBanUserFn,
  adminSetRoleFn,
  adminUsersFn,
} from '@/server/functions/admin'

const PAGE_SIZE = 20

export const Route = createFileRoute('/admin/users')({
  head: headTitle('用户管理'),
  component: AdminUsersPage,
})

type RoleTarget = { id: string; email: string; role: 'user' | 'admin' }
type BanTarget = { id: string; email: string; banned: boolean }

function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [roleTarget, setRoleTarget] = useState<RoleTarget | null>(null)
  const [banTarget, setBanTarget] = useState<BanTarget | null>(null)

  const list = useQuery({
    queryKey: ['admin-users', query, page],
    queryFn: () =>
      adminUsersFn({ data: { search: query || undefined, page } }),
  })

  const setRole = useMutation({
    mutationFn: (input: { userId: string; role: 'user' | 'admin' }) =>
      adminSetRoleFn({ data: input }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('角色已更新')
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const ban = useMutation({
    mutationFn: (input: { userId: string; banned: boolean }) =>
      adminBanUserFn({ data: input }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('状态已更新')
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const items = list.data?.ok ? list.data.data.items : []
  const total = list.data?.ok ? list.data.data.total : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="用户管理" description="角色、封禁与邮箱数量。" />

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setQuery(search.trim())
        }}
      >
        <Input
          label="搜索"
          placeholder="昵称或登录邮箱"
          leadingIcon={RiSearchLine}
          value={search}
          onChange={setSearch}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary">
          搜索
        </Button>
      </form>

      {list.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="没有匹配的用户" />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Phones: one card per user, every value and action visible. */}
          <div className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-body-medium text-text-primary">
                      {item.name}
                    </span>
                    <span className="truncate text-caption-1-regular text-text-tertiary">
                      {item.email}
                    </span>
                  </div>
                  <Chip
                    variant="caption"
                    color={item.banned ? 'rose' : 'lime'}
                  >
                    {item.banned ? '已封禁' : '正常'}
                  </Chip>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-caption-1-regular text-text-tertiary">
                      角色
                    </span>
                    <Select
                      aria-label={`角色 ${item.email}`}
                      size="sm"
                      selectedKey={item.role}
                      onSelectionChange={(key) =>
                        setRoleTarget({
                          id: item.id,
                          email: item.email,
                          role: String(key) as 'user' | 'admin',
                        })
                      }
                    >
                      <SelectItem id="user" textValue="用户">
                        用户
                      </SelectItem>
                      <SelectItem id="admin" textValue="管理员">
                        管理员
                      </SelectItem>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption-1-regular text-text-tertiary">
                      邮箱数
                    </span>
                    <span className="text-body-medium text-text-primary">
                      {item.mailboxes}
                    </span>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className="text-caption-1-regular text-text-tertiary">
                      注册时间
                    </span>
                    <span className="text-caption-1-regular text-text-secondary">
                      {formatFullDateTime(item.createdAt)}
                    </span>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  className={
                    item.banned ? 'self-start' : 'self-start text-text-error-primary'
                  }
                  onClick={() =>
                    setBanTarget({
                      id: item.id,
                      email: item.email,
                      banned: !item.banned,
                    })
                  }
                >
                  {item.banned ? '解封账号' : '封禁账号'}
                </Button>
              </div>
            ))}
          </div>

          {/* Tablet and up: the dense table. */}
          <div className="relative hidden overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default p-2 md:block">
            <Table
              aria-label="用户列表"
              size="sm"
              containerClassName="[scrollbar-width:thin]"
            >
              <TableHeader>
                <TableColumn isRowHeader>用户</TableColumn>
                <TableColumn>角色</TableColumn>
                <TableColumn>邮箱数</TableColumn>
                <TableColumn>注册时间</TableColumn>
                <TableColumn>状态</TableColumn>
                <TableColumn>操作</TableColumn>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} id={item.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-body-medium text-text-primary">
                          {item.name}
                        </span>
                        <span className="text-caption-1-regular text-text-tertiary">
                          {item.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        aria-label={`角色 ${item.email}`}
                        size="sm"
                        selectedKey={item.role}
                        onSelectionChange={(key) =>
                          setRoleTarget({
                            id: item.id,
                            email: item.email,
                            role: String(key) as 'user' | 'admin',
                          })
                        }
                        className="w-28"
                      >
                        <SelectItem id="user" textValue="用户">
                          用户
                        </SelectItem>
                        <SelectItem id="admin" textValue="管理员">
                          管理员
                        </SelectItem>
                      </Select>
                    </TableCell>
                    <TableCell>{item.mailboxes}</TableCell>
                    <TableCell>
                      <span className="text-caption-1-regular text-text-tertiary">
                        {formatFullDateTime(item.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Chip
                        variant="caption"
                        color={item.banned ? 'rose' : 'lime'}
                      >
                        {item.banned ? '已封禁' : '正常'}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="xs"
                        variant="secondary"
                        className={
                          item.banned ? undefined : 'text-text-error-primary'
                        }
                        onClick={() =>
                          setBanTarget({
                            id: item.id,
                            email: item.email,
                            banned: !item.banned,
                          })
                        }
                      >
                        {item.banned ? '解封' : '封禁'}
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
        isOpen={Boolean(banTarget)}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null)
        }}
        title={banTarget?.banned ? '封禁这个账号？' : '解封这个账号？'}
        description={
          banTarget
            ? banTarget.banned
              ? `${banTarget.email} 将无法登录，邮箱与邮件会保留。`
              : `${banTarget.email} 会恢复登录能力。`
            : ''
        }
        confirmLabel={banTarget?.banned ? '封禁' : '解封'}
        onConfirm={async () => {
          if (!banTarget) return
          await ban.mutateAsync({
            userId: banTarget.id,
            banned: banTarget.banned,
          })
          setBanTarget(null)
        }}
      />

      <AlertDialog
        isOpen={Boolean(roleTarget)}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null)
        }}
        title={
          roleTarget?.role === 'admin' ? '设为管理员？' : '取消管理员权限？'
        }
        description={
          roleTarget
            ? roleTarget.role === 'admin'
              ? `${roleTarget.email} 将可以管理全部用户、邮箱与站点设置。`
              : `${roleTarget.email} 将失去管理后台的访问权限。`
            : ''
        }
        confirmLabel="确认修改"
        onConfirm={async () => {
          if (!roleTarget) return
          await setRole.mutateAsync({
            userId: roleTarget.id,
            role: roleTarget.role,
          })
          setRoleTarget(null)
        }}
      />
    </div>
  )
}
