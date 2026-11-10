import type { ReactNode } from 'react'
import { RiErrorWarningLine } from '@remixicon/react'

import { Button } from '@/components/base/buttons/button'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-title-2-semibold text-text-primary">{title}</h1>
        {description ? (
          <p className="text-body-regular text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = '无法加载内容',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border-error-default px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-background-tertiary-error text-text-error-primary">
        <RiErrorWarningLine className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body-medium text-text-primary">{title}</p>
        <p className="max-w-sm text-body-regular text-text-tertiary">
          {description ?? '请检查网络后重试。'}
        </p>
      </div>
      {onRetry ? (
        <Button size="small" variant="secondary" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border-button-default px-6 py-14 text-center">
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-2xl bg-background-secondary-default text-foreground-icon-secondary">
          <Icon className="size-5" />
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-body-medium text-text-primary">{title}</p>
        {description ? (
          <p className="max-w-sm text-body-regular text-text-tertiary">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
