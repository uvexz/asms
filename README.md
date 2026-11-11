# asms · A Simple Mail Server

基于 **Resend** 的轻量邮箱服务：用户可以创建长期邮箱与一次性临时邮箱，通过 Resend Webhook 收件、通过 Resend API 发件；管理员在独立面板里配置站点、域名、API Key 与第三方登录。

- **框架**：TanStack Start（React 19 + Nitro）
- **UI**：BoardUI（Tailwind v4，组件按 registry 原样安装）
- **数据库**：libSQL（本地 SQLite 文件 / Turso 线上）
- **认证**：Better Auth（邮箱密码 + 邮箱验证 + Google/GitHub/sb.sb OIDC + admin 插件）
- **邮件**：Resend 收发，S3 兼容存储保存附件（可选）

## 功能

- **用户面板 `/app`**：长期邮箱与临时邮箱、收件箱、写邮件、已发送、注册验证、个人设置。
- **管理面板 `/admin`**：站点、邮件策略、Resend、域名、第三方登录、用户、邮箱、审计与收件日志。
- **Telegram Bot**：在私聊 Widget 卡片里创建临时邮箱、切换邮箱、阅读与删除邮件。

管理员不受邮箱数量与发件额度限制。完整说明见[功能文档](docs/features.md)。

## 快速开始

```bash
bun install
cp .env.example .env.local
# 填入 BETTER_AUTH_SECRET 与 ASMS_ENCRYPTION_KEY
bun run db:push
bun run dev
```

打开 <http://localhost:3000>，注册账号后访问 `/setup` 领取管理员权限，再到 `/admin/settings` 配置 Resend。完整步骤见[本地启动](docs/getting-started.md)。

## 文档

| 文档                                 | 内容                                           |
| ------------------------------------ | ---------------------------------------------- |
| [本地启动](docs/getting-started.md)  | 环境准备、数据库初始化、领取管理员             |
| [功能说明](docs/features.md)         | 用户面板、管理面板、已知边界                   |
| [Resend 配置](docs/resend.md)        | API Key、域名 DNS、Webhook、系统发件、附件存储 |
| [Telegram Bot](docs/telegram-bot.md) | 账号绑定、命令、Widget 限制、部署              |
| [配置参考](docs/configuration.md)    | 环境变量、数据库                               |
| [限流与清理](docs/operations.md)     | 限流阈值、定时清理任务                         |
| [部署](docs/deployment.md)           | Vercel、Docker、VPS                            |
| [开发](docs/development.md)          | 目录结构、脚本                                 |
