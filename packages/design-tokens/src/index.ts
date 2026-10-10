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
} as const

export const RADII = { sm: 4, md: 8, lg: 14 } as const

export const FONT_FAMILIES = {
  serif: 'Newsreader',
  sans: 'Instrument Sans',
  mono: 'JetBrains Mono',
} as const

export const COLORS_LIGHT = {
  canvas: '#f7f6f2',
  surface: '#ffffff',
  text: '#1b1f1e',
  textMuted: '#6a716e',
  border: '#dedbd2',
  accent: '#2b6b5e',
  error: '#a33a2c',
} as const

export const VIZ_PALETTE = [
  '#2b6b5e',
  '#8a5a12',
  '#3c5a8c',
  '#8c3c5a',
  '#5a6b2b',
  '#6b4a8a',
] as const
