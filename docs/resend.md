# Resend 配置

收件与发件都依赖 Resend。以下配置在管理面板中完成，环境变量里的 `RESEND_*` 只作兜底。

## 1. API Key

在 Resend Dashboard → API Keys 创建 **Full access** 密钥。仅发件权限的 key 无法读取域名与收件内容。

## 2. 域名

1. 管理面板 → 域名 → 添加域名（建议使用子域，如 `mail.example.com`）。
2. 按页面展示的 DNS 记录在域名服务商配置：
   - **MX**：收件，优先级数字必须最小；
   - **SPF / DKIM**：发件；
   - 建议同时配置 DMARC。
3. 回到面板点击“验证”，状态变为 `verified` 后即可创建邮箱。

> 如果根域已有邮箱服务（Google Workspace、Microsoft 365 等），请务必使用子域，否则整域邮件都会转到 Resend。

## 3. Webhook

Resend Dashboard → Webhooks → 添加：

- URL：`https://你的域名/api/webhooks/resend`
- 事件：至少勾选 `email.received`，建议同时勾选 `email.sent`、`email.delivered`、`email.bounced`、`email.complained`、`email.delivery_delayed`、`email.failed`。
- 将签名密钥（`whsec_...`）填入管理面板 → Resend → Webhook Secret。

服务端会校验 svix 签名；Webhook 只包含元数据，正文会通过 Receiving API 二次拉取并按 `(resend_email_id, mailbox_id)` 幂等入库。

## 4. 系统发件

“找回密码”与“注册验证”需要发件地址。请在 Resend 验证过的域名下配置一个地址（如 `no-reply@mail.example.com`），填入管理面板 → Resend → 系统发件地址。

API Key 与系统发件地址都配置后，邮箱密码注册会自动发送验证链接；新账号未验证时，登录后会被引导到 `/verify-email` 重发或等待验证。领取 `/setup` 管理员权限的账号会自动标记为已验证，管理员也不受验证拦截，避免配置错误时锁死后台。

## 5. 附件存储（可选）

默认不落地附件内容：只保存文件名、类型、大小，下载时按需向 Resend 获取签名 URL。配置 S3 兼容存储后，收件时会自动下载并保存：

- Cloudflare R2：`Endpoint=https://<account>.r2.cloudflarestorage.com`，`Region=auto`，开启 Force path style。
- AWS S3：填写对应 Region，Endpoint 可留空。
- MinIO：填写自己的 Endpoint，开启 Force path style。
