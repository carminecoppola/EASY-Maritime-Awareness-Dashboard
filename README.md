<div align="center">

# EASY Maritime Awareness Dashboard

**An edge node for dual-sensor maritime monitoring: RGB + thermal capture, on-device AI and dataset building on a Raspberry Pi**

[![Quality checks](https://github.com/carminecoppola/EASY-Maritime-Awareness-Dashboard/actions/workflows/quality.yml/badge.svg)](https://github.com/carminecoppola/EASY-Maritime-Awareness-Dashboard/actions/workflows/quality.yml)
[![License: BSD-3-Clause](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/runs%20on-Raspberry%20Pi%204-c51a4a)
![Stack](https://img.shields.io/badge/stack-Flask%20·%20React%20·%20ONNX%20Runtime-1f6feb)

</div>

EASY (*Environmental Awareness by the Sea and beYond*) turns a Raspberry Pi with two RGB
cameras and a FLIR/PureThermal sensor into a maritime observation node. The operator
works from a browser on a Mac; capture, inference and storage stay on the Raspberry.

| | |
| --- | --- |
| **Live view** | two continuous RGB feeds and a persistent thermal stream, with honest readiness states (`STREAMING`, `READY`, `ERROR`, ...) |
| **Missions** | a pre-flight checklist, then one manifest per mission that links captures, detections and events |
| **Paired capture** | RGB left + RGB right + thermal saved under one capture-set id, with the *measured* time skew between sensors |
| **On-device AI** | YOLOv8n in ONNX Runtime on the CPU, ≈ 0.6 s per frame, classes `boat` · `ship` · `buoy` |
| **Datasets** | validation of paired samples and export as a ZIP with a deterministic train/validation split |
| **Operations** | one-command remote launcher for macOS, systemd service, benchmark and validation tools |
| **Access control** | optional local accounts, roles, step-up authentication and an audit log |

> **Honest scope.** The detector was trained on public datasets and is **not validated for
> open water** (3.87% of obstacles found on the external MODD2 benchmark). It assists data
> collection and research; it is not a navigation or safety system. See
> [Project status](docs/project-status.md).

## How it fits together

```text
 RGB cameras ─┐                                          ┌────────── Mac ──────────┐
 PureThermal ─┼─► frame providers ─► acquisition ─┐      │  browser (React SPA)    │
 replay set  ─┘          │                        ├─► mission manifest ─► dataset   │
                         └──► ONNX inference ─────┘      └─────▲───────────────────┘
                                                               │ SSH tunnel
        Raspberry Pi 4: Flask + SystemOrchestrator ────────────┘
```

The detection model lives in its own repository,
[**easy-maritime-awareness**](https://github.com/carminecoppola/easy-maritime-awareness),
with its training, validation and honest results. The file in
`runtime/models/` is byte-identical to the one released there.

## Quick start

### Run it on your machine (no hardware needed)

```bash
git clone https://github.com/carminecoppola/EASY-Maritime-Awareness-Dashboard.git
cd EASY-Maritime-Awareness-Dashboard
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
(cd frontend && npm ci --include=dev && npm run build)
EASY_DASHBOARD_PORT=5051 python app.py   # then open http://127.0.0.1:5051
```

On macOS port 5000 belongs to the AirPlay Receiver, hence the explicit port. On the
Raspberry the service uses the `app.port` of `config.yaml` (5000).

Without cameras the dashboard starts in replay mode with the sample images in
`runtime/replay/`, so you can try missions, analysis and export.

### Deploy on the Raspberry Pi

```bash
git clone https://github.com/carminecoppola/EASY-Maritime-Awareness-Dashboard.git ~/easy-dashboard
cd ~/easy-dashboard && ./install.sh
sudo systemctl restart easy-dashboard.service
```

Requires Raspberry Pi OS with Python 3.9+, `libcamera`/`rpicam` tools for the cameras,
`ffmpeg` and `v4l2-ctl` for the thermal sensor, and Node.js 24 to build the frontend
(or build on the Mac and copy `frontend/dist/`). Full procedure:
[Raspberry operations](docs/raspberry-operations.md).

### Open it from the Mac

```bash
cp scripts/easy_dashboard_mac.env.example ~/.config/easy/launcher.env   # set your Raspberry address
./scripts/easy_dashboard_mac.sh --install-home-launcher
~/easy_dashboard_mac.sh
```

The launcher opens one SSH connection (through an optional jump host), starts the
service only if it is not already healthy, waits for readiness, forwards a local port
and opens the browser once the dashboard really answers.

## Documentation

| Guide | For |
| --- | --- |
| [Operator guide](docs/operator-guide.md) | running a mission and reading the status |
| [Developer guide](docs/developer-guide.md) | architecture, data flow, extending, security model |
| [Raspberry operations](docs/raspberry-operations.md) | install, launch, diagnose, validate, demo hotspot |
| [Project status](docs/project-status.md) | capabilities, model, measurements, next steps |
| [Runtime benchmark](docs/runtime-benchmark.md) | the reproducible Raspberry measurement protocol |
| [Validation report](docs/validation-report.md) | what was verified, and when |
| [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) | how to help, how to report a problem |

## Repository map

```text
app.py                      Flask application factory
system_orchestrator.py      builds and supervises every component
*_manager.py, frame_provider.py, inference_*.py, dataset_exporter.py
                            sessions, devices, sources, detections, events, inference, export
easy_dashboard/             config, stores, auth, hardware adapters, runtime status, HTTP routes
frontend/                   React operator interface (served from frontend/dist)
runtime/                    model, configuration and replay assets (missions are generated here)
scripts/                    launcher, install, benchmark, validation and demo tools
services/                   systemd unit template, demo hotspot configuration
tests/                      Python regression tests (no hardware needed)
docs/                       guides and reports
```

Every source file starts with a header and a docstring explaining its role.

## Tests

```bash
./scripts/validate_local_release.sh
```

builds the frontend, runs the React and Python suites, the smoke test and shell checks.
The same checks run on every push (`.github/workflows/quality.yml`). Hardware checks
stay separate because hosted CI cannot validate libcamera, V4L2 or the sensors.

## Publications

This software is the system described in:

- C. Coppola, V. Bucciero, S. Perrotta, R. Montella,
  *An Edge Node for Citizen-Contributed Maritime Observations*,
  INSTIL Workshop, IEEE eScience 2026, Naples.
- C. Coppola, V. Bucciero, S. Perrotta, R. Montella,
  *An Instrumented Edge Node for Dual-Sensor Maritime Safety Monitoring*,
  poster, IEEE eScience 2026 (Best Poster Award, participants' selection).

Laboratory results on the Raspberry Pi 4 prototype: two hours of concurrent RGB and
thermal acquisition without lost RGB views or service restarts, about 53% of one CPU
core and 450 MiB of memory in steady capture, 1.08 s mean end-to-end latency over 50
replay requests, and no throttling under CPU stress (77.4 °C peak). These figures refer
to the laboratory prototype only; thermal fusion and field deployment are future work.

## Citing and credits

If you use this software, the models or ideas from it in your work, **please cite it**.
GitHub's *Cite this repository* button reads [`CITATION.cff`](CITATION.cff); for a paper,
cite the INSTIL publication above.

Created and maintained by **Carmine Coppola**, with the EASY project collaborators named
in the publications. Third-party components and datasets are credited in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Licence

Code and original documentation: **BSD 3-Clause**, © 2026 Carmine Coppola and EASY
contributors ([`LICENSE`](LICENSE), [`NOTICE`](NOTICE)). You may use, modify and
redistribute them provided the copyright notice and the licence text are kept in your
source and in the documentation of your binaries, and you may not use the author's name
to endorse derived products without written permission. For other uses, or if in doubt,
ask first: contact the author through GitHub
([@carminecoppola](https://github.com/carminecoppola)).

The licence does **not** cover third-party material: the model weights (derived from
Ultralytics YOLOv8, AGPL-3.0; trained on datasets such as ABOships, CC BY 4.0), sample
images and bundled front-end snippets keep their own terms. See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
