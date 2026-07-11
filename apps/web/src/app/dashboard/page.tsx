import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buildShareUrl, formatRelativeDate, muxThumbnailUrl } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { listVideosByOwnerWithViews } from '@/db/queries'
import { SignOutButton } from '@/components/sign-out-button'
import { VideoCard } from '@/components/video-card'

// The session lookup reads request headers, so this route is always dynamic.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Middleware gates /dashboard on the cookie; this validates the session and
  // enforces the invite gate.
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const videos = await listVideosByOwnerWithViews(user.id)
  const now = Date.now()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="rise flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your recordings</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {user.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'admin' && (
            <Link href="/admin" className="btn-ghost px-3 py-1.5 text-sm">
              Admin
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      {videos.length === 0 ? (
        <div className="glass rise rounded-2xl border-dashed p-12 text-center">
          <h2 className="font-display text-lg font-semibold tracking-tight">No recordings yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Record your screen from the desktop app and it will appear here, ready to share.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              id={video.id}
              title={video.title}
              slug={video.shareSlug}
              shareUrl={buildShareUrl(video.shareSlug)}
              status={video.status}
              isPublic={video.isPublic}
              durationSeconds={video.durationSeconds}
              viewCount={video.viewCount}
              createdLabel={formatRelativeDate(video.createdAt, now)}
              thumbnailUrl={
                video.muxPlaybackId
                  ? muxThumbnailUrl(video.muxPlaybackId, {
                      width: 640,
                      height: 360,
                      fitMode: 'smartcrop',
                    })
                  : null
              }
            />
          ))}
        </div>
      )}

      <footer className="mt-auto border-t border-line pt-6 text-sm text-faint">
        <Link href="/" className="transition hover:text-ink">
          ← Back to {`letmeshowyou.com.au`}
        </Link>
      </footer>
    </main>
  )
}
