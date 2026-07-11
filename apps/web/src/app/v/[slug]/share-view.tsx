'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { recordShareView } from './actions'

// The Mux player is a custom element that only runs in the browser, so load it
// client-side only and show a poster-shaped skeleton while it hydrates.
const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-xl bg-white/[0.04]" />,
})

export function ShareView({
  slug,
  playbackId,
  title,
  poster,
  accentColor,
}: {
  slug: string
  playbackId: string
  title: string
  poster: string
  accentColor: string
}) {
  useEffect(() => {
    // Fire-and-forget; the server action debounces to 1/IP/hour.
    void recordShareView(slug).catch(() => {})
  }, [slug])

  return (
    <MuxPlayer
      playbackId={playbackId}
      poster={poster}
      accentColor={accentColor}
      streamType="on-demand"
      metadata={{ video_title: title }}
      className="w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: '16 / 9' }}
    />
  )
}
