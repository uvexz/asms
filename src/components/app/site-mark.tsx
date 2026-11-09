import { cx } from '@/utils/cx'

/**
 * The site's mark: the configured logo when there is one, otherwise the first
 * letter of the site name. Shared by the landing page, the auth screens and
 * both dashboard shells so branding is identical everywhere.
 */
export function SiteMark({
  logoUrl,
  siteName,
  className,
}: {
  logoUrl?: string
  siteName: string
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cx('size-8 shrink-0 rounded-lg object-cover', className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-body-medium text-text-white',
        className,
      )}
    >
      {siteName.slice(0, 1).toUpperCase()}
    </span>
  )
}
