import type { RecordingState, RecordingStatus } from '../shared/ipc'

export type StatusListener = (status: RecordingStatus) => void

export interface Recorder {
  getStatus: () => RecordingStatus
  onChange: (listener: StatusListener) => () => void
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  isActive: () => boolean
}

/**
 * The single source of truth for recording state, shared by the tray and the
 * control-panel renderer. Actual capture is not wired up yet — this only tracks
 * state and elapsed time so both surfaces stay in sync.
 */
export function createRecorder(): Recorder {
  let state: RecordingState = 'idle'
  let startedAt: number | null = null
  let accumulatedMs = 0
  const listeners = new Set<StatusListener>()

  const getStatus = (): RecordingStatus => ({ state, startedAt, accumulatedMs })

  const emit = (): void => {
    const status = getStatus()
    for (const listener of listeners) listener(status)
  }

  return {
    getStatus,
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start() {
      if (state !== 'idle') return
      state = 'recording'
      startedAt = Date.now()
      accumulatedMs = 0
      emit()
    },
    stop() {
      if (state === 'idle') return
      state = 'idle'
      startedAt = null
      accumulatedMs = 0
      emit()
    },
    pause() {
      if (state !== 'recording') return
      accumulatedMs += Date.now() - (startedAt ?? Date.now())
      startedAt = null
      state = 'paused'
      emit()
    },
    resume() {
      if (state !== 'paused') return
      startedAt = Date.now()
      state = 'recording'
      emit()
    },
    isActive() {
      return state !== 'idle'
    },
  }
}
