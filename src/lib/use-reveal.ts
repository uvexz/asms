import { useEffect, useLayoutEffect, useRef } from 'react'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Reveals a block once, when it enters the viewport.
 *
 * The block renders visible and stays visible without JS — the hook only
 * parks it (`data-reveal="pending"`) when it is still below the fold, so a
 * failed hydration can never leave content unreadable. Anything already on
 * screen is left alone: it is covered by the page-load animation instead.
 *
 * Children opt in with `data-reveal-item`; `--reveal-index` staggers them.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null)

  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Give the page a moment to settle, then only animate what is genuinely
    // off screen.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return

    element.dataset.reveal = 'pending'

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          element.dataset.reveal = 'in'
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return ref
}
