# Developer guide

## Runtime ownership

`app.py` builds stores, hardware adapters, and `SystemOrchestrator`, then
registers Flask blueprints. The orchestrator owns manager lifecycle; routes
retrieve collaborators through `DashboardRuntime` and remain thin.

The browser polls one aggregate dashboard endpoint. Page-specific JavaScript
normalizes that state and updates stable DOM IDs. User actions use the shared
API client so timeout and error feedback stay consistent.

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
second camera process. PureThermal owns one FFmpeg process, enforces a frame
timeout and cooldown, and pauses above the configured CPU temperature limit.

## Stable interfaces

Public Flask routes and required payload fields are compatibility boundaries.
Internal refactors should keep adapters for existing imports. Runtime status
normalization lives in `runtime_support.py`; hardware payload translation lives
in `easy_dashboard/runtime_status.py`.

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

## Glossary

- **Mission / session** — one bounded operating and persistence period.
- **Capture set** — one coordinated sensor action.
- **Sample** — manifest group used as one training example.
- **Detection** — one model observation for a frame.
- **Event** — an operator-relevant state derived from runtime or detections.
- **Manifest** — session index of saved artifacts and metadata.
