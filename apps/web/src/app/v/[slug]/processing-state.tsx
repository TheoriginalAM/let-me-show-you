'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { pollShareStatus } from './actions'

/**
 * Shown while a shared video is still `processing`/`uploading`. Polls every 5s
 * and refreshes the route (which re-renders the server component into the player)
 * once Mux reports the asset is ready.
 */
export function ProcessingState({ slug, title }: { slug: string; title: string }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await pollShareStatus(slug).catch(() => null)
      if (status === 'ready' || status === 'errored' || status === 'notfound') {
        router.refresh()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [slug, router])

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-xl border border-neutral-200 bg-neutral-50 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600 dark:border-neutral-700 dark:border-t-indigo-400" />
      <div className="px-6">
        <p className="font-medium">Still processing…</p>
        <p className="mt-1 text-sm text-neutral-500">
          “{title}” is being prepared. This page will update automatically.
        </p>
      </div>
    </div>
  )
}
