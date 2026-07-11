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
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Connect your desktop app</h1>
        <p className="text-sm text-neutral-500">Log in to approve this device.</p>
        <Link
          href={`/login?redirect=${encodeURIComponent(back)}`}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Log in
        </Link>
      </main>
    )
  }

  return (
    <ApproveDevice initialCode={code ?? ''} account={session.user.name || session.user.email} />
  )
}
