'use client'

import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkspaceBrand } from '@/db/workspaces'
import {
  BRAND_FONTS,
  DEFAULT_ACCENT,
  themeVars,
  type BrandFont,
  type BrandTheme,
} from '@/lib/brand-theme'
import { resizeImage } from '@/lib/image-resize'
import { Icon } from '@/components/brand/icons'
import { saveBrandAction } from './actions'

const SWATCHES = [
  '#4f3cff',
  '#ff5fa2',
  '#ff8f2e',
  '#ffd23f',
  '#2fd98a',
  '#0ea5e9',
  '#e11d48',
  '#0f766e',
  '#17132b',
]
const LOGO_SIZES = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
] as const

const inputCls =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">{title}</h2>
        {hint && <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function ImagePicker({
  label,
  hint,
  value,
  shape,
  onPick,
  onRemove,
}: {
  label: string
  hint: string
  value: string | null
  shape: 'wide' | 'round' | 'logo'
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const frame =
    shape === 'wide'
      ? 'aspect-[5/2] w-full rounded-xl'
      : shape === 'round'
        ? 'h-20 w-20 rounded-full'
        : 'h-20 w-20 rounded-xl'
  return (
    <div className={`flex gap-4 ${shape === 'wide' ? 'flex-col' : 'items-center'}`}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`${frame} group relative grid shrink-0 place-items-center overflow-hidden border-2 border-dashed border-line-strong bg-surface-2 text-faint transition hover:border-ink hover:text-ink`}
        aria-label={value ? `Replace ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className={`h-full w-full ${shape === 'logo' ? 'object-contain p-2' : 'object-cover'}`}
          />
        ) : (
          <Icon name="plus" className="h-6 w-6" strokeWidth={2} />
        )}
      </button>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="text-xs leading-relaxed text-muted">{hint}</span>
        <span className="flex gap-3 text-sm">
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="font-medium text-accent-ink hover:underline"
          >
            {value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button type="button" onClick={onRemove} className="text-muted hover:text-red-600">
              Remove
            </button>
          )}
        </span>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(f)
        }}
      />
    </div>
  )
}

/** A small live picture of the booking page with these settings. */
function BookingPreview({
  name,
  tagline,
  logo,
  logoSize,
  color,
  theme,
  font,
  cover,
  photo,
  bio,
  ctaLabel,
  calendars,
}: {
  name: string
  tagline: string
  logo: string | null
  logoSize: string
  color: string
  theme: BrandTheme
  font: BrandFont
  cover: string | null
  photo: string | null
  bio: string
  ctaLabel: string
  calendars: string[]
}) {
  const style = useMemo(() => themeVars({ accent: color, theme, font }), [color, theme, font])
  const logoH = logoSize === 'small' ? 'h-7' : logoSize === 'large' ? 'h-11' : 'h-9'
  const sample = calendars.length ? calendars.slice(0, 3) : ['Intro call', 'Strategy session']
  return (
    <div
      data-theme={theme}
      style={style}
      className="theme-root overflow-hidden rounded-2xl border border-line text-[0.8rem]"
    >
      <div
        className="h-24 w-full bg-cover bg-center"
        style={{
          backgroundImage: cover
            ? `url("${cover}")`
            : `linear-gradient(120deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 55%, #ff5fa2))`,
        }}
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="-mt-7 flex items-end justify-between gap-3">
          <span className="grid min-h-14 min-w-14 place-items-center rounded-2xl border-4 border-[var(--color-canvas)] bg-surface p-1.5 shadow-sm">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className={`${logoH} w-auto max-w-[9rem] object-contain`} />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent font-brand text-lg font-bold text-on-accent">
                {name.charAt(0).toUpperCase() || 'B'}
              </span>
            )}
          </span>
          {ctaLabel && (
            <span className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[0.72rem] font-semibold text-ink">
              {ctaLabel}
            </span>
          )}
        </div>
        <div>
          <p className="font-brand text-xl font-bold leading-tight text-ink">
            {name || 'Your business'}
          </p>
          {tagline && <p className="mt-0.5 text-muted">{tagline}</p>}
        </div>
        {(photo || bio) && (
          <div className="flex items-start gap-3">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            )}
            {bio && <p className="line-clamp-3 leading-relaxed text-muted">{bio}</p>}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sample.map((c, i) => (
            <div
              key={c + i}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="font-semibold text-ink">{c}</span>
              </span>
              <span className="rounded-md bg-accent px-2 py-0.5 text-[0.68rem] font-semibold text-on-accent">
                Book
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function BrandingForm({
  initial,
  fallbackName,
  calendars,
  bookingUrl,
}: {
  initial: WorkspaceBrand
  fallbackName: string
  calendars: string[]
  bookingUrl: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name ?? '')
  const [tagline, setTagline] = useState(initial.tagline ?? '')
  const [logo, setLogo] = useState<string | null>(initial.logo)
  const [logoSize, setLogoSize] = useState<string>(initial.logoSize ?? 'medium')
  const [color, setColor] = useState(initial.color ?? DEFAULT_ACCENT)
  const [theme, setTheme] = useState<BrandTheme>(initial.theme)
  const [font, setFont] = useState<BrandFont>(initial.font)
  // Photos: the shown image, and whether it changed (undefined = keep the saved one).
  const [cover, setCover] = useState<string | null>(initial.coverUrl)
  const [coverEdit, setCoverEdit] = useState<string | null | undefined>(undefined)
  const [photo, setPhoto] = useState<string | null>(initial.photoUrl)
  const [photoEdit, setPhotoEdit] = useState<string | null | undefined>(undefined)
  const [bio, setBio] = useState(initial.bio ?? '')
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel ?? '')
  const [ctaUrl, setCtaUrl] = useState(initial.ctaUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function touch(): void {
    setSaved(false)
    setError(null)
  }

  async function pick(file: File, kind: 'logo' | 'cover' | 'photo'): Promise<void> {
    touch()
    try {
      if (kind === 'logo') {
        setLogo(await resizeImage(file, { maxWidth: 480, maxHeight: 480, type: 'image/png' }))
      } else if (kind === 'cover') {
        const url = await resizeImage(file, {
          maxWidth: 1600,
          maxHeight: 640,
          fit: 'cover',
          quality: 0.8,
        })
        setCover(url)
        setCoverEdit(url)
      } else {
        const url = await resizeImage(file, {
          maxWidth: 400,
          maxHeight: 400,
          fit: 'cover',
          quality: 0.85,
        })
        setPhoto(url)
        setPhotoEdit(url)
      }
    } catch {
      setError('Could not read that image. Try a PNG or JPEG.')
    }
  }

  function save(): void {
    touch()
    startTransition(async () => {
      const result = await saveBrandAction({
        name: name.trim() || null,
        tagline: tagline.trim() || null,
        logo,
        logoSize,
        color,
        theme,
        font,
        ctaLabel: ctaLabel.trim() || null,
        ctaUrl: ctaUrl.trim() || null,
        bio: bio.trim() || null,
        cover: coverEdit,
        photo: photoEdit,
      }).catch(() => ({ ok: false, error: 'Could not save. Check your connection and try again.' }))
      if (result.ok) {
        setSaved(true)
        setCoverEdit(undefined)
        setPhotoEdit(undefined)
        router.refresh()
      } else setError(result.error ?? 'Could not save.')
    })
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <Section
          title="Name and logo"
          hint="Shown at the top of your booking page, meeting rooms, shared videos and emails."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Business name
              <input
                value={name}
                onChange={(e) => (touch(), setName(e.target.value))}
                maxLength={60}
                placeholder={fallbackName}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Tagline
              <input
                value={tagline}
                onChange={(e) => (touch(), setTagline(e.target.value))}
                maxLength={120}
                placeholder="Websites that win work"
                className={inputCls}
              />
            </label>
          </div>
          <ImagePicker
            label="Logo"
            hint="A PNG with a transparent background looks best."
            value={logo}
            shape="logo"
            onPick={(f) => void pick(f, 'logo')}
            onRemove={() => (touch(), setLogo(null))}
          />
          {logo && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Logo size</span>
              {LOGO_SIZES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => (touch(), setLogoSize(s.key))}
                  aria-pressed={logoSize === s.key}
                  className={`rounded-full border px-3 py-1 transition ${
                    logoSize === s.key
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-line-strong text-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Colour and style"
          hint="Your colour fills buttons and highlights. Pick a light or dark page and a heading style."
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => (touch(), setColor(c))}
                aria-label={`Use ${c}`}
                aria-pressed={color.toLowerCase() === c}
                className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-[var(--color-surface)] transition hover:scale-110 ${
                  color.toLowerCase() === c ? 'ring-[3px] ring-ink' : 'ring-1 ring-line'
                }`}
                style={{ background: c }}
              />
            ))}
            <label className="flex items-center gap-2 rounded-full border border-line-strong py-1 pl-1 pr-3 text-sm text-muted">
              <input
                type="color"
                value={color}
                onChange={(e) => (touch(), setColor(e.target.value))}
                className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Pick any colour"
              />
              <span className="font-mono text-xs uppercase">{color}</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => (touch(), setTheme(t))}
                aria-pressed={theme === t}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                  theme === t ? 'border-ink' : 'border-line hover:border-line-strong'
                }`}
              >
                <span
                  className={`grid h-10 w-14 shrink-0 place-items-center rounded-lg border border-line ${t === 'dark' ? 'bg-[#12101f]' : 'bg-[#f4f3fb]'}`}
                >
                  <span className="h-2.5 w-7 rounded-full" style={{ background: color }} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {t === 'light' ? 'Light page' : 'Dark page'}
                  </span>
                  <span className="block text-xs text-muted">
                    {t === 'light' ? 'Bright and clean' : 'Moody and bold'}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BRAND_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => (touch(), setFont(f.id))}
                aria-pressed={font === f.id}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition ${
                  font === f.id ? 'border-ink' : 'border-line hover:border-line-strong'
                }`}
              >
                <span
                  className="text-3xl font-bold leading-none text-ink"
                  style={{ fontFamily: f.family }}
                >
                  Aa
                </span>
                <span className="text-xs font-medium text-muted">{f.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Your booking page"
          hint="A cover photo and a few lines about you make the page feel like yours."
        >
          <ImagePicker
            label="Cover photo"
            hint="Wide works best (at least 1600 by 640). Leave empty for a colour wash."
            value={cover}
            shape="wide"
            onPick={(f) => void pick(f, 'cover')}
            onRemove={() => (touch(), setCover(null), setCoverEdit(null))}
          />
          <ImagePicker
            label="Your photo"
            hint="A friendly face next to your bio."
            value={photo}
            shape="round"
            onPick={(f) => void pick(f, 'photo')}
            onRemove={() => (touch(), setPhoto(null), setPhotoEdit(null))}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            About you
            <textarea
              value={bio}
              onChange={(e) => (touch(), setBio(e.target.value))}
              maxLength={600}
              rows={3}
              placeholder="I help trades businesses get found online. Book a call and we’ll look at your site together."
              className={inputCls}
            />
            <span className="self-end text-xs font-normal text-faint">{bio.length}/600</span>
          </label>
        </Section>

        <Section
          title="Button"
          hint="An optional button at the top of your pages, like “Visit our website”."
        >
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Label
              <input
                value={ctaLabel}
                onChange={(e) => (touch(), setCtaLabel(e.target.value))}
                maxLength={40}
                placeholder="Visit our website"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Link
              <input
                value={ctaUrl}
                onChange={(e) => (touch(), setCtaUrl(e.target.value))}
                maxLength={400}
                inputMode="url"
                placeholder="yourbusiness.com"
                className={inputCls}
              />
            </label>
          </div>
        </Section>

        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-[0_14px_30px_-18px_rgb(23_19_43/0.45)] backdrop-blur">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            {pending ? 'Saving…' : 'Save branding'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> Saved
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      <aside className="order-first flex flex-col gap-3 xl:sticky xl:top-8 xl:order-none">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Live preview</span>
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-accent-ink hover:underline"
            >
              Open booking page <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <BookingPreview
          name={name.trim() || fallbackName}
          tagline={tagline.trim()}
          logo={logo}
          logoSize={logoSize}
          color={color}
          theme={theme}
          font={font}
          cover={cover}
          photo={photo}
          bio={bio.trim()}
          ctaLabel={ctaUrl.trim() ? ctaLabel.trim() : ''}
          calendars={calendars}
        />
        <p className="text-xs leading-relaxed text-faint">
          Meeting rooms use your colour and logo too. Give each room its own backdrop and welcome
          message on the Meeting rooms page.
        </p>
      </aside>
    </div>
  )
}
