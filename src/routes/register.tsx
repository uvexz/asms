import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RiEyeLine, RiEyeOffLine } from '@remixicon/react'
import { FieldError } from 'react-aria-components'

import { AuthClosed } from '@/components/application/auth/auth-closed'
import { AuthShell } from '@/components/application/auth/auth-shell'
import { ProviderButtons } from '@/components/application/auth/provider-buttons'
import { SiteMark } from '@/components/app/site-mark'
import { Button } from '@/components/base/buttons/button'
import { LinkButton } from '@/components/base/buttons/link-button'
import { Divider } from '@/components/base/divider/divider'
import { hintTextClassName } from '@/components/base/input/hint-text'
import { Input, InputBase, TextField } from '@/components/base/input/input'
import { Label } from '@/components/base/input/label'
import { toast } from '@/components/base/toast/toast'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { headTitle } from '@/lib/site'
import { fetchPublicConfig, fetchSetupStatus } from '@/server/functions/auth'

export const Route = createFileRoute('/register')({
  head: headTitle('创建账号'),
  loader: async () => fetchPublicConfig(),
  beforeLoad: ({ context }) => {
    if (!context.session) return
    const needsVerification =
      context.emailVerificationRequired &&
      context.session.user.role !== 'admin' &&
      !context.session.user.emailVerified
    throw redirect({ to: needsVerification ? '/verify-email' : '/app' })
  },
  component: RegisterPage,
})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FIELD_RING =
  'focus-within:not-has-[[aria-invalid=true]]:ring-border-focus-ring focus-within:has-[[aria-invalid=true]]:ring-border-error-default'
const FIELD_SIZE = 'h-11 sm:h-9'

type FieldErrors = { name?: string; email?: string; password?: string }

function RegisterPage() {
  const config = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const nextErrors: FieldErrors = {}
    if (!trimmedName) nextErrors.name = '请输入昵称'
    if (!trimmedEmail) nextErrors.email = '请输入邮箱地址'
    else if (!EMAIL_PATTERN.test(trimmedEmail))
      nextErrors.email = '邮箱格式不对，检查一下 @ 前后'
    if (password.length < 8) nextErrors.password = '密码至少需要 8 位'

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      if (nextErrors.name) nameRef.current?.focus()
      else if (nextErrors.email) emailRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }

    setErrors({})
    setPending(true)
    const { data, error } = await authClient.signUp.email({
      name: trimmedName,
      email: trimmedEmail,
      password,
      callbackURL: `${window.location.origin}/verify-email?verified=1`,
    })
    setPending(false)

    if (error) {
      toast.error('注册失败', { description: authErrorMessage(error) })
      return
    }

    await router.invalidate()
    const status = await fetchSetupStatus()
    if (status.needsSetup) {
      await router.navigate({ to: '/setup' })
      return
    }
    if (
      config.emailVerificationRequired &&
      data?.user.emailVerified === false
    ) {
      await router.navigate({ to: '/verify-email' })
      return
    }
    await router.navigate({ to: '/app' })
  }

  const brand = (
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
  )

  if (!config.registrationEnabled) {
    return (
      <AuthClosed
        title="注册暂未开放"
        description="站点管理员已关闭自助注册。如果你已有账号，可以直接登录。"
        brand={brand}
      />
    )
  }

  // Email + password is a sign-in method the admin can switch off. With it off
  // there is no credential to create here — the first third-party sign-in is
  // the sign-up — so the page keeps the providers and drops the form rather
  // than offering what the server would refuse.
  if (!config.emailPasswordEnabled) {
    return (
      <AuthShell
        title={`创建 ${config.siteName} 账号`}
        description={
          config.providers.length > 0
            ? '用第三方账号登录，首次登录即创建账号。'
            : undefined
        }
        brand={brand}
        footer={
          <>
            已有账号？{' '}
            <LinkButton href="/login" size="small" className="py-1">
              去登录
            </LinkButton>
          </>
        }
      >
        {config.providers.length > 0 ? (
          <ProviderButtons providers={config.providers} />
        ) : (
          <p className="text-body-regular text-text-secondary">
            站点还没有开启登录方式，请联系管理员。
          </p>
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={`创建 ${config.siteName} 账号`}
      description="账号邮箱仅用于登录，不会作为收件地址。"
      brand={brand}
      footer={
        <>
          已有账号？{' '}
          <LinkButton href="/login" size="small" className="py-1">
            去登录
          </LinkButton>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Input
          ref={nameRef}
          name="name"
          label="昵称"
          placeholder="你的昵称"
          autoComplete="name"
          isRequired
          value={name}
          onChange={(value) => {
            setName(value)
            if (errors.name)
              setErrors((current) => ({ ...current, name: undefined }))
          }}
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name}
          fieldClassName={`${FIELD_SIZE} ${FIELD_RING}`}
        />

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
            if (errors.email)
              setErrors((current) => ({ ...current, email: undefined }))
          }}
          isInvalid={Boolean(errors.email)}
          errorMessage={errors.email}
          fieldClassName={`${FIELD_SIZE} ${FIELD_RING}`}
        />

        <TextField
          name="password"
          type={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          isRequired
          value={password}
          onChange={(value) => {
            setPassword(value)
            if (errors.password)
              setErrors((current) => ({ ...current, password: undefined }))
          }}
          isInvalid={Boolean(errors.password)}
        >
          {({ isRequired, isInvalid }) => (
            <>
              <Label isRequired={isRequired}>密码</Label>
              <InputBase
                ref={passwordRef}
                placeholder="至少 8 位"
                fieldClassName={`${FIELD_SIZE} pe-1 ${FIELD_RING}`}
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

        <Button
          type="submit"
          className="mt-1 h-11 w-full"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? '创建中…' : '创建账号'}
        </Button>
      </form>

      {config.providers.length > 0 ? (
        <>
          <div className="my-5">
            <Divider>或使用第三方登录</Divider>
          </div>
          <ProviderButtons providers={config.providers} />
        </>
      ) : null}
    </AuthShell>
  )
}
