import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { SpaLinkHandler } from '@/components/app/spa-link-handler'
import { ThemeColor } from '@/components/app/theme-color'
import { Toaster } from '@/components/base/toast/toast'
import { queryKeys } from '@/lib/queries'
import { siteBranding, siteIcons, siteTitle } from '@/lib/site'
import { fetchShell } from '@/server/functions/auth'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  queryClient: QueryClient
  session: Awaited<ReturnType<typeof fetchShell>>['session']
  emailVerificationRequired: boolean
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    const shell = await fetchShell()
    const userId = shell.session?.user.id ?? null
    const previousOwner = context.queryClient.getQueryData<{
      id: string | null
    }>(queryKeys.authUser)
    // A session can expire and another account can sign in without a
    // sign-out. Drop the previous account's mail/admin cache before the new
    // owner's routes render.
    if (previousOwner?.id !== userId) {
      context.queryClient.clear()
      context.queryClient.setQueryData(queryKeys.authUser, { id: userId })
    }
    return {
      session: shell.session,
      site: shell.site,
      emailVerificationRequired: shell.emailVerificationRequired,
    }
  },
  head: ({ matches }) => {
    const site = siteBranding(matches)
    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          title: siteTitle(matches),
        },
        { name: 'theme-color', content: '#ffffff' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        ...siteIcons(site.logoUrl),
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    }
  },
  shellComponent: RootDocument,
})

/**
 * Runs before first paint so a dark-mode reload never flashes white. Kept
 * inline and dependency-free; ThemeToggle owns the runtime from here on.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem('boardui:theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <HeadContent />
      </head>
      <body>
        <SpaLinkHandler />
        <ThemeColor />
        {children}
        <Toaster aria-label="通知" closeLabel="关闭通知" />
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
