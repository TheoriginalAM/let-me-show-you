/** Spoken names for the preset swatches, so screen readers don't read out hex codes. */
const COLOUR_NAMES: Record<string, string> = {
  '#4f3cff': 'Violet',
  '#ff5fa2': 'Pink',
  '#ff8f2e': 'Orange',
  '#ffd23f': 'Yellow',
  '#2fd98a': 'Green',
  '#0ea5e9': 'Sky blue',
  '#e11d48': 'Red',
  '#0f766e': 'Teal',
  '#17132b': 'Near black',
}

/** A human name for a preset colour, or the hex itself for a custom one. */
export function colourName(hex: string): string {
  return COLOUR_NAMES[hex.toLowerCase()] ?? hex.toUpperCase()
}
