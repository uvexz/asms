'use client'

import { RiShieldKeyholeLine } from '@remixicon/react'

import { SocialButton } from '@/components/base/social-button/social-button'
import { authClient } from '@/lib/auth-client'
import { isBrandProvider, providerLabel } from '@/lib/oauth-providers'
import { cx } from '@/utils/cx'

/**
 * One stacked button per enabled provider: the brand mark where we ship one,
 * a keyhole for a plain OIDC provider. The sign-in panel and the provider-only
 * sign-up page render the same thing, so neither can list a different set of
 * providers or start OAuth with different callbacks.
 */
export function ProviderButtons({
  providers,
  callbackURL = '/app',
  errorCallbackURL = '/login',
  className,
}: {
  providers: string[]
  /** Where the provider returns a signed-in visitor. */
  callbackURL?: string
  /** Where a failed round-trip lands, carrying `?error=` for the panel. */
  errorCallbackURL?: string
  className?: string
}) {
  return (
    <div className={cx('flex flex-col gap-2.5', className)}>
      {providers.map((provider) => {
        const brand = isBrandProvider(provider)
        const label = providerLabel(provider)
        return (
          <SocialButton
            key={provider}
            brand={brand ? provider : 'custom'}
            config={
              brand
                ? undefined
                : {
                    label,
                    icon: (
                      <RiShieldKeyholeLine
                        aria-hidden
                        className="size-[18px]"
                      />
                    ),
                  }
            }
            appearance="white"
            fullWidth
            onClick={() => {
              void authClient.signIn.social({
                provider,
                callbackURL,
                errorCallbackURL,
              })
            }}
          >
            使用 {label} 登录
          </SocialButton>
        )
      })}
    </div>
  )
}
