import { useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  RiArrowLeftLine,
  RiErrorWarningLine,
  RiQuestionLine,
} from '@remixicon/react'

import { Button, ButtonLink } from '@/components/base/buttons/button'

function RouteStateShell({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background-full p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-background-secondary-default text-foreground-icon-secondary">
          {icon}
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-title-2-semibold text-text-primary">{title}</h1>
          <p className="text-body-regular text-text-secondary">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      </div>
    </main>
  )
}

export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <RouteStateShell
      icon={<RiErrorWarningLine className="size-6" aria-hidden />}
      title="页面出了点问题"
      description="这次加载没有完成。可以重试，或回到首页重新开始。"
    >
      <Button onClick={reset}>重试</Button>
      <ButtonLink href="/" variant="secondary">
        回首页
      </ButtonLink>
      <Button
        variant="secondary"
        leadingIcon={RiArrowLeftLine}
        onClick={() => router.history.back()}
      >
        返回上一页
      </Button>
    </RouteStateShell>
  )
}

export function RouteNotFound() {
  const router = useRouter()

  return (
    <RouteStateShell
      icon={<RiQuestionLine className="size-6" aria-hidden />}
      title="页面不存在"
      description="链接可能已经失效，或者这个页面从未存在过。"
    >
      <ButtonLink href="/">回首页</ButtonLink>
      <Button
        variant="secondary"
        leadingIcon={RiArrowLeftLine}
        onClick={() => router.history.back()}
      >
        返回上一页
      </Button>
    </RouteStateShell>
  )
}
