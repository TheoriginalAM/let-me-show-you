import type { RecorderApi } from '@shared/ipc'

declare global {
  interface Window {
    /** The bridge exposed by the preload script (see src/preload/index.ts). */
    recorder: RecorderApi
  }
}

export {}
