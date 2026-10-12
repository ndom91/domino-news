// Vite inlines these as base64 data URLs (see card.ts). Only the web app (Vite) and the
// tests (Vitest) load the share-card module; the worker never does.
declare module '*.ttf?inline' {
  const dataUrl: string
  export default dataUrl
}
