# EASY dashboard frontend

React 19 + TypeScript + Vite single-page application served by Flask in production
(`frontend/dist/`, built by `npm run build`, found by `easy_dashboard/routes/spa.py`).

```bash
npm ci --include=dev        # install
npm run dev                 # dev server on :5173, proxies the API to http://127.0.0.1:5000
npm test                    # unit tests (Vitest + Testing Library)
npm run test:e2e            # browser tests (Playwright; start with `npx playwright install chromium`)
npm run build               # type-check and production build
```

Set `EASY_BACKEND_ORIGIN` to point the dev proxy at another backend (for instance the
Raspberry through an SSH tunnel).

## Layout

```text
src/api/          typed HTTP client (client.ts), response types (types.ts), token storage
src/hooks/        shared polling (usePolling, DashboardStateContext), auth, mission control
src/pages/        one component per route (Live, Mission, Analysis, Thermal, Archive, ...)
src/components/   panels grouped by area (live, mission, thermal, snapshots, feedback, ...)
src/lib/          pure logic: error translation, readiness, pre-flight, preferences
src/styles/       design tokens (tokens.css) and per-area stylesheets
```

Principles worth keeping when you change something:

- **One poller.** `DashboardStateProvider` polls `/api/dashboard/state` once for the whole
  app. Pages read it with `useSharedDashboardState()` instead of adding their own polling:
  the Raspberry CPU is the scarce resource.
- **Honest state.** Never present stale or placeholder data as live; show its age
  (`StaleDataBadge`) and say what is missing (`PanelState`).
- **No colour-only status.** Every status colour comes from `severityColors.ts` and is
  accompanied by text.
- **Operator language.** Errors go through `lib/errors.ts` so the UI says what failed
  and what to do, with the technical detail folded away.
