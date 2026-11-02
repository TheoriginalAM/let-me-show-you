// Shapes shared by the transcript, AI write-ups and the share page. No imports:
// used on both sides.

/** One caption line: seconds from the start of the video. */
export interface TranscriptCue {
  start: number
  end: number
  text: string
}

/** A named section of the video, for the chapter list and the player's timeline. */
export interface Chapter {
  start: number
  title: string
}

/** What a write-up can be made into. `custom` follows the owner's own instructions. */
export const DOCUMENT_KINDS = [
  {
    id: 'howto',
    label: 'How-to',
    noun: 'how-to',
    blurb: 'Numbered steps with screenshots, for whoever does it next.',
  },
  {
    id: 'bug',
    label: 'Bug report',
    noun: 'bug report',
    blurb: 'Steps to reproduce, what should happen and what did.',
  },
  {
    id: 'followup',
    label: 'Follow-up email',
    noun: 'follow-up email',
    blurb: 'A ready-to-send recap for your client.',
  },
  {
    id: 'actions',
    label: 'Action items',
    noun: 'action items',
    blurb: 'Who does what next, pulled from what was said.',
  },
  {
    id: 'prompt',
    label: 'AI prompt',
    noun: 'AI prompt',
    blurb: 'Tasks and acceptance criteria to paste into Claude Code or Cursor.',
  },
  {
    id: 'custom',
    label: 'Something else',
    noun: 'write-up',
    blurb: 'Describe what you want and it’s written from the recording.',
  },
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['id']

export function isDocumentKind(value: unknown): value is DocumentKind {
  return DOCUMENT_KINDS.some((k) => k.id === value)
}

/** Reactions viewers can leave at a moment in the video. */
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'] as const
export type Reaction = (typeof REACTIONS)[number]

export function isReaction(value: unknown): value is Reaction {
  return REACTIONS.some((r) => r === value)
}

/** "1:05" or "1:02:05". */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Parses "1:05" / "01:02:05" back to seconds; null if it isn't a timestamp. */
export function parseTimestamp(value: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/**
 * Joins short caption cues into readable paragraphs (a new one after a pause, a
 * sentence end past ~25 seconds, or ~45 seconds regardless).
 */
export function paragraphs(cues: TranscriptCue[]): TranscriptCue[] {
  const out: TranscriptCue[] = []
  let cur: TranscriptCue | null = null
  for (const c of cues) {
    const gap = cur ? c.start - cur.end : 0
    const long = cur ? c.end - cur.start : 0
    const sentenceDone = cur ? /[.?!]$/.test(cur.text) : false
    if (!cur || gap > 2.5 || long > 45 || (long > 25 && sentenceDone)) {
      if (cur) out.push(cur)
      cur = { ...c }
    } else {
      cur.text = `${cur.text} ${c.text}`
      cur.end = c.end
    }
  }
  if (cur) out.push(cur)
  return out
}
