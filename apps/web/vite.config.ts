import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 4000 },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  ssr: {
    // Workspace packages ship TypeScript source; bundle them for SSR.
    noExternal: [/^@dn\//],
    // Share images (packages/server/src/og) need these loaded by Node as they ship: resvg
    // loads a native .node binary, and satori's layout engine finds its wasm via __dirname,
    // which breaks once bundled into ESM. Both are @dn/web dependencies so Node can resolve them.
    external: ['@resvg/resvg-js', 'satori'],
    optimizeDeps: { exclude: ['@resvg/resvg-js', 'satori'] },
  },
  optimizeDeps: { exclude: ['@resvg/resvg-js', 'satori'] },
})
