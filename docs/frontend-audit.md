# 前端代码审计报告

审计对象：`src/` 下全部前端代码（79 个 `.tsx` / 74 个 `.ts`，约 8.1k 行页面与组件代码）
技术栈：TanStack Start 1.169 + React 19 + TanStack Query 5 + BoardUI（React Aria）+ Tailwind v4
审计方式：逐文件走查 + `tsc --noEmit` + `eslint` + 交叉比对 `AGENTS.md` 约定
结论：**基础工程质量高**（类型、lint、分层、缓存设计都干净），**问题集中在"提交类交互的失败路径"与"移动端细节"**，另有若干性能与可访问性欠账。

---

## 0. 严重程度定义

| 级别   | 含义                                 | 处理时机 |
| ------ | ------------------------------------ | -------- |
| **P0** | 数据被写坏，或流程走到死胡同无法自愈 | 立即修   |
| **P1** | 主路径明显受损，用户需要绕过或刷新   | 本迭代   |
| **P2** | 体验、性能或无障碍欠账，不影响完成度 | 下个迭代 |
| **P3** | 一致性与整洁度                       | 随手改   |

---

## 1. 总览

| 主题         | 评价                                                                            | 主要风险                                                           |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 代码结构     | 分层清晰：`routes` / `components` / `server/functions` / `lib/queries` 各司其职 | 两处超大组件（696、498 行）                                        |
| 组件划分     | 三栏邮件视图拆得干净，`PanelHeader` 统一高度是正确决定                          | 布局外壳在 `app.tsx` / `admin.tsx` 重复；表格的"卡片+表格"双份渲染 |
| 状态管理     | `queryKeys` / `STALE_TIME` / 失效 helper 的收敛是本项目最强的一环               | 派生状态用 effect 同步；提交类操作缺 finally                       |
| 样式与响应式 | 语义 token 使用到位，`xl:` 三栏、`md:` 双栏切换正确                             | 硬编码 `100dvh` 偏移；主题只有两档；全局 CSS 有死代码              |
| 性能         | 读操作并发、缓存分层做得好                                                      | 滚动每帧 setState、无用 CSS、`preloadStaleTime: 0`                 |
| 可访问性     | 表单焦点管理、`role="alert"`、`aria-busy`、skip link 都在                       | 无 live region 播报；列表无列表语义/方向键；`title` 承担信息       |
| 错误处理     | 路由级 `defaultErrorComponent` 已配置，`Result` 模式统一                        | 5 处提交流程失败后按钮卡死；`sent` 详情无错误分支                  |

---

## 2. P0 — 立即修复

### P0-1 后台数值设置被清空后写入 `0`

- **位置**：`src/routes/admin/settings.tsx:293-327`（`NumberField` 的 `onChange`），脏值判定 `:159-170`
- **现象**：`onChange={(v) => set('mail.dailySendLimit', Number(v))}`。用户清空输入框时 React Aria 传入 `''`，`Number('') === 0`。该键随即被判为脏并允许保存。
- **影响**：一次误操作就能把"每日发件额度 / 长期邮箱上限 / 前缀最长 / 邮件保留天数"写成 `0`，保存后全站用户无法创建邮箱或发信，且界面上看不出是"空"还是"零"。这属于**静默数据损坏**。
- **建议**：
  ```ts
  const toNumber = (v: string) => (v.trim() === '' ? '' : Number(v))
  // 保存前用 zod 逐字段校验：整数、>= 1、<= 上限
  // Input 加 min={0}，空值时字段自身报错而不是落到 0
  ```

### P0-2 提交流程没有 `finally`，失败一次就永久卡死

- **位置**：
  - `src/routes/app/settings.tsx:79-90`（`saveName`）、`:92-111`（`changePassword`）
  - `src/routes/verify-email.tsx:76-99`（`resend`）、`:101-117`（`check`）
  - `src/components/app/settings/telegram-link.tsx:30-41`（`create`）、`:43-58`（`unlink`）
  - `src/routes/reset-password.tsx:31-59`（`submit`）
  - `src/routes/setup.tsx:35-56`（`submit`）
