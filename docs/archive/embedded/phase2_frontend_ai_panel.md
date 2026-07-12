# EASY Phase 2 - Frontend AI Panel

This step connects the dashboard frontend to the already validated inference backend.

## What is shown on the Mission Console

The live dashboard now includes an AI section with:

- AI Analysis status
- current model and backend
- last processed image
- inference time and FPS
- last error, if any
- current detections list
- detection preview image

## Backend APIs used

The frontend uses only the existing inference APIs:

- `GET /api/inference/status`
- `POST /api/inference/start`
- `POST /api/inference/run-on-image`
- `GET /api/detections/current`
- `POST /api/inference/stop`
- `GET /api/inference/preview`

## Runtime files

The AI panel reads and displays artifacts from `runtime/` only:

- `runtime/models/easy_v1_best_rgb.onnx`
- `runtime/models/easy_v1_best_rgb.pt`
- `runtime/config/inference_config.json` or `.yaml`
- `runtime/replay/`
- `runtime/sessions/current_detections.json`
- `runtime/sessions/current_detections.jpg`

## UI behavior

- The panel polls status and detections every 2.5 seconds.
- The detection preview uses a safe backend endpoint with cache-busting.
- API errors are handled in place without breaking the page.
- The live RGB and thermal sections remain unchanged.

## Controls

Available buttons:

- `Start AI`
- `Stop AI`
- `Run Demo Image`
- `Refresh detections`

The replay/demo mode uses the runtime replay images and does not depend on the model repository.

## Current limits

- No live overlay is drawn on RGB or thermal feeds yet.
- The panel is backend-first and read-only apart from the simple AI controls.
- The detection preview shows the latest annotated runtime image only.

## Implementation notes

Main files involved:

- [`templates/index.html`](/home/pi/Desktop/carmine/easy-dashboard/templates/index.html)
- [`static/js/dashboard.js`](/home/pi/Desktop/carmine/easy-dashboard/static/js/dashboard.js)
- [`static/css/style.css`](/home/pi/Desktop/carmine/easy-dashboard/static/css/style.css)
- [`app.py`](/home/pi/Desktop/carmine/easy-dashboard/app.py)

## Next step

The next phase is to wire a dedicated AI status badge and a richer detection panel into the rest of the dashboard UI, while still keeping live overlays out of scope for now.

