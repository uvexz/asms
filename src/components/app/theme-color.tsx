import { useEffect } from 'react'

import { useThemeMode } from '@/components/application/theme/theme-toggle'

/** Matches `--color-background-full` in each theme. */
const THEME_COLORS = { light: '#ffffff', dark: '#121212' } as const

/**
 * Tints the browser chrome with the active theme. The `<meta>` lives in the
 * root document with the light value; React's head manager keeps one tag per
 * name, so the dark value is applied here instead of a `media` variant.
 */
export function ThemeColor() {
  const theme = useThemeMode()

  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme])
  }, [theme])

  return null
}
