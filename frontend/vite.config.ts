import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const FLASK_ORIGIN = 'http://127.0.0.1:5000'

const PROXIED_PREFIXES = [
  '/api',
  '/video',
  '/thermal',
  '/snapshots',
  '/snapshot',
  '/health',
  '/system',
  '/cameras',
]

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      PROXIED_PREFIXES.map((prefix) => [
        prefix,
        { target: FLASK_ORIGIN, changeOrigin: false },
      ]),
    ),
  },
})
