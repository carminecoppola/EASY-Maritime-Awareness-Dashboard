# Raspberry Pi Environment Check

Date: 2026-07-07

## Host

- Python: `3.9.2`
- Virtual environment: `.venv` present and used for validation
- Repository validated: `easy-dashboard`
- Model repository: `easy-maritime-awareness` not modified

## Dependencies

Checked inside `.venv`:

- Flask: `2.3.3`
- OpenCV: `5.0.0` via `opencv-python-headless`
- ONNX Runtime: `1.19.2`
- NumPy: `2.0.2`
- PyYAML: `6.0.3`
- psutil: `5.9.8`
- Pillow: `10.4.0`

## Installation Notes

- `opencv-python-headless` was missing and installed into `.venv` without changing application code.
- No other missing runtime dependencies were found during the validation run.

## Runtime Layout

Validated present:

- `runtime/models/`
- `runtime/config/`
- `runtime/replay/`
- `runtime/sessions/`
- `runtime/logs/`

Validated present model/config files:

- `runtime/models/easy_v1_best_rgb.onnx`
- `runtime/config/inference_config.yaml`

Missing file requested by the phase spec:

- `runtime/config/frame_provider_config.yaml`

## Notes

- The dashboard already uses `runtime/` as its local storage root for inference artifacts and sessions.
- Event persistence is implemented through session-level `events.json` and `data/logs/events.jsonl`, not through a `current_events.json` file.
