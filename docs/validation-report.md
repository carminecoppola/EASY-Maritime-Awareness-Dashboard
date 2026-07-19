# Validation report — 19 July 2026

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
- Unit and integration suite: PASS, 41 tests.
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

## Runtime benchmark status

The repeatable replay-based Raspberry Pi 4 benchmark is complete for the paper
evaluation. Ten inference requests produced a mean ONNX backend time of
608.17 ms and a mean end-to-end API latency of 1014.19 ms after persistence
optimization. The earlier value of approximately 4.1 seconds belongs to the
pre-optimization implementation and is not the current result.

This replay protocol does not establish sustained inference performance on both
live RGB views. A cooled, long-duration live-source benchmark remains future
work and must be reported separately rather than mixed with the replay results.

Generated measurement directories are intentionally excluded from source
history. The paper evaluation archive must preserve the complete raw run,
environment metadata, exact dependency versions and checksums.
