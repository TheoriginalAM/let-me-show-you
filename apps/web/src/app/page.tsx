import Link from 'next/link'
import { APP_DOMAIN, APP_NAME } from '@lmsy/shared'

const features = [
  {
    title: 'Record with your voice',
    body: 'Capture your screen and narrate as you go. Explain the thing instead of typing three paragraphs about it.',
    icon: (
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0M12 19v3" />
    ),
  },
  {
    title: 'Share with one link',
    body: 'Every recording becomes a clean public link that plays instantly in the browser — no sign-up for the person watching.',
    icon: (
      <path d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 5.657 5.657l-1 1M13.5 17.5l-1 1a4 4 0 0 1-5.657-5.657l1-1" />
    ),
  },
  {
    title: 'See what lands',
    body: 'Know when your clients actually watched. View counts on every recording, right in your dashboard.',
    icon: <path d="M3 3v18h18M8 14l3-4 3 3 4-6" />,
  },
]

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-b from-[#8281ff] to-accent-strong text-[10px] text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]">
              ▶
            </span>
            {APP_NAME}
          </span>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="btn-ghost px-3 py-1.5">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary px-3.5 py-1.5">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6">
        {/* ---------- Hero ---------- */}
        <section className="relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Photographic aurora backdrop, weighted right and faded out behind the headline. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-6 -top-10 bottom-0 -z-10 bg-[url('/brand/hero-atmosphere.jpg')] bg-cover bg-[center_right] opacity-60 [mask-image:linear-gradient(to_right,transparent,black_48%,black)]"
          />
          <div className="flex flex-col items-start gap-6">
            <span className="eyebrow rise" style={{ animationDelay: '40ms' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
              {APP_DOMAIN}
            </span>
            <h1
              className="rise font-display text-6xl font-semibold leading-[0.95] tracking-tight sm:text-7xl"
              style={{ animationDelay: '90ms' }}
            >
              <span className="text-gradient">Show,</span>
              <br />
              don’t tell.
            </h1>
            <p
              className="rise max-w-md text-lg leading-relaxed text-muted"
              style={{ animationDelay: '150ms' }}
            >
              Record your screen with voiceover and send it to clients as a single link. Walk them
              through the work instead of writing another long email.
            </p>
            <div
              className="rise flex flex-wrap items-center gap-3 pt-1"
              style={{ animationDelay: '210ms' }}
            >
              <Link href="/download" className="btn-primary px-5 py-3 text-sm">
                Download the app
              </Link>
              <Link href="/login" className="btn-ghost px-5 py-3 text-sm">
                Sign in
              </Link>
            </div>
          </div>

          {/* Floating product mock */}
          <div className="rise relative" style={{ animationDelay: '280ms' }}>
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_20%,rgba(120,110,255,0.35),transparent_70%)] blur-2xl" />
            <div className="glass overflow-hidden rounded-2xl p-2 shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)]">
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#14121f,#0c0b14)]">
                <div className="absolute inset-0 bg-[radial-gradient(40%_60%_at_50%_45%,rgba(130,120,255,0.22),transparent_70%)]" />
                <button className="relative grid h-16 w-16 place-items-center rounded-full bg-white/10 backdrop-blur ring-1 ring-white/20 transition hover:scale-105">
                  <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <span className="absolute bottom-3 right-3 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
                  2:14
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Q3 dashboard walkthrough</p>
                  <p className="text-xs text-faint">Sam Rivera · 2 hours ago · 34 views</p>
                </div>
                <span className="shrink-0 rounded-md bg-accent-strong/20 px-2 py-1 text-xs font-medium text-accent-ink ring-1 ring-inset ring-accent/30">
                  Link copied
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="glass glass-hover rounded-2xl p-6">
              <span className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-accent"
                >
                  {feature.icon}
                </svg>
              </span>
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </section>

        {/* ---------- CTA band ---------- */}
        <section className="relative mb-20 overflow-hidden rounded-3xl border border-line px-8 py-14 text-center">
          <div
            aria-hidden
            className="absolute inset-0 -z-20 bg-[url('/brand/cta-contours.jpg')] bg-cover bg-center opacity-40 [mask-image:radial-gradient(80%_120%_at_50%_100%,black,transparent_75%)]"
          />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_50%_0%,rgba(120,110,255,0.25),transparent_70%)]" />
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Stop typing. Start showing.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Record your first walkthrough in the next five minutes.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/download" className="btn-primary px-5 py-3 text-sm">
              Download the app
            </Link>
            <Link href="/signup" className="btn-ghost px-5 py-3 text-sm">
              Create account
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-6 text-sm text-faint">
        <span>© 2026 {APP_NAME}</span>
        <div className="flex gap-5">
          <Link href="/login" className="transition hover:text-ink">
            Sign in
          </Link>
          <Link href="/download" className="transition hover:text-ink">
            Download
          </Link>
        </div>
      </footer>
    </div>
  )
}
