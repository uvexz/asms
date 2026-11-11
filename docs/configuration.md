# 配置参考

## 环境变量

| 变量                           | 必填     | 说明                                                                          |
| ------------------------------ | -------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                 | 是       | 本地 `file:dev.db`；线上 `libsql://xxx.turso.io`                              |
| `DATABASE_AUTH_TOKEN`          | 线上必填 | Turso 数据库令牌                                                              |
| `BETTER_AUTH_URL`              | 是       | 站点完整 URL，如 `https://mail.example.com`                                   |
| `BETTER_AUTH_SECRET`           | 是       | Better Auth 会话签名密钥                                                      |
| `ASMS_ENCRYPTION_KEY`          | 是       | AES-256-GCM 密钥；生产环境缺失会拒绝启动                                      |
| `ASMS_ENCRYPTION_KEY_PREVIOUS` | 否       | 轮换期间保留的旧密钥，逗号分隔，仅用于解密                                    |
| `SETUP_TOKEN`                  | 生产必填 | 初始化管理员口令；生产环境未设置时无法领取管理员                              |
| `CRON_SECRET`                  | 定时必填 | `/api/cron/cleanup` 的 Bearer 口令；未设置时接口一律拒绝                      |
| `IP_ADDRESS_HEADERS`           | 否       | 可信客户端 IP 头，逗号分隔；默认 `cf-connecting-ip,x-real-ip,x-forwarded-for` |
| `TRUSTED_PROXIES`              | 否       | 可信代理 CIDR，逗号分隔，用于解析多级 `x-forwarded-for`                       |
| `RESEND_API_KEY`               | 否       | 仅作兜底；面板配置优先                                                        |
| `RESEND_WEBHOOK_SECRET`        | 否       | 仅作兜底；面板配置优先                                                        |
| `OIDC_ISSUER`                  | 否       | sb.sb 登录的 issuer，如 `https://sb.sb/oidc`                                  |
| `OIDC_CLIENT_ID`               | 否       | 配合 `OIDC_ISSUER` 使用；面板保存后以面板为准                                 |
| `OIDC_CLIENT_SECRET`           | 否       | 同上                                                                          |
| `OIDC_REDIRECT_URI`            | 否       | 默认 `<BETTER_AUTH_URL>/api/auth/callback/sb`                                 |
| `OIDC_SCOPES`                  | 否       | 默认 `openid profile email offline_access`                                    |
| `TELEGRAM_BOT_TOKEN`           | Bot 启用 | @BotFather 的 Bot Token                                                       |
| `TELEGRAM_BOT_USERNAME`        | Bot 启用 | 不带 `@`，用于生成 `t.me` 深链与设置页                                        |
| `TELEGRAM_WEBHOOK_SECRET`      | Bot 启用 | `setWebhook` 的 secret_token；仅 `A-Za-z0-9_-`                                |
| `TELEGRAM_WEBHOOK_URL`         | 否       | 默认 `<BETTER_AUTH_URL>/api/telegram/webhook`                                 |
| `TELEGRAM_BODY_PAGE_CHARS`     | 否       | 正文每页字符上限，默认 420                                                    |
| `TELEGRAM_BODY_PAGE_BYTES`     | 否       | 正文每页 UTF-8 字节上限，默认 700                                             |
| `PORT`                         | 否       | Node 服务端口，默认 3000                                                      |

`OIDC_*` 只在面板里还没有保存过 sb.sb 时生效：保存（或关闭）后完全以数据库为准。回调地址需在 sb.sb 登记为 `<BETTER_AUTH_URL>/api/auth/callback/sb`；scope 必须包含 `email`，否则第三方账号不会返回登录邮箱。

## 数据库

本地使用 libSQL 文件，线上使用 Turso，同一套 Drizzle schema：

```bash
bun run db:generate   # 生成迁移到 drizzle/
bun run db:push       # 开发环境直接同步
bun run db:migrate    # 生产环境执行迁移（读取 DATABASE_URL / DATABASE_AUTH_TOKEN）
```

Turso 示例：

```bash
turso db create asms
turso db show asms --url
turso db tokens create asms
```

把 URL 与 token 写入 `DATABASE_URL`、`DATABASE_AUTH_TOKEN` 后执行 `bun run db:migrate`。