- **现象**：统一写成 `setPending(true)` → `await` → `setPending(false)`。服务端函数在传输层抛错（断网、超时、5xx 非 `Result` 路径）时，第二行永远不会执行。
- **影响**：按钮停在"处理中…"且 `disabled`，页面没有任何错误提示，用户唯一出路是刷新——在"修改密码""重新发送验证邮件""重置密码"这些关键场景里尤其糟糕。
- **建议**：统一 `try { ... } catch (e) { toast.error('网络异常，请重试') } finally { setPending(false) }`。更好的做法是把这类"按钮 + 异步 + 结果提示"抽成一个 `useAsyncAction()`，从根上消除重复。

---

## 3. P1 — 本迭代

### P1-1 管理后台移动端抽屉导航后不关闭

- **位置**：`src/routes/admin.tsx:82-163`；对照组 `src/routes/app.tsx:87-89` 有 `useEffect(() => setMobileOpen(false), [location.pathname])`，后台没有。
- **影响**：手机上点任意导航项，路由变了但抽屉仍盖在新页面上，必须再点一次"关闭导航"。管理后台在移动端基本不可用。
- **建议**：照抄 `app.tsx` 的那一行 effect；或让 `NavItem` 接收 `onNavigate`，点击时统一 `onClose()`。

### P1-2 切换邮件时详情区滚动位置不重置

- **位置**：`src/components/app/mailbox/message-detail.tsx:96-100`（滚动容器没有 ref），切换仅依赖 `message.id` 变化。
- **影响**：先读一封长邮件滚到底部，再点开一封短信，会看到正文被滚出视口、只剩页脚——像"空白邮件"。桌面端尤其明显（移动端有 `selectMessage` 里的 `window.scrollTo`，但那只滚外层页面）。
- **建议**：
  ```tsx
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [message?.id])
  ```

### P1-3 邮件 iframe 在"显示图片"后丢弃整段 CSP

- **位置**：`src/components/app/mailbox/message-detail.tsx:236-247`
- **现象**：`allowImages ? '' : '...script-src none; object-src none; img-src data: cid:'`——允许图片时 `<meta http-equiv="Content-Security-Policy">` 整个消失。
- **影响**：`sandbox="allow-same-origin"` 仍拦住脚本，但 `object-src`/`base-uri` 的纵深防御没了；更实际的是，邮件 HTML 里的 `<img src="/api/attachments/...">` 会带着站点 cookie 打同源接口，成为可用的探测/追踪通道。
- **建议**：CSP 恒定存在，只放宽 `img-src`：
  ```
  script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';
  img-src data: cid: https:;   // 允许图片时把 https: 加回来
  ```
  同时把 `allow-same-origin` 的必要性写进注释（它只为测量高度），将来若要"更安全"可改为 `sandbox=""` + `postMessage` 上报高度。

### P1-4 时间显示不跟随站点时区配置

- **位置**：`src/lib/format.ts:9-26`（两个 formatter 都没传 `timeZone`）
- **现象**：后台可配置 `site.timezone`，`compose.tsx:186` 还会告诉用户"每天 00:00（Asia/Shanghai）重置"，但所有邮件时间都按**浏览器本地时区**渲染。
- **影响**：跨时区用户看到"23:50 收到"却"今天额度已重置"，同一屏里两套时间基准；管理员排查投递问题时也会对不上日志。
- **建议**：`Intl.DateTimeFormat(locale, { timeZone, ... })`，`timeZone` 从 `policy.timezone` / `publicConfig` 下传；`formatRelative` 保留相对时间（无需时区），超过 7 天再落到绝对时间。

### P1-5 域名开关没有乐观更新，点完会自己弹回去

- **位置**：`src/routes/admin/domains.tsx:274-300`
- **现象**：`<Switch isSelected={domain.sendingEnabled} onChange={(v) => update.mutate(...)} />` 是受控组件，`domain.sendingEnabled` 要等 mutation 成功 + `invalidateDomains` + 重取列表才变。
- **影响**：点击后开关先跳到新位置、再弹回原位、最后又跳过去（约 300-800ms）。用户会以为没点上而重复点击。
- **建议**：`onMutate` 里改缓存（`queryClient.setQueryData(queryKeys.adminDomains, ...)`），`onError` 回滚；或在 mutation pending 期间用本地 state 覆盖显示值。

