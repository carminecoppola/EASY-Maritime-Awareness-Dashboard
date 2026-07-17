# Validation report — 17 July 2026

## Current validation scope

The latest Raspberry field check established the stable hardware behavior now
represented by the runtime contract:

- RGB left and right: online, frames available, approximately 10 fps.
- PureThermal: detected on `/dev/video0`, Y16 at 160×120.
- Thermal acquisition: one real 38,400-byte source frame captured on demand.
- Thermal idle state after capture: `READY`, with `streaming: false` by design.
- CPU temperature during the reported short test: approximately 64.7–65.7 °C.
- Browser access from macOS through the SSH tunnel: verified.

This report does not claim a new Raspberry run for the current code revision.
The next hardware release check must confirm that `frame_seq` increases after
`/thermal/frame`, RGB resumes after the brief thermal acquisition, and no camera
process remains after `systemctl stop`.

## Local regression for the current change

- Python compilation: PASS through `scripts/validate_local_release.sh`.
- Unit and integration suite: PASS, 27 tests.
- Dashboard smoke suite: PASS.
- JavaScript syntax checks: PASS.
- Shell syntax checks: PASS.
- Desktop rendering of all six pages: PASS, with no duplicate DOM IDs or
  browser-console errors.
- Mobile layout at 390×844 for Live, Mission, Analysis, and Archive: PASS, with
  no horizontal overflow.
- API compatibility for `/health`, dashboard state, sessions, acquisition,
  inference, sources, and thermal status: PASS in the smoke suite.
- ONNX metadata check: PASS; configured classes match `boat`, `ship`, `buoy`.
- Inference preprocessing, letterbox, NMS, result formatting, and compatibility
  imports: PASS in the regression suite.
- Frontend polling: one render per payload, bounded event history, and no
  overlapping dashboard-state request.

## Runtime semantics

`/health` reports service viability; it does not require PureThermal to hold a
continuous stream. Hardware payloads retain their existing fields and add
`runtime_state`:

- `STREAMING`: a current frame is flowing.
- `READY`: detected and available for capture.
- `INITIALIZING`: startup or recovery is in progress.
- `NOT_PRESENT`: disabled or not detected.
- `ERROR`: capture/runtime failure requiring attention.

## Deferred benchmark

The ONNX benchmark has not been repeated in this change. The last recorded
Raspberry Pi 4 median was approximately 4.1 seconds per inference. A cooled,
sustained live-RGB benchmark remains required before release sign-off.
