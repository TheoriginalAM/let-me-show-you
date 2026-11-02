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
import { listVideoComments } from '@/db/comments'
import { getVideoReactions } from '@/db/reactions'
import { listVideoDocuments } from '@/db/video-notes'
import { getPublicVideoViewCount, getShareableVideoBySlug } from '@/db/queries'
import { userCanAccessVideo } from '@/db/workspaces'
import { aiConfigured } from '@/lib/ai-notes'
import { getCurrentUser } from '@/lib/current-user'
import { unlockCookieName, verifyUnlockToken } from '@/lib/share-password'
import { ApprovalWidget } from './approval'
import { Comments } from './comments'
import { ExpiredBanner, LinkExpired } from './expired'
import { ReportLink } from './report-link'
import { isLinkExpired } from '@/lib/link-expiry'
import { VideoNotes } from './notes'
import { PasswordGate } from './password-gate'
import { PlayerProvider } from './player-context'
import { ProcessingState } from './processing-state'
import { Reactions } from './reactions'
import { ShareView } from './share-view'
import { BrandedPage, BrandHeader } from '../../book/brand-header'
import { DEFAULT_ACCENT } from '@/lib/brand-theme'
import { Logo } from '@/components/brand/logo'

// Reads the DB per request and records views, so never static.
export const dynamic = 'force-dynamic'

// Dedupe the slug lookup across generateMetadata + the page render (one request).
const loadVideo = cache((slug: string) => getShareableVideoBySlug(slug))

/** Whether the current request has proven the password for a protected video. */
async function hasUnlocked(videoId: string, passwordHash: string): Promise<boolean> {
  const token = (await cookies()).get(unlockCookieName(videoId))?.value
  return Boolean(token && verifyUnlockToken(token, videoId, passwordHash))
}

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

  // An expired link shows viewers nothing, so its unfurl mustn't show the title
  // or thumbnail either (the business still sees the page itself).
  if (isLinkExpired(video.expiresAt)) {
    return {
      title: 'Expired link',
      description: `A recording shared on ${brandName}. This link has expired.`,
      robots: { index: false },
    }
  }

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

  const currentUser = await getCurrentUser()
  // Any member of the video's workspace can moderate its thread + see emails.
  const isOwner = Boolean(currentUser && (await userCanAccessVideo(currentUser.id, video.id)))
  // An expired link stops working for everyone but the business itself.
  const expired = Boolean(video.expiresAt && Date.parse(video.expiresAt) <= Date.now())
  const shutOut = expired && !isOwner

  // Password-protected: show only the lock screen until the viewer proves the
  // password (verified server-side; the cookie never carries the password).
  const locked =
    !shutOut && video.passwordHash ? !(await hasUnlocked(video.id, video.passwordHash)) : false
  const hidden = shutOut || locked

  const isReady = video.status === 'ready' && Boolean(video.muxPlaybackId)
  const viewCount = !hidden && isReady ? await getPublicVideoViewCount(video.id) : 0
  // Public comment thread — only loaded (and only rendered) once unlocked, so a
  // protected recording never leaks its discussion. The owner (if signed in)
  // gets moderation controls.
  const comments = hidden ? [] : await listVideoComments(video.id)
  // Write-ups: the business sees drafts too; viewers only what's published.
  const documents = hidden ? [] : await listVideoDocuments(video.id, { drafts: isOwner })
  // Commenter emails are only ever sent to the owner/members, never the public.
  const commentsForClient = comments.map((c) => ({
    ...c,
    authorEmail: isOwner ? c.authorEmail : null,
  }))
  // Reactions + the moments top-level comments point at, for the row and strip
  // under the player.
  const reactions = !hidden && isReady ? await getVideoReactions(video.id) : null
  const commentTimes = comments.flatMap((c) =>
    !c.parentId && c.atSeconds != null ? [c.atSeconds] : [],
  )
  const poster = video.muxPlaybackId
    ? muxThumbnailUrl(video.muxPlaybackId, { width: 1280, fitMode: 'preserve' })
    : ''

  // Owner branding: accent applies everywhere; a logo/name switches the header
  // and footer to a white-label look (with a subtle "Powered by" credit).
  const { brand } = video
  const accent = brand.color ?? DEFAULT_ACCENT
  const branded = Boolean(brand.name || brand.logo)

  return (
    <BrandedPage brand={brand}>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        {branded ? (
          <BrandHeader brand={brand} fallbackName={brand.name ?? ''} />
        ) : (
          <Link href="/" aria-label={APP_NAME} className="self-start">
            <Logo className="text-sm" markClass="h-7 w-7" />
          </Link>
        )}

        {expired && isOwner && video.expiresAt && <ExpiredBanner expiresAt={video.expiresAt} />}

        {shutOut ? (
          <LinkExpired businessName={brand.name || video.ownerName} />
        ) : locked ? (
          <PasswordGate slug={slug} accent={accent} />
        ) : (
          <PlayerProvider>
            {isReady && video.muxPlaybackId ? (
              <div className="rise relative" style={{ animationDelay: '80ms' }}>
                <div className="card overflow-hidden rounded-3xl p-2">
                  <ShareView
                    slug={slug}
                    playbackId={video.muxPlaybackId}
                    title={video.title}
                    poster={poster}
                    accentColor={accent}
                    chapters={video.chapters}
                  />
                </div>
              </div>
            ) : (
              <ProcessingState slug={slug} title={video.title} accent={accent} />
            )}

            {isReady && reactions && (
              <Reactions
                slug={slug}
                initialCounts={reactions.counts}
                initialMoments={reactions.moments}
                commentTimes={commentTimes}
              />
            )}

            <div className="rise flex flex-col gap-2" style={{ animationDelay: '150ms' }}>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
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
              {video.description && (
                <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted">
                  {video.description}
                </p>
              )}
            </div>

            {isReady && (
              <VideoNotes
                slug={slug}
                playbackId={video.muxPlaybackId}
                isOwner={isOwner}
                aiReady={aiConfigured()}
                transcriptStatus={video.transcriptStatus}
                transcript={video.transcript}
                summary={video.summary}
                chapters={video.chapters}
                notesStatus={video.notesStatus}
                documents={documents}
              />
            )}

            {video.approvalEnabled && isReady && (
              <ApprovalWidget
                slug={slug}
                defaultName={currentUser?.name ?? ''}
                defaultEmail={currentUser?.email ?? ''}
              />
            )}

            <Comments
              slug={slug}
              initialComments={commentsForClient}
              isOwner={isOwner}
              defaultName={currentUser?.name ?? ''}
              defaultEmail={currentUser?.email ?? ''}
            />
          </PlayerProvider>
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
              <Link href="/" className="font-medium text-accent-ink transition hover:opacity-80">
                Make your own
              </Link>
            </>
          )}
          {!isOwner && (
            <>
              <span aria-hidden className="mx-2">
                ·
              </span>
              <ReportLink slug={slug} />
            </>
          )}
        </footer>
      </main>
    </BrandedPage>
  )
}
