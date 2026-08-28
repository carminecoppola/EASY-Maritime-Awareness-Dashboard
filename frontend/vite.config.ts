import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const FLASK_ORIGIN = 'http://127.0.0.1:5000'

// Vite's dev proxy matches plain string keys by prefix (url.startsWith(key)),
// so a naive prefix like "/system" also matches the SPA's own
// "/system-diagnostics" client route (and "/thermal" matches
// "/thermal-events", "/snapshots" matches the gallery page's own path) —
// those requests would get sent to Flask instead of staying client-side,
// breaking direct navigation/refresh on those pages in dev only (production
// has no separate proxy, so it isn't affected). Vite treats a key as a regex
// when the string starts with "^" (see resolveHttpProxyContext in Vite's
// source) — every entry below uses that form, scoped to the real backend
// route shape, instead of a bare prefix.
const PROXY_PATTERNS: string[] = [
  '^/api(/|$)',
  '^/video(/|$)',
  '^/thermal/', // real routes are always /thermal/<something>
  '^/snapshots/', // media route has a required /<feed>/<filename> subpath
  '^/snapshot/', // singular action route, always has a /<feed> subpath
  '^/health(/|$)',
  '^/system$', // exact: the diagnostics API, not /system-diagnostics
  '^/cameras$',
  '^/paper-assets/',
]

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      PROXY_PATTERNS.map((pattern) => [
        pattern,
        { target: FLASK_ORIGIN, changeOrigin: false },
      ]),
    ),
  },
})
