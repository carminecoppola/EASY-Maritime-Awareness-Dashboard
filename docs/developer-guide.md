# Developer guide

## Runtime ownership

`app.py` builds stores, hardware adapters, and `SystemOrchestrator`, then
registers Flask blueprints. The orchestrator owns manager lifecycle; routes
retrieve collaborators through `DashboardRuntime` and remain thin.

The React frontend lives in `frontend/src/`. Shared dashboard state and polling
are owned by its hooks; page components render the results. User actions use
`frontend/src/api/client.ts` for consistent timeouts, authentication and errors.
Flask serves the production build from `frontend/dist/`.

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
caches the resulting JPEG, and releases the V4L2 node. RGB (CSI/libcamera) and
thermal (USB/UVC) go through independent V4L2 paths, so RGB capture is not
paused during thermal capture; a concurrent capture test showed RGB was never
interrupted. Thermal capture is refused above the configured CPU temperature
limit.

Detection history uses an append-only `detection_history.jsonl` journal on the
hot path. `detection_history.json` remains the compatible compact snapshot and
is refreshed when both the age and size thresholds are reached, or when the
manager starts and clears its state.

## Stable interfaces

Public Flask routes and required payload fields are compatibility boundaries.
Internal refactors should keep adapters for existing imports. Generic manager
normalization lives in `runtime_support.py`. The shared hardware contract lives
in `easy_dashboard/runtime_status.py` and distinguishes `READY` from
`STREAMING`; adapters, `/health`, presentation code, and the browser consume
that same contract.

Important endpoint groups:

- `/health/ready` for lightweight service readiness; `/health` for complete diagnostics
- `/api/dashboard/state`, `/api/status/summary`
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
`inference_image.py` owns preprocessing, YOLO decoding, NMS, and preview
drawing, `inference_results.py` preserves the public detection representation,
and `InferenceWorker` coordinates frames, lifecycle, persistence, and events.

## Security model

The dashboard has no login and assumes a trusted LAN, matching how it's
deployed today (Raspberry Pi reachable over LAN and an SSH tunnel from the
operator's Mac). For a demo on a network with untrusted peers, set
`security.shared_token` in `config.yaml` (or the `EASY_DASHBOARD_TOKEN` env
var, which takes precedence) to require an `X-EASY-Token` header on every
state-changing request; GETs stay open. The token is rendered into the page
itself (`templates/base.html` → `window.EASY_DASHBOARD_TOKEN`), so it blocks
requests that never loaded the real dashboard origin — it is not a substitute
for real authentication. Leave it unset for the default trust model.

## Regression strategy

`tests/` covers normalized runtime states, manager propagation, stable API
payloads, session lifecycle, synchronized capture sets, dataset validation, and
ZIP export. `scripts/smoke_dashboard.py` remains the fast whole-application
check. GitHub Actions runs both suites plus Python, JavaScript, and shell syntax
checks. Raspberry validation stays explicit and separate from CI.

Hardware responsibilities are separated behind the compatibility module
`easy_dashboard.hardware`, which re-exports `RgbMasterSource` from
`rgb_hardware.py` and `ThermalState` from `thermal_hardware.py` (split apart
once their RGB/thermal coordination was removed). `system_probe.py` owns
read-only host diagnostics, `rgb_capture.py` owns RGB command construction and
MJPEG framing, and `thermal_discovery.py` owns PureThermal node recognition and
ranking. Existing `SystemProbe`, `RgbMasterSource`, and `ThermalState` imports
remain valid for routes and external scripts. `RgbMasterSource.focus_score()`
reports a Laplacian-variance sharpness estimate for the live page's manual
focus assist (there is no autofocus actuator on these fixed-lens modules).

## Glossary

- **Mission / session** — one bounded operating and persistence period.
- **Capture set** — one coordinated sensor action.
- **Sample** — manifest group used as one training example.
- **Detection** — one model observation for a frame.
- **Event** — an operator-relevant state derived from runtime or detections.
- **Manifest** — session index of saved artifacts and metadata.

## Snapshot archive

`SnapshotStore` keeps JPEGs and JSON sidecars as the source data and a derived
SQLite index at `data/snapshots/snapshots.sqlite3`. Startup rebuilds the index
from the archive, including legacy filenames and offline metadata changes.
Normal captures update the index immediately; polling does not scan image
directories or read sidecars. Stop the service before editing archive files
externally and restart afterward to reconcile them. If the derived index is
damaged, remove only `snapshots.sqlite3` while the service is stopped; startup
recreates it from the JPEGs and sidecars.

`GET /api/snapshots/recent?limit=24&offset=24` supports pagination. `count` and
`summary` cover the complete archive, independent of the page size. Images are
ordered by modification time descending, then filename descending for ties.
Snapshot filenames contain a UUID and are created exclusively; failed saves
clean up their newly created files instead of advertising partial captures.
