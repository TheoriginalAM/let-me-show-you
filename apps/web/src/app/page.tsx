import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'
import { Logo } from '@/components/brand/logo'
import { Scribble } from '@/components/brand/scribble'
import { BrandDemo } from '@/components/marketing/brand-demo'

/** The product, mid-explanation: a client's page, circled and pointed at, with the presenter's face. */
function HeroScreen() {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[1.4rem] border-2 border-ink bg-surface shadow-[10px_10px_0_0_var(--color-ink)]">
        <div className="flex items-center gap-2 border-b-2 border-ink bg-canvas-2 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-hl-pink" />
          <span className="h-3 w-3 rounded-full bg-hl-yellow" />
          <span className="h-3 w-3 rounded-full bg-hl-green" />
          <span className="ml-3 min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-1 font-mono text-[0.68rem] text-faint">
            acmeplumbing.com.au/pricing
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-hl-pink px-2.5 py-0.5 text-[0.68rem] font-bold text-[#17132b]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#17132b] motion-reduce:animate-none" />
            0:42
          </span>
        </div>
        {/* A client's website, simplified */}
        <div className="relative px-6 pb-8 pt-6 sm:px-8">
          <div className="h-3 w-24 rounded-full bg-line-strong" />
          <div className="mt-4 h-6 w-3/4 rounded-md bg-ink/85" />
          <div className="mt-2 h-6 w-1/2 rounded-md bg-ink/85" />
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3"
              >
                <div className="h-2.5 w-10 rounded-full bg-line-strong" />
                <div className="h-5 w-14 rounded-md bg-ink/80" />
                <div className="h-2 w-full rounded-full bg-line" />
                <div className="h-2 w-4/5 rounded-full bg-line" />
                <div
                  className={`mt-2 h-7 rounded-lg ${i === 1 ? 'bg-hl-orange' : 'bg-line-strong'}`}
                />
              </div>
            ))}
          </div>
          {/* The markup: circled, pointed at, explained */}
          <Scribble
            kind="circle"
            className="absolute left-[34%] top-[58%] h-[34%] w-[38%]"
            color="var(--color-hl-yellow)"
            width={6}
            delay={0.9}
            duration={1.1}
          />
          <svg
            viewBox="0 0 24 24"
            className="absolute left-[54%] top-[78%] h-8 w-8 drop-shadow-[2px_3px_0_rgb(23_19_43/0.35)]"
            aria-hidden
          >
            <path
              d="M5 3v16.5l4.2-3.8 2.9 6 3.1-1.4-2.8-5.9 5.8-.4z"
              fill="#fff"
              stroke="#17132b"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <span className="absolute -right-2 top-[30%] hidden rotate-[5deg] font-hand text-[1.7rem] leading-none text-accent-ink sm:block">
        make this one
        <br />
        green?
      </span>
      <Scribble
        kind="arrow"
        className="absolute right-[17%] top-[47%] hidden h-12 w-14 rotate-[95deg] sm:block"
        color="var(--color-accent-ink)"
        width={3}
        delay={1.7}
        duration={0.6}
      />
      {/* The presenter's camera bubble */}
      <div className="absolute -bottom-6 -left-4 grid h-24 w-24 place-items-center overflow-hidden rounded-full border-[3px] border-ink bg-hl-yellow sm:h-28 sm:w-28">
        <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden>
          <circle cx="40" cy="31" r="14" fill="#17132b" />
          <path d="M12 80c2-18 14-28 28-28s26 10 28 28z" fill="#17132b" />
          <circle cx="35" cy="30" r="1.8" fill="#ffe14a" />
          <circle cx="45" cy="30" r="1.8" fill="#ffe14a" />
          <path
            d="M35 37c3 3 7 3 10 0"
            stroke="#ffe14a"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}