### P1-6 写信页无草稿保护，误触即永久丢失

- **位置**：`src/routes/app/compose.tsx:39-56`（全部草稿在 `useState`），`:175-308`（无 `<form>`）
- **影响**：写到一半点侧栏任意导航，收件人/主题/正文全部清空，没有任何"确定离开？"提示。对邮件产品这是最伤人的一类事故。
- **建议**：至少做 `beforeunload`（刷新/关标签）+ 路由级拦截（`useBlocker` 或 `router.subscribe('onBeforeNavigate')`）；更完整的是把草稿写进 `sessionStorage` 并在挂载时恢复。

---

## 4. P2 — 体验 / 性能 / 无障碍

### P2-1 六个页面没有 `<form>`，回车不提交

- **位置**：`app/compose.tsx`、`admin/settings.tsx`、`app/mailbox/create-modals.tsx`（两个弹窗）、`app/settings.tsx`（昵称/密码）、`reset-password.tsx`、`admin/domains.tsx`（添加域名弹窗）
- **影响**：在输入框里按 Enter 没有任何反应；浏览器密码管理器不认这是"登录/改密表单"；`autocomplete` 语义失效。对照组 `login-panel.tsx` / `register.tsx` / `admin/users.tsx` 已经用了 `<form onSubmit>`，说明团队知道正确做法。
- **建议**：统一包 `<form onSubmit={...}>`，主按钮 `type="submit"`，取消按钮 `type="button"`。

### P2-2 动态变化的内容完全没有播报

- **位置**：全局只有 `toast.tsx:200` 一处 `aria-live`
- **影响**：15/30 秒轮询会悄悄把新邮件插进列表、把未读数加一，屏幕阅读器用户完全不知道。同理，筛选切换、分页、邮箱切换后的内容变化也没有提示。
- **建议**：在 `__root.tsx` 挂一个集中式 `<div role="status" aria-live="polite" className="sr-only">`，新邮件到达 / 列表刷新 / 操作成功时写一句"收到 1 封新邮件，来自 …"。**不要**播报"加载中"这类中间态。

### P2-3 邮件列表与邮箱栏缺少列表语义与方向键导航

- **位置**：`message-list.tsx:186-247`（`div > button[]`）、`mailbox-rail.tsx:96-120`
- **影响**：20 封邮件就是 20 个 Tab 停靠点，用户想从第 1 封跳到第 20 封必须按 19 次 Tab；辅助技术也无法感知"共 20 条、当前第 3 条"。
- **建议**：`<ul role="list">` + `<li>` 包住每行（恢复列表语义，Safari 在 `list-style:none` 下会丢列表角色），再补上 `ArrowUp/Down` 移动焦点、`Home/End` 跳首尾。邮件这行"选中态"建议用 `aria-selected` + `role="option"`，比 `aria-current="true"` 更贴切。

### P2-4 滚动淡出每帧触发一次组件重渲染

- **位置**：`src/components/foundations/scroll-fade/scroll-fade.tsx:28-36`，消费方 `message-list.tsx:155-158`、`mailbox-rail.tsx:65-68`、`message-detail.tsx:97-100`、`modal.tsx:294-296`
- **影响**：`onScroll` 里 `setProgress`，滚动邮件列表时每帧重渲染 `MessageList` 及其 20 行子节点。低端机上滚动会掉帧，而这正是最需要跟手的地方。
- **建议**：`progress` 改走 ref + 直接写 `style.opacity`（三个图层用 `ref` 拿节点），或至少用 `requestAnimationFrame` 合帧；`ScrollFade` 的 `progress` prop 改为可选的外部驱动。

### P2-5 `globals.css` 里有大量本项目零引用的组件样式

