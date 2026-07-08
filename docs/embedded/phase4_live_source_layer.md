# EASY Phase 4 - Live Source Integration Layer

Date: 2026-07-08

## Goal

Introduce a source management layer that sits above the frame provider, so the dashboard can switch between Replay and future live providers without changing the inference, detection, session, or event pipeline.

## Architecture

Current flow:

`Source Manager -> Unified Frame Provider -> Inference Worker -> Detection Manager -> Session Manager -> Event Engine -> Dashboard`

What changed in this phase:

- source registration is explicit
- source health is queryable
- source selection is runtime-driven
- Replay remains the only fully functional input path
- RGB LEFT, RGB RIGHT, and THERMAL are registered as placeholders for future live integration

## Source Manager

Implemented in:

- [`source_manager.py`](/home/pi/Desktop/carmine/easy-dashboard/source_manager.py)

Responsibilities:

- register all sources
- keep the selected source
- expose source status and health
- refresh source states safely
- log source changes and refresh events

Registered sources:

- Replay Folder
- RGB LEFT
- RGB RIGHT
- THERMAL

Each source exposes:

- `id`
- `name`
- `type`
- `status`
- `enabled`
- `last_update`
- `configuration`

## Standard States

Supported source states:

- `ONLINE`
- `OFFLINE`
- `NOT_AVAILABLE`
- `STREAMING`
- `ERROR`
- `INITIALIZING`
- `UNKNOWN`

Current behavior:

- Replay Folder reports `STREAMING` when selected and usable
- Replay Folder reports `ONLINE` when available but not selected
- RGB LEFT, RGB RIGHT, and THERMAL currently report `NOT_AVAILABLE`
- missing or disconnected sources never raise exceptions

## API

New endpoints:

- `GET /api/sources`
- `GET /api/sources/status`
- `GET /api/sources/<id>`
- `POST /api/sources/refresh`
- `POST /api/sources/select`

Behavior:

- sources can be queried at any time
- selection updates the active source without restarting Flask
- unavailable sources return safe placeholder states

## Dashboard

New panel:

- `Mission Sources`

Displayed data:

- source name
- source type
- source status
- last update
- currently selected source

Color mapping:

- green for `ONLINE` and `STREAMING`
- yellow for `INITIALIZING` and similar transitional states
- red for `OFFLINE` and `ERROR`
- gray for `NOT_AVAILABLE` and `UNKNOWN`

## Frame Provider Integration

The frame provider layer now reads the selected source from the Source Manager instead of being coupled to a direct replay-folder assumption.

Current behavior:

- Replay continues to work normally
- selecting RGB LEFT or RGB RIGHT returns `NOT_AVAILABLE`
- selecting THERMAL returns `NOT_AVAILABLE`
- no crash occurs when a source is unavailable

This preserves the replay-based validation path while creating the hook for future live adapters.

## Logging

Source events now generate logs such as:

- `Replay Folder selected`
- `RGB LEFT unavailable`
- `THERMAL unavailable`
- `Source changed`

Events are emitted into the dashboard event engine so they appear in the existing logs and diagnostics UI.

## Future Compatibility

This layer is intentionally designed to support later adapters for:

- `libcamera`
- `Arducam`
- `FLIR`
- `RTSP`
- `USB Camera`

The rest of the pipeline should remain unchanged when these providers are connected.

## Validation Results

Verified during this phase:

- source registry is exposed through API
- source selection updates at runtime
- Replay remains functional
- placeholder sources do not crash the dashboard
- source state is visible in the UI

## Roadmap Toward Live Camera Integration

Next steps:

1. connect a real RGB LEFT provider to the `rgb_left` source
2. connect a real RGB RIGHT provider to the `rgb_right` source
3. connect a real THERMAL provider to the thermal source
4. keep Replay as the fallback validation path
5. preserve the current API and dashboard contract while swapping the adapter implementation

