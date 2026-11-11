export type SiteBranding = {
  siteName: string
  siteDescription: string
  logoUrl: string
  footerText: string
}

const DEFAULT_BRANDING: SiteBranding = {
  siteName: 'asms',
  siteDescription: '自托管邮件服务',
  logoUrl: '',
  footerText: '',
}

type HeadMatch = { context: unknown }
type HeadMatches = ReadonlyArray<HeadMatch | undefined>

/**
 * The root route loads the branding into every match's context, so a route's
 * `head` can name itself after the site without loading settings again.
 */
export function siteBranding(matches: HeadMatches): SiteBranding {
  const root = matches[0]?.context as { site?: SiteBranding } | undefined
  return { ...DEFAULT_BRANDING, ...root?.site }
}

export function siteTitle(matches: HeadMatches, label?: string): string {
  const site = siteBranding(matches)
  return label
    ? `${label} · ${site.siteName}`
    : `${site.siteName} · ${site.siteDescription}`
}

/** `head: headTitle('域名')` — the page's own name, suffixed with the site's. */
export function headTitle(label?: string) {
  return ({ matches }: { matches: HeadMatches }) => ({
    meta: [{ title: siteTitle(matches, label) }],
  })
}

type IconLink = {
  rel: string
  href: string
  type?: string
  sizes?: string
}

/**
 * Tab and home-screen icons. A logo from the site settings wins; otherwise the
 * icon set shipped in `public/` (an "@" mark) is used.
 */
export function siteIcons(logoUrl: string): IconLink[] {
  if (logoUrl) {
    return [
      { rel: 'icon', href: logoUrl },
      { rel: 'apple-touch-icon', href: logoUrl },
    ]
  }

  return [
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    {
      rel: 'icon',
      href: '/favicon-32x32.png',
      type: 'image/png',
      sizes: '32x32',
    },
    {
      rel: 'icon',
      href: '/favicon-16x16.png',
      type: 'image/png',
      sizes: '16x16',
    },
    {
      rel: 'apple-touch-icon',
      href: '/apple-touch-icon.png',
      sizes: '180x180',
    },
  ]
}
