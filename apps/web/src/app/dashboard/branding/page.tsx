import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/current-user'
import { getUserBrand } from '@/db/users'
import { BrandingForm } from './branding-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Branding' }

export default async function BrandingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const brand = await getUserBrand(user.id)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="rise flex flex-col gap-3">
        <Link href="/dashboard" className="text-sm text-faint transition hover:text-ink">
          ← Your recordings
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Branding</h1>
          <p className="mt-1 max-w-md text-sm text-muted">
            Make every recording you share look like your own. Your logo, name, and colour appear
            on the public share pages instead of Let Me Show You.
          </p>
        </div>
      </header>

      <BrandingForm initial={brand} fallbackName={user.name} />
    </main>
  )
}
