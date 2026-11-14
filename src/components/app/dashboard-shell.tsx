'use client'

import { Link, Outlet, useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { RiMenuLine } from '@remixicon/react'

import { DashboardSidebar } from '@/components/application/dashboard/dashboard-sidebar'
import type { DashboardNavItem } from '@/components/application/dashboard/dashboard-sidebar'
import { SiteMark } from '@/components/app/site-mark'
import { Drawer } from '@/components/base/drawer/drawer'
import { IconButton } from '@/components/base/buttons/icon-button'
import { useSignOut } from '@/lib/use-sign-out'
import { cx } from '@/utils/cx'

/**
 * The signed-in frame: skip link, sidebar (floating on desktop, in a drawer on
 * phones), a compact header, and `<Outlet />`.
 *
 * The app shell and the admin shell are the same surface with a different
 * navigation list, so they share this instead of two copies that drift. The
 * only differences are which routes exist, the mobile brand suffix, and
 * whether the account menu offers the admin console.
 */
export function DashboardShell({
  nav,
  selected,
  homeTo,
  user,
  site,
  isAdmin = false,
  wide = false,
  withAdminLink = false,
}: {
  nav: DashboardNavItem[]
  /** Which nav row paints its selected state. */
  selected: string
  homeTo: '/app' | '/admin'
  user: { name: string; email: string; image?: string | null }
  site: { siteName: string; logoUrl: string }
  isAdmin?: boolean
  /** Let the page use the full width (the three-pane mail view). */
  wide?: boolean
  /** Offer "管理后台" in the account menu (hidden inside the console itself). */
  withAdminLink?: boolean
}) {
  const router = useRouter()
  const location = useLocation()
  const signOut = useSignOut()
  const [mobileOpen, setMobileOpen] = useState(false)

  // The drawer is a full-screen overlay: leaving it open after a navigation
  // hides the page the user just asked for.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const sidebar = (mobile: boolean) => (
    <DashboardSidebar
      items={nav}
      selected={selected}
      user={user}
      isAdmin={isAdmin}
      onSettings={() => {
        if (mobile) setMobileOpen(false)
        void router.navigate({ to: '/app/settings' })
      }}
      onAdmin={
        isAdmin && withAdminLink
          ? () => {
              if (mobile) setMobileOpen(false)
              void router.navigate({ to: '/admin' })
            }
          : undefined
      }
      onSignOut={() => void signOut()}
      mobile={mobile}
      flat={mobile}
      onClose={mobile ? () => setMobileOpen(false) : undefined}
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
        {sidebar(false)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-separator-border px-4 py-3 lg:hidden">
          <Link to={homeTo} className="flex items-center gap-2">
            <SiteMark logoUrl={site.logoUrl} siteName={site.siteName} />
            <span className="text-body-medium text-text-primary">
              {site.siteName}
              {homeTo === '/admin' ? ' 管理后台' : null}
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
          className={cx(
            'mx-auto w-full flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8',
            wide ? 'max-w-none' : 'max-w-6xl',
          )}
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
        <div className="h-full">{sidebar(true)}</div>
      </Drawer>
    </div>
  )
}
