type AuthErrorLike = {
  code?: string
  message?: string
  status?: number
  statusText?: string
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确',
  INVALID_PASSWORD: '密码不正确',
  INVALID_EMAIL: '邮箱格式不正确',
  USER_ALREADY_EXISTS: '这个邮箱已经注册过了',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '这个邮箱已经注册过了',
  PASSWORD_TOO_SHORT: '密码至少需要 8 位',
  PASSWORD_TOO_LONG: '密码太长了',
  INVALID_TOKEN: '链接已失效，请重新发起',
  TOKEN_EXPIRED: '链接已过期，请重新发起',
  SESSION_EXPIRED: '登录状态已过期，请重新登录',
  EMAIL_NOT_VERIFIED: '请先验证邮箱后再登录',
  SIGNUP_DISABLED: '站点暂未开放注册',
  RATE_LIMITED: '尝试次数过多，请稍后再试',
  TOO_MANY_REQUESTS: '尝试次数过多，请稍后再试',
}

/**
 * Better Auth returns English messages from the server. The product is in
 * Chinese, so map the codes we know and never surface a raw English string in
 * the interface. Unknown messages that are already Chinese pass through.
 */
export function authErrorMessage(error?: AuthErrorLike | null): string {
  if (!error) return '操作没有完成，请稍后再试'
  const byCode = error.code ? MESSAGES[error.code] : undefined
  if (byCode) return byCode
  const message = error.message?.trim()
  if (message && /[\u4e00-\u9fff]/.test(message)) return message
  if (error.status === 429) return MESSAGES.RATE_LIMITED
  return '操作没有完成，请稍后再试'
}
