// Light/dark choice. Without one, the tokens follow prefers-color-scheme.
const KEY = 'dn-theme'

export type Theme = 'light' | 'dark'

/** Inline in <head>: applies a saved choice before first paint, so the other theme never flashes. */
export const themeScript = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

/** Client only. */
export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode or storage disabled: the choice lasts for this page only.
  }
}

let revealRun = 0

/**
 * Switches theme with a circular reveal growing from `origin` (the control that was used),
 * via the View Transitions API. Falls back to an instant switch without support or with
 * reduced motion. The animation itself lives in styles.css.
 */
export function switchTheme(theme: Theme, origin?: Element | null) {
  if (
    typeof document.startViewTransition !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    setTheme(theme)
    return
  }
  const rect = origin?.getBoundingClientRect()
  const x = rect ? rect.left + rect.width / 2 : innerWidth / 2
  const y = rect ? rect.top + rect.height / 2 : innerHeight / 2
  // Far enough to reach the furthest corner of the viewport.
  const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)))
  const root = document.documentElement.style
  root.setProperty('--theme-reveal-x', `${x}px`)
  root.setProperty('--theme-reveal-y', `${y}px`)
  root.setProperty('--theme-reveal-radius', `${radius}px`)
  const run = ++revealRun
  document
    .startViewTransition(() => setTheme(theme))
    .finished.finally(() => {
      // A newer switch may have started; it owns the properties now.
      if (run !== revealRun) return
      root.removeProperty('--theme-reveal-x')
      root.removeProperty('--theme-reveal-y')
      root.removeProperty('--theme-reveal-radius')
    })
}
