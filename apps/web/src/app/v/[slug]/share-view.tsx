'use client'

import { useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { Chapter } from '@/lib/video-notes'
import { recordShareView } from './actions'
import { usePlayer, type PlayerLike } from './player-context'

// The Mux player is a custom element that only runs in the browser, so load it
// client-side only and show a poster-shaped skeleton while it hydrates.
const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video w-full animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
  ),
})

export function ShareView({
  slug,
  playbackId,
  title,
  poster,
  accentColor,
  chapters,
}: {
  slug: string
  playbackId: string
  title: string
  poster: string
  accentColor: string
  chapters?: Chapter[] | null
}) {
  const player = usePlayer()
  const el = useRef<PlayerLike | null>(null)

  useEffect(() => {
    // Fire-and-forget; the server action debounces to 1/IP/hour.
    void recordShareView(slug).catch(() => {})
  }, [slug])

  // Once the video has loaded: start at ?t= (a link to a moment), and show
  // chapters as marks on the player's timeline.
  const onLoaded = useCallback(() => {
    const p = el.current
    if (!p) return
    const t = Number(new URLSearchParams(window.location.search).get('t'))
    if (Number.isFinite(t) && t > 0 && p.currentTime < 1) p.currentTime = t
    if (!p.addChapters || !chapters?.length) return
    const sorted = [...chapters].sort((a, b) => a.start - b.start)
    void p.addChapters(
      sorted.map((c, i) => ({
        startTime: c.start,
        endTime: sorted[i + 1]?.start,
        value: c.title,
      })),
    )
  }, [chapters])

  const setRef = useCallback(
    (node: PlayerLike | null) => {
      el.current = node
      player.register(node)
    },
    [player],
  )

  return (
    <MuxPlayer
      ref={setRef}
      playbackId={playbackId}
      poster={poster}
      accentColor={accentColor}
      streamType="on-demand"
      metadata={{ video_title: title }}
      onLoadedMetadata={onLoaded}
      className="w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: '16 / 9' }}
    />
  )
}
