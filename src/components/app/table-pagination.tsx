import { Button } from '@/components/base/buttons/button'

export function TablePagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  if (total <= pageSize) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-caption-1-regular text-text-tertiary">
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          上一页
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}
