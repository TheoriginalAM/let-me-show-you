import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="eyebrow rise" style={{ animationDelay: '40ms' }}>
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
        {APP_NAME}
      </span>
      <div
        className="rise glass grid h-16 w-16 place-items-center rounded-2xl ring-1 ring-inset ring-white/10"
        style={{ animationDelay: '90ms' }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-accent"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>
      <h1
        className="rise font-display text-3xl font-semibold tracking-tight sm:text-4xl"
        style={{ animationDelay: '150ms' }}
      >
        This link isn’t available
      </h1>
      <p className="rise max-w-md leading-relaxed text-muted" style={{ animationDelay: '210ms' }}>
        The video may have been removed, set to private, or the link is incorrect.
      </p>
      <Link
        href="/"
        className="btn-primary rise px-5 py-3 text-sm"
        style={{ animationDelay: '270ms' }}
      >
        Go home
      </Link>
    </main>
  )
}
