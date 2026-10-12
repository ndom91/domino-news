import { formatDate, plural } from '@dn/domain'
import { DESK_SLOT, type Desk } from '@dn/schemas'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import bold from '../../assets/fonts/archivo-bold.ttf?inline'
import display from '../../assets/fonts/archivo-display.ttf?inline'
import regular from '../../assets/fonts/archivo-regular.ttf?inline'

// Share images (og:image) for stories and narratives: 1200×630, in the desk's colour like the
// hero card. satori lays out JSX-like nodes into SVG; resvg turns that into a PNG.
// Static Archivo instances (OFL, made with fontTools' instancer from the variable font):
// satori can't read woff2 or set variable axes.

const WIDTH = 1200
const HEIGHT = 630

// The desk fills and their text colours, from design-tokens.css (--dn-narrative-0…6).
const DESK_COLOURS = [
  ['#e3dfd6', '#121212'],
  ['#2f4dff', '#ffffff'],
  ['#00a36c', '#121212'],
  ['#ffb21f', '#121212'],
  ['#f06292', '#121212'],
  ['#13a3b0', '#121212'],
  ['#5b6478', '#ffffff'],
] as const
const ACCENT = '#ff4f1a'

const fromDataUrl = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
let fonts: { name: string; data: Buffer; weight: 400 | 700 | 800; style: 'normal' }[] | null = null

export interface ShareCard {
  title: string
  kicker: string
  description: string | null
  desk: Desk | null
  /** "Covered by 12 publishers: BBC News, Reuters, …" or "8 stories". */
  footnote: string
  date: string
}

type Node = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
})

/** Smaller type for longer titles, so three lines always fit. */
const titleSize = (title: string) => (title.length > 90 ? 64 : title.length > 60 ? 76 : 88)

export async function renderShareCard(card: ShareCard): Promise<Buffer> {
  fonts ??= [
    { name: 'Display', data: fromDataUrl(display), weight: 800, style: 'normal' },
    { name: 'Archivo', data: fromDataUrl(bold), weight: 700, style: 'normal' },
    { name: 'Archivo', data: fromDataUrl(regular), weight: 400, style: 'normal' },
  ]
  const [fill, ink] = DESK_COLOURS[card.desk ? DESK_SLOT[card.desk] : 0] ?? DESK_COLOURS[0]

  const tree = h(
    'div',
    {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '56px 64px',
      background: fill,
      color: ink,
      fontFamily: 'Archivo',
    },
    h(
      'div',
      { display: 'flex', flexDirection: 'column' },
      h(
        'div',
        {
          display: 'flex',
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: 'uppercase',
          paddingBottom: 16,
          borderBottom: `3px solid ${ink}`,
        },
        card.kicker,
      ),
      h(
        'div',
        {
          display: 'flex',
          marginTop: 32,
          fontFamily: 'Display',
          fontWeight: 800,
          fontSize: titleSize(card.title),
          lineHeight: 1.02,
          letterSpacing: -1,
        },
        card.title,
      ),
      card.description
        ? h(
            'div',
            { display: 'flex', marginTop: 24, fontSize: 28, lineHeight: 1.35, maxWidth: 1000 },
            card.description,
          )
        : h('div', { display: 'flex' }),
    ),
    h(
      'div',
      {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        borderTop: `3px solid ${ink}`,
        paddingTop: 20,
      },
      h(
        'div',
        { display: 'flex', fontFamily: 'Display', fontWeight: 800, fontSize: 56, lineHeight: 0.9 },
        'DOMINO',
        h('span', { color: ACCENT }, '.'),
      ),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 22 },
        h('div', { display: 'flex', fontWeight: 700 }, card.footnote),
        h('div', { display: 'flex', marginTop: 4 }, card.date),
      ),
    ),
  )

  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts,
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng()
}

/** Footnote and date lines for a story card. */
export function storyFootnote(publishers: string[], at: string) {
  const unique = [...new Set(publishers)]
  const named = unique.slice(0, 3).join(', ')
  const more = unique.length > 3 ? ` +${unique.length - 3}` : ''
  return {
    footnote: `${plural(unique.length, 'publisher')}: ${named}${more}`,
    date: formatDate(at),
  }
}
