export {}

declare global {
  interface Window {
    /** API bridge exposed by the preload script (see src/preload/index.ts). */
    lmsy: {
      ping: () => Promise<string>
      platform: string
    }
  }
}
