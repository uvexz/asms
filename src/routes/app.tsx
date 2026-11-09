import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import {
  RiDashboardLine,
  RiInboxLine,
  RiMailSendLine,
  RiMenuLine,
  RiSendPlaneLine,
  RiTimeLine,
} from '@remixicon/react'

import { DashboardSidebar } from '@/components/application/dashboard/dashboard-sidebar'
import type { DashboardNavItem } from '@/components/application/dashboard/dashboard-sidebar'
import { SiteMark } from '@/components/app/site-mark'
import { Drawer } from '@/components/base/drawer/drawer'
import { IconButton } from '@/components/base/buttons/icon-button'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: AppLayout,
})

const NAV: DashboardNavItem[] = [
  { key: 'overview', label: '概览', icon: RiDashboardLine, href: '/app' },
  {
    key: 'mailboxes',
    label: '邮箱',
    icon: RiInboxLine,
    href: '/app/mailboxes',
  },
  { key: 'temp', label: '临时邮箱', icon: RiTimeLine, href: '/app/temp' },
  {
    key: 'compose',
    label: '写邮件',
    icon: RiMailSendLine,
    href: '/app/compose',
  },
  { key: 'sent', label: '已发送', icon: RiSendPlaneLine, href: '/app/sent' },
]

function selectedKey(pathname: string) {
  if (
    pathname.startsWith('/app/mailboxes') ||
    pathname.startsWith('/app/inbox')
  ) {
    return 'mailboxes'
  }
  if (pathname.startsWith('/app/temp')) return 'temp'
  if (pathname.startsWith('/app/settings')) return 'settings'
  if (pathname.startsWith('/app/compose')) return 'compose'
  if (pathname.startsWith('/app/sent')) return 'sent'
  return 'overview'
}

function AppLayout() {
  const { session, site } = Route.useRouteContext()
  const router = useRouter()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const user = session?.user
  if (!user) return null

  const signOut = async () => {
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: '/login' })
  }

  const sidebar = (
    <DashboardSidebar
      items={NAV}
      selected={selectedKey(location.pathname)}
      user={{ name: user.name, email: user.email, image: user.image }}
      isAdmin={user.role === 'admin'}
      siteName={site.siteName}
      siteLogoUrl={site.logoUrl}
      onSettings={() => {
        setMobileOpen(false)
        void router.navigate({ to: '/app/settings' })
      }}
      onAdmin={
        user.role === 'admin'
          ? () => {
              setMobileOpen(false)
              void router.navigate({ to: '/admin' })
            }
          : undefined
      }
      onSignOut={() => void signOut()}
      mobile
      flat
      onClose={() => setMobileOpen(false)}
    />
  )

  return (
    <div className="flex min-h-dvh gap-3 bg-background-full p-0 lg:p-3">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-100 focus:rounded-lg focus:bg-background-primary-default focus:px-3 focus:py-2 focus:text-body-medium focus:text-text-primary focus:shadow-dropdown focus:outline-none focus:ring-2 focus:ring-border-focus-ring"
      >
        跳到主要内容
      </a>
      <div className="sticky top-3 hidden h-[calc(100dvh-24px)] lg:block">
        <DashboardSidebar
          items={NAV}
          selected={selectedKey(location.pathname)}
          user={{ name: user.name, email: user.email, image: user.image }}
          isAdmin={user.role === 'admin'}
          siteName={site.siteName}
          siteLogoUrl={site.logoUrl}
          onSettings={() => void router.navigate({ to: '/app/settings' })}
          onAdmin={
            user.role === 'admin'
              ? () => void router.navigate({ to: '/admin' })
              : undefined
          }
          onSignOut={() => void signOut()}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-separator-border px-4 py-3 lg:hidden">
          <Link to="/app" className="flex items-center gap-2">
            <SiteMark logoUrl={site.logoUrl} siteName={site.siteName} />
            <span className="text-body-medium text-text-primary">
              {site.siteName}
            </span>
          </Link>
          <IconButton
            aria-label="打开导航"
            icon={RiMenuLine}
            onClick={() => setMobileOpen(true)}
          />
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8"
        >
          <Outlet />
        </main>
      </div>

      <Drawer
        isOpen={mobileOpen}
        onOpenChange={setMobileOpen}
        placement="start"
        size="sm"
        aria-label="主导航"
        className="h-full p-0"
      >
        <div className="h-full">{sidebar}</div>
      </Drawer>
    </div>
  )
}
