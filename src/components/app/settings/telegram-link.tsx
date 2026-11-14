import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/base/buttons/button'
import { AlertDialog } from '@/components/base/modal/modal'
import { toast } from '@/components/base/toast/toast'
import { NETWORK_ERROR_MESSAGE } from '@/lib/auth-errors'
import { queryKeys, telegramLinkQuery } from '@/lib/queries'
import {
  createTelegramLinkFn,
  unlinkTelegramFn,
} from '@/server/functions/telegram'

type TelegramLinkPanel = {
  url: string
  expiresAt: string
}

export function TelegramLink() {
  const queryClient = useQueryClient()
  const query = useQuery(telegramLinkQuery())
  const data = query.data?.ok ? query.data.data : null
  const [link, setLink] = useState<TelegramLinkPanel | null>(null)
  const [pending, setPending] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)

  if (!data || !data.configured) return null

  const linked = data.linked

  const create = async () => {
    setPending(true)
    try {
      const response = await createTelegramLinkFn()
      if (!response.ok) {
        toast.error('无法生成连接', {
          description: response.message,
        })
        return
      }
      setLink(response.data)
    } catch {
      toast.error('无法生成连接', { description: NETWORK_ERROR_MESSAGE })
    } finally {
      setPending(false)
    }
  }

  const unlink = async () => {
    setPending(true)
    try {
      const response = await unlinkTelegramFn()
      if (!response.ok) {
        toast.error('断开失败', {
          description: response.message,
        })
        return
      }
      setLink(null)
      toast.success('已断开 Telegram')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.telegramLink,
      })
    } catch {
      toast.error('断开失败', { description: NETWORK_ERROR_MESSAGE })
    } finally {
      setPending(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success('链接已复制')
    } catch {
      toast.error('复制失败，请手动复制链接')
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border-button-default bg-background-primary-default p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-3-semibold text-text-primary">
          Telegram Bot
        </h2>
        <p className="text-body-regular text-text-secondary">
          在 Telegram 中直接管理临时邮箱和收件箱。
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-body-medium text-text-primary">
            Telegram
          </span>
          <span className="text-caption-1-regular text-text-tertiary">
            {linked
              ? linked.username
                ? `@${linked.username}`
                : linked.firstName || '已连接'
              : '未连接'}
          </span>
        </div>
        {linked ? (
          <Button
            variant="secondary"
            size="small"
            onClick={() => setUnlinkOpen(true)}
            disabled={pending}
          >
            断开连接
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="small"
            onClick={() => void create()}
            disabled={pending}
          >
            连接 Telegram
          </Button>
        )}
      </div>

      {!linked && link ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border-button-default p-4">
          <p className="text-body-regular text-text-secondary">
            在 Telegram 中打开下面的链接并发送 /start，完成后点“刷新状态”。链接
            10 分钟内有效。
          </p>
          <p className="break-all text-caption-1-regular text-text-tertiary">
            {link.url}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() => void copy()}
            >
              复制链接
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                window.open(link.url, '_blank', 'noopener,noreferrer')
              }
            >
              打开 Telegram
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              刷新状态
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog
        isOpen={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="断开 Telegram"
        description="断开后 Telegram Bot 将无法访问此账户的邮箱；邮箱本身不受影响。"
        confirmLabel="断开连接"
        pendingLabel="断开中…"
        onConfirm={unlink}
      />
    </section>
  )
}
