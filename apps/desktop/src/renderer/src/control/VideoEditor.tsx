import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration } from '@lmsy/shared'
import type { EditSegment, RecordingResult } from '@shared/ipc'

/** Stream the finished recording from main over the Range-capable media scheme. */
function mediaUrl(filePath: string): string {
  return `lmsy-media://file/?path=${encodeURIComponent(filePath)}`
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/** "M:SS.d" — a tenth-of-a-second readout for precise trimming. */
function fmt(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const d = Math.floor((t % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${d}`
}

/**
 * Turn a trim window [trimStart, trimEnd] with removed `cuts` into the ordered
 * list of spans to KEEP. Cuts are clamped to the window, merged, and the gaps
 * between them (plus the head and tail) become the kept segments.
 */
export function computeKeep(
  trimStart: number,
  trimEnd: number,
  cuts: EditSegment[],
): EditSegment[] {
  const within = cuts
    .map((c) => ({
      start: clamp(c.start, trimStart, trimEnd),
      end: clamp(c.end, trimStart, trimEnd),
    }))
    .filter((c) => c.end - c.start > 0.05)
    .sort((a, b) => a.start - b.start)

  const merged: EditSegment[] = []
  for (const c of within) {
    const last = merged[merged.length - 1]
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end)
    else merged.push({ ...c })
  }

  const keep: EditSegment[] = []
  let cursor = trimStart
  for (const c of merged) {
    if (c.start > cursor) keep.push({ start: cursor, end: c.start })
    cursor = Math.max(cursor, c.end)
  }
  if (trimEnd > cursor) keep.push({ start: cursor, end: trimEnd })
  return keep.filter((s) => s.end - s.start > 0.05)
}

type Drag = 'start' | 'end' | 'seek' | null

export function VideoEditor({
  result,
  onClose,
}: {
  result: RecordingResult
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<Drag>(null)

  const [duration, setDuration] = useState(result.durationSeconds)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(result.durationSeconds)
  const [cuts, setCuts] = useState<EditSegment[]>([])
  const [pendingCut, setPendingCut] = useState<number | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefer the container's real duration once metadata loads (the pre-transcode
  // wall-clock estimate can be off by a second).
  const onLoadedMeta = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : result.durationSeconds
    setDuration(d)
    // Only widen the end handle if the user hasn't dragged it yet.
    setTrimEnd((prev) => (Math.abs(prev - result.durationSeconds) < 0.001 ? d : prev))
  }, [result.durationSeconds])

  // Preview the *result*: while playing, stay inside the trim window and skip
  // over any cut regions so what you see is what uploads.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (): void => {
      const v = videoRef.current
      if (v) {
        let t = v.currentTime
        const cut = cuts.find((c) => t >= c.start && t < c.end - 0.02)
        if (cut) {
          t = Math.min(cut.end, trimEnd)
          v.currentTime = t
        }
        if (t >= trimEnd - 0.02) {
          v.pause()
          v.currentTime = trimStart
          setCurrent(trimStart)
          setPlaying(false)
          return
        }
        setCurrent(t)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, cuts, trimStart, trimEnd])

  function togglePlay(): void {
    const v = videoRef.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
    } else {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd - 0.05) v.currentTime = trimStart
      void v.play()
      setPlaying(true)
    }
  }

  function seekTo(t: number): void {
    const v = videoRef.current
    const clamped = clamp(t, 0, duration)
    if (v) v.currentTime = clamped
    setCurrent(clamped)
  }

  function timeFromClientX(clientX: number): number {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return clamp((clientX - rect.left) / rect.width, 0, 1) * duration
  }

  function beginDrag(kind: Exclude<Drag, null>) {
    return (e: React.PointerEvent): void => {
      e.preventDefault()
      if (kind !== 'seek') e.stopPropagation()
      dragRef.current = kind
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      if (kind === 'seek') seekTo(timeFromClientX(e.clientX))
    }
  }

  function onDragMove(e: React.PointerEvent): void {
    const kind = dragRef.current
    if (!kind) return
    const t = timeFromClientX(e.clientX)
    if (kind === 'start') {
      const next = clamp(t, 0, trimEnd - 0.3)
      setTrimStart(next)
      seekTo(next)
    } else if (kind === 'end') {
      const next = clamp(t, trimStart + 0.3, duration)
      setTrimEnd(next)
      seekTo(next)
    } else {
      seekTo(t)
    }
  }

  function endDrag(e: React.PointerEvent): void {
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  function toggleCut(): void {
    if (pendingCut === null) {
      setPendingCut(current)
      return
    }
    const a = Math.min(pendingCut, current)
    const b = Math.max(pendingCut, current)
    if (b - a > 0.1) {
      setCuts((cs) => [...cs, { start: a, end: b }].sort((x, y) => x.start - y.start))
    }
    setPendingCut(null)
  }

  const keep = computeKeep(trimStart, trimEnd, cuts)
  const editedDuration = keep.reduce((sum, s) => sum + (s.end - s.start), 0)
  const changed = trimStart > 0.1 || trimEnd < duration - 0.1 || cuts.length > 0
  const pct = (t: number): number => (duration > 0 ? (t / duration) * 100 : 0)

  async function apply(): Promise<void> {
    if (!keep.length) {
      setError('Nothing left to keep.')
      return
    }
    setApplying(true)
    setError(null)
    videoRef.current?.pause()
    try {
      await window.recorder.applyEdits(keep)
      onClose()
    } catch {
      setError('Could not apply the edits. Please try again.')
      setApplying(false)
    }
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <span className="editor-title">Trim &amp; cut</span>
        <button className="editor-x no-drag" onClick={onClose} disabled={applying} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="editor-scroll">
        <div className="editor-stage">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="editor-video"
            src={mediaUrl(result.filePath)}
            onLoadedMetadata={onLoadedMeta}
            onClick={togglePlay}
            playsInline
          />
          <button className="editor-play no-drag" onClick={togglePlay} aria-label="Play/pause">
            {playing ? '❚❚' : '▶'}
          </button>
        </div>

        <div className="editor-times">
          <span>{fmt(current)}</span>
          <span className="editor-times-total">{fmt(duration)}</span>
        </div>

        <div
          ref={trackRef}
          className="editor-track no-drag"
          onPointerDown={beginDrag('seek')}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
        >
          {/* trimmed-away head + tail */}
          <div className="editor-trimmed" style={{ left: 0, width: `${pct(trimStart)}%` }} />
          <div
            className="editor-trimmed"
            style={{ left: `${pct(trimEnd)}%`, right: 0, width: 'auto' }}
          />
          {/* removed cut regions */}
          {cuts.map((c, i) => (
            <div
              key={i}
              className="editor-cut"
              style={{ left: `${pct(c.start)}%`, width: `${pct(c.end - c.start)}%` }}
            />
          ))}
          {/* an in-progress cut selection */}
          {pendingCut !== null && (
            <div
              className="editor-cut pending"
              style={{
                left: `${pct(Math.min(pendingCut, current))}%`,
                width: `${pct(Math.abs(current - pendingCut))}%`,
              }}
            />
          )}
          {/* draggable trim handles */}
          <div
            className="editor-handle"
            style={{ left: `${pct(trimStart)}%` }}
            onPointerDown={beginDrag('start')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
          />
          <div
            className="editor-handle"
            style={{ left: `${pct(trimEnd)}%` }}
            onPointerDown={beginDrag('end')}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
          />
          {/* playhead */}
          <div className="editor-playhead" style={{ left: `${pct(current)}%` }} />
        </div>

        <div className="editor-tools">
          <button
            className="btn-mini no-drag"
            onClick={() => setTrimStart(clamp(current, 0, trimEnd - 0.3))}
          >
            Trim start here
          </button>
          <button
            className="btn-mini no-drag"
            onClick={() => setTrimEnd(clamp(current, trimStart + 0.3, duration))}
          >
            Trim end here
          </button>
          <button
            className={`btn-mini no-drag ${pendingCut !== null ? 'active' : ''}`}
            onClick={toggleCut}
          >
            {pendingCut === null ? 'Cut out ▸' : `End cut (from ${fmt(pendingCut)})`}
          </button>
        </div>

        {cuts.length > 0 && (
          <div className="editor-cuts">
            {cuts.map((c, i) => (
              <span key={i} className="editor-cutchip">
                Cut {fmt(c.start)}–{fmt(c.end)}
                <button
                  className="no-drag"
                  onClick={() => setCuts((cs) => cs.filter((_, j) => j !== i))}
                  aria-label="Remove cut"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="signin-error">{error}</p>}
      </div>

      <div className="editor-foot">
        <div className="editor-summary">
          {changed ? (
            <>
              New length <strong>{formatDuration(Math.max(1, Math.round(editedDuration)))}</strong>
              <span className="editor-summary-was"> (was {formatDuration(duration)})</span>
            </>
          ) : (
            <>Drag the handles or use the buttons to trim. Mark sections to cut out.</>
          )}
        </div>
        <div className="editor-foot-actions">
          <button className="btn-ghost no-drag" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button
            className="btn-record no-drag"
            onClick={apply}
            disabled={applying || !changed || keep.length === 0}
          >
            {applying ? 'Applying…' : 'Apply edits'}
          </button>
        </div>
      </div>
    </div>
  )
}
