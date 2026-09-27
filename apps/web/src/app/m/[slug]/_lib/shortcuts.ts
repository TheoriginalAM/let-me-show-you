/** Whether this is a Mac/iPad (⌘ shortcuts) rather than Windows/Linux (Ctrl). */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** A shortcut label for this platform: "⌘D" on a Mac, "Ctrl+D" elsewhere. */
export function shortcut(key: string): string {
  return isApple() ? `⌘${key}` : `Ctrl+${key}`
}
