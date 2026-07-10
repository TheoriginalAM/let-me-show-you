import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { buildShareUrl, formatDuration } from '@lmsy/shared'
import { auth } from '@/lib/auth'
import { listVideosByOwner } from '@/db/queries'
import { SignOutButton } from '@/components/sign-out-button'

// The session lookup reads request headers, so this route is always dynamic.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  // Middleware already gates /dashboard on the cookie; this validates the
  // session for real and gives us the trusted user id.
  if (!session) {
    redirect('/login')
  }

  const videos = await listVideosByOwner(session.user.id)

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your recordings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Signed in as {session.user.name || session.user.email}
          </p>
        </div>
        <SignOutButton />
      </header>

      {videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
          <h2 className="text-lg font-semibold">No recordings yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500">
            Record your screen from the desktop app and it will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {videos.map((video) => (
            <li
              key={video.id}
              className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800"
            >
              <div>
                <p className="font-medium">{video.title}</p>
                <p className="text-xs text-neutral-500">
                  {video.status} · {formatDuration(video.durationSeconds)} ·{' '}
                  {video.isPublic ? 'public' : 'private'}
                </p>
              </div>
              <a
                href={buildShareUrl(video.shareSlug)}
                className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              >
                /s/{video.shareSlug}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
