import {
  APP_NAME,
  APP_DOMAIN,
  buildShareUrl,
  formatBytes,
  type User,
  type Video,
  type ShareLink,
} from '@lmsy/shared'

const owner: User = {
  id: 'usr_demo',
  email: 'demo@letmeshowyou.com.au',
  displayName: 'Demo Owner',
  createdAt: '2026-07-10T00:00:00.000Z',
}

const sampleVideo: Video = {
  id: 'vid_demo',
  ownerId: owner.id,
  title: 'Onboarding walkthrough',
  status: 'ready',
  durationSeconds: 92,
  sizeBytes: 48_530_000,
  width: 2560,
  height: 1440,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}

const shareLink: ShareLink = {
  id: 'shr_demo',
  videoId: sampleVideo.id,
  slug: 'demo123',
  visibility: 'unlisted',
  createdAt: '2026-07-10T00:00:00.000Z',
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {APP_DOMAIN}
        </span>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">{APP_NAME}</h1>
        <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
          Record your screen on the desktop app, then share it anywhere with a single link. This is
          the Next.js web starter for the platform.
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Example (typed with <code className="font-mono">@lmsy/shared</code>)
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Title</dt>
            <dd className="font-medium">{sampleVideo.title}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Owner</dt>
            <dd className="font-medium">{owner.displayName}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd className="font-medium capitalize">{sampleVideo.status}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Size</dt>
            <dd className="font-medium">{formatBytes(sampleVideo.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Visibility</dt>
            <dd className="font-medium capitalize">{shareLink.visibility}</dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-neutral-500">Share link</dt>
            <dd className="font-mono text-indigo-600 dark:text-indigo-400">
              {buildShareUrl(shareLink.slug)}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
