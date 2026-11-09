import { createFileRoute } from '@tanstack/react-router'

import { getSiteConfig } from '#/server/settings'

/**
 * The PWA manifest is generated rather than shipped as a static file so the
 * installed app carries the same name as the rest of the site. The icons
 * themselves are the static "@" set in `public/`.
 */
const ICONS = [
  { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
]

export const Route = createFileRoute('/site.webmanifest')({
  server: {
    handlers: {
      GET: async () => {
        const site = await getSiteConfig()

        const manifest = {
          name: site.siteName,
          short_name: site.siteName.slice(0, 12),
          description: site.siteDescription,
          lang: 'zh-CN',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#ffffff',
          icons: ICONS,
        }

        return new Response(JSON.stringify(manifest), {
          headers: {
            'content-type': 'application/manifest+json',
            // Branding changes are rare; a short cache keeps installs fresh.
            'cache-control': 'public, max-age=300',
          },
        })
      },
    },
  },
})
