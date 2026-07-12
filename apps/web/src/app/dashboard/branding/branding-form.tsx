'use client'

import { useRef, useState, useTransition } from 'react'
import type { WorkspaceBrand } from '@/db/workspaces'
import { saveBrandAction } from './actions'

const DEFAULT_COLOR = '#8b8bf6'
const SWATCHES = ['#8b8bf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899']
const LOGO_SIZES: { key: 'small' | 'medium' | 'large'; label: string; preview: string }[] = [
  { key: 'small', label: 'Small', preview: 'h-7' },
  { key: 'medium', label: 'Medium', preview: 'h-10' },
  { key: 'large', label: 'Large', preview: 'h-14' },
]

/** Read a logo file and downscale it to a small square-ish PNG data URL. */
async function fileToLogoDataUrl(file: File, max = 384): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return canvas.toDataURL('image/png')
}

export function BrandingForm({
  initial,
  fallbackName,
}: {
  initial: WorkspaceBrand
  fallbackName: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initial.name ?? '')
  const [color, setColor] = useState(initial.color ?? DEFAULT_COLOR)
  const [logo, setLogo] = useState<string | null>(initial.logo)
  const [tagline, setTagline] = useState(initial.tagline ?? '')
  const [logoSize, setLogoSize] = useState<'small' | 'medium' | 'large'>(
    (initial.logoSize as 'small' | 'medium' | 'large') ?? 'medium',
  )
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel ?? '')
  const [ctaUrl, setCtaUrl] = useState(initial.ctaUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const displayName = name.trim() || fallbackName
  const logoPreviewCls = LOGO_SIZES.find((s) => s.key === logoSize)?.preview ?? 'h-10'

  async function onPickLogo(file: File | undefined) {
    setError(null)
    setSaved(false)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    try {
      const dataUrl = await fileToLogoDataUrl(file)
      if (dataUrl.length > 400_000) {
        setError('That image is too detailed. Try a simpler logo.')
        return
      }
      setLogo(dataUrl)
    } catch {
      setError('Could not read that image.')
    }
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveBrandAction({
        name: name.trim() || null,
        logo,
        color,
        tagline: tagline.trim() || null,
        logoSize,
        ctaLabel: ctaLabel.trim() || null,
        ctaUrl: ctaUrl.trim() || null,
      })
      if (result.ok) setSaved(true)
      else setError(result.error ?? 'Could not save')
    })
  }

  function resetAll() {
    setName('')
    setColor(DEFAULT_COLOR)
    setLogo(null)
    setTagline('')
    setLogoSize('medium')
    setCtaLabel('')
    setCtaUrl('')
    setError(null)
    setSaved(false)
  }

  const inputCls =
    'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'

  return (
    <div className="rise flex flex-col gap-6" style={{ animationDelay: '60ms' }}>
      {/* Live preview of the share-page header */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-faint">
          Preview · what viewers see
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className={`${logoPreviewCls} w-auto object-contain`} />
            ) : (
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
                style={{ background: color }}
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            {/* With a logo, the name is optional (logo can stand alone). Without a
                logo, fall back to a name so there is some identity. */}
            {(logo ? name.trim() : displayName) || tagline.trim() ? (
              <span className="min-w-0">
                {(logo ? name.trim() : displayName) && (
                  <span className="block truncate font-semibold text-ink">
                    {logo ? name.trim() : displayName}
                  </span>
                )}
                {tagline.trim() && (
                  <span className="block truncate text-xs text-muted">{tagline.trim()}</span>
                )}
              </span>
            ) : null}
          </span>
          {ctaLabel.trim() && ctaUrl.trim() && (
            <span
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: color }}
            >
              {ctaLabel.trim()}
            </span>
          )}
        </div>
      </div>

      {/* Logo + size */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">Logo</label>
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white/[0.03]">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo preview" className="h-full w-full object-contain p-1.5" />
            ) : (
              <span className="text-xs text-faint">None</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              {logo ? 'Replace' : 'Upload logo'}
            </button>
            {logo && (
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="px-3 py-1.5 text-sm text-red-300 transition hover:text-red-200"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickLogo(e.target.files?.[0])}
          />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-faint">Size</span>
          {LOGO_SIZES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setLogoSize(s.key)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                logoSize === s.key
                  ? 'border-accent/50 bg-accent-strong/15 text-accent-ink'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Brand name */}
      <div className="flex flex-col gap-2">
        <label htmlFor="brand-name" className="text-sm font-medium text-ink">
          Brand name
        </label>
        <input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={fallbackName}
          maxLength={60}
          className={inputCls}
        />
      </div>

      {/* Tagline */}
      <div className="flex flex-col gap-2">
        <label htmlFor="brand-tagline" className="text-sm font-medium text-ink">
          Tagline <span className="text-faint">(optional)</span>
        </label>
        <input
          id="brand-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="A short line under your name"
          maxLength={120}
          className={inputCls}
        />
      </div>

      {/* Accent color */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">Accent colour</label>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((sw) => (
            <button
              key={sw}
              type="button"
              aria-label={sw}
              onClick={() => setColor(sw)}
              className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-canvas transition ${
                color.toLowerCase() === sw.toLowerCase() ? 'ring-white/70' : 'ring-transparent'
              }`}
              style={{ background: sw }}
            />
          ))}
          <label className="ml-1 flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            />
            <span className="font-mono text-xs uppercase text-muted">{color}</span>
          </label>
        </div>
      </div>

      {/* Call to action */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">
          Call-to-action button <span className="text-faint">(optional)</span>
        </label>
        <p className="text-xs text-faint">
          Adds a button to your share pages, e.g. &ldquo;Book a call&rdquo; or &ldquo;Visit our
          site&rdquo;.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Button label"
            maxLength={40}
            className={`${inputCls} sm:max-w-[12rem]`}
          />
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://yoursite.com"
            className={inputCls}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={pending} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
          {pending ? 'Saving…' : 'Save branding'}
        </button>
        <button onClick={resetAll} disabled={pending} className="btn-ghost px-4 py-2.5 text-sm">
          Reset to default
        </button>
        {saved && <span className="text-sm text-green-300">✓ Saved</span>}
      </div>
    </div>
  )
}
