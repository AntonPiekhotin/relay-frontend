import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

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
