'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
} from '@remixicon/react'
import { FieldError } from 'react-aria-components'

import { ProviderButtons } from '@/components/application/auth/provider-buttons'
import { Button } from '@/components/base/buttons/button'
import { LinkButton } from '@/components/base/buttons/link-button'
import { Checkbox } from '@/components/base/checkbox/checkbox'
import { Divider } from '@/components/base/divider/divider'
import { hintTextClassName } from '@/components/base/input/hint-text'
import { Input, InputBase, TextField } from '@/components/base/input/input'
import { Label } from '@/components/base/input/label'
import { Spinner } from '@/components/base/spinner/spinner'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { cx } from '@/utils/cx'

/**
 * The sign-in form. Used both inside the landing hero and on `/login`, so the
 * two never drift apart.
 *
 * Validation is ours, not the browser's: `noValidate` keeps the message
 * language and placement consistent across browsers, errors are wired to the
 * fields through React Aria's FieldError, and a failed submit moves focus to
 * the field that needs fixing. Server errors land in a `role="alert"` strip
 * above the form.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Field shells keep the system's ring for shape, but a sign-in form needs the
 * focus state to be unmistakable: the accent ring when the value is fine, the
 * error ring when the field is the one being corrected. `has()` keeps the two
 * from fighting; the base input leaves invalid fields with no ring at all.
 */
const FIELD_RING =
  'focus-within:not-has-[[aria-invalid=true]]:ring-border-focus-ring focus-within:has-[[aria-invalid=true]]:ring-border-error-default'

const FIELD_SIZE = 'h-11 sm:h-9'

type FieldErrors = { email?: string; password?: string }
type Status = 'idle' | 'submitting' | 'success'

export interface LoginPanelProps {
  /** Provider ids enabled in settings, e.g. `['github']`. */
  providers: string[]
  registrationEnabled: boolean
  emailPasswordEnabled: boolean
  /** The site can deliver verification mail, so unverified accounts are held. */
  emailVerificationRequired: boolean
  /** Message left behind by a failed OAuth round-trip, shown above the form. */
  initialError?: string | null
  /** `1` on `/login`, where the card is the page; `2` inside the hero. */
  headingLevel?: 1 | 2
  className?: string
}

