import Link from 'next/link'
import type { Metadata } from 'next'
import { APP_NAME } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { getInviteByToken } from '@/db/workspaces'
import { AcceptInvite } from './accept'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Workspace invite', robots: { index: false } }

type PageProps = { params: Promise<{ token: string }> }

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params
  const invite = await getInviteByToken(token)
  const me = await getCurrentUser()
  const here = `/invite/${token}`

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="rise glass rounded-2xl p-8 text-center shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-b from-[#8281ff] to-accent-strong text-lg text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]">
          ▶
        </span>

        {!invite ? (
          <>
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
              Invite not found
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
              This invite is invalid or has expired. Ask whoever invited you to send a new one.
            </p>
            <Link href="/" className="btn-ghost mt-6 inline-block px-5 py-2.5 text-sm">
              Back home
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
              Join {invite.workspaceName}
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
              {invite.invitedByName ? `${invite.invitedByName} invited ` : 'You were invited '}
              <span className="text-ink">{invite.email}</span> to collaborate on {APP_NAME}.
            </p>

            <div className="mt-6">
              {me ? (
                <AcceptInvite token={token} />
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-faint">
                    Sign in as {invite.email} to accept.
                  </p>
                  <Link
                    href={`/signup?redirect=${encodeURIComponent(here)}`}
                    className="btn-primary w-full px-5 py-2.5 text-sm"
                  >
                    Create an account
                  </Link>
                  <Link
                    href={`/login?redirect=${encodeURIComponent(here)}`}
                    className="btn-ghost w-full px-5 py-2.5 text-sm"
                  >
                    Log in
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
