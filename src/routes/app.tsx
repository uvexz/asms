import { createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import {
  RiDashboardLine,
  RiInboxLine,
  RiMailSendLine,
  RiSendPlaneLine,
  RiSettings4Line,
} from '@remixicon/react'

import { DashboardShell } from '@/components/app/dashboard-shell'
import type { DashboardNavItem } from '@/components/application/dashboard/dashboard-sidebar'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (
      context.emailVerificationRequired &&
      context.session.user.role !== 'admin' &&
      !context.session.user.emailVerified
    ) {
      throw redirect({ to: '/verify-email' })
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
  {
    key: 'compose',
    label: '写邮件',
    icon: RiMailSendLine,
    href: '/app/compose',
  },
  { key: 'sent', label: '已发送', icon: RiSendPlaneLine, href: '/app/sent' },
  {
    key: 'settings',
    label: '设置',
    icon: RiSettings4Line,
    href: '/app/settings',
  },
]

function selectedKey(pathname: string) {
  if (
    pathname.startsWith('/app/mailboxes') ||
    pathname.startsWith('/app/inbox') ||
    pathname.startsWith('/app/temp')
  ) {
    return 'mailboxes'
  }
  if (pathname.startsWith('/app/settings')) return 'settings'
  if (pathname.startsWith('/app/compose')) return 'compose'
  if (pathname.startsWith('/app/sent')) return 'sent'
  return 'overview'
}

function AppLayout() {
  const { session, site } = Route.useRouteContext()
  const location = useLocation()
  const user = session?.user
  if (!user) return null

  return (
    <DashboardShell
      nav={NAV}
      selected={selectedKey(location.pathname)}
      homeTo="/app"
      user={{ name: user.name, email: user.email, image: user.image }}
      site={site}
      isAdmin={user.role === 'admin'}
      // The mail view is a three-pane client: it needs the full width it can get.
      wide={location.pathname.startsWith('/app/mailboxes')}
      withAdminLink
    />
  )
}