- **位置**：`src/styles/globals.css`（1025 行）
- **现象**：以下类在全项目 `.tsx/.ts` 中 **0 引用**：`agent-progress-loading-text`、`bui-composer-loader-*`、`animate-number-fade`、`.recharts-wrapper`、`landing-glass-stroke`/`lg-*`、`animate-flap-*`、`animate-row-*-in/out`、`t-stagger*`、`animate-label-*`、`check-draw`、`theme-logo-dark`。
- **影响**：这些都是从 BoardUI 模板整体带过来的，会进入每一次首屏的 CSS 关键路径（该文件 32.9KB，另有 `theme.css` 56.7KB、`typography.css` 11.1KB）。
- **建议**：删除零引用块；把 `landing-*` 相关规则从 `globals.css` 挪进已经按路由加载的 `landing.css`（现在 `landing.css` 只被首页 import，但 `globals.css` 是全局的）。

### P2-6 `defaultPreloadStaleTime: 0` 让每次悬停都重跑 loader

- **位置**：`src/router.tsx:21-22`
- **影响**：`defaultPreload: 'intent'` + 预加载立即过期，等于鼠标每次划过导航就要发起一轮 `fetchPublicConfig` / `ensureQueryData` 的服务端调用。对一个轮询已经不少的应用是额外负载。
- **建议**：`defaultPreloadStaleTime: 30_000`（与 `STALE_TIME.user` 对齐）。

### P2-7 登录成功后人为等待 420ms

- **位置**：`src/components/application/auth/login-panel.tsx:137`
- **影响**：`await new Promise(r => setTimeout(r, 420))` 让每次登录都慢半拍。目的（让"已登录"状态被看见）可以用 150-200ms 或 `requestAnimationFrame` 双帧达成。
- **建议**：降到 150ms，或把跳转交给按钮的成功态动画结束回调。

### P2-8 "放弃"按钮不会回滚 OAuth 编辑区的本地状态

- **位置**：`src/routes/admin/settings.tsx:187-197`（`discard` 只重置 `draft`）vs `:605-609`（`OAuthEditor` 各自持有 `useState`）
- **影响**：用户改了三处设置和 GitHub 的 Client ID，点"放弃"后前者恢复、后者保留，界面进入"说不清哪些已放弃"的状态。
- **建议**：`OAuthEditor` 受控化（把值提到页面级 `draft`），或用 `key={discardToken}` 强制重挂载。

### P2-9 `sent` 详情查询失败时永远显示骨架

- **位置**：`src/routes/app/sent.tsx:129-165`
- **现象**：`{email ? 内容 : <Skeleton />}`，`detail.isError` 没有分支。
- **影响**：点开一条发件记录、请求失败，弹窗里会永远转圈，没有重试入口。
- **建议**：`detail.isError` 时渲染 `ErrorState` + `onRetry`。

### P2-10 只在 `title` 里给出的信息拿不到

- **位置**：`src/routes/app/compose.tsx:181-189`（额度重置时间塞进 `<span title>`）
- **影响**：`title` 只对鼠标悬停可见，键盘用户、触摸用户、屏幕阅读器都拿不到"每天 00:00 重置"这条关键信息。
- **建议**：改成可见的 `caption` 文本，或用已安装的 `Tooltip` 组件（React Aria 会给触发器补 `aria-describedby`）。

### P2-11 全局点击劫持对 `/api/` 链接不设防

- **位置**：`src/components/app/spa-link-handler.tsx:16-52`
- **现象**：所有同源 `<a>` 都被 `router.navigate` 接管，只排除了 `target`、`download`、`#`、异源。附件下载现在都用 `target="_blank"` 所以安全，但任何同源的 `/api/...` 直链一旦写成普通 `<a>`，就会被路由当作页面跳转，结果是 404 而不是下载。
- **建议**：加一行 `if (url.pathname.startsWith('/api/')) return`，并支持 `data-no-spa` 逃生口。

### P2-12 移动端可点区域偏小

- **位置**：`mailbox-rail.tsx:200-206`（每行"更多"按钮 `size-6` = 24×24）、`message-list.tsx:302-325`（筛选胶囊高约 26px）
- **影响**：WCAG 2.5.8 的最小值是 24×24，这两处刚好压线；触屏上（`pointer: coarse`）实际需要更大。
- **建议**：`@media (pointer: coarse)` 下把 rail 的更多按钮提到 32px，并把胶囊 `py-1` 提到 `py-1.5`。

---

## 5. P3 — 一致性与整洁度

