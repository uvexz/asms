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
  SESSION_NOT_FRESH: '登录状态已过期，请重新登录',
  EMAIL_NOT_VERIFIED: '请先验证邮箱后再登录',
  EMAIL_ALREADY_VERIFIED: '邮箱已经验证过了',
  EMAIL_MISMATCH: '邮箱与当前账号不一致',
  VERIFICATION_EMAIL_NOT_ENABLED: '当前站点未开启邮箱验证',
  USER_NOT_FOUND: '没有找到这个账号',
  SIGNUP_DISABLED: '站点暂未开放注册',
  RATE_LIMITED: '尝试次数过多，请稍后再试',
  TOO_MANY_REQUESTS: '尝试次数过多，请稍后再试',
  // Third-party sign-in and account linking.
  PROVIDER_NOT_FOUND: '站点没有开启这种方式登录',
  EMAIL_NOT_FOUND: '第三方账号没有返回邮箱地址',
  ACCOUNT_NOT_LINKED: '这个第三方账号还没有绑定，请先用其他方式登录',
  ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER: '该第三方账号已绑定到另一个用户',
  EMAIL_DOES_NOT_MATCH: '第三方账号的邮箱与当前账号不一致',
  UNABLE_TO_LINK_ACCOUNT: '无法绑定这个账号，请稍后再试',
  FAILED_TO_UNLINK_LAST_ACCOUNT: '这是唯一的登录方式，无法解绑',
  NO_CODE: '授权已取消，请重新发起',
  STATE_NOT_FOUND: '授权流程已失效，请重新发起',
  INVALID_CALLBACK_REQUEST: '授权流程已失效，请重新发起',
  ACCESS_DENIED: '授权已取消',
}

/**
 * A request that never produced an answer: offline, timed out, or the
 * connection dropped mid-flight. Server functions resolve a `Result` instead
 * of rejecting, so a rejection here always means transport, never a rule the
 * user broke — the wording must not blame them.
 */
export const NETWORK_ERROR_MESSAGE = '网络异常，请检查连接后重试'

/**
 * Better Auth returns English messages from the server. The product is in
 * Chinese, so map the codes we know and never surface a raw English string in
 * the interface. Unknown messages that are already Chinese pass through.
 */
export function authErrorMessage(error?: AuthErrorLike | null): string {
  if (!error) return '操作没有完成，请稍后再试'
  const code = error.code?.trim()
  const byCode = code
    ? (MESSAGES[code] ?? MESSAGES[code.toUpperCase()])
    : undefined
  if (byCode) return byCode
  const message = error.message?.trim()
  if (message && /[\u4e00-\u9fff]/.test(message)) return message
  if (error.status === 429) return MESSAGES.RATE_LIMITED
  return '操作没有完成，请稍后再试'
}
