# 部署

## Vercel / PaaS

1. 导入仓库，框架会被识别为 Nitro。
2. 配置[环境变量](configuration.md)；数据库必须使用 Turso（Serverless 无持久磁盘）。
3. 附件请配置 S3/R2，否则只保留元数据。
4. 部署后把 `BETTER_AUTH_URL` 改为正式域名，并在 Resend 配置 Webhook。

## Docker

```bash
docker build -t asms .
docker run -d --name asms -p 3000:3000 --env-file .env.local asms
```

持久化 SQLite 时，把 `DATABASE_URL` 设为 `file:/data/asms.db` 并挂载卷：`-v asms-data:/data`。首次启动前在宿主机执行 `bun run db:push`（或对 Turso 执行 `db:migrate`）。

## VPS（Node）

```bash
bun install
bun run build
NODE_ENV=production node .output/server/index.mjs
```

用 Nginx / Caddy 反向代理到 3000，配置 HTTPS；`BETTER_AUTH_URL` 必须是外部可访问的 https 地址，否则 OAuth 回调与 Cookie 会异常。

部署完成后按[限流与定时清理](operations.md)配置定时任务。
