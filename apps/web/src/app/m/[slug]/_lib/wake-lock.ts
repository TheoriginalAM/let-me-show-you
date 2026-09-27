'use client'

import { useEffect } from 'react'

/**
 * Keep the screen on while `active` (waiting in the lobby, or in a call). A
 * phone that auto-locks suspends the page: a waiting guest drops off the host's
 * lobby list, and a call with no video on screen loses its microphone. The
 * browser releases the lock whenever the page is hidden, so it's taken again
 * when the page is shown. Unsupported browsers just skip it.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let alive = true
    const request = async (): Promise<void> => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (alive) lock = next
        else void next.release().catch(() => undefined)
      } catch {
        // Not allowed right now (e.g. battery saver): the screen may lock.
      }
    }
    void request()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
    }
  }, [active])
}
