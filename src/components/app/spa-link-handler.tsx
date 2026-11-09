import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * Keeps same-origin `<a href="/...">` links inside the router. The design
 * system's ButtonLink / LinkButton render plain anchors, so without this a
 * click on "写邮件" reloads the whole document and loses client state.
 *
 * Runs at the document level, after React's own handlers: router `<Link>`s
 * have already called preventDefault, so they are left alone. Modified
 * clicks, new-tab targets, downloads and hash links keep native behaviour.
 */
export function SpaLinkHandler() {
  const router = useRouter()

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const anchor = (event.target as Element | null)?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return
      }

      event.preventDefault()
      void router.navigate({ href: `${url.pathname}${url.search}${url.hash}` })
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [router])

  return null
}
