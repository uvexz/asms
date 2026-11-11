# 开发

## 目录结构

```
src/
  routes/                 页面与 API 路由（/app、/admin、/api/*）
  server/
    functions/            服务端函数（鉴权 + zod 校验）
    services/             邮箱、收件、发件、配额、域名、清理、审计
    integrations/         Resend、S3、加密
    telegram/             Telegram Bot：widget.html、handler、会话/链接存储、真实邮箱适配
    settings.ts           设置注册表（默认值 + 校验 + 加密）
  db/                     Drizzle schema 与 libSQL 连接
  components/             BoardUI 组件（按 registry 安装）
  lib/                    auth、auth-client、格式化
drizzle/                  迁移文件
```

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
bun run bot:poll     # 本地 Bot 长轮询（无需 webhook）
bun run bot:webhook  # set / info / delete Telegram webhook
bun run bot:widget   # 校验 widget.html 体积与外部资源
bun run bot:preview  # 浏览器预览 Widget
```
