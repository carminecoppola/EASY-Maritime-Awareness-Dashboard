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
evaluation. On the currently deployed sequence-safe/ABOships model, a fresh
50-request run (session freshly started, no prior accumulated history)
measured a mean backend time of 593 ms and a mean end-to-end request-pipeline
latency of 967 ms — consistent with the original paper's 574 ms / 908 ms on
the earlier model.

This replay protocol does not establish sustained inference performance on both
live RGB views. A cooled, long-duration live-source benchmark remains future
work and must be reported separately rather than mixed with the replay results.

Generated measurement directories are intentionally excluded from source
history. The paper evaluation archive must preserve the complete raw run,
environment metadata, exact dependency versions and checksums.

### Session-length confound (found and fixed 17 September 2026)

Re-running this benchmark against a session that had accumulated 16+ hours of
unattended replay history showed persistence latency growing from the ~140 ms
baseline to 280-370 ms, with the tail (P95) exceeding 800 ms. Root cause:
`session_manager.py` rewrote the entire growing per-session detections/events
file on every single inference request — an O(n) cost in session length, on
the hot path. Fixed by switching to an append-only `.jsonl` journal with
periodic compaction, the pattern `detection_manager.py` already used
correctly for its own history file. Re-measured on a freshly stopped/started
session after the fix: persistence back down to 189 ms (P95 225 ms).

Consequence for future benchmark comparisons: **stop the current session
(`POST /api/session/stop`) before a comparison run**, or session age becomes
a confound indistinguishable from a real regression.
