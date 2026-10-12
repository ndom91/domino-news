// Renders the web app manifest icons from apps/web/public/favicon.svg.
// Run after changing the favicon: node scripts/app-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// resvg is a dependency of @dn/web (pnpm doesn't hoist it to the root).
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { Resvg } = require('@resvg/resvg-js')

const pub = new URL('../apps/web/public/', import.meta.url)
const svg = readFileSync(new URL('favicon.svg', pub), 'utf8')

const render = (source, size, name) => {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(new URL(name, pub), png)
  console.log(`${name} ${size}×${size}`)
}

render(svg, 192, 'icon-192.png')
render(svg, 512, 'icon-512.png')

// Maskable: launchers crop to a circle or squircle, keeping only the centre 80%. Shrink the
// mark to 58% (its corner then sits inside the safe circle) and centre it on the full-bleed canvas so the crop never cuts the "D.".
const maskable = svg
  .replace(
    /<g transform="([^"]*)">/,
    '<g transform="translate(159.6 159.6) scale(0.58)"><g transform="$1">',
  )
  .replace('</g></svg>', '</g></g></svg>')
render(maskable, 512, 'icon-maskable-512.png')
