import Link from 'next/link'
import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'

const features = [
  {
    title: 'Record with your voice',
    body: 'Capture your screen and narrate as you go. Explain the thing instead of typing three paragraphs about it.',
  },
  {
    title: 'Share with one link',
    body: 'Every recording gets a clean public link that plays instantly in the browser — no sign-up for the person watching.',
  },
  {
    title: 'See what lands',
    body: 'Know when your clients actually watched. View counts on every recording, right in your dashboard.',
  },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="font-medium hover:underline">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6">
        <section className="flex flex-col items-start gap-6 py-16 sm:py-24">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {APP_DOMAIN}
          </span>
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
            Show, don’t tell.
          </h1>
          <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-400">
            Record your screen with voiceover and send it to clients as a single link. Walk them
            through the work instead of writing another long email.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/download"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Download the app
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-6 pb-20 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800"
            >
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-6 py-6 text-sm text-neutral-500 dark:border-neutral-800">
        <span>
          © {2026} {APP_NAME}
        </span>
        <div className="flex gap-4">
          <Link href="/login" className="hover:underline">
            Sign in
          </Link>
          <Link href="/download" className="hover:underline">
            Download
          </Link>
        </div>
      </footer>
    </div>
  )
}
