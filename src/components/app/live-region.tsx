'use client'

import { useEffect, useState } from 'react'

import { subscribeAnnouncements } from '@/lib/announcer'

/**
 * The single polite live region for the whole document.
 *
 * The text is cleared and re-set on the next tick: writing the same sentence
 * twice in a row would otherwise leave the node's content unchanged, and an
 * unchanged node produces no announcement.
 */
export function LiveRegion() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = subscribeAnnouncements((next) => {
      setMessage('')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setMessage(next), 80)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}