export function LoginPanel({
  providers,
  registrationEnabled,
  emailPasswordEnabled,
  emailVerificationRequired,
  initialError,
  headingLevel = 2,
  className,
}: LoginPanelProps) {
  const router = useRouter()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(initialError ?? null)
  const [status, setStatus] = useState<Status>('idle')

  const busy = status !== 'idle'
  const Heading = `h${headingLevel}` as const

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const trimmedEmail = email.trim()
    const nextErrors: FieldErrors = {}
    if (!trimmedEmail) nextErrors.email = '请输入邮箱地址'
    else if (!EMAIL_PATTERN.test(trimmedEmail))
      nextErrors.email = '邮箱格式不对，检查一下 @ 前后'

    if (!password) nextErrors.password = '请输入密码'

    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors)
      setFormError(null)
      if (nextErrors.email) emailRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }

    setErrors({})
    setFormError(null)
    setStatus('submitting')

    const { data, error } = await authClient.signIn.email({
      email: trimmedEmail,
      password,
      rememberMe: remember,
    })

    if (error) {
      setStatus('idle')
      setFormError(authErrorMessage(error))
      passwordRef.current?.focus()
      return
    }

    setStatus('success')
    const role = (data?.user as { role?: string } | undefined)?.role
    const unverified =
      emailVerificationRequired &&
      role !== 'admin' &&
      data?.user.emailVerified === false
    // Let the check land before the page changes under the pointer. The
    // session refresh comes after, so it never flashes the signed-in card
    // over a form the visitor is still looking at.
    await new Promise((resolve) => setTimeout(resolve, 420))
    await router.invalidate()
    if (unverified) await router.navigate({ to: '/verify-email' })
    else if (role === 'admin') await router.navigate({ to: '/admin' })
    else await router.navigate({ to: '/app' })
  }

  return (
    <div
      className={cx(
        'landing-panel relative overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-sm',
        className,
      )}
    >
      {/* Envelope seal, drawn once on arrival. */}
      <span
        aria-hidden
        className="landing-seal absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent-500 to-transparent"
      />

      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-1.5">
          <Heading className="text-title-1-medium text-text-primary">
            登录
          </Heading>
          <p className="text-body-regular text-text-secondary">
            回到你的收件箱。
          </p>
        </div>

        <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
          {formError ? (
            <div
              role="alert"
              className="landing-alert flex items-start gap-2 rounded-2lg border border-border-error-default bg-background-tertiary-error px-3 py-2.5"
            >
              <RiErrorWarningLine
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-text-error-primary"
              />
              <p className="text-body-regular text-text-error-primary">
                {formError}
              </p>
            </div>
          ) : null}

          {emailPasswordEnabled ? (
            <>
              <Input
                ref={emailRef}
                name="email"
                type="email"
                label="邮箱"
                placeholder="you@example.com"
                autoComplete="email"
                isRequired
                value={email}
                onChange={(value) => {
                  setEmail(value)
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
                }}
                isInvalid={Boolean(errors.email)}
                errorMessage={errors.email}
                fieldClassName={cx(FIELD_SIZE, FIELD_RING)}
              />

              <TextField
                name="password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                isRequired
                value={password}
                onChange={(value) => {
                  setPassword(value)
                  if (errors.password)
                    setErrors((prev) => ({ ...prev, password: undefined }))
                }}
                isInvalid={Boolean(errors.password)}
              >
                {({ isRequired, isInvalid }) => (
                  <>
                    <div className="flex w-full items-center justify-between gap-3">
                      <Label isRequired={isRequired}>密码</Label>
                      <LinkButton
                        href="/forgot-password"
                        size="small"
                        className="py-1"
                      >
                        忘记密码？
                      </LinkButton>
                    </div>
                    <InputBase
                      ref={passwordRef}
                      placeholder="输入密码"
                      fieldClassName={cx(FIELD_SIZE, 'pe-1', FIELD_RING)}
                      trailingAddon={
                        <button
                          type="button"
                          onClick={() => setReveal((value) => !value)}
                          aria-label={reveal ? '隐藏密码' : '显示密码'}
                          className="me-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-icon-tertiary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                        >
                          {reveal ? (
                            <RiEyeOffLine aria-hidden className="size-[18px]" />
                          ) : (
                            <RiEyeLine aria-hidden className="size-[18px]" />
                          )}
                        </button>
                      }
                    />
                    {isInvalid ? (
                      <FieldError className={hintTextClassName(true)}>
                        {errors.password}
                      </FieldError>
                    ) : null}
                  </>
                )}
              </TextField>

              <Checkbox size="sm" isSelected={remember} onChange={setRemember}>
                记住我
              </Checkbox>

              <Button
                type="submit"
                className="mt-1 h-11 w-full"
                disabled={busy}
                aria-busy={status === 'submitting'}
              >
                {status === 'submitting' ? (
                  <>
                    <Spinner size="sm" aria-hidden className="me-1.5" />
                    正在登录
                  </>
                ) : status === 'success' ? (
                  <>
                    <RiCheckLine aria-hidden className="me-1.5 size-[18px]" />
                    已登录
                  </>
                ) : (
                  '登录'
                )}
              </Button>
            </>
          ) : providers.length === 0 ? (
            <p className="text-body-regular text-text-secondary">
              站点还没有开启登录方式，请联系管理员。
            </p>
          ) : null}

          {providers.length > 0 ? (
            <>
              {emailPasswordEnabled ? (
                <div className="mt-1">
                  <Divider>或使用第三方登录</Divider>
                </div>
              ) : null}
              <ProviderButtons providers={providers} />
            </>
          ) : null}
        </form>

        {/* With email + password off there is no registration form to point
            at: the first third-party sign-in is the sign-up. */}
        {!registrationEnabled ? (
          <p className="mt-6 text-center text-caption-1-regular text-text-tertiary">
            自助注册已关闭，请联系管理员。
          </p>
        ) : emailPasswordEnabled ? (
          <p className="mt-6 text-center text-body-regular text-text-secondary">
            还没有账号？{' '}
            <LinkButton href="/register" size="small" className="py-1">
              创建账号
            </LinkButton>
          </p>
        ) : null}
      </div>
    </div>
  )
}
