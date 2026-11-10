import { AuthShell } from '@/components/application/auth/auth-shell'
import { ButtonLink } from '@/components/base/buttons/button'

/**
 * What a route renders when the method it exists for has been switched off —
 * self-service sign-up, password recovery, password reset. Same shell as the
 * form it replaces, one sentence on what changed, and the only action left
 * that goes anywhere: back to sign-in.
 *
 * A card rather than a redirect, because a link a visitor already had (a reset
 * mail, a bookmark) should say why it stopped working instead of silently
 * landing them somewhere else.
 */
export function AuthClosed({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <AuthShell title={title} description={description}>
      <ButtonLink href="/login">前往登录</ButtonLink>
    </AuthShell>
  )
}
