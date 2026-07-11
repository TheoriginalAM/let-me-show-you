import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  APP_NAME,
  buildShareUrl,
  formatDuration,
  formatRelativeDate,
  muxThumbnailUrl,
} from '@lmsy/shared'
import { getPublicVideoViewCount, getVideoBySlug } from '@/db/queries'
import { ProcessingState } from './processing-state'
import { ShareView } from './share-view'

// Reads the DB per request and records views, so never static.
export const dynamic = 'force-dynamic'

// Dedupe the slug lookup across generateMetadata + the page render (one request).
const loadVideo = cache((slug: string) => getVideoBySlug(slug))

const ACCENT = '#4f46e5' // indigo-600 — brand accent

/** Mux static MP4 rendition (enabled via mp4_support: 'capped-1080p'). */
function muxMp4Url(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}/capped-1080p.mp4`
}

function viewLabel(n: number): string {
  return `${n.toLocaleString()} view${n === 1 ? '' : 's'}`
}

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const video = await loadVideo(slug)
  if (!video) {
    return { title: 'Video not found', robots: { index: false } }
  }

  const url = buildShareUrl(slug)
  const description = `A screen recording shared by ${video.ownerName} on ${APP_NAME}.`
  // JPEG (not webp) so crawlers like LinkedIn that can't decode webp still unfurl.
  const poster = video.muxPlaybackId
    ? muxThumbnailUrl(video.muxPlaybackId, {
        width: 1200,
        height: 675,
        fitMode: 'smartcrop',
        format: 'jpg',
      })
    : undefined

  return {
    title: video.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'video.other',
      siteName: APP_NAME,
      title: video.title,
      description,
      url,
      images: poster ? [{ url: poster, width: 1200, height: 675, alt: video.title }] : undefined,
      videos:
        video.status === 'ready' && video.muxPlaybackId
          ? [
              {
                url: muxMp4Url(video.muxPlaybackId),
                type: 'video/mp4',
                width: 1920,
                height: 1080,
              },
            ]
          : undefined,
    },
    twitter: {
      card: poster ? 'summary_large_image' : 'summary',
      title: video.title,
      description,
      images: poster ? [poster] : undefined,
    },
  }
}

export default async function SharePage({ params }: PageProps) {
  const { slug } = await params
  const video = await loadVideo(slug)
  if (!video) notFound()

  const isReady = video.status === 'ready' && Boolean(video.muxPlaybackId)
  const viewCount = isReady ? await getPublicVideoViewCount(video.id) : 0
  const poster = video.muxPlaybackId
    ? muxThumbnailUrl(video.muxPlaybackId, { width: 1280, fitMode: 'preserve' })
    : ''

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Get started
        </Link>
      </div>

      {isReady && video.muxPlaybackId ? (
        <ShareView
          slug={slug}
          playbackId={video.muxPlaybackId}
          title={video.title}
          poster={poster}
          accentColor={ACCENT}
        />
      ) : (
        <ProcessingState slug={slug} title={video.title} />
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {video.ownerName}
          </span>
          <span aria-hidden>·</span>
          <span>{formatRelativeDate(video.createdAt)}</span>
          {isReady && (
            <>
              <span aria-hidden>·</span>
              <span>{viewLabel(viewCount)}</span>
              {video.durationSeconds != null && (
                <>
                  <span aria-hidden>·</span>
                  <span>{formatDuration(video.durationSeconds)}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="mt-auto border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800">
        Recorded with {APP_NAME}.{' '}
        <Link href="/" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Make your own →
        </Link>
      </footer>
    </main>
  )
}
