import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// `@lmsy/shared` is shipped as TypeScript source, so it must be bundled
// (not externalized) into the main/preload output.
const bundledWorkspaceDeps = ['@lmsy/shared']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspaceDeps })],
    // Bake the Sentry DSN into the main bundle at build time (empty when unset,
    // so Sentry stays off). Read at build — not runtime — so a distributed app
    // reports crashes without the end user setting any env var.
    define: {
      'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
      'process.env.SENTRY_ENVIRONMENT': JSON.stringify(process.env.SENTRY_ENVIRONMENT ?? ''),
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspaceDeps })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    // Renderer root defaults to `src/renderer` (holds index.html).
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react()],
  },
})
