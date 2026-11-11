# Telegram Bot

可选能力：在 Telegram 私聊里用一张 In-Message Widgets 卡片管理真实 asms 邮箱。Web 端绑定账号后，可以直接创建临时邮箱、切换邮箱、刷新收件箱、阅读 / 删除邮件。

真实收件仍走 [Resend 入站链路](resend.md)，Bot 只是读写同一份邮箱 / 邮件数据。

## 能力

- **账号绑定**：个人设置 → Telegram Bot → 连接。深链 10 分钟有效、一次性；Bot 消费后写入 `telegram_links`，一个 asms 账号只对应一个 Telegram 账号。
- **Bot 命令**：`/start`、`/create [prefix]`。`/start <token>` 用于深链绑定。
- **邮箱范围**：Bot 只创建和删除**临时邮箱**；长期邮箱在 Web 端创建 / 删除，Bot 可以列出、切换和阅读。
- **真实收件**：Bot 创建的临时邮箱是真实 `mailboxes` 行，Resend 入站会正常投递；已读 / 删除会同步回 Web 端。
- **新邮件推送**：邮件落库后，已连接 Telegram 的账号会收到一张 Widget 卡片，直接打开该邮件的正文；同一封邮件只推送一次。
- **客户端要求**：需要最新版 Telegram（In-Message Widgets 是 Bot API 10.4 的新能力）；生产环境仅支持与 Bot 的私聊，发送后的卡片不可转发。
- **卡片限制**：HTML 发送后不可替换；受 32KB / 4KB 压缩与 1KB 状态限制，收件箱每页 4 封、正文按页加载；Widget 内无键盘、无滚动，自定义前缀需在聊天中发送 `/create name`。

## 配置步骤

1. @BotFather 创建 Bot。
2. 在 `.env.local` 或部署平台填写 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_BOT_USERNAME`、`TELEGRAM_WEBHOOK_SECRET`。
3. 建表：`bun run db:generate`，开发执行 `bun run db:push`，生产执行 `bun run db:migrate`。
4. 本地：`bun run dev` + 另开一个终端 `bun run bot:poll`（长轮询，不需要公网）。
5. 生产：部署后执行 `bun run bot:webhook set`；`info` / `delete` 用于排障。
6. Web 端 `/app/settings` 连接 Telegram，打开深链并发送 `/start`。

辅助命令：`bun run bot:widget`（体积 / 外部资源检查）、`bun run bot:preview`（浏览器预览 Widget）。
