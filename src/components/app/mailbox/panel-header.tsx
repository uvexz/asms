import type { ReactNode } from 'react'

import { cx } from '@/utils/cx'

/**
 * One header for all three mail panes. The height is fixed, so the divider
 * under it lands on the same row in every column — a header that grows with
 * its own content would push each panel's hairline to a different height.
 */
export function PanelHeader({
  leading,
  title,
  subtitle,
  actions,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex h-14 shrink-0 items-center gap-1 border-b border-separator-border px-4',
        className,
      )}
    >
      {leading}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-body-medium text-text-primary">
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-caption-1-regular text-text-tertiary">
            {subtitle}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      ) : null}
    </div>
  )
}
