'use client'

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'

/** The bits of the Mux player element the share page uses. */
export interface PlayerLike {
  currentTime: number
  duration: number
  paused: boolean
  play(): Promise<void> | void
  addChapters?(chapters: { startTime: number; endTime?: number; value: string }[]): unknown
}

interface PlayerApi {
  /** Called by the player wrapper with its element (null on unmount). */
  register(el: PlayerLike | null): void
  /** Jump to a moment, start playing and bring the player into view. */
  seek(seconds: number): void
  /** Where the viewer is now (0 before the player loads). */
  currentTime(): number
  /** Length in seconds, once known. */
  duration(): number | null
  /** The player element, for listening to its events. */
  element(): PlayerLike | null
}

const PlayerContext = createContext<PlayerApi | null>(null)

/** Lets chapters, the transcript, reactions and comments drive one player. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PlayerLike | null>(null)

  const register = useCallback((el: PlayerLike | null) => {
    ref.current = el
  }, [])

  const seek = useCallback((seconds: number) => {
    const el = ref.current
    if (!el) return
    el.currentTime = Math.max(0, seconds)
    void Promise.resolve(el.play()).catch(() => {})
    const node = el as unknown as Element
    if (typeof node.scrollIntoView === 'function') {
      const rect = node.getBoundingClientRect()
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [])

  const api = useMemo<PlayerApi>(
    () => ({
      register,
      seek,
      currentTime: () => ref.current?.currentTime ?? 0,
      duration: () => {
        const d = ref.current?.duration
        return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : null
      },
      element: () => ref.current,
    }),
    [register, seek],
  )

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>
}

/** The share page's player, or a no-op stand-in outside a PlayerProvider. */
export function usePlayer(): PlayerApi {
  return (
    useContext(PlayerContext) ?? {
      register: () => {},
      seek: () => {},
      currentTime: () => 0,
      duration: () => null,
      element: () => null,
    }
  )
}
