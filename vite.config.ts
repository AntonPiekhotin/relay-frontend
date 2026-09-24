import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import browserslist from 'browserslist'
import { browserslistToTargets } from 'lightningcss'
import path from 'node:path'

/**
 * The oldest browser the CSS must render in. Chrome 109 is the last Chrome for Windows 7, and a
 * real user is on it. Tailwind v4 writes every colour as `oklch()`, which Chrome learned in 111 —
 * on 109 each `--relay-*` token is an invalid value, every `var(--relay-*)` resolves to nothing,
 * and the app renders with no backgrounds, borders or text colour. Lightning CSS lowers the output
 * for these targets: a hex fallback first, the exact `lab()` colour behind an `@supports` guard.
 * `defaults` keeps the modern floor for everything else so nothing is lowered that need not be.
 */
const cssTargets = browserslistToTargets(browserslist('defaults, chrome >= 109'))

/**
 * The proxy is not a convenience — it is the only reason a browser client works at all.
 *
 * The backend has NO CORS configuration anywhere (no `CorsConfiguration`, no `@CrossOrigin`,
 * no `addCorsMappings`), and websocket-gateway's `WebSocketConfig` never calls
 * `setAllowedOrigins`, so Spring applies its same-origin default to the handshake. A direct
 * `fetch('http://localhost:8080/...')` from :5173 is blocked by CORS, and a direct
 * `new WebSocket('ws://localhost:8083/ws')` is answered 403 on the Origin check.
 *
 * Routing both through Vite makes every request same-origin from the browser's point of view.
 * `changeOrigin` rewrites Host; the explicit `Origin` header is what satisfies Spring's
 * same-origin check on the WS upgrade — `changeOrigin` alone does not rewrite Origin.
 *
 * Never bypass this by hardcoding a backend host in application code. See docs/ARCHITECTURE.md §2.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: cssTargets },
  },
  build: {
    cssMinify: 'lightningcss',
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8083',
        ws: true,
        changeOrigin: true,
        headers: { Origin: 'http://localhost:8083' },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['.cra-backup/**', 'node_modules/**'],
    passWithNoTests: true,
  },
})
