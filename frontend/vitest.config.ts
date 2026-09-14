import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    // e2e/ holds Playwright specs (a different test runner entirely) — without
    // excluding it, Vitest tries to execute them too and fails immediately.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