const PARTS = [
  {
    id: 'record',
    color: 'var(--color-hl-pink)',
    title: 'Record it',
    body: 'Talk through your screen like you would in the room. Stop, and the link is already on your clipboard. Clients watch in any browser, comment on the exact moment, and approve the work.',
  },
  {
    id: 'meet',
    color: 'var(--color-hl-sky)',
    title: 'Meet in your own room',
    body: 'Video calls with your name on the door. Give each client a room with its own link, colour and welcome note. They join from the browser and wait in your lobby until you let them in.',
  },
  {
    id: 'book',
    color: 'var(--color-hl-green)',
    title: 'Let them book',
    body: 'A booking page for each business you run. Calendars with your hours, your questions and a calendar invite, plus a private room and reminder emails for every booking.',
  },
] as const

function RecordMock() {
  return (
    <div className="rounded-xl border-2 border-ink bg-surface p-3">
      <div className="grid aspect-video place-items-center rounded-lg bg-ink">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-hl-pink">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-[#17132b]" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">New homepage, first look</span>
        <span className="shrink-0 rounded-md bg-hl-pink px-2 py-0.5 text-xs font-bold text-[#17132b]">
          Link copied
        </span>
      </div>
    </div>
  )
}

function MeetMock() {
  return (
    <div
      className="rounded-xl border-2 border-ink p-4"
      style={{ background: 'linear-gradient(135deg, #0b6bff, #38bdff 50%, #2fd98a)' }}
    >
      <div className="mx-auto flex max-w-[14rem] flex-col items-center gap-2 rounded-xl bg-[#12101f]/80 p-4 text-center text-white backdrop-blur">
        <span className="font-display text-sm font-extrabold">Acme weekly check-in</span>
        <span className="text-xs text-white/70">Grab a coffee, I&rsquo;ll let you in shortly.</span>
        <span className="mt-1 w-full rounded-lg bg-hl-sky py-1.5 text-xs font-bold text-[#17132b]">
          Ask to join
        </span>
      </div>
    </div>
  )
}

