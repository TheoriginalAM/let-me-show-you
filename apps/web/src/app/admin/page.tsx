import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/current-user'
import { listUsersForAdmin } from '@/db/users'
import { approveUserAction, revokeUserAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const users = await listUsersForAdmin()
  // Pending first so new sign-ups surface at the top.
  const sorted = [...users].sort((a, b) => Number(a.approved) - Number(b.approved))
  const pendingCount = users.filter((u) => !u.approved).length

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-14 sm:px-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
            Admin
          </span>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Users
          </h1>
          <p className="mt-2 text-sm text-muted">
            {pendingCount > 0 ? (
              <span className="font-medium text-amber-300">{pendingCount} awaiting approval</span>
            ) : (
              'Nobody awaiting approval'
            )}{' '}
            · {users.length} total
          </p>
        </div>
        <Link href="/dashboard" className="btn-ghost px-4 py-2 text-sm">
          ← Dashboard
        </Link>
      </header>

      <ul
        className="glass rise divide-y divide-line overflow-hidden rounded-2xl"
        style={{ animationDelay: '80ms' }}
      >
        {sorted.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02]"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-medium text-ink">
                {u.name}
                {u.role === 'admin' && (
                  <span className="rounded bg-accent-strong/20 px-1.5 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-accent-ink ring-1 ring-inset ring-accent/30">
                    admin
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-faint">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {u.approved ? (
                <>
                  <span className="rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-300 ring-1 ring-inset ring-green-500/25">
                    Approved
                  </span>
                  {u.role !== 'admin' && (
                    <form action={revokeUserAction.bind(null, u.id)}>
                      <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                        Revoke
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/25">
                    Pending
                  </span>
                  <form action={approveUserAction.bind(null, u.id)}>
                    <button type="submit" className="btn-primary px-3.5 py-1.5 text-xs">
                      Approve
                    </button>
                  </form>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
