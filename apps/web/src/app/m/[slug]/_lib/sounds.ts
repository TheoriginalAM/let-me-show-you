'use client'

// Short, soft cues generated with WebAudio (no audio assets to license or load).

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function note(c: AudioContext, dest: AudioNode, freq: number, start: number, length: number): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(dest)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

/** A two-note chime: rising for "someone wants in" / "joined", falling for "left". */
export function playChime(kind: 'knock' | 'join' | 'leave'): void {
  const c = audio()
  if (!c) return
  const t = c.currentTime
  const [a, b] = kind === 'leave' ? [784, 587] : kind === 'join' ? [587, 784] : [659, 880]
  note(c, c.destination, a, t, 0.28)
  note(c, c.destination, b, t + 0.16, 0.36)
}

/**
 * Play a short test tone through a chosen speaker. Uses an <audio> element fed
 * from WebAudio so `setSinkId` can route it. Must run from a click handler.
 * Resolves when the tone finishes; rejects if the output can't be used.
 */
export async function playTestTone(sinkId: string | null): Promise<void> {
  const c = new AudioContext()
  try {
    const dest = c.createMediaStreamDestination()
    const t = c.currentTime + 0.05
    note(c, dest, 523, t, 0.35)
    note(c, dest, 659, t + 0.3, 0.35)
    note(c, dest, 784, t + 0.6, 0.5)
    const el = new Audio()
    el.srcObject = dest.stream
    if (sinkId && typeof el.setSinkId === 'function') await el.setSinkId(sinkId)
    await el.play()
    await new Promise((r) => setTimeout(r, 1300))
    el.pause()
    el.srcObject = null
  } finally {
    void c.close()
  }
}
