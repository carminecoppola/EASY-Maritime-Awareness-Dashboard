# EASY Maritime Awareness Dashboard

EASY is a Raspberry Pi dashboard for RGB and FLIR/PureThermal monitoring,
mission-based acquisition, ONNX inference, and dataset export. The browser runs
on the operator's Mac; camera capture and data storage remain on the Raspberry.

The two RGB views are continuous streams. PureThermal is acquired on demand so
the V4L2 node can be released between frames: `READY` means the sensor is found
and available, while `STREAMING` is only the short interval around a capture.

## Start here

- [Operator guide](docs/operator-guide.md) — use the dashboard and collect data.
- [Developer guide](docs/developer-guide.md) — understand the runtime and APIs.
- [Raspberry operations](docs/raspberry-operations.md) — install, launch, diagnose, and test safely.
- [Project status](docs/project-status.md) — current capabilities, model, dataset sources, and next steps.
- [Latest validation report](docs/validation-report.md) — measured Mac and Raspberry results.

## Installation

The target runtime is Raspberry Pi OS with Python 3.9. On the Raspberry:

```bash
cd ~/Desktop/carmine/easy-dashboard
./install.sh
sudo install -m 644 services/easy-dashboard.service /etc/systemd/system/easy-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable easy-dashboard.service
```

Do not run `install.sh` from an active virtual environment; the Raspberry
installer uses the platform-compatible package layout.

## One-command remote launch

From the project clone on the Mac:

```bash
./scripts/easy_dashboard_mac.sh
```

The launcher connects through the configured jump host, installs the current
systemd unit, restarts the Raspberry service, waits for `/health`, creates a
local SSH tunnel on the first available port from `5500`, and opens Safari only
after the dashboard responds.

The launcher intentionally does not run `git pull`. Update the Raspberry clone
explicitly so local changes can never be overwritten silently.

## Architecture

```text
RGB cameras / PureThermal / replay
                │
                ▼
        hardware and providers
                │
       ┌────────┴────────┐
       ▼                 ▼
 acquisition         ONNX inference
       │                 │
       └────────┬────────┘
                ▼
       mission manifest/events
                │
                ▼
      validated dataset export
```

Flask routes are under `easy_dashboard/routes/`. Long-lived services are
created by `SystemOrchestrator`. Runtime data belongs under `runtime/`; operator
snapshots belong under `data/snapshots/`.

## Local validation

Local tests do not require Raspberry hardware:

```bash
./.venv/bin/python -m py_compile app.py runtime_support.py system_orchestrator.py
./.venv/bin/python -m unittest discover -s tests -v
./.venv/bin/python scripts/smoke_dashboard.py
for file in static/js/dashboard_*.js; do node --check "$file"; done
```

The same regression suite runs on every push and pull request through
`.github/workflows/quality.yml`. Hardware tests remain separate because hosted
CI cannot validate V4L2, libcamera, CPU temperature, or the physical sensors.

On the Raspberry, use `scripts/validate_raspberry_runtime.sh` only during a
controlled validation window. Stop the service if CPU temperature reaches
78 °C or the thermal device fails to produce frames. The validator performs one
bounded thermal capture and confirms that the RGB process resumes afterward.

## Repository map

- `app.py` — Flask application factory and runtime wiring.
- `easy_dashboard/` — configuration, hardware adapters, presentation, routes, and shared runtime context.
- `*_manager.py` — sessions, acquisition, sources, devices, detections, and events.
- `inference_backend.py` / `inference_worker.py` — model execution and inference orchestration.
- `static/` / `templates/` — operator interface.
- `scripts/` — launch, smoke, benchmark, and Raspberry validation tools.
- `docs/archive/` — historical implementation reports; not current operating instructions.

## Compatibility

Existing HTTP routes and required JSON fields are kept stable. Internal modules
may be reorganized behind compatibility adapters as the project is simplified.
Hardware payloads also expose a `runtime_state` object with normalized
availability, readiness, streaming, health, and capture-mode fields.
