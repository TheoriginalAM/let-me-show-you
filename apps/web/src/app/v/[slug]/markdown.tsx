'use client'

import { Fragment, type ReactNode } from 'react'
import { muxThumbnailUrl } from '@lmsy/shared'
import { formatTimestamp, parseTimestamp } from '@/lib/video-notes'
import { usePlayer } from './player-context'

// A small Markdown renderer for write-ups: headings, paragraphs, lists,
// checklists, bold, code and links, plus two recording-aware bits: [1:05]
// timestamps that jump the video, and ![caption](t=65) screenshot lines that
// show the frame at that moment. Builds React elements (never raw HTML), so
// whatever the model or the business writes can't inject markup.

const IMAGE_LINE = /^!\[([^\]]*)\]\(t=(\d+(?:\.\d+)?)\)\s*$/
const INLINE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\d{1,2}(?::\d{2}){1,2}\]|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

type Block =
  | { kind: 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: { text: string; checked: boolean | null }[] }
  | { kind: 'img'; alt: string; time: number }

function parse(markdown: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    const img = IMAGE_LINE.exec(trimmed)
    const bullet = /^[-*]\s+(\[( |x|X)\]\s+)?(.*)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (!trimmed) {
      flush()
    } else if (trimmed.startsWith('### ')) {
      flush()
      blocks.push({ kind: 'h3', text: trimmed.slice(4) })
    } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      flush()
      blocks.push({ kind: 'h2', text: trimmed.replace(/^#+\s+/, '') })
    } else if (img) {
      flush()
      blocks.push({ kind: 'img', alt: img[1]!, time: Number(img[2]) })
    } else if (bullet || numbered) {
      flush()
      const kind = bullet ? 'ul' : 'ol'
      const item = bullet
        ? { text: bullet[3]!, checked: bullet[1] ? bullet[2] !== ' ' : null }
        : { text: numbered![1]!, checked: null }
      const last = blocks.at(-1)
      if (last && last.kind === kind) last.items.push(item)
      else blocks.push({ kind, items: [item] })
    } else {
      para.push(trimmed)
    }
  }
  flush()
  return blocks
}

function Inline({ text }: { text: string }) {
  const player = usePlayer()
  const parts = text.split(INLINE)
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
              {part.slice(1, -1)}
            </code>
          )
        }
        const stamp = /^\[(\d{1,2}(?::\d{2}){1,2})\]$/.exec(part)
        const seconds = stamp ? parseTimestamp(stamp[1]!) : null
        if (seconds !== null) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => player.seek(seconds)}
              aria-label={`Play from ${formatTimestamp(seconds)}`}
              className="mx-0.5 inline-flex rounded-md bg-accent/12 px-1.5 font-mono text-[0.85em] font-semibold text-accent-ink transition hover:bg-accent/25"
            >
              {formatTimestamp(seconds)}
            </button>
          )
        }
        const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-accent-ink underline underline-offset-2"
            >
              {link[1]}
            </a>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

/** Renders a write-up. `playbackId` turns screenshot lines into frames from the video. */
export function Markdown({
  markdown,
  playbackId,
}: {
  markdown: string
  playbackId: string | null
}) {
  const player = usePlayer()
  return (
    <div className="flex flex-col gap-3 leading-relaxed text-muted">
      {parse(markdown).map((b, i): ReactNode => {
        switch (b.kind) {
          case 'h2':
            return (
              <h4
                key={i}
                className="mt-2 font-display text-lg font-extrabold tracking-tight text-ink"
              >
                <Inline text={b.text} />
              </h4>
            )
          case 'h3':
            return (
              <h5 key={i} className="mt-1 font-semibold text-ink">
                <Inline text={b.text} />
              </h5>
            )
          case 'p':
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            )
          case 'img':
            if (!playbackId) return null
            return (
              <figure key={i} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => player.seek(b.time)}
                  aria-label={`${b.alt || 'Screenshot'}. Play from ${formatTimestamp(b.time)}`}
                  className="group relative overflow-hidden rounded-xl border border-line bg-black"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={muxThumbnailUrl(playbackId, { time: b.time, width: 960 })}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-contain transition group-hover:opacity-90"
                  />
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">
                    {formatTimestamp(b.time)}
                  </span>
                </button>
                {b.alt && <figcaption className="text-sm text-faint">{b.alt}</figcaption>}
              </figure>
            )
          case 'ul':
          case 'ol': {
            const List = b.kind === 'ol' ? 'ol' : 'ul'
            return (
              <List
                key={i}
                className={`flex flex-col gap-1.5 ${
                  b.kind === 'ol'
                    ? 'list-decimal pl-5'
                    : b.items.every((it) => it.checked !== null)
                      ? 'list-none'
                      : 'list-disc pl-5'
                }`}
              >
                {b.items.map((it, j) => (
                  <li key={j} className={it.checked !== null ? 'flex gap-2' : undefined}>
                    {it.checked !== null && (
                      <span aria-hidden className="mt-0.5 shrink-0 text-faint">
                        {it.checked ? '☑' : '☐'}
                      </span>
                    )}
                    <span>
                      <Inline text={it.text} />
                    </span>
                  </li>
                ))}
              </List>
            )
          }
        }
      })}
    </div>
  )
}

/**
 * The write-up as Markdown that works outside this page (GitHub, Linear, an AI
 * agent): timestamps link to that moment on the share page, screenshots become
 * image URLs.
 */
export function exportMarkdown(
  markdown: string,
  opts: { shareUrl: string; playbackId: string | null },
): string {
  return markdown
    .split('\n')
    .map((line) => {
      const img = IMAGE_LINE.exec(line.trim())
      if (img) {
        const t = Math.floor(Number(img[2]))
        return opts.playbackId
          ? `![${img[1]} (${formatTimestamp(t)})](${muxThumbnailUrl(opts.playbackId, { time: t, width: 1280, format: 'jpg' })})`
          : ''
      }
      return line.replace(/\[(\d{1,2}(?::\d{2}){1,2})\](?!\()/g, (whole, stamp: string) => {
        const s = parseTimestamp(stamp)
        return s === null ? whole : `[${stamp}](${opts.shareUrl}?t=${s})`
      })
    })
    .join('\n')
}
