'use client'

import { useState } from 'react'
import { themeVars, type BrandFont, type BrandTheme } from '@/lib/brand-theme'

interface DemoBrand {
  id: string
  name: string
  tagline: string
  accent: string
  theme: BrandTheme
  font: BrandFont
  cover: string
  calendars: { title: string; length: string }[]
}

// Made-up businesses, to show one page wearing three brands.
const BRANDS: DemoBrand[] = [
  {
    id: 'harbour',
    name: 'Harbour Physio',
    tagline: 'Sports and spinal physiotherapy',
    accent: '#0f766e',
    theme: 'light',
    font: 'classic',
    cover: 'linear-gradient(120deg, #0f766e, #5eead4)',
    calendars: [
      { title: 'Telehealth consult', length: '30 min' },
      { title: 'Exercise plan review', length: '20 min' },
    ],
  },
  {
    id: 'neon',
    name: 'Neon Studio',
    tagline: 'Brand and web design',
    accent: '#ff5fa2',
    theme: 'dark',
    font: 'bold',
    cover: 'linear-gradient(120deg, #ff5fa2, #8a3cff 60%, #4f3cff)',
    calendars: [
      { title: 'Project kick-off', length: '1 hr' },
      { title: 'Design review', length: '45 min' },
    ],
  },
  {
    id: 'greenfield',
    name: 'Greenfield Plumbing',
    tagline: 'Same-week quotes across Sydney',
    accent: '#16a34a',
    theme: 'light',
    font: 'friendly',
    cover: 'linear-gradient(120deg, #ffe14a, #2fd98a)',
    calendars: [
      { title: 'Video quote', length: '15 min' },
      { title: 'Renovation walkthrough', length: '30 min' },
    ],
  },
]

const TIMES = ['9:00 am', '9:30 am', '11:00 am', '2:30 pm']

export function BrandDemo() {
  const [id, setId] = useState(BRANDS[1]!.id)
  const b = BRANDS.find((x) => x.id === id)!
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Example businesses">
        {BRANDS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === id}
            onClick={() => setId(x.id)}
            className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${
              x.id === id
                ? 'border-ink bg-surface shadow-[5px_5px_0_0_var(--color-ink)]'
                : 'border-line bg-surface/60 hover:border-line-strong'
            }`}
          >
            <span
              className="h-11 w-11 shrink-0 rounded-xl"
              style={{ background: x.cover }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{x.name}</span>
              <span className="block truncate text-sm text-muted">
                {x.theme === 'dark' ? 'Dark' : 'Light'} page, {x.font} headings
              </span>
            </span>
          </button>
        ))}
      </div>

      <div
        data-theme={b.theme}
        style={themeVars({ accent: b.accent, theme: b.theme, font: b.font })}
        className="theme-root overflow-hidden rounded-[1.6rem] border-2 border-ink shadow-[8px_8px_0_0_var(--color-ink)] transition-colors duration-300"
        aria-live="polite"
      >
        <div
          className="h-24 w-full transition-[background] duration-300"
          style={{ background: b.cover }}
        />
        <div className="grid gap-5 px-6 pb-6 sm:grid-cols-[1fr_11rem]">
          <div>
            <span className="-mt-8 grid h-16 w-16 place-items-center rounded-2xl border-4 border-[var(--color-canvas)] bg-accent font-brand text-2xl font-bold text-on-accent">
              {b.name.charAt(0)}
            </span>
            <p className="mt-3 font-brand text-2xl font-bold leading-tight text-ink">{b.name}</p>
            <p className="text-sm text-muted">{b.tagline}</p>
            <div className="mt-4 flex flex-col gap-2">
              {b.calendars.map((c, i) => (
                <div
                  key={c.title}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${
                    i === 0 ? 'border-accent bg-accent/10' : 'border-line bg-surface'
                  }`}
                >
                  <span className="font-semibold text-ink">{c.title}</span>
                  <span className="text-muted">{c.length}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:pt-5">
            <span className="text-xs font-semibold text-muted">Thursday 12 November</span>
            {TIMES.map((t, i) => (
              <span
                key={t}
                className={`rounded-xl border-2 px-3 py-2 text-center text-sm font-bold ${
                  i === 1
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-accent/35 text-accent-ink'
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
