# Developer guide

## Architecture in one page

```text
Raspberry Pi                                              Operator's Mac
┌──────────────────────────────────────────────┐          ┌──────────────┐
│ app.py (Flask)                               │          │ browser      │
│  ├─ easy_dashboard/routes/   HTTP API + SPA  │ ◄─ SSH ─►│ React SPA    │
│  ├─ DashboardRuntime         payload builders│  tunnel  └──────────────┘
│  └─ SystemOrchestrator       supervises:     │
│      DeviceManager · SourceManager           │
│      SessionManager · AcquisitionManager     │
│      EventManager · DetectionManager         │
│      DatasetExporter · InferenceWorker       │
│ hardware: RgbMasterSource · ThermalState     │
└──────────────────────────────────────────────┘
```

`app.py` builds the stores, the hardware adapters and the `SystemOrchestrator`,
registers the Flask blueprints and installs the authentication hook. Slow start-up
work (pre-flight, sensor detection, starting the cameras) runs in a background
thread, so Flask answers `/health` immediately while the sensors come up. Routes
stay thin: they reach their collaborators through `DashboardRuntime`.

## Data flow

```text
sensor or replay frame
  → UnifiedFrameProvider
  → acquisition and/or InferenceWorker
  → DetectionManager / EventManager
  → SessionManager manifest
  → DatasetExporter validation and ZIP
```

* **RGB.** One `rpicam-vid`/`libcamera-vid` process outputs a side-by-side MJPEG
  stereo image. `RgbMasterSource` owns it and crops the left and right views, so
  the camera is opened exactly once; live inference reads frames through a callback
  instead of opening a second process.
* **Thermal.** `ThermalState` runs a persistent FFmpeg worker (Y16, 160×120) in
  `continuous` mode (the default) or bounded single-frame captures in `on_demand`
  mode. RGB (CSI/libcamera) and thermal (USB/UVC) use independent paths, so RGB is
  never paused. Capture stops above 78 °C CPU temperature.
* **Persistence.** Detections and session data are appended to JSONL journals
  (constant cost per inference) and compacted into JSON snapshots when large and old
  enough, on stop and on graceful shutdown. See the module docstrings of
  `easy_dashboard/detection_manager.py` and `easy_dashboard/session_manager.py`.

## Module map

| Module (in `easy_dashboard/`) | Responsibility |
| --- | --- |
| `system_orchestrator.py` | Builds and supervises every component, health aggregation |
| `device_manager.py`, `source_manager.py`, `runtime_catalog.py` | Devices, selectable sources, canonical endpoints |
| `frame_provider.py` | Replay and live frame providers behind one interface |
| `inference_*.py` | Configuration, ONNX backend, image pipeline, result format, worker |
| `detection_manager.py`, `event_manager.py` | Detections and mission events |
| `session_manager.py`, `acquisition_manager.py` | Missions, manifests, RGB/thermal pairing |
| `dataset_exporter.py` | Validation and export of datasets |
| `auth.py`, `stores.py`, `config.py`, `routes/` | Accounts, persistence helpers, configuration, HTTP routes |
| `hardware.py`, `rgb_*.py`, `thermal_*.py` | Camera and thermal adapters |

`app.py` (repository root) is the Flask factory and entry point; `frontend/src/` holds the
React application (pages, components, hooks, API client).

Every module starts with a docstring that explains its role; read it first.

## Stable interfaces

Public Flask routes and required payload fields are compatibility boundaries.
The shared hardware contract lives in `easy_dashboard/runtime_status.py`
(`STREAMING`, `READY`, `INITIALIZING`, `NOT_PRESENT`, `ERROR`); adapters, `/health`
and the browser all consume it. Main endpoint groups:

- `/health/ready` (lightweight) and `/health` (full diagnostics)
- `/api/dashboard/state`, `/api/status/summary`
- `/video/*`, `/thermal/*`, `/api/stream-state`
- `/api/session/*`, `/api/acquisition/*`, `/api/dataset/*`
- `/api/inference/*`, `/api/detection(s)/*`, `/api/events/*`
- `/api/auth/*`

## Extending the project

* **A new source:** add its catalog entry in `runtime_catalog.py`, a status provider
  for the device manager, a frame provider adapter and its capability flags.
* **A new model:** put the ONNX file in `runtime/models/`, point
  `runtime/config/inference_config.json` at it and adjust the class list. Keep
  model-specific code in `inference_backend.py` and `inference_image.py`, never in
  route handlers. Record its checksum in the model repository (see
  *Models* in [Project status](validation.md)).
* **A new page:** add the route in `frontend/src/routes.tsx`, the navigation entry in
  `components/layout/navItems.ts` and use `useSharedDashboardState()` for data
  instead of adding another poller.

## Security model

By default the dashboard assumes a trusted LAN reached through an SSH tunnel. Three
layers can be added:

1. **Accounts and roles** (`easy_dashboard/auth.py`): local users, roles
   (`viewer < operator < admin`), server-side sessions with CSRF protection, scrypt
   password hashing, login rate limiting and an audit log. Enforcement is a
   two-key switch: an Admin enables it in *Users & Roles*, or the
   `EASY_DASHBOARD_ENABLE_AUTH` environment variable forces it (`1`) or disables it
   (`0`, the emergency way back in for a locked device). First-run setup never
   locks anyone out.
2. **Step-up authentication** for destructive actions (password typed again within
   five minutes).
3. **Legacy shared token**: `security.shared_token` in `config.yaml` or
   `EASY_DASHBOARD_TOKEN` requires an `X-EASY-Token` header on state-changing
   requests. It is not a substitute for real authentication.

## Testing

```bash
python -m unittest discover -s tests -v      # backend (hardware-free)
python scripts/smoke_dashboard.py            # whole-application smoke test
cd frontend && npm test                      # unit tests (Vitest)
cd frontend && npm run test:e2e              # browser tests (Playwright)
scripts/validate_local_release.sh            # everything above plus shell checks
```

GitHub Actions runs the same suites. Raspberry hardware validation is explicit and
separate from CI (see [Raspberry operations](raspberry-operations.md)).

## Snapshot archive

`SnapshotStore` keeps JPEGs and JSON sidecars as the source data and a derived
SQLite index at `data/snapshots/snapshots.sqlite3`, rebuilt at start-up (so offline
edits and legacy files are picked up). Stop the service before editing archive files
by hand. If the index is damaged, delete only `snapshots.sqlite3` while the service
is stopped. `GET /api/snapshots/recent?limit=24&offset=24` pages through the archive;
`count` and `summary` always cover the whole archive.

## Glossary

- **Mission / session** — one bounded acquisition period.
- **Capture set** — one coordinated RGB+thermal capture.
- **Sample** — the manifest group used as one training example.
- **Detection** — one model observation in one frame.
- **Event** — an operator-relevant state derived from detections.
- **Manifest** — the session index of saved artifacts and metadata.
