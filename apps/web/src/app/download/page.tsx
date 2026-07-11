import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'
import { getLatestRelease, releasesUrl } from '@/lib/github-releases'
import { DownloadButtons } from './download-buttons'

export const metadata: Metadata = {
  title: 'Download',
  description: `Download the ${APP_NAME} desktop recorder for macOS and Windows.`,
}

// Always reflect the current latest release (getLatestRelease fetches live).
export const dynamic = 'force-dynamic'

export default async function DownloadPage() {
  const release = await getLatestRelease()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="glass rise w-full rounded-3xl p-8 shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)] sm:p-10">
        <Link href="/" className="eyebrow mx-auto justify-center transition hover:text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
          {APP_NAME}
        </Link>
        <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Download <span className="text-gradient">{APP_NAME}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm leading-relaxed text-muted">
          Record your screen with voiceover on your desktop and share it with a single link. For
          macOS and Windows.
        </p>

        {release ? (
          <>
            <div className="mt-8">
              <DownloadButtons assets={release} />
            </div>
            <p className="mt-5 text-xs text-faint">
              Version {release.version} ·{' '}
              <a href={releasesUrl()} className="text-muted transition hover:text-ink">
                release notes &amp; older versions
              </a>
            </p>
          </>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-5">
            <p className="max-w-sm leading-relaxed text-muted">
              The desktop app isn’t published yet. Create your account now and you’ll be ready the
              moment it lands.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="btn-primary px-5 py-3 text-sm">
                Create account
              </Link>
              <a href={releasesUrl()} className="btn-ghost px-5 py-3 text-sm">
                Releases on GitHub
              </a>
            </div>
          </div>
        )}
      </div>

      <Link href="/" className="text-sm text-faint transition hover:text-ink">
        ← Back home
      </Link>
    </main>
  )
}
