# EASY Dashboard Raspberry Pi Full Platform Validation

## Test window
- Date/time: 2026-07-08 12:53:51 Europe/Rome
- UTC snapshot: 2026-07-08T10:53:51Z
- Commit hash: `576f95a2a4cda70db2c70745dc8db3f6da41db9e`

## Environment
- Python: 3.9.2
- Flask: 2.3.3
- OpenCV: 5.0.0
- NumPy: 2.0.2
- PyYAML: 6.0.3
- ONNX Runtime: 1.19.2
- psutil: 5.9.8
- Pillow: 10.4.0

## Runtime status
- Dashboard booted successfully on the Raspberry Pi.
- Flask served the app on `http://127.0.0.1:5000` and `http://192.168.1.54:5000`.
- Replay mode is operational.
- ONNX inference is operational.
- Detection manager, session manager, event engine, and source manager are operational.
- Safe camera probing completed without forcing streams.

## Runtime file checks
- Present: `runtime/models/easy_v1_best_rgb.onnx`
- Present: `runtime/config/inference_config.yaml`
- Present: `runtime/config/inference_config.json`
- Created for validation: `runtime/config/frame_provider_config.yaml`
- Present: `runtime/replay/test_inference/`
- Present: `runtime/sessions/`
- Present: `runtime/logs/`

## Py compile
- Requested compile command could not be completed exactly as written because `event_manager.py` and `frame_provider.py` do not exist in this repo.
- Successful compile on the actual repo modules:
  - `app.py`
  - `inference_worker.py`
  - `detection_manager.py`
  - `session_manager.py`
  - `source_manager.py`

## Frame Provider validation
- `scripts/test_frame_provider_api.sh` does not exist in this repo.
- No `frame_provider.py` module or `/api/frame-provider/*` routes were found in the current codebase.
- Equivalent replay validation was completed through the live inference and source APIs.

## Source Manager validation
- `/api/sources` returned 4 sources.
- `/api/sources/status` returned:
  - `replay = STREAMING`
  - `rgb_left = NOT_AVAILABLE`
  - `rgb_right = NOT_AVAILABLE`
  - `thermal = NOT_AVAILABLE`
- Selecting `replay` worked.
- Selecting `rgb_left` worked and remained `NOT_AVAILABLE` without backend errors.
- Selecting `thermal` worked and remained `NOT_AVAILABLE` without backend errors.
- The backend did not crash when unavailable sources were selected.

## Replay and inference validation
- `bash scripts/test_inference_api.sh http://127.0.0.1:5000` passed.
- `GET /api/inference/status` succeeded.
- `POST /api/inference/start` succeeded.
- `POST /api/inference/run-on-image` succeeded and returned a ship detection on the replay image.
- `GET /api/detections/current` succeeded and returned current detections.
- `POST /api/inference/stop` succeeded.

## Session and event validation
- `GET /api/session/status` succeeded.
- `POST /api/session/start` returned `Session already running` because the existing replay session was already active during validation.
- `POST /api/session/stop` succeeded.
- `GET /events?limit=10` succeeded and showed source selection, detection, and session stop events.
- `current_events.json` does not exist globally in `runtime/sessions/`; the project currently uses session-scoped `events.json`.

## Camera probing
- `libcamera-hello --list-cameras`:
  - One camera detected: `imx477`
- `vcgencmd get_camera`:
  - `supported=0 detected=0, libcamera interfaces=0`
- `/dev/video*`:
  - Multiple V4L2 nodes were present.
- `dmesg | grep -i camera | tail -n 30`:
  - No additional camera kernel lines were returned in this validation window.

## Benchmark
- Workload: 30 consecutive replay inferences on `runtime/replay/test_inference/001_seaships__001253.jpg`
- Average inference time: 1657.34 ms
- Approx FPS: 0.60
- Min / max inference time: 1133.32 ms / 2223.06 ms
- CPU before: 25.1%
- CPU after: 34.7%
- RAM before: 1630.9 MB
- RAM after: 1735.7 MB
- CPU temperature before: 66.2 C
- CPU temperature after: 76.0 C
- Detection count during benchmark: 1 to 1 per run

## Files updated during validation
- `runtime/config/frame_provider_config.yaml`
- `runtime/sessions/current_detections.json`
- `runtime/sessions/current_detections.jpg`
- `runtime/sessions/detection_history.json`
- `runtime/sessions/index.json`
- `runtime/sessions/session_20260707_092345/metadata.json`
- `runtime/sessions/session_20260707_092345/metrics.json`
- `runtime/sessions/session_20260707_092345/detections.json`
- `runtime/sessions/session_20260707_092345/events.json`

## Dashboard reachability
- HTTP root returned `200` on `http://127.0.0.1:5000/`.
- The app served the dashboard successfully.
- A GUI browser screenshot was not captured in this terminal-only session.

## Problems found
- `event_manager.py` is missing from the repo, even though it was listed in the requested compile command.
- `frame_provider.py` is missing from the repo.
- `scripts/test_frame_provider_api.sh` is missing from the repo.
- `/api/frame-provider/*` routes are not implemented in the current backend.
- `vcgencmd get_camera` reports `supported=0 detected=0`, so the Pi camera stack is not reported as active by that tool even though `libcamera-hello` lists an IMX477 camera.

## Problems resolved
- Added the missing runtime config file `runtime/config/frame_provider_config.yaml`.
- Confirmed the dashboard starts cleanly on the Raspberry Pi.
- Confirmed ONNX replay inference works on marine imagery.
- Confirmed source selection does not crash on unavailable cameras.

## Problems remaining
- There is no dedicated frame-provider module/API in the current repo, so the exact checklist items around `next-frame` and `run-on-next-frame` cannot be executed literally.
- No GUI browser screenshot was captured.
- `current_events.json` is not standardized globally yet; the project relies on session-local `events.json`.

## Next phase recommended
- Keep the current runtime flow stable and decide whether to add a compatibility layer for the missing frame-provider API names only if the team wants to preserve the older checklist wording.
- Otherwise, proceed with a light cleanup pass focused on session persistence and dashboard documentation.

