# EASY Dashboard Refactor Report

## What changed

- The Flask dashboard was refactored into a denser operator console without changing the live stream or snapshot backend.
- The navigation now exposes five pages:
  - `Mission Console`
  - `Sensors / Acquisition`
  - `Thermal & Events`
  - `System / Diagnostics`
  - `Snapshots`
- A shared layout, shared design tokens, and reusable JS renderers were introduced so feed cards, metric cards, badges, logs, and gallery tiles all follow the same visual language.
- The Mission Console was rebuilt around the requested three-zone structure:
  - compact status header
  - dominant RGB LEFT / THERMAL / RGB RIGHT feed row
  - bottom operational bar
- The thermal and event pages were tightened into a clearer monitoring surface with lighter tables and more readable empty states.
- The snapshot archive now uses polished placeholders instead of broken browser image icons.

## What is real today

- `RGB LEFT` and `RGB RIGHT` still use the existing MJPEG stream endpoints.
- `THERMAL` still uses the existing thermal frame endpoint.
- Snapshot capture still works for:
  - `rgb_left`
  - `rgb_right`
  - `thermal`
- Event ingestion, filtering, and summaries still rely on `/events`.
- Live health, camera, thermal, system, and pipeline state still come from `/health`.
- The diagnostics page shows real Raspberry metrics, camera inventory, UC512 information, and the current thermal mode from the backend payload.

## What is placeholder

- `FUSED VIEW` is present as a dedicated panel, but it remains a visual placeholder for future multimodal fusion.
- Detection, inference, and recording controls are clearly separated placeholders until those pipelines are wired for real.
- Attention/threat level is currently inferred from existing health and thermal state, not from a dedicated detection engine.
- Thermal sparkline support is present in the UI, but it only renders if the backend starts supplying a history array.

## What remains to integrate

- A real fused RGB/thermal/stereo preview.
- A detection pipeline that can populate current detections with actual objects and confidence values.
- A real inference service and richer pipeline telemetry.
- A real recording backend if video capture should be stored beyond snapshots.
- Optional more granular service health endpoints if process-level monitoring becomes necessary later.

## Reused endpoints and components

- Reused endpoints:
  - `/video/rgb_left`
  - `/video/rgb_right`
  - `/thermal/frame`
  - `/snapshot/rgb_left`
  - `/snapshot/rgb_right`
  - `/snapshot/thermal`
  - `/health`
  - `/events`
  - `/api/snapshots/recent`
  - `/snapshots`
- Reused UI building blocks:
  - camera feed cards
  - thermal monitor card
  - event table
  - snapshot gallery cards
  - compact metric cards
  - status badges and navigation indicators
