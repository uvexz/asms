import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { SpaLinkHandler } from '@/components/app/spa-link-handler'
import { Toaster } from '@/components/base/toast/toast'
import { fetchSession } from '@/server/functions/auth'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  queryClient: QueryClient
  session: Awaited<ReturnType<typeof fetchSession>>
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => ({
    session: await fetchSession(),
  }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'asms · 自托管邮箱',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
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
