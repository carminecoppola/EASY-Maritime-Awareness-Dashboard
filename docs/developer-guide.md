# Developer guide

## Runtime ownership

`app.py` builds stores, hardware adapters, and `SystemOrchestrator`, then
registers Flask blueprints. The orchestrator owns manager lifecycle; routes
retrieve collaborators through `DashboardRuntime` and remain thin.

The browser polls one aggregate dashboard endpoint. Page-specific JavaScript
normalizes that state and updates stable DOM IDs. User actions use the shared
API client so timeout and error feedback stay consistent.

`dashboard_runtime.js` owns polling, shared state, payload distribution, and
cross-page interactions. Rendering and event handlers that belong to one page
live in `dashboard_live.js`, `dashboard_detections.js`, `dashboard_log.js`, or
`dashboard_system.js`; they should not be copied back into the runtime module.

The shared template loads four CSS layers in a fixed order:
`foundations.css`, `runtime-layout.css`, `page-layouts.css`, then
`operator-overrides.css`. Keep that order when changing the layout because the
last layer contains the current operator-facing refinements. `style.css`
remains only as a compatibility entry point for external or historical links.

## Data flow

```text
sensor or replay frame
  → UnifiedFrameProvider
  → acquisition and/or InferenceWorker
  → DetectionManager / EventManager
  → SessionManager manifest
  → DatasetExporter validation and ZIP
```

RGB live providers consume callbacks from the existing camera owner, avoiding a
second camera process. PureThermal performs a bounded FFmpeg capture on demand,
temporarily pauses RGB ownership when required, caches the resulting JPEG, and
releases the V4L2 node. Thermal capture is refused above the configured CPU
temperature limit.

## Stable interfaces

Public Flask routes and required payload fields are compatibility boundaries.
Internal refactors should keep adapters for existing imports. Generic manager
normalization lives in `runtime_support.py`. The shared hardware contract lives
in `easy_dashboard/runtime_status.py` and distinguishes `READY` from
`STREAMING`; adapters, `/health`, presentation code, and the browser consume
that same contract.

Important endpoint groups:

- `/health`, `/api/dashboard/state`, `/api/status/summary`
- `/video/*`, `/thermal/*`, `/api/stream-state`
- `/api/session/*`, `/api/acquisition/*`
- `/api/inference/*`, `/api/detections/*`, `/api/events/*`
- `/api/dataset/*`

## Extending the project

Add a source by defining its catalog entry, device status provider, frame
provider adapter, and capability flags. Add a model backend behind the inference
backend contract; do not put model-specific loading into route handlers.

Inference responsibilities are intentionally separate: `inference_config.py`
loads paths and thresholds, `inference_backend.py` owns ONNX Runtime,
`inference_results.py` preserves the public detection representation, and
`InferenceWorker` coordinates frames, lifecycle, persistence, and events.

## Regression strategy

`tests/` covers normalized runtime states, manager propagation, stable API
payloads, session lifecycle, synchronized capture sets, dataset validation, and
ZIP export. `scripts/smoke_dashboard.py` remains the fast whole-application
check. GitHub Actions runs both suites plus Python, JavaScript, and shell syntax
checks. Raspberry validation stays explicit and separate from CI.

Hardware responsibilities are separated behind the compatibility module
`easy_dashboard.hardware`: `system_probe.py` owns read-only host diagnostics,
`rgb_capture.py` owns RGB command construction and MJPEG framing, and
`thermal_discovery.py` owns PureThermal node recognition and ranking. Existing
`SystemProbe`, `RgbMasterSource`, and `ThermalState` imports remain valid for
routes and external scripts.

## Glossary

- **Mission / session** — one bounded operating and persistence period.
- **Capture set** — one coordinated sensor action.
- **Sample** — manifest group used as one training example.
- **Detection** — one model observation for a frame.
- **Event** — an operator-relevant state derived from runtime or detections.
- **Manifest** — session index of saved artifacts and metadata.
