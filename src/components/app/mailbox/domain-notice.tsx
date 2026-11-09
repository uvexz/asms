import { RiShieldKeyholeLine } from '@remixicon/react'

/** Shown when no verified, receiving-enabled domain exists yet. */
export function DomainNotice() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default px-3 py-2">
      <RiShieldKeyholeLine className="size-4 shrink-0 text-foreground-icon-secondary" />
      <span className="text-caption-1-regular text-text-secondary">
        还没有可用域名，管理员添加并验证域名后才能创建邮箱。
      </span>
    </div>
  )
}