| 编号  | 位置                                                            | 问题                                                                                                                          | 建议                                                                  |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P3-1  | `routes/admin.tsx:82-163` vs `routes/app.tsx:80-184`            | 两套布局壳（skip link / 头部 / 侧栏 / main）几乎逐行重复                                                                      | 抽 `DashboardShell`，接收 `nav`、`wide`、`user`                       |
| P3-2  | `dashboard-sidebar.tsx:92`、`admin/index.tsx:183,254`           | `to={href as never}` 绕过路由类型                                                                                             | `href: LinkProps['to']`，把 `NAV` 声明成 `satisfies` 具体路径联合     |
| P3-3  | `app/page-header.tsx`、`stat-cards` 等                          | `Stat` 强制要求 `delta`，导致到处传 `delta: ''`                                                                               | `delta?: string`，空值不渲染                                          |
| P3-4  | `app/mailbox/mailboxes.tsx:113-122` 与 `mailbox-rail.tsx:40-50` | 同一套排序/分组逻辑写了两遍                                                                                                   | 抽 `sortMailboxes(list)` 到 `mailbox/types.ts`                        |
| P3-5  | `login-panel.tsx:37` 与 `register.tsx:42`                       | `EMAIL_PATTERN` 重复定义                                                                                                      | 提到 `lib/auth-errors.ts` 或 `lib/validate.ts`                        |
| P3-6  | `admin/users.tsx:139-308`                                       | 同一份数据渲染两次（手机卡片 + 桌面表格），字段改动要改两处                                                                   | 表格用 CSS 变卡片，或抽 `UserRow` 供两处复用                          |
| P3-7  | `app/mailboxes.tsx:226-228`                                     | `useEffect(() => setPage(1), [mailboxId])` 与 `selectMailbox` 里的 `setPage(1)` 重复；浏览器前进/后退时会先用旧页码发一次请求 | 把 `page` 并入 URL search，或用 `key={mailboxId}` 重挂载列表          |
| P3-8  | `__root.tsx:56-60`                                              | `theme-color` 硬编码 `#ffffff`，深色首帧是白条；`description` 只在首页有                                                      | `theme-color` 用 `media` 双值；补站点级 description                   |
| P3-9  | `theme-toggle.tsx:87-94`                                        | 只支持 light/dark，明确不读系统偏好                                                                                           | 若坚持两档，在设置页说明；否则补 `system` 档 + `prefers-color-scheme` |
| P3-10 | `setup.tsx:28-29`                                               | `useRouteContext()` 连续调用两次                                                                                              | 合并解构                                                              |
| P3-11 | `format.ts:52-56`                                               | `formatBytes` 无 GB 档                                                                                                        | 补 GB，或改 `Intl.NumberFormat` + unit                                |
| P3-12 | `compose.tsx:49`                                                | `useRef(crypto.randomUUID())` 每次渲染都求值一次（结果被丢弃）                                                                | `useRef<string \| null>(null)` + 惰性赋值                             |
| P3-13 | `admin/settings.tsx:226`                                        | 选中的 Tab 不在 URL 里，刷新回到"站点"                                                                                        | `validateSearch` 承载 tab                                             |
| P3-14 | `admin/users.tsx:251-270`                                       | 可以把最后一个管理员降级（自己）                                                                                              | 服务端已拦则写注释；否则前端禁用自己那一行                            |

---

## 6. 值得肯定的部分

写报告容易只列问题，但这几处确实是同类项目里少见的克制与正确：

1. **缓存契约集中在 `src/lib/queries.ts`**：三层 `STALE_TIME`、命名空间化的 `queryKeys`、四个 `invalidate*` helper，把"谁该失效"这件事收到了一个文件里。组件里没有一处内联 `queryKey`。
2. **`fetchShell` 留在 router context、登出时 `queryClient.clear()`**：会话归属这件事处理得比大多数项目严谨。
3. **`patchResult()`（`mailboxes.tsx:57-62`）**：乐观更新时只改 `data`、不改 `ok/error` 形状，避免"把错误缓存改成命中"这类经典事故。
4. **认证表单**：`noValidate` + 自定义校验 + 失败后聚焦第一个出错字段 + `role="alert"` 错误条 + `aria-busy`，这套组合是完整正确的。
5. **`Modal` / `Drawer` / `Toast`**：基于 React Aria，焦点陷阱、`aria-describedby` 接线、polite 播报、悬停暂停倒计时都做到了。
6. **`EmailFrame` 默认拦图 + `sandbox` + 尺寸自适应**：隐私默认值是正确方向（只需补 P1-3）。
7. **`tsc --noEmit` 与 `eslint` 全绿**，`strict` + `noUnusedLocals` + `verbatimModuleSyntax` 全开。

