import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

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
