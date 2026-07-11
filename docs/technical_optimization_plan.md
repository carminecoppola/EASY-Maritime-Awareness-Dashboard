# EASY technical optimization plan

This document describes the next structural and technical steps for turning the
current Raspberry dashboard into a stable acquisition, inference, and dataset
collection platform.

## Product objective

The dashboard must reliably:

1. stream the Raspberry RGB cameras and FLIR thermal sensor;
2. run inference on live or replayed frames;
3. save RGB, thermal, detection, event, and session metadata in a dataset-ready
   structure;
4. make the operator understand what is live, what is being analyzed, and what
   has been saved;
5. provide enough diagnostics to debug hardware issues directly on the
   Raspberry.

## Current architecture

- `app.py` creates the Flask app, creates the runtime context, and registers
  blueprints.
- `create_app(run_startup_checks=..., start_runtime_services=...)` can now be
  instantiated without preflight scripts or background services for smoke tests.
- `easy_dashboard/routes/` owns route modules for pages, runtime APIs, media,
  and inference/session APIs.
- `easy_dashboard/runtime.py` owns shared dashboard payload builders and exposes
  runtime collaborators to route modules.
- `system_orchestrator.py` creates and monitors the runtime managers.
- `device_manager.py` tracks logical hardware endpoints.
- `source_manager.py` tracks operator-selectable frame sources.
- `frame_provider.py` converts replay folders/images and future live sources
  into one `FrameObject` contract.
- `inference_worker.py` runs model loading, preprocessing, inference, and
  detection drawing.
- `detection_manager.py`, `event_manager.py`, and `session_manager.py` persist
  detections, events, metrics, and session metadata.
- `acquisition_manager.py` indexes saved artifacts into the session manifest
  that will feed future dataset and fine-tuning workflows.
- `static/js/dashboard_*.js` keeps frontend behavior split by page.

This is already much cleaner than a monolith. The next improvement is to reduce
hidden coupling between app routes, runtime managers, and frontend polling.

## Highest-value improvements

### 1. Keep Flask route ownership explicit

Done for the first pass. `app.py` is now a small app factory that registers:

- `routes/pages.py` for HTML pages;
- `routes/api_runtime.py` for aggregate dashboard state, sources, devices, and
  system APIs;
- `routes/media.py` for video streams, snapshots, and thermal media;
- `routes/api_inference.py` for frame-provider, inference, detection, event,
  and session APIs.

Next step: keep these modules thin and move complex payload shaping into typed
services instead of letting route functions grow again.

### 2. Harden the runtime context object

Done for the first pass. Routes now use `DashboardRuntime` instead of closing
over many local variables: events, stores, probe, RGB, thermal, orchestrator,
and managers.

Next step: split `DashboardRuntime` payload methods into focused service
objects once acquisition and dataset manifests become first-class.

### 3. Make source/device/frame-provider contracts explicit

`device_manager.py` and `source_manager.py` already share
`runtime_catalog.py`, but the next step is to define a single endpoint status
schema for:

- hardware state;
- UI source state;
- frame-provider capability;
- dataset role.

Expected benefit: the UI can show "available", "selected", "streaming",
"recording", and "inferable" without guessing from several payloads.

First pass done. Source payloads now expose explicit `availability` and
`capabilities` fields. The UI uses them to distinguish live viewing, snapshot
capture and AI inference support without deriving behavior from source names.

### 4. Promote acquisition to a first-class service

First pass done. `AcquisitionManager` now records runtime artifacts into the
active session manifest. The next evolution is for it to own:

- active session id;
- selected source;
- capture cadence;
- saved frame paths;
- RGB/thermal synchronization metadata;
- dataset manifest updates.

Expected benefit: fine-tuning data becomes reproducible instead of a collection
of snapshots and events.

### 5. Add a dataset manifest per session

Each session should produce a manifest such as:

```text
runtime/sessions/<session_id>/
  metadata.json
  manifest.json
  rgb_left/
  rgb_right/
  thermal/
  detections.json
  events.json
  metrics.json
```

`manifest.json` should index every acquired frame with timestamp, source,
path, width, height, paired thermal/RGB frame id when available, inference
result id, and labels.

First pass done. New sessions now include `manifest.json` with snapshot and
inference entries. Snapshot entries include `sample_id`, `modality`,
`dataset_role`, and lightweight RGB/thermal pairing metadata when captures
happen close together. Expected benefit: later fine-tuning can consume a session
directly without manual file archaeology.

Coordinated capture is now implemented. One operator action records RGB left,
RGB right and thermal with a shared `capture_set_id` and `sample_id`. Manifest
counts include `synchronized_samples` only when usable RGB and thermal data are
both present, so diagnostic placeholders cannot inflate training-ready totals.

Live RGB inference is now connected. The unified provider consumes frames from
the existing RGB runtime owner through in-memory callbacks, avoiding a second
camera process. RGB left and right can feed the current RGB model; thermal is
explicitly rejected until a thermal or fusion model is configured.

## Remaining implementation phases

Dataset validation and export are now implemented. Only usable RGB/thermal
samples enter the package; missing or incomplete artifacts are reported and
excluded. Exports use deterministic train/validation assignment and include a
portable `dataset.json`, validation report, organized images and ZIP archive.

1. Complete technical hardening: sustained Raspberry benchmarks, storage
   retention and automated regression coverage.
2. Run a dedicated final UI/UX redesign phase: information architecture,
   visual hierarchy, interaction feedback, responsive behavior, accessibility
   and full operator-flow browser validation.

### 6. Separate inference backend from inference worker

Keep `InferenceWorker` as the orchestration loop, but move model-specific logic
into backend classes:

- `OnnxDetectionBackend`;
- later `TorchDetectionBackend`;
- later thermal/RGB fusion backend.

Expected benefit: model upgrades and Raspberry compatibility fixes are isolated.

First pass done. `OnnxDetectionBackend` now owns lazy ONNX Runtime loading,
CPU provider selection and tensor execution. `InferenceWorker` remains
responsible for frame orchestration, result shaping and persistence.

### 7. Keep UI state boring and predictable

The frontend should continue with page modules, but the polling should become
more declarative:

- one shared API client;
- one state normalizer;
- one render function per card/panel;
- no DOM id guessing from multiple modules.

Expected benefit: the UI remains understandable while the runtime gets more
complex.

First pass done. `dashboard_api.js` now owns JSON parsing, request timeouts and
action errors for every page. `dashboard_runtime.js` focuses on state and user
interactions instead of implementing multiple variants of the same HTTP call.

## Immediate stability checks

Run this before pushing to the Raspberry:

```bash
./.venv/bin/python -m py_compile app.py runtime_support.py runtime_catalog.py device_manager.py source_manager.py detection_manager.py event_manager.py session_manager.py frame_provider.py inference_worker.py system_orchestrator.py

node --check static/js/dashboard_shared.js
node --check static/js/dashboard_live.js
node --check static/js/dashboard_detections.js
node --check static/js/dashboard_log.js
node --check static/js/dashboard_system.js
node --check static/js/dashboard_runtime.js
node --check static/js/dashboard_utils.js

./.venv/bin/python scripts/smoke_dashboard.py
```

On the Raspberry, after pulling:

```bash
./start.sh
curl http://127.0.0.1:5000/api/dashboard/state
curl http://127.0.0.1:5000/api/session/status
```

## Suggested next implementation order

1. Keep the smoke test green.
2. Add a clearer live-source interface for RGB and FLIR.
3. Add Playwright UI checks for the three operator flows:
   live refresh, snapshot capture, start/stop analysis.
4. Add an operator-facing dataset/session summary panel in the UI.