---

## 7. 已执行的修复（2026-11-14）

上表全部 P0–P3 项已按批次落地，`tsc` / `eslint` / `prettier --check` 全绿。

### 行为变更

| 编号     | 修复方式                                                                                                                        | 涉及文件                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P0-1     | 数值字段空串保留为 `''`，按服务端 schema 的上下界校验；有错时两个保存入口一起禁用                                               | `admin/settings.tsx`                                                                                                 |
| P0-2     | 五处提交流程改为 `try/catch/finally`，新增 `NETWORK_ERROR_MESSAGE`                                                              | `app/settings.tsx`、`verify-email.tsx`、`telegram-link.tsx`、`reset-password.tsx`、`setup.tsx`、`lib/auth-errors.ts` |
| P1-1     | 布局壳抽取为 `DashboardShell`，抽屉跟随 `pathname` 关闭（`app` / `admin` 共用）                                                 | `components/app/dashboard-shell.tsx`（新）、`routes/app.tsx`、`routes/admin.tsx`                                     |
| P1-2     | 详情滚动容器加 `ref`，`message.id` 变化时 `scrollTop = 0`                                                                       | `message-detail.tsx`                                                                                                 |
| P1-3     | CSP 常驻：`script-src` / `object-src` / `frame-src` / `base-uri` / `form-action` 恒为 `'none'`，只放宽 `img-src`                | `message-detail.tsx`                                                                                                 |
| P1-4     | `setDefaultTimeZone()` 由根路由 `beforeLoad` 注入（SSR 与客户端一致），格式化按站点时区，非法时区回退浏览器                     | `lib/format.ts`、`routes/__root.tsx`、`server/functions/auth.ts`                                                     |
| P1-5     | 域名开关写入缓存前先乐观翻转，失败回滚，`onSettled` 再对齐服务端                                                                | `admin/domains.tsx`                                                                                                  |
| P1-6     | 草稿存 `sessionStorage`（防抖 500ms）+ 挂载后恢复 + `beforeunload` 提醒；不保存发件邮箱以免恢复失效地址                         | `app/compose.tsx`                                                                                                    |
| P2-1     | 12 个 `<form>` 覆盖全部保存/提交入口，主按钮 `type="submit"`                                                                    | compose / admin settings / 两个创建弹窗 / 添加域名 / 昵称 / 改密 / 重置密码                                          |
| P2-2     | 新增 `announce()` + `LiveRegion`（单个 `role="status"`），邮箱页播报新增未读                                                    | `lib/announcer.ts`、`components/app/live-region.tsx`、`mailboxes.tsx`                                                |
| P2-3     | 邮件列表改为 `ul[role=list]` + `li`，支持 `↑ ↓ Home End`                                                                        | `message-list.tsx`                                                                                                   |
| P2-4     | `ScrollFade` 改走 CSS 变量 `--scroll-fade`，滚动时零重渲染                                                                      | `scroll-fade.tsx` + 4 处调用点                                                                                       |
| P2-5     | `globals.css` 1026 → 312 行，删除 628 行零引用块                                                                                | `styles/globals.css`                                                                                                 |
| P2-6     | `defaultPreloadStaleTime: 30_000`                                                                                               | `router.tsx`                                                                                                         |
| P2-7     | 登录成功等待 420ms → 150ms                                                                                                      | `login-panel.tsx`                                                                                                    |
| P2-8     | "放弃"递增 `oauthResetKey`，重挂载 OAuth 编辑区                                                                                 | `admin/settings.tsx`                                                                                                 |
| P2-9     | `sent` 详情补 `ErrorState` + 重试                                                                                               | `app/sent.tsx`                                                                                                       |
| P2-10    | 额度重置时间从 `title` 移到可见说明文字                                                                                         | `app/compose.tsx`                                                                                                    |
| P2-11    | `SpaLinkHandler` 跳过 `/api/`，支持 `data-no-spa`                                                                               | `spa-link-handler.tsx`                                                                                               |
| P2-12    | 触屏（`pointer-coarse`）放大邮箱行"更多"与筛选胶囊                                                                              | `mailbox-rail.tsx`、`message-list.tsx`                                                                               |
| P3-1/2   | 布局去重；`DashboardNavItem.href` 改用 `LinkProps['to']`，侧栏用路由 `<Link>`，5 处 `as never` 清零                             | `dashboard-shell.tsx`、`dashboard-sidebar.tsx`、`admin/index.tsx`                                                    |
| P3-3/4/5 | `Stat.delta` 可选；`sortMailboxes()` 单一排序来源；`EMAIL_PATTERN` 收进 `lib/validate.ts`                                       | `stat-cards.tsx`、`mailbox/types.ts`、`login-panel.tsx`、`register.tsx`                                              |
| P3-10~14 | `setup` 去重复解构；`formatBytes` 补 GB；UUID 惰性生成；`?tab=` 承载设置分组；自己那行禁用改角色/封禁并标注"当前账号"           | 多处                                                                                                                 |
| 额外     | `eslint.config.js` 不再整体忽略 `src/components/**`，只保留 vendored 的 `src/components/base/**`（此前项目自有组件从未被 lint） | `eslint.config.js`、`application/**`                                                                                 |

