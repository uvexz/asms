# asms · A Simple Mail Server

基于 **Resend** 的轻量邮箱服务：用户可以创建长期邮箱与一次性临时邮箱，通过 Resend Webhook 收件、通过 Resend API 发件；管理员在独立面板里配置站点、域名、API Key 与第三方登录。

- **框架**：TanStack Start（React 19 + Nitro）
- **UI**：BoardUI（Tailwind v4，组件按 registry 原样安装）
- **数据库**：libSQL（本地 SQLite 文件 / Turso 线上）
- **认证**：Better Auth（邮箱密码 + Google/GitHub/sb.sb OIDC + admin 插件）
- **邮件**：Resend 收发，S3 兼容存储保存附件（可选）

## 功能

### 用户面板 `/app`

- 长期邮箱：数量上限由管理员配置（默认 5），前缀最短 3 位，可收件与发件。
- 临时邮箱：不限数量，前缀最短 8 位，默认 1 小时有效，可续期（总寿命默认 24 小时）。
- 收件箱：列表 + 正文 + 附件，HTML 在 sandbox iframe 中渲染，默认拦截远程图片。
- 写邮件：纯文本自动生成 HTML，每日额度由管理员配置（默认 5 封）。
- 已发送：查看 Resend 投递状态（送达 / 退信 / 投诉等）。
- 个人设置：昵称、密码、第三方账号绑定 / 解绑、退出登录。

### 管理面板 `/admin`

- 站点信息：名称、副标题、Logo、页脚、时区、是否开放注册。
- 邮件策略：长期邮箱上限、每日发件额度、临时邮箱 TTL、地址冷却期、保留天数。
- Resend：API Key、Webhook Secret、发件显示名、系统发件地址，支持一键测试连接。
- 域名：添加 / 验证 / 刷新 / 设为默认 / 启停收发 / 查看 DNS 记录。
- 第三方登录：Google、GitHub 的 Client ID / Secret 与启停；sb.sb 走标准 OIDC，填 Issuer 即可自动发现端点。
- 用户管理：角色调整、封禁 / 解封。
- 邮箱管理、审计日志、收件日志（排查“邮件为什么没收到”）。

管理员不受邮箱数量与发件额度限制。

## 本地启动

```bash
bun install
cp .env.example .env.local
# 填入 BETTER_AUTH_SECRET 与 ASMS_ENCRYPTION_KEY
bun run db:push
bun run dev
```

打开 <http://localhost:3000>：

1. 注册第一个账号。
2. 访问 `/setup` 领取管理员权限（若设置了 `SETUP_TOKEN`，需要输入该口令）。
3. 在 `/admin/settings` 填入 Resend API Key 与 Webhook Secret。
4. 在 `/admin/domains` 添加域名并按提示配置 DNS。

生成密钥：

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ASMS_ENCRYPTION_KEY（必须是 32 字节 base64）
```

## Resend 配置

### 1. API Key

在 Resend Dashboard → API Keys 创建 **Full access** 密钥。仅发件权限的 key 无法读取域名与收件内容。

### 2. 域名

1. 管理面板 → 域名 → 添加域名（建议使用子域，如 `mail.example.com`）。
2. 按页面展示的 DNS 记录在域名服务商配置：
   - **MX**：收件，优先级数字必须最小；
   - **SPF / DKIM**：发件；
   - 建议同时配置 DMARC。
3. 回到面板点击“验证”，状态变为 `verified` 后即可创建邮箱。

> 如果根域已有邮箱服务（Google Workspace、Microsoft 365 等），请务必使用子域，否则整域邮件都会转到 Resend。

### 3. Webhook

Resend Dashboard → Webhooks → 添加：

- URL：`https://你的域名/api/webhooks/resend`
- 事件：至少勾选 `email.received`，建议同时勾选 `email.sent`、`email.delivered`、`email.bounced`、`email.complained`、`email.delivery_delayed`、`email.failed`。
- 将签名密钥（`whsec_...`）填入管理面板 → Resend → Webhook Secret。

服务端会校验 svix 签名；Webhook 只包含元数据，正文会通过 Receiving API 二次拉取并按 `(resend_email_id, mailbox_id)` 幂等入库。

### 4. 系统发件

“找回密码”等功能需要发件地址。请在 Resend 验证过的域名下配置一个地址（如 `no-reply@mail.example.com`），填入管理面板 → Resend → 系统发件地址。

### 5. 附件存储（可选）

默认不落地附件内容：只保存文件名、类型、大小，下载时按需向 Resend 获取签名 URL。配置 S3 兼容存储后，收件时会自动下载并保存：

- Cloudflare R2：`Endpoint=https://<account>.r2.cloudflarestorage.com`，`Region=auto`，开启 Force path style。
- AWS S3：填写对应 Region，Endpoint 可留空。
- MinIO：填写自己的 Endpoint，开启 Force path style。

## 环境变量

