# EASY Phase 2 - Inference Worker

This step adds a reusable ONNX inference backend to `easy-dashboard` without depending on the model repository.

## Runtime layout

The worker uses only `runtime/`:

- `runtime/models/easy_v1_best_rgb.onnx` preferred model
- `runtime/models/easy_v1_best_rgb.pt` fallback model
- `runtime/config/inference_config.json` or `.yaml`
- `runtime/replay/` demo/replay images
- `runtime/sessions/` current detections, preview image, session artifacts
- `runtime/logs/` runtime logs

The worker writes current outputs to:

- `runtime/sessions/current_detections.json`
- `runtime/sessions/current_detections.jpg`

## Backend module

The reusable backend lives in [`inference_worker.py`](/home/pi/Desktop/carmine/easy-dashboard/inference_worker.py).

Exposed functions:

- `start()`
- `stop()`
- `status()`
- `run_on_image(image_path)`
- `get_current_detections()`

The worker:

- loads the runtime config
- loads the ONNX model once
- supports the classes `boat`, `ship`, `buoy`
- applies YOLOv8-style preprocessing
- applies confidence threshold and NMS
- saves the latest detections JSON in `runtime/sessions/`
- optionally saves an annotated preview image for debugging

## API endpoints

Available in `app.py`:

- `GET /api/inference/status`
- `POST /api/inference/start`
- `POST /api/inference/stop`
- `POST /api/inference/run-on-image`
- `GET /api/detections/current`

### Response shape

The endpoints return JSON with fields such as:

- `ok`
- `running`
- `backend`
- `model_path`
- `last_image`
- `last_detections`
- `inference_time_ms`
- `fps`
- `error`

If something is not available, the API returns a clear JSON error instead of crashing the app.

## How to start the dashboard

Use the existing startup flow:

```bash
./start.sh
```

Then the API is available on the same Flask backend that serves the dashboard.

## How to test the API

Run the shell test after starting the dashboard:

```bash
bash scripts/test_inference_api.sh
```

You can pass a different base URL or image:

```bash
bash scripts/test_inference_api.sh http://127.0.0.1:5000 runtime/replay/test_inference/002_seaships__002958.jpg
```

## Current limits

- No frontend overlay is wired yet.
- The worker is currently focused on Replay/Demo and image-based inference.
- The AI panel is backend-only for this step.

## Next step

The next logical step is to add:

- frontend AI status card
- detection panel
- live preview / overlay integration

