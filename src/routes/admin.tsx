import { createFileRoute, redirect, useLocation } from '@tanstack/react-router'
import {
  RiArrowLeftLine,
  RiDashboardLine,
  RiFileList3Line,
  RiGlobalLine,
  RiInboxLine,
  RiMailCheckLine,
  RiSettings4Line,
  RiUserLine,
} from '@remixicon/react'

import { DashboardShell } from '@/components/app/dashboard-shell'
import type { DashboardNavItem } from '@/components/application/dashboard/dashboard-sidebar'

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
  const location = useLocation()
  const user = session?.user
  if (!user) return null

  return (
    <DashboardShell
      nav={NAV}
      selected={selectedKey(location.pathname)}
      homeTo="/admin"
      user={{ name: user.name, email: user.email, image: user.image }}
      site={site}
      isAdmin
    />
  )
}
