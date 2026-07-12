# EASY Phase 3 Raspberry Validation

Date: 2026-07-07

## Summary

The embedded pipeline on the Raspberry Pi was validated in Replay/Demo mode using the dashboard repository only.

Validated outcomes:

- Python environment ready
- ONNX model loads successfully
- Replay inference works
- Detection manager persists artifacts
- Session manager persists artifacts
- API endpoints respond correctly
- Dashboard routes respond correctly through Flask test client
- Replay can be started, stopped, and restarted
- Session can be closed cleanly
- Camera probing does not crash when cameras are absent

## Environment

- Python: `3.9.2`
- Virtual environment: `.venv`
- Flask: `2.3.3`
- OpenCV: `5.0.0`
- ONNX Runtime: `1.19.2`
- NumPy: `2.0.2`
- PyYAML: `6.0.3`

## Runtime Structure

Present:

- `runtime/models/`
- `runtime/config/`
- `runtime/replay/`
- `runtime/sessions/`
- `runtime/logs/`

Present files:

- `runtime/models/easy_v1_best_rgb.onnx`
- `runtime/config/inference_config.yaml`

Missing requested file:

- `runtime/config/frame_provider_config.yaml`

## Tests Executed

### 1. Environment check

Verified the Python stack and installed missing OpenCV into `.venv`.

### 2. ONNX smoke test

Ran `scripts/test_onnx_inference.py` on:

- `runtime/replay/test_inference/001_seaships__001253.jpg`

Result:

- model loaded
- preprocess succeeded
- inference succeeded
- postprocess succeeded
- annotated preview saved
- detections JSON saved

### 3. Replay benchmark

Ran 30 consecutive inferences on the replay folder.

Benchmark report:

- `docs/embedded/rpi_inference_benchmark.md`

### 4. Dashboard/API validation

Validated via Flask test client:

- `/health`
- `/api/inference/status`
- `/api/detections/current`
- `/api/session/status`
- `/api/session/current`
- `/api/inference/preview`
- `/cameras`
- `/events`

Observed responses:

- JSON endpoints returned `200`
- preview endpoint returned JPEG bytes
- camera probing returned a safe offline state, not a crash

### 5. Replay control

Validated:

- `POST /api/inference/start`
- `POST /api/inference/run-on-image`
- `POST /api/inference/stop`
- `POST /api/session/stop`
- `POST /api/inference/start` again after stop

Result:

- replay can be started
- inference runs on replay images
- current detections update
- session metrics update
- session can be closed correctly
- replay can be restarted

### 6. Robustness

Verified behavior when cameras are not available:

- RGB left: offline / not available
- RGB right: offline / not available
- Thermal placeholder: safe offline state

No crash occurred when the camera stack reported no usable devices.

## Session Artifacts

Updated successfully:

- `runtime/sessions/current_detections.json`
- `runtime/sessions/current_detections.jpg`
- `runtime/sessions/detection_history.json`
- `runtime/sessions/index.json`
- `runtime/sessions/session_20260707_092345/metrics.json`
- `runtime/sessions/session_20260707_092345/events.json`
- `runtime/sessions/session_20260707_092345/detections.json`

## Benchmark

- Average inference time: `1326.70 ms`
- FPS: `0.75`
- CPU: `5.0% -> 21.8%`
- RAM: `22.7% -> 25.2%`
- CPU temperature: `61.8 C -> 72.5 C`

## Camera State

Detected state from validation:

- RGB LEFT: `NOT_AVAILABLE`
- RGB RIGHT: `NOT_AVAILABLE`
- Thermal placeholder: `NOT_AVAILABLE`

Meaning:

- the software handles missing or disconnected cameras safely
- no live camera inference was enabled yet

## Problems Found

- `runtime/config/frame_provider_config.yaml` is missing.
- There is no `current_events.json` global file in the current runtime layout.
- The dashboard validation environment does not provide a browser, so screenshot capture was not available.
- A transient `FileNotFoundError` was observed in concurrent Flask-server logs while session metadata was being rewritten. The final in-process API checks still returned `200`, so this did not block validation, but it is worth revisiting as a race-condition hardening item.

## Problems Resolved During Validation

- OpenCV was missing from `.venv` and was installed successfully.

## Limitations

- Live camera inference was not implemented or tested in this phase.
- Stereo processing was not added.
- Tracking was not added.
- Thermal fusion was not added.
- The model repository `easy-maritime-awareness` was not modified.

## Recommendations

1. Add the missing `runtime/config/frame_provider_config.yaml` before the Live Camera Integration phase.
2. Keep Replay/Demo as the first line of validation on embedded hardware.
3. Monitor temperature and CPU if the ONNX path is reused for long live runs.
4. Decide whether the project should standardize on a global `current_events.json` file or keep session-level `events.json` only.
5. Capture a real browser screenshot on the Raspberry desktop in the next phase if GUI access is available.