### 有意保留

- **P3-6**（`admin/users` 手机卡片 + 桌面表格双份渲染）：这是为保留 `<table>` 语义的有意选择，改成 CSS 变卡片会丢掉表头关联，故保留。
- **P3-7**（`page` 的重置 effect）：点击路径由 `selectMailbox` 的 `setPage(1)` 覆盖，effect 只为浏览器前进/后退存在，二者并存是当前最省请求的写法。
- **P3-8**（静态 `theme-color`）：应用不读系统偏好，`media="(prefers-color-scheme: dark)"` 会给出与页面相反的色调；深色由 `ThemeColor` 在挂载后接管。
- **P3-9**（system 主题档）：属于新功能而非缺陷，未本次改动。

---

## 附录：验证记录

| 检查                   | 结果                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx tsc --noEmit`    | 通过，0 错误（`strict` / `noUnusedLocals` / `noUnusedParameters` 全开）                                                                                                                                                                                   |
| `bun run lint`         | 通过，0 警告（ignore 收窄后 `src/components/app`、`src/components/application` 一并纳入）                                                                                                                                                                 |
| `bun run check`        | 通过，`prettier --check .` 全绿                                                                                                                                                                                                                           |
| SSR 冒烟（2026-11-14） | `/`、`/login`、`/register`、`/forgot-password`、`/reset-password?token=` 均 200；`/app`、`/admin` 未登录 307；未知路径 404 渲染 `RouteNotFound`                                                                                                           |
| 登录态冒烟             | 以 `dev.db` 的副本起第二个实例，注册探针账号后 `/app`、`/app/mailboxes`、`/app/compose`、`/app/sent`、`/app/settings` 与 `/admin/*` 七个页面全部 200；壳的 `aria-current`、`href`、skip link、移动端品牌均正确。副本与探针数据已删除，未写入真实 `dev.db` |
| CSS 产物               | dev 端 `/src/styles.css` 编译通过（165 KB 未压缩），`agent-progress-*`、`recharts`、`t-stagger`、`flap-*`、`row-*`、`landing-glass-*`、`landing-showcase-card` 均已从产物消失                                                                             |
| `bun run build`        | **未能在本环境完成**：Nitro 清理 `.output` 时被沙箱的批量删除保护拦截，非项目问题。生产产物仍需在本地或 CI 复核                                                                                                                                           |
| 未覆盖                 | 未做 Lighthouse / axe 扫描与真机触屏、VoiceOver 实测；Modal 内的表单布局、拖拽/键盘细节需人工过一遍                                                                                                                                                       |