function BookMock() {
  const days = Array.from({ length: 14 }, (_, i) => i + 9)
  return (
    <div className="rounded-xl border-2 border-ink bg-surface p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem]">
        {days.map((d) => (
          <span
            key={d}
            className={`grid aspect-square place-items-center rounded-full font-bold ${
              d === 12
                ? 'bg-hl-green text-[#17132b]'
                : d % 7 === 0 || d % 7 === 6
                  ? 'text-faint'
                  : 'bg-hl-green/15 text-ink'
            }`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[0.7rem] font-bold">
        {['9:00', '10:30', '2:00'].map((t, i) => (
          <span
            key={t}
            className={`rounded-md border-2 py-1 ${i === 1 ? 'border-ink bg-ink text-canvas' : 'border-line-strong text-ink'}`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
          <Link href="/" aria-label={`${APP_NAME} home`}>
            <Logo wide compact markClass="h-8 w-8" className="text-[0.95rem]" />
          </Link>
          <nav className="flex items-center gap-1.5 text-sm sm:gap-2">
            <a
              href="#how"
              className="hidden rounded-lg px-3 py-1.5 font-medium text-muted transition hover:text-ink md:inline-flex"
            >
              What it does
            </a>
            <a
              href="#brand"
              className="hidden rounded-lg px-3 py-1.5 font-medium text-muted transition hover:text-ink md:inline-flex"
            >
              Your brand
            </a>
            <Link
              href="/login"
              className="inline-flex whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-ink transition hover:bg-surface"
            >
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary whitespace-nowrap px-4 py-2">
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-5 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-28">
          <div className="flex flex-col items-start gap-7">
            <h1 className="wide rise font-display text-[2.9rem] font-black leading-[0.9] tracking-[-0.03em] text-ink sm:text-[4.6rem] lg:text-[5.2rem]">
              Show, <br />
              don&rsquo;t tell.
            </h1>
            <p
              className="rise max-w-[30rem] text-lg leading-relaxed text-muted"
              style={{ animationDelay: '80ms' }}
            >
              Record your screen and talk it through. Meet clients in a room with your name on the
              door. Let them book a time that suits. All in your own colours, for every business you
              run.
            </p>
            <div
              className="rise flex flex-wrap items-center gap-3"
              style={{ animationDelay: '140ms' }}
            >
              <Link href="/signup" className="btn-primary px-6 py-3.5 text-base">
                Start free
              </Link>
              <Link href="/download" className="btn-ghost px-6 py-3.5 text-base">
                Download the app
              </Link>
            </div>
            <p className="rise text-sm text-faint" style={{ animationDelay: '180ms' }}>
              Recorder for Mac and Windows. Calls and booking run in any browser.
            </p>
          </div>
          <div className="rise px-2 pb-6 sm:px-6" style={{ animationDelay: '200ms' }}>
            <HeroScreen />
          </div>
        </section>

        {/* The three parts */}
        <section id="how" className="scroll-mt-20 border-y-2 border-ink bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6">
            <h2 className="max-w-2xl font-display text-[2.4rem] font-black leading-[1.02] tracking-tight text-ink sm:text-[3rem]">
              Everything you do to explain your work, in one place
            </h2>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {PARTS.map((p) => (
                <article
                  key={p.id}
                  className="flex flex-col gap-5 rounded-[1.6rem] border-2 border-ink p-6 shadow-[6px_6px_0_0_var(--color-ink)]"
                  style={{ background: p.color }}
                >
                  {p.id === 'record' ? (
                    <RecordMock />
                  ) : p.id === 'meet' ? (
                    <MeetMock />
                  ) : (
                    <BookMock />
                  )}
                  <div className="text-[#17132b]">
                    <h3 className="font-display text-2xl font-black tracking-tight">{p.title}</h3>
                    <p className="mt-2 leading-relaxed text-[#17132b]/80">{p.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* White label */}
        <section id="brand" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-24 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <h2 className="font-display text-[2.4rem] font-black leading-[1.02] tracking-tight text-ink sm:text-[3rem]">
              Your brand on everything clients see
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Each business gets its own logo, colour, light or dark pages and heading style, across
              booking pages, meeting rooms, shared videos and emails. Pick one below to see the same
              page change hands.
            </p>
          </div>
          <BrandDemo />
        </section>

        {/* Why */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-6">
          <div className="grid gap-8 rounded-[1.6rem] border-2 border-dashed border-line-strong p-8 sm:p-12 lg:grid-cols-[1fr_1.4fr]">
            <h2 className="font-display text-3xl font-black leading-tight tracking-tight text-ink">
              Made by people who do client work all day
            </h2>
            <div className="flex flex-col gap-4 text-lg leading-relaxed text-muted">
              <p>
                We run agencies, freelance and ship product. We lost whole afternoons to calls that
                should have been a two minute video, and to emails nobody read.
              </p>
              <p>
                So we built the tool we wanted: show the thing, put your name on it, and let clients
                pick a time without ten emails back and forth.
              </p>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="bg-ink text-canvas [--color-accent-ink:#b9b0ff]">
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-7 px-5 py-20 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="wide relative font-display text-[2.8rem] font-black leading-[0.95] tracking-tight sm:text-[3.8rem]">
              Stop typing.
              <br />
              Start showing.
              <Scribble
                kind="underline"
                className="absolute -bottom-4 left-0 h-5 w-[80%]"
                color="var(--color-hl-yellow)"
                width={5}
                animate={false}
              />
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-[0.8rem] bg-hl-yellow px-6 py-3.5 font-bold text-[#17132b] shadow-[0_3px_0_0_#c9a800] transition hover:-translate-y-px"
              >
                Start free
              </Link>
              <Link
                href="/download"
                className="inline-flex items-center rounded-[0.8rem] border-2 border-canvas/30 px-6 py-3.5 font-semibold text-canvas transition hover:border-canvas"
              >
                Download the app
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-ink text-canvas/60 [--color-accent-ink:#b9b0ff]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-canvas/15 px-5 py-6 text-sm sm:px-6">
          <span>© 2026 {APP_NAME}</span>
          <div className="flex gap-5">
            <Link href="/login" className="inline-flex py-1 transition hover:text-canvas">
              Sign in
            </Link>
            <Link href="/download" className="inline-flex py-1 transition hover:text-canvas">
              Download
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
