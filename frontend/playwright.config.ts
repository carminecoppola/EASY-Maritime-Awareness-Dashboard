import { defineConfig, devices } from '@playwright/test'

// Runs against the built frontend/dist served BY FLASK (not the Vite dev
// server): the thing worth testing end-to-end is the real production path
// — the catch-all route serving index.html, client-side routing, and every
// API/media route staying reachable — not Vite's own dev server behavior.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5051',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The release validator supplies its selected Python interpreter.
    command: 'cd .. && "${EASY_PYTHON_BIN:-python3}" e2e_backend.py',
    // /health/ready needs the orchestrator fully running, which
    // e2e_backend.py deliberately skips (run_startup_checks=False,
    // start_runtime_services=False — no hardware in CI); /api/config has no
    // such dependency and is a fine "the server is up" probe.
    url: 'http://127.0.0.1:5051/api/config',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
