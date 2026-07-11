'use client'

import { useEffect, useState } from 'react'
import type { DownloadAssets } from '@/lib/github-releases'

type OS = 'mac' | 'windows' | 'other'

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  if (/Windows/.test(ua)) return 'windows'
  return 'other'
}

interface Option {
  key: string
  label: string
  href: string
}

export function DownloadButtons({ assets }: { assets: DownloadAssets }) {
  // Start OS-agnostic so SSR and first client render match, then refine.
  const [os, setOS] = useState<OS>('other')
  useEffect(() => setOS(detectOS()), [])

  const mac = [
    assets.macArm && {
      key: 'mac-arm',
      label: 'Download for Mac · Apple Silicon',
      href: assets.macArm,
    },
    assets.macIntel && {
      key: 'mac-intel',
      label: 'Download for Mac · Intel',
      href: assets.macIntel,
    },
  ].filter(Boolean) as Option[]
  const win: Option[] = assets.win
    ? [{ key: 'win', label: 'Download for Windows', href: assets.win }]
    : []

  const ordered = os === 'windows' ? [...win, ...mac] : [...mac, ...win]
  if (ordered.length === 0) {
    return (
      <p className="text-sm text-neutral-500">The latest release doesn’t have installers yet.</p>
    )
  }

  const [primary, ...rest] = ordered
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <a
        href={primary.href}
        className="w-full max-w-xs rounded-lg bg-indigo-600 px-5 py-3 text-center text-sm font-medium text-white hover:bg-indigo-500"
      >
        {primary.label}
      </a>
      {rest.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {rest.map((option) => (
            <a
              key={option.key}
              href={option.href}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {option.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