| 变量                    | 必填     | 说明                                                        |
| ----------------------- | -------- | ----------------------------------------------------------- |
| `DATABASE_URL`          | 是       | 本地 `file:dev.db`；线上 `libsql://xxx.turso.io`            |
| `DATABASE_AUTH_TOKEN`   | 线上必填 | Turso 数据库令牌                                            |
| `BETTER_AUTH_URL`       | 是       | 站点完整 URL，如 `https://mail.example.com`                 |
| `BETTER_AUTH_SECRET`    | 是       | Better Auth 会话签名密钥                                    |
| `ASMS_ENCRYPTION_KEY`   | 是       | AES-256-GCM 密钥，用于加密数据库中的 API Key / OAuth Secret |
| `SETUP_TOKEN`           | 建议     | 初始化管理员口令；公网部署强烈建议设置                      |
| `CRON_SECRET`           | 建议     | `/api/cron/cleanup` 的 Bearer 口令                          |
| `RESEND_API_KEY`        | 否       | 仅作兜底；面板配置优先                                      |
| `RESEND_WEBHOOK_SECRET` | 否       | 仅作兜底；面板配置优先                                      |
| `OIDC_ISSUER`           | 否       | sb.sb 登录的 issuer，如 `https://sb.sb/oidc`                |
| `OIDC_CLIENT_ID`        | 否       | 配合 `OIDC_ISSUER` 使用；面板保存后以面板为准               |
| `OIDC_CLIENT_SECRET`    | 否       | 同上                                                        |
| `OIDC_REDIRECT_URI`     | 否       | 默认 `<BETTER_AUTH_URL>/api/auth/callback/sb`               |
| `OIDC_SCOPES`           | 否       | 默认 `openid profile email offline_access`                  |
| `PORT`                  | 否       | Node 服务端口，默认 3000                                    |

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

## 定时清理

`GET|POST /api/cron/cleanup` 会执行：

- 删除过期的临时邮箱及其邮件、附件；
- 删除超过保留期的邮件；
- 清理到期的地址冷却记录；
- 清理 30 天前的收件日志、180 天前的审计日志；
- 删除对应的 S3 对象。

鉴权：`Authorization: Bearer $CRON_SECRET`（未设置 `CRON_SECRET` 时仅非生产环境可用）。

- **Vercel**：`vercel.json` 已配置每天 03:00 调用；Vercel 会自动带上 `CRON_SECRET`。
- **VPS / Docker**：用系统 cron 或容器编排的定时任务调用，例如：
  ```
  0 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://mail.example.com/api/cron/cleanup
  ```

## 部署

### Vercel / PaaS

1. 导入仓库，框架会被识别为 Nitro。
2. 配置上表环境变量；数据库必须使用 Turso（Serverless 无持久磁盘）。
3. 附件请配置 S3/R2，否则只保留元数据。
4. 部署后把 `BETTER_AUTH_URL` 改为正式域名，并在 Resend 配置 Webhook。

### Docker

```bash
docker build -t asms .
docker run -d --name asms -p 3000:3000 --env-file .env.local asms
```

持久化 SQLite 时，把 `DATABASE_URL` 设为 `file:/data/asms.db` 并挂载卷：`-v asms-data:/data`。首次启动前在宿主机执行 `bun run db:push`（或对 Turso 执行 `db:migrate`）。

### VPS（Node）

```bash
bun install
bun run build
NODE_ENV=production node .output/server/index.mjs
```

用 Nginx / Caddy 反向代理到 3000，配置 HTTPS；`BETTER_AUTH_URL` 必须是外部可访问的 https 地址，否则 OAuth 回调与 Cookie 会异常。

## 目录结构

```
src/
  routes/                 页面与 API 路由（/app、/admin、/api/*）
  server/
    functions/            服务端函数（鉴权 + zod 校验）
    services/             邮箱、收件、发件、配额、域名、清理、审计
    integrations/         Resend、S3、加密
    settings.ts           设置注册表（默认值 + 校验 + 加密）
  db/                     Drizzle schema 与 libSQL 连接
  components/             BoardUI 组件（按 registry 安装）
  lib/                    auth、auth-client、格式化
drizzle/                  迁移文件
```

## 已知边界

- 临时邮箱默认只收不发；可在管理面板开启，但不建议。
- 发件暂不支持附件。
- 不做邮件转发、自动回复、别名、全文搜索（列表按时间分页）。
- 收件箱通过 15 秒轮询刷新，不是 WebSocket 推送。
- 地址前缀允许小写字母、数字、`.`、`_`、`-`，首尾必须是字母或数字。

## 脚本

```bash
bun run dev          # 开发
bun run build        # 生产构建
bun run start        # 运行 .output
bun run lint         # ESLint
bun run check        # Prettier 检查
bun run db:generate  # 生成迁移
bun run db:migrate   # 执行迁移
bun run db:studio    # Drizzle Studio
```
