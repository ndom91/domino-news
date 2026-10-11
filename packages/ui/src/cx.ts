import { extendTailwindMerge } from 'tailwind-merge'

// Our theme tokens (packages/design-tokens/theme.css), so tailwind-merge knows what each
// class is. Without this it reads `text-label` (a font size) as a colour and drops it next
// to `text-text-muted`. test/unit.test.ts checks this list against theme.css.
export const THEME_TOKENS = {
  text: [
    '2xs',
    'xs',
    'sm',
    'label',
    'base',
    'md',
    'lg',
    'numeral',
    'headline',
    'headline-lg',
    'section',
    'period',
    'masthead',
    'display',
  ],
  leading: ['display', 'headline', 'tight', 'snug', 'normal'],
  'font-weight': ['regular', 'medium', 'semibold', 'bold', 'heavy', 'extrabold', 'black'],
  tracking: ['display', 'masthead', 'headline', 'label'],
  spacing: ['tap', 'gutter', 'column', 'strip', 'bar'],
  container: ['page', 'reading'],
  radius: ['none', 'sm'],
  shadow: ['popover'],
  breakpoint: ['sm', 'md', 'lg', 'xl'],
}

const merge = extendTailwindMerge({ extend: { theme: THEME_TOKENS } })

/**
 * Join class names, resolving Tailwind conflicts so the later class wins (`px-4 … px-0`
 * gives `px-0`). Custom utilities (type-*, key-fill, t-*) are left alone.
 */
export function cx(...parts: (string | false | null | undefined)[]) {
  return merge(parts.filter(Boolean).join(' '))
}
