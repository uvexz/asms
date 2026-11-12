# Global design rules

我要把它做得像 Linear 的官网或者苹果备忘录一样干净：目标简单、架构简单、设计简单、实现简单。砍掉标语、提示文字和次要标签。如果一个页面非得靠这些东西才看得懂，那就去改布局。每个决定都要同时提升用户体验（UX）、开发者体验（DX）和智能体体验（AX），而且不能弄坏任何东西。

<!-- boardui:rules:start -->
# BoardUI design rules

This project uses BoardUI (React + Tailwind CSS v4, source-owned components under `components/`). These rules always apply when writing UI code. MCP tools are on demand; these rules are not optional context.

## Components first

- Before hand-building any UI element, check for an installed BoardUI component under `components/base/` and `components/application/`, and prefer it.
- Missing a component? Install it (BoardUI MCP `install_components`, or `npx boardui@latest add <name>`) instead of writing a lookalike.
- Import through the `@/` alias, e.g. `import { Button } from "@/components/base/buttons/button"`.

## Color: semantic tokens only

- Never use raw palette classes (`text-gray-500`, `bg-white`, `border-neutral-200`) or hex/oklch literals. Every color rides a BoardUI semantic token, which also makes dark mode automatic.
- Text: `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `text-text-placeholder`, errors `text-text-error-primary`.
- Surfaces: `bg-background-primary-default`, `bg-background-secondary-default` / `-hover`, `bg-background-tertiary-default`, page ground `bg-background-full`.
- Borders: `border-border-button-default` / `-hover`, hairlines `border-separator-border`, tables `border-border-table`, errors `border-border-error-default`.
- Icons: `text-foreground-icon-primary` through `text-foreground-icon-quaternary`.
- Charts: the `chart-1` … `chart-5` tokens (plus `-active` variants). CTAs and selection states: the `accent-50` … `accent-950` ramp.
- Dark mode flips tokens via the `.dark` class on `<html>`. Do not write `dark:` overrides with raw colors; if a token pair looks wrong in dark mode, pick a different token, not a literal.

## Typography: composite utilities only

- Use BoardUI's composite type utilities: `text-title-1-medium`, `text-title-2-medium`, `text-title-3-semibold`, `text-headline-medium`, `text-body-medium`, `text-body-regular`, `text-body-2-*`, `text-caption-1-semibold`, and friends. Each sets size, weight, line-height, and letter-spacing together.
- Never rebuild type by stacking `text-sm font-medium leading-5`; if a style seems missing, look in `styles/typography.css` before inventing one.

## Spacing and shape

- Stay on Tailwind's spacing scale (`gap-2`, `p-4`, `mt-6`); prefer flex/grid `gap` over per-child margins. Arbitrary values (`p-[13px]`) only when matching an existing BoardUI component exactly.
- Cards and panels: `rounded-3xl` with `border-border-button-default`. Inputs and menu rows: `rounded-md` to `rounded-xl`. Pills: `rounded-full`.

## Mechanics

- Direction: wrap the app (or a mixed-language region) in `DirectionProvider` from `@/components/foundations/direction/direction`, with an explicit BCP 47 `locale` (`ar`, `he`, `en-US`, `zh-CN`). Set matching `lang` and `dir` on `<html>` for full-app RTL. CSS `dir` alone does not configure React Aria keyboard navigation or portal placement. Use `useDirection()` for custom interactions and put its value on custom portal roots.
- Use logical styles: `ms`/`me`, `ps`/`pe`, `start`/`end`, `text-start`/`text-end`, `border-s`/`border-e`, `rounded-s`/`rounded-e`, and inline logical CSS properties. Mirror navigation/disclosure glyphs and horizontal drawer motion in RTL. Preserve physical coordinates for measured geometry, charts, canvas, and decorative art. Keep code, OTP digits, email addresses and URLs in explicit LTR regions; isolate mixed text with `<bdi>` or `dir="auto"`. Translating labels and formatting application data is separate from layout direction. See https://www.boardui.com/rtl.

- Internal vertical scroll regions must soften the top edge with a progressive blur and surface fade once scrolled, rather than sharply clipping content. Keep headers outside the scroll region. Use a stationary, `pointer-events-none`, `aria-hidden` overlay in a relative wrapper: a 24px masked 1px backdrop blur, a 16px masked 4px backdrop blur, and a gradient from the enclosing semantic surface token to transparent. Ramp each layer's opacity from 0 to 1 over the first 24px of scrolling; keep it invisible at scrollTop 0. Apply opacity to the individual layers, never the overlay parent (a translucent parent creates a backdrop root and can break blur at normal browser zoom). Verify top/reset, overflow, light/dark mode, and 100% zoom; preserve keyboard scrolling and do not blur the whole content area. The `scroll-fade` registry item ships this recipe as `ScrollFade` + `useScrollFade` (`@/components/foundations/scroll-fade/scroll-fade`); reuse it rather than rebuilding the layers.

- Merge classes with `cx()` from `@/utils/cx` (tailwind-merge aware of BoardUI's composite text styles). No string concatenation, no plain `clsx`.
- Icons come from `@remixicon/react`, passed as component references (`leadingIcon={RiAddLine}`), not rendered elements.
- Form components build on `react-aria-components`; extend the installed BoardUI form components rather than raw `<input>`/`<select>`.
- Focus states: `outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring`.

When unsure about a token, a component's API, or working example code, ask the BoardUI MCP server: `get_theme`, `get_component`, `get_usage_examples`.
<!-- boardui:rules:end -->

# Data fetching

Every server read that a screen keeps mounted goes through `@/lib/queries`. Nothing else calls a read server function from a component.

- **Never write an inline `queryKey`.** Add a factory to `src/lib/queries.ts` and read the key from `queryKeys`. Keys are namespaced `['mail', …]` and `['admin', …]`, so one `invalidateQueries` covers a whole area.
- **Pick a staleness tier, don't invent a number**: `STALE_TIME.live` (data that arrives on its own, the poll owns freshness), `STALE_TIME.user` (changes when the user acts), `STALE_TIME.reference` (configuration and anything immutable). Polling cadences live in `REFRESH_INTERVAL`.
- **Invalidate through the helpers** (`invalidateMailData`, `invalidateAfterSend`, `invalidateDomains`, `invalidateSettings`). A mutation that writes has to name the caches it staled; matching keys by hand is how they drift apart.
- **Prefer patching the cache to refetching it** when a write changes one field the client can already compute — see the read flag in `app/mailboxes.tsx`. Refetch when the value is a sum the server owns (unread counts).
- `fetchShell` stays in the router context on purpose: it is the session, read once per document and re-read on `router.invalidate()`. Do not move it into the query cache.
- Sign out through `useSignOut()` — it drops the whole query cache, because `['mail', …]` belongs to the account that just left.

# Server reads

The mailbox page polls, so its reads are the ones that cost something. Two rules keep them cheap.

- **One round trip per read.** Statements that do not depend on each other go in one `Promise.all` — the ownership check beside the page, the attachments beside the message. A serial `await` is another full latency of the database endpoint, and the local file driver hides that cost completely. `listMessages`, `getMessage`, `listMailboxes` and `fetchOverview` are the reference shape.
- **The database filters, the process does not.** Whether a mailbox is still alive is `liveMailboxCondition` in `src/server/services/mailboxes.ts` — the SQL twin of `isExpired`, kept in the same file so the two spellings cannot drift. Do not re-filter with `isExpired` a list the query already narrowed, and do not pass a list of mailbox ids into `inArray` where a join on `mailboxes` says the same thing: the id list changes per call and defeats statement reuse.

# Cold start

Every module a route imports is parsed and evaluated before the first response leaves a fresh process. Optional weight therefore stays behind `import()`.

- **An integration most deployments never configure loads on first use.** `src/server/integrations/storage.ts` is the reference: the S3 SDK is reached through `loadSdk()`, not a top-level import, so a site without object storage never pays for it. The module cache keeps later calls free.
- Judge this with an A/B, not with a one-off `import()` — the first dynamic import in a process pays loader setup that dwarfs the module itself, and the local graph is small enough that a plausible-looking 70 ms turns out to be 4 ms.
