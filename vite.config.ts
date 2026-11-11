import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    rolldownOptions: {
      onLog(level, log, handler) {
        // Dependencies ship React Server Component directives for Next.js.
        // TanStack Start has no RSC boundary, so the directive is a no-op.
        if (
          level === 'warn' &&
          log.code === 'MODULE_LEVEL_DIRECTIVE' &&
          log.message.includes('"use client"')
        ) {
          return
        }
        handler(level, log)
      },
    },
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
