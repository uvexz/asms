import type { ReactNode } from 'react'

/**
 * The shared card for the auth flow outside the sign-in/sign-up card
 * (recover, reset, first-run setup). Same width, radius, shadow and padding
 * as the sign-in panel, so the whole journey feels like one surface.
 */
export function AuthShell({
  title,
  description,
  brand,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  brand?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background-full p-6">
      <div className="w-full max-w-[400px]">
        {brand ? <div className="mb-5 flex justify-center">{brand}</div> : null}
        <div className="flex w-full flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs sm:p-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-title-2-medium text-text-primary">{title}</h1>
            {description ? (
              <p className="text-body-regular text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-col gap-4">{children}</div>
        </div>
        {footer ? (
          <p className="mt-4 text-center text-caption-1-regular text-text-tertiary">
            {footer}
          </p>
        ) : null}
      </div>
    </main>
  )
}
