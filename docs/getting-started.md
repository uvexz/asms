# 本地启动

## 环境要求

- [Bun](https://bun.sh)
- 本地 SQLite（默认 `file:dev.db`，无需单独安装）

## 步骤

```bash
bun install
cp .env.example .env.local
# 填入 BETTER_AUTH_SECRET 与 ASMS_ENCRYPTION_KEY
bun run db:push
bun run dev
```

打开 <http://localhost:3000>：

1. 注册第一个账号。
2. 访问 `/setup` 领取管理员权限（若设置了 `SETUP_TOKEN`，需要输入该口令）；领取后该账号会同时标记为邮箱已验证。
3. 在 `/admin/settings` 填入 Resend API Key 与 Webhook Secret。
4. 在 `/admin/domains` 添加域名并按提示配置 DNS。

## 生成密钥

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ASMS_ENCRYPTION_KEY（必须是 32 字节 base64）
```

环境变量完整列表见[配置参考](configuration.md)，Resend 域名与 Webhook 的配置见[Resend 配置](resend.md)。
