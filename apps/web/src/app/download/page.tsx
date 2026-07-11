import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'
import { getLatestRelease, releasesUrl } from '@/lib/github-releases'
import { DownloadButtons } from './download-buttons'

export const metadata: Metadata = {
  title: 'Download',
  description: `Download the ${APP_NAME} desktop recorder for macOS and Windows.`,
}

export default async function DownloadPage() {
  const release = await getLatestRelease()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-500">
        {APP_NAME}
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Download {APP_NAME}</h1>
      <p className="text-neutral-500">
        Record your screen with voiceover on your desktop and share it with a single link. For macOS
        and Windows.
      </p>

      {release ? (
        <>
          <DownloadButtons assets={release} />
          <p className="text-xs text-neutral-500">
            Version {release.version} ·{' '}
            <a href={releasesUrl()} className="hover:underline">
              release notes &amp; older versions
            </a>
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-neutral-500">
            The desktop app isn’t published yet. Create your account now and you’ll be ready the
            moment it lands.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Create account
            </Link>
            <a
              href={releasesUrl()}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Releases on GitHub
            </a>
          </div>
        </div>
      )}

      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Back home
      </Link>
    </main>
  )
}
