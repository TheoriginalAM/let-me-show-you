import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { APP_NAME } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { SignOutButton } from '@/components/sign-out-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Pending approval', robots: { index: false } }

export default async function PendingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.approved) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="eyebrow rise" style={{ animationDelay: '40ms' }}>
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
        {APP_NAME}
      </span>
      <div
        className="rise glass grid h-16 w-16 place-items-center rounded-2xl text-2xl ring-1 ring-inset ring-amber-500/25"
        style={{ animationDelay: '90ms' }}
      >
        ⏳
      </div>
      <h1
        className="rise font-display text-3xl font-semibold tracking-tight sm:text-4xl"
        style={{ animationDelay: '150ms' }}
      >
        Your account is pending approval
      </h1>
      <p className="rise max-w-md leading-relaxed text-muted" style={{ animationDelay: '210ms' }}>
        Thanks for signing up, {user.name}. {APP_NAME} is invite-only right now — an admin reviews
        new accounts before they get access. You’ll be able to record and share as soon as you’re
        approved.
      </p>
      <div className="rise pt-1" style={{ animationDelay: '270ms' }}>
        <SignOutButton />
      </div>
    </main>
  )
}
