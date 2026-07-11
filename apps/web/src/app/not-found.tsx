import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-sm font-semibold tracking-tight text-neutral-500">{APP_NAME}</span>
      <h1 className="text-3xl font-bold tracking-tight">This link isn’t available</h1>
      <p className="text-neutral-500">
        The video may have been removed, set to private, or the link is incorrect.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Go home
      </Link>
    </main>
  )
}
