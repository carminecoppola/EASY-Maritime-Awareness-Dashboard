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
curl http://127.0.0.1:5000/health
./scripts/validate_raspberry_runtime.sh
```

`start.sh` is the operator/manual launcher with preflight output and tunnel
instructions. The systemd unit uses `scripts/run_service.sh`, a minimal
non-interactive launcher for the Flask process.

## Access

Open:

```text
http://<Raspberry_IP>:5000
```

Purple exposes the Raspberry SSH server only on its loopback address through
the persistent reverse tunnel `rainbow-tunnel.service`. Start the dashboard on
the Raspberry, then run this command in a second terminal on the Mac:

```bash
curl -fsS --max-time 2 http://127.0.0.1:5500/ >/dev/null || \
  ssh -fNT -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
    -L 5500:127.0.0.1:5000 \
    -J ccoppola@193.205.230.76 \
    -p 44222 pi@127.0.0.1
open http://127.0.0.1:5500
```

The command reuses a working local tunnel when one already exists. Otherwise,
SSH moves to the background after creating it. Safari then opens automatically.
Port `5500` is used on the Mac to avoid the macOS AirPlay service that may
already occupy local port `5000`; Flask continues to listen on Raspberry port
`5000`.

The two SSH ports have different roles:

- Purple SSH uses its normal port `22`.
- Port `44222` exists only on Purple loopback and reaches Raspberry SSH.

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
