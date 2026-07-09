# EASY Local Dashboard

Browser-based local dashboard for Raspberry Pi camera monitoring.

## Project structure

The codebase is now organized so the Flask entrypoint stays small and the core
responsibilities are easy to find:

- `app.py` — Flask entrypoint and route wiring only
- `easy_dashboard/config.py` — config loading and merge logic
- `easy_dashboard/constants.py` — shared paths, defaults, and folder bootstrap
- `easy_dashboard/stores.py` — event log and snapshot persistence
- `easy_dashboard/media.py` — placeholder image and stream helpers
- `easy_dashboard/hardware.py` — Raspberry probe, RGB source, and thermal source
- `easy_dashboard/presentation.py` — UI payload builders and page context helpers
- `system_orchestrator.py` — lifecycle and health coordination of the runtime managers
- `runtime/` — session data, replay data, runtime configs, and models
- `docs/embedded/` — delivery notes and phase-by-phase implementation reports

This split is intentional: app boot, storage, hardware, and UI payload shaping
now evolve independently instead of accumulating inside one monolithic file.

## Install

```bash
cd ~/Desktop/carmine/easy-dashboard
./install.sh
```

## Start

```bash
./start.sh
```

## Access

Open:

```text
http://<Raspberry_IP>:5000
```

Rainbow must remain an SSH-only reverse tunnel. From the Mac, open a local
forward through Rainbow with ProxyJump:

```bash
ssh -N -L 5000:127.0.0.1:5000 -J ccoppola@193.205.230.76 -p 44222 pi@127.0.0.1
```

Then open on the Mac:

```text
http://127.0.0.1:5000
```

## Debug

```bash
journalctl -u easy-dashboard.service -f
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:5000/cameras
```

## Notes

- RGB feeds are browser-native MJPEG streams.
- Left and right cards represent the logical split of the CamArray feed.
- Thermal mode defaults to `mock` until the real FLIR path is activated.
- Runtime data is stored under `data/`:
  - `data/logs/`
  - `data/reports/`
  - `data/captures/`
