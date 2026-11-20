import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'
import { nativeDarkTokens, nativeTokens } from './native.ts'

const here = path.dirname(new URL(import.meta.url).pathname)
const twIndex = createRequire(import.meta.url).resolve('tailwindcss/index.css')
const sheets: Record<string, string> = {
  tailwindcss: twIndex,
  '@dn/design-tokens/design-tokens.css': path.join(here, 'design-tokens.css'),
  '@dn/design-tokens/theme.css': path.join(here, 'theme.css'),
}

async function build(classes: string[]) {
  const compiler = await compile(
    '@import "tailwindcss";\n@import "@dn/design-tokens/design-tokens.css";\n@import "@dn/design-tokens/theme.css";',
    {
      base: here,
      loadStylesheet: async (id, base) => {
        const file = sheets[id]
        // Font CSS and the like don't affect utilities.
        if (!file) return { path: id, base, content: '' }
        return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
      },
    },
  )
  return compiler.build(classes)
}

// A theme key named after a display value (e.g. --spacing-grid) makes Tailwind's
// inline-*/block-* size utilities claim the display class too: `inline-grid` then also
// sets inline-size. Each display class must emit exactly one rule.
const DISPLAY = [
  'inline-grid',
  'inline-flex',
  'inline-block',
  'inline-table',
  'grid',
  'flex',
  'block',
  'table',
  'contents',
  'hidden',
]

describe('theme keys', () => {
  it('do not give display utilities a second meaning', async () => {
    const css = await build(DISPLAY)
    for (const cls of DISPLAY) {
      const rules = css.match(new RegExp(`(^|\\n)\\s*\\.${cls}\\s*\\{`, 'g')) ?? []
      expect(rules, cls).toHaveLength(1)
    }
  })
})

function luminance(hex: string) {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrast(a: string, b: string) {
  const light = luminance(a)
  const dark = luminance(b)
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)
}

describe('summary sheets', () => {
  it.each([
    ['light', '[data-theme="light"]', nativeTokens],
    ['dark', '[data-theme="dark"]', nativeDarkTokens],
    ['system dark', ':root:not([data-theme])', nativeDarkTokens],
  ] as const)(
    'keeps %s web and native colours in sync and text above AA',
    (_, selector, tokens) => {
      const css = readFileSync(path.join(here, 'design-tokens.css'), 'utf8')
      const block = css.split(`${selector} {`)[1]?.split('}')[0] ?? ''
      const value = (name: string) => block.match(new RegExp(`--dn-${name}: (#[a-f\\d]+)`))?.[1]
      expect(value('accent-text-on-sheet')).toBe(tokens.color.accentTextOnSheet)
      for (const [desk, fill] of Object.entries(tokens.color.deskSheet)) {
        expect(value(`desk-${desk}-sheet`), desk).toBe(fill)
        for (const ink of [
          tokens.color.text,
          tokens.color.textMuted,
          tokens.color.accentTextOnSheet,
        ]) {
          expect(contrast(ink, fill), `${desk}: ${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    },
  )
})
