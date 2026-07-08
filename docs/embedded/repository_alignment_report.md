# Repository Alignment Report

## Scope
This report compares the Raspberry Pi checkout of `easy-dashboard` against the GitHub remote `origin/main`.

## Repository states
- Mac repository state: not directly accessible from this Raspberry Pi session. For alignment purposes, the intended baseline is the shared GitHub branch `origin/main`.
- Raspberry repository state: `main`, commit `576f95a2a4cda70db2c70745dc8db3f6da41db9e`, working tree dirty, behind `origin/main` by 1 commit.
- GitHub state: `origin/main` at `6108ea94cae01ce8fa257bce6860ebbcd134b5d8`.

## Git snapshot
- `pwd`: `/home/pi/Desktop/carmine/easy-dashboard`
- `git rev-parse --show-toplevel`: `/home/pi/Desktop/carmine/easy-dashboard`
- Branch: `main`
- Remote:
  - `origin https://github.com/carminecoppola/EASY-Maritime-Awareness-Dashboard.git`
- Recent log:
  - `576f95a Add AI runtime detection and session pipeline`
  - `d895c1c Refine dashboard navigation and layouts`
  - `494ad8d new web view`
  - `2a561bf Improve logs and snapshot UX`
  - `fc904ff Reduce thermal stream latency`
  - `9259b66 Use real PureThermal feed`
  - `3d0de79 Fix Mac tunnel access command`
  - `7ad13bf Refine dashboard layout and Mac access docs`
  - `7f9c2e6 Refine thermal logs and snapshot UX`
  - `9189d09 Dashboard snapshot gallery and log refresh`

## Repository comparison

### Missing from Raspberry checkout
Files present on `origin/main` but absent from the Raspberry tree:
- `docs/embedded/phase2_validation_report.md`
- `docs/embedded/phase7_event_engine.md`
- `docs/embedded/phase8_unified_frame_provider.md`
- `docs/embedded/raspberry_deploy_test_plan.md`
- `event_manager.py`
- `frame_provider.py`
- `scripts/test_frame_provider_api.sh`
- `scripts/test_phase2_pipeline.sh`
- `runtime/replay/test_inference/.gitkeep`
- `runtime/replay/test_inference/001_seaships__001253.jpg`
- `runtime/replay/test_inference/002_seaships__002958.jpg`

### Extra files in Raspberry workspace
Files present locally but not tracked in `origin/main`:
- `docs/embedded/live_camera_integration_checklist.md`
- `docs/embedded/phase3_raspberry_validation.md`
- `docs/embedded/phase4_live_source_layer.md`
- `docs/embedded/rpi_environment_check.md`
- `docs/embedded/rpi_full_platform_validation.md`
- `docs/embedded/rpi_inference_benchmark.md`
- `source_manager.py`

### Modified files in Raspberry workspace
Tracked files that differ from `origin/main`:
- `.gitignore`
- `app.py`
- `detection_manager.py`
- `inference_worker.py`
- `requirements.txt`
- `runtime/README.md`
- `session_manager.py`
- `static/css/style.css`
- `static/js/dashboard.js`
- `templates/index.html`
- `templates/thermal_events.html`

### Untracked but expected file
- `runtime/config/frame_provider_config.yaml` exists locally as an untracked file, and it is also present on `origin/main`.

## Required module check
Present in the Raspberry checkout:
- `app.py`
- `source_manager.py`
- `inference_worker.py`
- `detection_manager.py`
- `session_manager.py`
- `static/js/dashboard.js`
- `static/css/style.css`
- `templates/`
- `runtime/config/`
- `docs/embedded/`

Missing from the Raspberry checkout:
- `frame_provider.py`
- `event_manager.py`

## Documentation check
Present:
- `docs/embedded/phase2_frontend_ai_panel.md`
- `docs/embedded/phase2_inference_worker.md`
- `docs/embedded/phase5_detection_manager.md`
- `docs/embedded/phase6_session_manager.md`
- `docs/embedded/live_camera_integration_checklist.md`
- `docs/embedded/phase3_raspberry_validation.md`
- `docs/embedded/phase4_live_source_layer.md`
- `docs/embedded/rpi_environment_check.md`
- `docs/embedded/rpi_full_platform_validation.md`
- `docs/embedded/rpi_inference_benchmark.md`

Missing from the Raspberry checkout compared with `origin/main`:
- `docs/embedded/phase2_validation_report.md`
- `docs/embedded/phase7_event_engine.md`
- `docs/embedded/phase8_unified_frame_provider.md`
- `docs/embedded/raspberry_deploy_test_plan.md`

## Alignment assessment
- The Raspberry repository is not identical to GitHub `origin/main`.
- The checkout is behind by 1 commit.
- The checkout also contains local modifications and untracked files.

## Missing commit
- `6108ea9` `Implement EASY Phase 2 embedded inference pipeline`

## Main blockers to alignment
- Missing tracked files from `origin/main`:
  - `event_manager.py`
  - `frame_provider.py`
  - `scripts/test_frame_provider_api.sh`
  - `scripts/test_phase2_pipeline.sh`
  - `runtime/replay/test_inference/001_seaships__001253.jpg`
  - `runtime/replay/test_inference/002_seaships__002958.jpg`
  - `runtime/replay/test_inference/.gitkeep`
  - several documentation files under `docs/embedded/`
- Local modified files:
  - `.gitignore`
  - `app.py`
  - `detection_manager.py`
  - `inference_worker.py`
  - `requirements.txt`
  - `runtime/README.md`
  - `session_manager.py`
  - `static/css/style.css`
  - `static/js/dashboard.js`
  - `templates/index.html`
  - `templates/thermal_events.html`
- Local extra files:
  - `docs/embedded/live_camera_integration_checklist.md`
  - `docs/embedded/phase3_raspberry_validation.md`
  - `docs/embedded/phase4_live_source_layer.md`
  - `docs/embedded/rpi_environment_check.md`
  - `docs/embedded/rpi_full_platform_validation.md`
  - `docs/embedded/rpi_inference_benchmark.md`
  - `source_manager.py`

## Suggestions for alignment
1. Fast-forward the Raspberry branch to `origin/main` only after confirming the local modifications are intended to stay.
2. Decide whether `source_manager.py` should be tracked and committed, since it is currently an untracked workspace file.
3. Decide whether the local embedded validation documents should remain in the repo or be moved out of the alignment baseline.
4. If the goal is strict parity with GitHub, remove or commit the local modified files and untracked extras so the working tree becomes clean.

## Final verdict
Repository NON sincronizzati.
The files currently preventing a clean alignment are the missing tracked files listed above, the modified tracked files, and the extra untracked workspace files.

