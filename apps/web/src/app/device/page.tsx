import { headers } from 'next/headers'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ApproveDevice } from './approve-device'

export const dynamic = 'force-dynamic'

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    const back = `/device${code ? `?code=${encodeURIComponent(code)}` : ''}`
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <div className="glass rise flex flex-col items-center gap-5 rounded-2xl p-8 text-center">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
            Desktop app
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Connect your desktop app
          </h1>
          <p className="text-sm leading-relaxed text-muted">Sign in to approve this device.</p>
          <Link
            href={`/login?redirect=${encodeURIComponent(back)}`}
            className="btn-primary px-5 py-3 text-sm"
          >
            Sign in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <ApproveDevice initialCode={code ?? ''} account={session.user.name || session.user.email} />
  )
}
