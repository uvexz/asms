import { createFileRoute, Link, redirect } from '@tanstack/react-router'

import { LoginPanel } from '@/components/application/auth/login-panel'
import { SiteMark } from '@/components/app/site-mark'
import { authErrorMessage } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'
import { fetchPublicConfig } from '@/server/functions/auth'

export const Route = createFileRoute('/login')({
  head: headTitle('登录'),
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loader: async () => fetchPublicConfig(),
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/app' })
  },
  component: LoginPage,
})

function LoginPage() {
  const config = Route.useLoaderData()
  const { error } = Route.useSearch()

  return (
    <main className="grid min-h-dvh place-items-center bg-background-full p-6">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <Link
          to="/"
          className="flex w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <SiteMark
            logoUrl={config.logoUrl}
            siteName={config.siteName}
            className="size-7 rounded-lg text-caption-1-semibold"
          />
          <span className="text-body-medium text-text-secondary">
            {config.siteName}
          </span>
        </Link>

        <LoginPanel
          headingLevel={1}
          providers={config.providers}
          registrationEnabled={config.registrationEnabled}
          emailPasswordEnabled={config.emailPasswordEnabled}
          initialError={error ? authErrorMessage({ code: error }) : null}
        />
      </div>
    </main>
  )
}
