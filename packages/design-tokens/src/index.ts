// Typed mirror of design decisions for non-CSS consumers (e.g. a future Expo app).
// Keep in sync with design-tokens.css and theme.css.

export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export const SPACING = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const

// Square system: no radii except native inputs if a platform insists.
export const RADII = { none: 0, sm: 2 } as const

export const FONT_FAMILY = 'Archivo' as const

// Archivo width axis (font-stretch %). Narrower = louder.
export const FONT_WIDTHS = {
  masthead: 62,
  display: 66,
  headline: 72,
  numeral: 75,
  text: 100,
} as const

export const COLORS_LIGHT = {
  canvas: '#f3f1ec',
  surface: '#fbfaf7',
  text: '#121212',
  textMuted: '#625f59',
  border: '#d6d2c9',
  band: '#121212',
  bandText: '#f3f1ec',
  accent: '#ff4d1a',
  accentText: '#c7330b',
  error: '#b3122e',
} as const

export const COLORS_DARK = {
  canvas: '#121212',
  surface: '#1b1a18',
  text: '#f3f1ec',
  textMuted: '#a29e96',
  border: '#33312d',
  band: '#1d1c1a',
  bandText: '#f3f1ec',
  accent: '#ff4d1a',
  accentText: '#ff7a52',
  error: '#ff7088',
} as const

/** Narrative keys: [fill, text-on-fill]. Slot 0 = not in a Narrative. Slots are stored per Narrative. */
export const NARRATIVE_COLORS = [
  ['#e3dfd6', '#121212'],
  ['#2f4dff', '#ffffff'],
  ['#00a36c', '#121212'],
  ['#ffb21f', '#121212'],
  ['#f06292', '#121212'],
  ['#13a3b0', '#121212'],
  ['#56607a', '#ffffff'],
] as const
