import { createFileRoute, Link, redirect } from '@tanstack/react-router'

import { LoginPanel } from '@/components/application/auth/login-panel'
import { fetchPublicConfig } from '@/server/functions/auth'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: '登录 · asms' }] }),
  loader: async () => fetchPublicConfig(),
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/app' })
  },
  component: LoginPage,
})

function LoginPage() {
  const config = Route.useLoaderData()

  return (
    <main className="grid min-h-dvh place-items-center bg-background-full p-6">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <Link
          to="/"
          className="flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          {config.logoUrl ? (
            <img
              src={config.logoUrl}
              alt=""
              className="size-7 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent-600 text-caption-1-semibold text-text-white">
              {config.siteName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="text-body-medium text-text-secondary">
            {config.siteName}
          </span>
        </Link>

        <LoginPanel
          headingLevel={1}
          providers={config.providers}
          registrationEnabled={config.registrationEnabled}
          emailPasswordEnabled={config.emailPasswordEnabled}
        />
      </div>
    </main>
  )
}
