/**
 * One place to speak to assistive tech.
 *
 * The interface changes on its own — the rail polls every 30 seconds, the
 * message list every 15 — and a screen reader is told nothing about it unless
 * something announces the change. `LiveRegion` owns the single polite region
 * (one per page, as the accessibility guidance recommends); everything else
 * only names the event.
 *
 * Deliberately not used for "loading…" states: those are noise, and the
 * skeleton plus `aria-busy` already say the same thing.
 */
type Listener = (message: string) => void

const listeners = new Set<Listener>()

/** Announce one short sentence. No-op on the server, where nobody listens. */
export function announce(message: string) {
  const text = message.trim()
  if (!text) return
  for (const listener of listeners) listener(text)
}

export function subscribeAnnouncements(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
