import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buildShareUrl, formatRelativeDate, muxThumbnailUrl } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { commentCountsByVideo } from '@/db/comments'
import { approvalCountsByVideo } from '@/db/approvals'
import { listVideosByWorkspaceWithViews } from '@/db/queries'
import { getActiveWorkspaceId, listWorkspacesForUser } from '@/db/workspaces'
import { Icon } from '@/components/brand/icons'
import { Scribble } from '@/components/brand/scribble'
import { VideoCard } from '@/components/video-card'
import { PageHeader } from './page-header'

// The session lookup reads request headers, so this route is always dynamic.
export const dynamic = 'force-dynamic'

const FIRST_STEPS = [
  { title: 'Get the app', body: 'Download Let Me Show You for Mac or Windows and sign in.' },
  {
    title: 'Record and talk',
    body: 'Pick a screen or window and explain it out loud, like you would in the room.',
  },
  {
    title: 'Paste the link',
    body: 'Stop, and the link is on your clipboard. It plays in any browser.',
  },
]

export default async function DashboardPage() {
  // The layout gates sign-in and approval; this still needs the user for data.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const workspaces = await listWorkspacesForUser(user.id)
  const activeId = await getActiveWorkspaceId(user.id)
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null

  const videos = active ? await listVideosByWorkspaceWithViews(active.id) : []
  const videoIds = videos.map((v) => v.id)
  const [commentCounts, approvalCounts] = await Promise.all([
    commentCountsByVideo(videoIds),
    approvalCountsByVideo(videoIds),
  ])
  const now = Date.now()

  return (
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        section="recordings"
        title="Recordings"
        description={
          videos.length === 0
            ? `Walkthroughs you record for ${active?.name ?? 'this business'} land here, ready to share.`
            : `${videos.length} recording${videos.length === 1 ? '' : 's'} in ${active?.name ?? 'this business'}.`
        }
        actions={
          <Link href="/download" className="btn-ghost px-4 py-2 text-sm">
            <Icon name="download" className="h-4 w-4" strokeWidth={2.1} />
            Get the app
          </Link>
        }
      />

      {videos.length === 0 ? (
        <section className="card relative overflow-hidden rounded-3xl p-8 sm:p-10">
          <div className="grid items-center gap-10 xl:grid-cols-[1fr_18rem]">
            <div>
              <h2 className="max-w-md font-display text-2xl font-extrabold tracking-tight text-ink">
                Your first recording is three steps away
              </h2>
              <ol className="mt-6 flex max-w-lg flex-col gap-4">
                {FIRST_STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-extrabold text-canvas">
                      {i + 1}
                    </span>
                    <span className="flex flex-col gap-0.5 pt-0.5">
                      <span className="font-semibold text-ink">{step.title}</span>
                      <span className="text-sm leading-relaxed text-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <Link href="/download" className="btn-primary mt-8 px-5 py-3 text-sm">
                Download the app
              </Link>
            </div>
            {/* A little screen with the pen already on it. */}
            <div className="relative mx-auto hidden w-full max-w-[18rem] xl:block" aria-hidden>
              <div className="rotate-2 rounded-2xl border-2 border-ink bg-surface p-2 shadow-[6px_6px_0_0_var(--color-ink)]">
                <div className="flex gap-1.5 px-1 pb-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-hl-pink" />
                  <span className="h-2.5 w-2.5 rounded-full bg-hl-yellow" />
                  <span className="h-2.5 w-2.5 rounded-full bg-hl-green" />
                </div>
                <div className="relative grid aspect-video place-items-center rounded-xl bg-canvas-2">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-on-accent">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  <Scribble
                    kind="circle"
                    className="absolute inset-x-6 inset-y-5"
                    color="var(--color-hl-pink)"
                    width={4}
                    delay={0.4}
                  />
                </div>
              </div>
              <span className="absolute -bottom-7 right-0 -rotate-6 font-hand text-2xl text-accent-ink">
                your link, ready!
              </span>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              id={video.id}
              title={video.title}
              slug={video.shareSlug}
              shareUrl={buildShareUrl(video.shareSlug)}
              status={video.status}
              isPublic={video.isPublic}
              isProtected={video.hasPassword}
              durationSeconds={video.durationSeconds}
              viewCount={video.viewCount}
              commentCount={commentCounts[video.id] ?? 0}
              description={video.description}
              approvalEnabled={video.approvalEnabled}
              approvalCounts={approvalCounts[video.id] ?? { approved: 0, changes: 0 }}
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
    </div>
  )
}
