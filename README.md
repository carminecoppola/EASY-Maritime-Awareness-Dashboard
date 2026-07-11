# EASY Local Dashboard

Browser-based local dashboard for Raspberry Pi camera monitoring.

## Project structure

The codebase is now organized so the Flask entrypoint stays small and the core
responsibilities are easy to find:

- `app.py` — Flask entrypoint and route wiring only
- `easy_dashboard/runtime.py` — shared runtime context used by all routes
- `easy_dashboard/routes/` — Flask blueprints split by page, runtime API,
  media/snapshots, and inference/session APIs
- `easy_dashboard/config.py` — config loading and merge logic
- `easy_dashboard/constants.py` — shared paths, defaults, and folder bootstrap
- `easy_dashboard/stores.py` — event log and snapshot persistence
- `easy_dashboard/media.py` — placeholder image and stream helpers
- `easy_dashboard/hardware.py` — Raspberry probe, RGB source, and thermal source
- `easy_dashboard/presentation.py` — UI payload builders and page context helpers
- `system_orchestrator.py` — lifecycle and health coordination of the runtime managers
- `acquisition_manager.py` — indexes session artifacts for dataset/fine-tuning workflows
- `dataset_exporter.py` — validates synchronized samples and creates portable train/validation packages
- `inference_backend.py` — lazy ONNX Runtime loading and model execution
- `inference_worker.py` — frame orchestration, result shaping, and persistence
- `runtime/` — session data, replay data, runtime configs, and models
- `docs/embedded/` — delivery notes and phase-by-phase implementation reports

This split is intentional: app boot, route ownership, storage, hardware, and UI
payload shaping now evolve independently instead of accumulating inside one
monolithic file.

## Install

```bash
cd ~/Desktop/carmine/easy-dashboard
./install.sh
```

## Start

```bash
./start.sh
```

For systemd/service mode, use:

```bash
sudo install -m 644 services/easy-dashboard.service /etc/systemd/system/easy-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable easy-dashboard.service
sudo systemctl restart easy-dashboard.service
./scripts/validate_raspberry_runtime.sh
```

The runtime validator waits up to 30 seconds for Flask and the hardware runtime
to become ready after a service restart. Override the limit with
`EASY_STARTUP_TIMEOUT_SECONDS` when startup checks intentionally take longer.

The systemd unit uses `scripts/run_service.sh`, a minimal non-interactive
launcher for Flask. `start.sh` remains available only for local diagnostics on
the Raspberry; remote operation should use the single Mac launcher below.

## Access

Open:

```text
http://<Raspberry_IP>:5000
```

Purple exposes the Raspberry SSH server only on its loopback address through
the persistent reverse tunnel `rainbow-tunnel.service`. The Mac launcher below
handles service startup, readiness, the local tunnel and Safari. Port `5500` is
preferred on the Mac to avoid the macOS AirPlay service; if occupied, the
launcher selects the next available port. Flask remains on Raspberry port
`5000`.

The two SSH ports have different roles:

- Purple SSH uses its normal port `22`.
- Port `44222` exists only on Purple loopback and reaches Raspberry SSH.

### Un solo comando dal Mac

Quando lavori senza accesso fisico alla Raspberry, non lanciare Flask a mano e
non aprire un browser sulla Raspberry. Dal clone del progetto sul Mac esegui:

```bash
./scripts/easy_dashboard_mac.sh
```

Il launcher riavvia `easy-dashboard.service` via SSH, aspetta `/health`, sceglie
una porta locale libera a partire da `5500`, crea il tunnel e apre Safari solo
quando la dashboard è raggiungibile. Il codice sulla Raspberry deve essere già
allineato con `git pull --ff-only`; il launcher non aggiorna il repository in
automatico.

I parametri possono essere sovrascritti senza modificare lo script, per esempio:

```bash
EASY_LOCAL_PORT=5600 EASY_TARGET_PORT=44222 ./scripts/easy_dashboard_mac.sh
```

## Debug

```bash
journalctl -u easy-dashboard.service -f
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:5000/cameras
curl http://127.0.0.1:5000/api/acquisition/status
curl http://127.0.0.1:5000/api/session/manifest
```

Session manifests index saved artifacts with `sample_id`, feed/modality labels,
and lightweight RGB/thermal pairing metadata when captures are close enough in
time to become a useful fine-tuning sample.

## Local smoke test

Before pushing changes to the Raspberry, run:

```bash
./.venv/bin/python scripts/smoke_dashboard.py
```

The smoke test imports the Flask app, renders the main dashboard pages, checks
for duplicate DOM ids, and verifies the primary JSON API contracts used by the
UI.

See `docs/technical_optimization_plan.md` for the next structural steps toward
a cleaner acquisition, inference, and dataset pipeline.

### Raspberry performance and storage checks

After restarting the service, run the normal validation and a short read-only
API benchmark:

```bash
./scripts/validate_raspberry_runtime.sh
./scripts/benchmark_raspberry_runtime.py --runs 20
```

Add `--inference` only when you intentionally want to benchmark the currently
selected source and model. Export status survives service restarts and includes
disk usage plus a retention preview:

```bash
curl http://127.0.0.1:5000/api/dataset/export/status
curl 'http://127.0.0.1:5000/api/dataset/export/retention?keep_latest=5'
```

Retention never runs automatically. Applying it requires an explicit POST with
`confirm: true`, so an operator can inspect the preview before removing old
export packages.

For day-to-day usage, see `docs/user_guide.md` or open `/help` from the
dashboard footer.

## Notes

- RGB feeds are browser-native MJPEG streams.
- Left and right cards represent the logical split of the CamArray feed.
- Thermal mode defaults to `mock` until the real FLIR path is activated.
- Runtime data is stored under `data/`:
  - `data/logs/`
  - `data/reports/`
  - `data/captures/`
