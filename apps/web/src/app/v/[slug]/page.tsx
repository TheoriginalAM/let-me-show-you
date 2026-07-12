import { cache } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  APP_NAME,
  buildShareUrl,
  formatDuration,
  formatRelativeDate,
  muxThumbnailUrl,
} from '@lmsy/shared'
import { getPublicVideoViewCount, getShareableVideoBySlug } from '@/db/queries'
import { unlockCookieName, verifyUnlockToken } from '@/lib/share-password'
import { PasswordGate } from './password-gate'
import { ProcessingState } from './processing-state'
import { ShareView } from './share-view'

// Reads the DB per request and records views, so never static.
export const dynamic = 'force-dynamic'

// Dedupe the slug lookup across generateMetadata + the page render (one request).
const loadVideo = cache((slug: string) => getShareableVideoBySlug(slug))

/** Whether the current request has proven the password for a protected video. */
async function hasUnlocked(videoId: string, passwordHash: string): Promise<boolean> {
  const token = (await cookies()).get(unlockCookieName(videoId))?.value
  return Boolean(token && verifyUnlockToken(token, videoId, passwordHash))
}

const DEFAULT_ACCENT = '#8b8bf6' // luminous violet — the default brand accent

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

  const brandName = video.brand.name ?? APP_NAME

  // A protected recording must not leak its title, byline, or thumbnail into
  // social unfurls or search results. Advertise nothing but the lock.
  if (video.passwordHash) {
    return {
      title: 'Password-protected recording',
      description: `A private recording shared on ${brandName}.`,
      robots: { index: false },
    }
  }

  const url = buildShareUrl(slug)
  const description = `A screen recording shared by ${video.ownerName} on ${brandName}.`
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
      siteName: brandName,
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

  // Password-protected: show only the lock screen until the viewer proves the
  // password (verified server-side; the cookie never carries the password).
  const locked = video.passwordHash ? !(await hasUnlocked(video.id, video.passwordHash)) : false

  const isReady = video.status === 'ready' && Boolean(video.muxPlaybackId)
  const viewCount = !locked && isReady ? await getPublicVideoViewCount(video.id) : 0
  const poster = video.muxPlaybackId
    ? muxThumbnailUrl(video.muxPlaybackId, { width: 1280, fitMode: 'preserve' })
    : ''

  // Owner branding: accent applies everywhere; a logo/name switches the header
  // and footer to a white-label look (with a subtle "Powered by" credit).
  const { brand } = video
  const accent = brand.color ?? DEFAULT_ACCENT
  const branded = Boolean(brand.name || brand.logo)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between">
        {branded ? (
          <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-ink">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt="" className="h-7 w-7 rounded-md object-contain" />
            ) : brand.name ? (
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
                style={{ background: accent }}
              >
                {brand.name.charAt(0).toUpperCase()}
              </span>
            ) : null}
            {brand.name && <span className="truncate">{brand.name}</span>}
          </span>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-b from-[#8281ff] to-accent-strong text-[10px] text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]">
              ▶
            </span>
            {APP_NAME}
          </Link>
        )}
        {!branded && (
          <Link href="/signup" className="btn-primary px-3.5 py-1.5 text-sm">
            Get started
          </Link>
        )}
      </div>

      {locked ? (
        <PasswordGate slug={slug} accent={accent} />
      ) : (
        <>
          {isReady && video.muxPlaybackId ? (
            <div className="rise relative" style={{ animationDelay: '80ms' }}>
              <div
                className="absolute -inset-6 -z-10 rounded-[2rem] blur-2xl"
                style={{
                  background: `radial-gradient(60% 60% at 50% 20%, ${accent}4d, transparent 70%)`,
                }}
              />
              <div className="glass overflow-hidden rounded-2xl p-2 shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)]">
                <ShareView
                  slug={slug}
                  playbackId={video.muxPlaybackId}
                  title={video.title}
                  poster={poster}
                  accentColor={accent}
                />
              </div>
            </div>
          ) : (
            <ProcessingState slug={slug} title={video.title} accent={accent} />
          )}

          <div className="rise flex flex-col gap-2" style={{ animationDelay: '150ms' }}>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {video.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-faint">
              <span className="font-medium text-muted">{video.ownerName}</span>
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
        </>
      )}

      <footer className="mt-auto border-t border-line pt-6 text-sm text-faint">
        {branded ? (
          <span>
            Powered by{' '}
            <Link href="/" className="font-medium text-muted transition hover:text-ink">
              {APP_NAME}
            </Link>
          </span>
        ) : (
          <>
            Recorded with {APP_NAME}.{' '}
            <Link
              href="/"
              className="font-medium transition hover:opacity-80"
              style={{ color: accent }}
            >
              Make your own →
            </Link>
          </>
        )}
      </footer>
    </main>
  )
}
