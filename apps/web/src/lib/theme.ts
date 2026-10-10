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
