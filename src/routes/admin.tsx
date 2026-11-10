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
  RiArrowLeftLine,
  RiDashboardLine,
  RiFileList3Line,
  RiGlobalLine,
  RiInboxLine,
  RiMailCheckLine,
  RiMenuLine,
  RiSettings4Line,
  RiUserLine,
} from '@remixicon/react'

import { DashboardSidebar } from '@/components/application/dashboard/dashboard-sidebar'
import type { DashboardNavItem } from '@/components/application/dashboard/dashboard-sidebar'
import { SiteMark } from '@/components/app/site-mark'
import { Drawer } from '@/components/base/drawer/drawer'
import { IconButton } from '@/components/base/buttons/icon-button'
import { useSignOut } from '@/lib/use-sign-out'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/app' })
    }
  },
  component: AdminLayout,
})

const NAV: DashboardNavItem[] = [
  { key: 'overview', label: '概览', icon: RiDashboardLine, href: '/admin' },
  { key: 'users', label: '用户', icon: RiUserLine, href: '/admin/users' },
  {
    key: 'mailboxes',
    label: '邮箱',
    icon: RiInboxLine,
    href: '/admin/mailboxes',
  },
  { key: 'domains', label: '域名', icon: RiGlobalLine, href: '/admin/domains' },
  {
    key: 'settings',
    label: '站点设置',
    icon: RiSettings4Line,
    href: '/admin/settings',
  },
  {
    key: 'audit',
    label: '审计日志',
    icon: RiFileList3Line,
    href: '/admin/audit',
  },
  {
    key: 'ingest',
    label: '收件日志',
    icon: RiMailCheckLine,
    href: '/admin/ingest',
  },
  { key: 'back', label: '邮箱面板', icon: RiArrowLeftLine, href: '/app' },
]

function selectedKey(pathname: string) {
  if (pathname.startsWith('/admin/users')) return 'users'
  if (pathname.startsWith('/admin/mailboxes')) return 'mailboxes'
  if (pathname.startsWith('/admin/domains')) return 'domains'
  if (pathname.startsWith('/admin/settings')) return 'settings'
  if (pathname.startsWith('/admin/audit')) return 'audit'
  if (pathname.startsWith('/admin/ingest')) return 'ingest'
  return 'overview'
}

function AdminLayout() {
  const { session, site } = Route.useRouteContext()
  const router = useRouter()
  const location = useLocation()
  const signOut = useSignOut()
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = session?.user
  if (!user) return null

  const sidebar = (
    <DashboardSidebar
      items={NAV}
      selected={selectedKey(location.pathname)}
      user={{ name: user.name, email: user.email, image: user.image }}
      isAdmin
      onSettings={() => {
        setMobileOpen(false)
        void router.navigate({ to: '/app/settings' })
      }}
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
          isAdmin
          onSettings={() => void router.navigate({ to: '/app/settings' })}
          onSignOut={() => void signOut()}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-separator-border px-4 py-3 lg:hidden">
          <Link to="/admin" className="flex items-center gap-2">
            <SiteMark logoUrl={site.logoUrl} siteName={site.siteName} />
            <span className="text-body-medium text-text-primary">
              {site.siteName} 管理后台
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
