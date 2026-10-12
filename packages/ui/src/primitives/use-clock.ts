import { useSyncExternalStore } from 'react'

// One minute timer shared by every subscriber, running only while someone listens.
let now = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    // The clock may have been idle; React re-reads the snapshot after subscribing.
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getNow = () => {
  if (!now) now = Date.now()
  return now
}
const getNull = () => null
const noSubscribe = () => () => {}

/**
 * Current time, refreshed each minute, or null on the server and during hydration so the
 * first client render matches the server's. Pass `false` to skip the timer.
 */
export function useMinuteClock(enabled = true): number | null {
  return useSyncExternalStore(
    enabled ? subscribe : noSubscribe,
    enabled ? getNow : getNull,
    getNull,
  )
}

let zone: string | undefined
/** The reader's IANA time zone, read once. Client only. */
export const localZone = () => {
  zone ??= Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone
}

/** The reader's IANA time zone, or null on the server and during hydration. */
export function useReaderZone(): string | null {
  return useSyncExternalStore(noSubscribe, localZone, getNull)
}
