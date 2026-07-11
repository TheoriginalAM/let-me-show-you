import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'

export const metadata: Metadata = {
  title: 'Download',
  description: `Download the ${APP_NAME} desktop recorder for macOS and Windows.`,
}

export default function DownloadPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-500">
        {APP_NAME}
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Desktop app coming soon</h1>
      <p className="text-neutral-500">
        The macOS and Windows recorder is on the way. Create your account now and you’ll be ready to
        record and share the moment it lands.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create account
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Back home
        </Link>
      </div>
    </main>
  )
}
