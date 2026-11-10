/**
 * Display labels for values that only exist on the server. Admin-facing
 * screens should not make people translate `no_mailbox` or `settings.update`
 * in their head, and a missing target id must not render as `settings:`.
 */

const INGEST_RESULTS: Record<string, { label: string; hint: string }> = {
  stored: { label: '已入库', hint: '邮件已保存到对应收件箱' },
  duplicate: { label: '重复投递', hint: '同一封邮件已经入库过' },
  no_mailbox: { label: '未命中邮箱', hint: '收件地址不存在或已被删除' },
  mailbox_expired: { label: '邮箱已过期', hint: '临时邮箱超过有效期' },
  mailbox_disabled: { label: '邮箱已停用', hint: '地址存在但当前不可收件' },
  content_fetch_failed: {
    label: '正文获取失败',
    hint: '向 Resend 拉取正文时出错',
  },
}

export function ingestResultLabel(value: string) {
  return INGEST_RESULTS[value] ?? { label: value, hint: '' }
}

const AUDIT_ACTIONS: Record<string, string> = {
  'setup.claim_admin': '领取管理员',
  'settings.update': '更新站点设置',
  'oauth.update': '更新登录方式',
  'user.role': '修改用户角色',
  'user.ban': '封禁用户',
  'user.unban': '解封用户',
  'domain.add': '添加域名',
  'domain.verify': '验证域名',
  'domain.default': '设为默认域名',
  'domain.update': '修改域名设置',
  'domain.remove': '删除域名',
  'mailbox.delete': '删除邮箱',
}

export function auditActionLabel(action: string) {
  return AUDIT_ACTIONS[action] ?? action
}

const DOMAIN_STATUS: Record<string, string> = {
  verified: '已验证',
  pending: '待验证',
  not_started: '未开始',
  failed: '验证失败',
  temporary_failure: '暂时失败',
}

export function domainStatusLabel(status: string) {
  return DOMAIN_STATUS[status] ?? status
}

const TARGET_TYPES: Record<string, string> = {
  user: '用户',
  domain: '域名',
  mailbox: '邮箱',
  message: '邮件',
  settings: '站点设置',
  oauth: '登录方式',
}

export function auditTargetLabel(type?: string | null, id?: string | null) {
  if (!type) return '—'
  const label = TARGET_TYPES[type] ?? type
  return id ? `${label} · ${id}` : label
}

/** `["a@b.com","c@d.com"]` → `a@b.com、c@d.com`; malformed input falls back. */
export function formatRecipients(json: string) {
  try {
    const parsed: unknown = JSON.parse(json)
    if (Array.isArray(parsed)) {
      const addresses = parsed.filter(
        (value): value is string => typeof value === 'string',
      )
      if (addresses.length > 0) return addresses.join('、')
    }
  } catch {
    // Keep the raw value; it is still better than hiding the row.
  }
  return json
}
