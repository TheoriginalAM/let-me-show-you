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

/** A phone or tablet with no mouse or keyboard (for wording only). */
function touchOnly(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
}

/** A control's label with its shortcut, e.g. "Turn off camera (⌘E)"; phones get no shortcut. */
export function withShortcut(label: string, key: string): string {
  return touchOnly() ? label : `${label} (${shortcut(key)})`
}

/** How to get the mic back: a shortcut on computers, the button on phones. */
export function unmuteHint(verb: 'talk' | 'unmute'): string {
  return touchOnly() ? `Tap the microphone button to ${verb}.` : `Press ${shortcut('D')} to ${verb}.`
}

/** Whether to list keyboard shortcuts at all. */
export function hasKeyboard(): boolean {
  return !touchOnly()
}
