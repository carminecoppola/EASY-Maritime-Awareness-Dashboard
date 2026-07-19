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
- [Raspberry runtime benchmark](docs/runtime-benchmark.md) — reproduce the IEEE system-performance measurements.
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

## Paper and presentation preview

Open `/paper-preview` when the physical cameras are unavailable but a stable
interface figure is needed for a paper or presentation. The view uses two
recorded SeaShips RGB samples already stored in the repository and a clearly
labelled illustrative thermal reference. It does not poll the hardware APIs or
present any of these assets as live measurements.

For a clean figure, open the page at the normal dashboard URL, hide the browser
toolbar or enter full screen, and capture the dashboard viewport. Keep the
“Paper preview” banner visible so the provenance of the displayed data remains
unambiguous.

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
./scripts/validate_local_release.sh
```

The same regression suite runs on every push and pull request through
`.github/workflows/quality.yml`. Hardware tests remain separate because hosted
CI cannot validate V4L2, libcamera, CPU temperature, or the physical sensors.

The current suite contains 41 automated regression tests. The paper evaluation
also uses scripted Raspberry and browser checks; these are reported separately
because they depend on physical cameras and the target device.

On the Raspberry, use `scripts/validate_raspberry_runtime.sh` only during a
controlled validation window. Stop the service if CPU temperature reaches
78 °C or the thermal device fails to produce frames. The validator performs one
bounded thermal capture and confirms that the RGB process resumes afterward.

## Repository map

- `app.py` — Flask application factory and runtime wiring.
- `easy_dashboard/` — configuration, hardware adapters, presentation, routes, and shared runtime context.
- `*_manager.py` — sessions, acquisition, sources, devices, detections, and events.
- `inference_config.py` / `inference_backend.py` / `inference_image.py` / `inference_results.py` — inference configuration, model execution, image processing, and stable result formatting.
- `inference_worker.py` — inference lifecycle and frame-provider orchestration.
- `static/` / `templates/` — operator interface; CSS is loaded as four ordered layers from foundations to operator overrides.
- `scripts/` — launch, smoke, benchmark, and Raspberry validation tools.
- `docs/archive/` — historical implementation reports; not current operating instructions.

## Compatibility

Existing HTTP routes and required JSON fields are kept stable. Internal modules
may be reorganized behind compatibility adapters as the project is simplified.
Hardware payloads also expose a `runtime_state` object with normalized
availability, readiness, streaming, health, and capture-mode fields.

## Reproducibility

The Raspberry benchmark writes raw samples, environment metadata, dependency
versions, summaries, LaTeX tables and checksums. Generated runs are deliberately
kept outside Git history and must be copied intact into the companion paper
evaluation archive. `requirements.txt` defines supported installation ranges;
the exact packages used for a reported experiment belong in that archive's
`environment.json` or an exported lock file.

## License

The dashboard software is distributed under the BSD 3-Clause License. See
[`LICENSE`](LICENSE). Captured images, replay material, model files and other
third-party assets may have separate provenance and usage conditions; the
software license does not override those terms.
