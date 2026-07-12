# Raspberry Deploy Test Plan

## Paths

Dashboard repository:

```text
/home/pi/Desktop/carmine/easy-dashboard
```

Model repository kept separate:

```text
/home/pi/Desktop/carmine/easy-maritime-awareness
```

## Goal

Validate on Raspberry the same Phase 2 pipeline already verified locally:

```text
Replay Folder
-> Unified Frame Provider
-> Frame Object
-> Inference Worker ONNX
-> Detection Manager
-> Session Manager
-> Event Engine
-> API
-> Dashboard
```

## 1. Open The Dashboard Repo

```bash
cd /home/pi/Desktop/carmine/easy-dashboard
```

## 2. Verify Runtime Model Assets

Check that the ONNX model is available:

```bash
ls -lh runtime/models/
```

Expected key files:

- `runtime/models/easy_v1_best_rgb.onnx`
- `runtime/models/easy_v1_best_rgb.pt`

If missing, copy them from the model workflow used to prepare the dashboard package.

## 3. Verify Runtime Config

```bash
ls -lh runtime/config/
cat runtime/config/inference_config.yaml
cat runtime/config/frame_provider_config.yaml
```

Confirm:

- inference model path is correct
- replay folder path is correct
- frame provider default source is `REPLAY_FOLDER`

## 4. Python Version And Virtualenv

Recommended:

```bash
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

## 5. Install Requirements

```bash
pip install -r requirements.txt
```

Note about ONNX Runtime:

- the repository currently targets `onnxruntime>=1.20,<1.28`
- verify that the Raspberry Python version is compatible with the wheel available for that platform
- if Raspberry uses an older Python, align the Python version before continuing

## 6. Validate Replay Samples

```bash
find runtime/replay/test_inference -maxdepth 1 -type f
```

The folder must contain valid test images.

## 7. Start The Dashboard

Option A:

```bash
./start.sh
```

Option B:

```bash
source .venv/bin/activate
python app.py
```

Expected local URL:

```text
http://127.0.0.1:5000
```

Expected LAN URL:

```text
http://<raspberry-ip>:5000
```

## 8. Run API Validation

From the repository root:

```bash
BASE_URL=http://127.0.0.1:5000 bash scripts/test_frame_provider_api.sh
BASE_URL=http://127.0.0.1:5000 bash scripts/test_phase2_pipeline.sh
```

The pipeline test must confirm:

- frame provider status
- replay folder configuration
- next frame retrieval
- inference on next frame
- current detections update
- current events update
- session metrics update

## 9. Open The Dashboard In Browser

Open:

```text
http://127.0.0.1:5000/thermal-events
```

Or from another machine:

```text
http://<raspberry-ip>:5000/thermal-events
```

## 10. Verify Required Panels

Check that these panels render correctly:

- `Frame Source`
- `Current Session`
- `Current Events`
- `Current Detections / Advanced Debug`
- `Detection Preview`

For `Frame Source`, confirm:

- source type shown as `REPLAY_FOLDER`
- source path points to `runtime/replay/test_inference`
- frame id updates
- frame index updates
- total frames is visible

For `Current Session`, confirm:

- session starts automatically or via button
- metrics increase after inference

For `Current Events`, confirm:

- `BoatDetected` or `ShipDetected` appears on supported replay samples

For `Advanced Debug`, confirm:

- detections table shows bounding box metadata
- preview image loads from `/api/inference/preview`

## 11. If Using Live Cameras Later

Do not validate live acquisition in this phase beyond checking that the dashboard remains stable.

Live validation is deferred for:

- RGB LEFT / RGB RIGHT real feed
- thermal live inference
- stereo logic
- tracking
- thermal fusion

## 12. Useful Commands

Re-check syntax:

```bash
python3 -m py_compile app.py inference_worker.py detection_manager.py session_manager.py event_manager.py frame_provider.py
```

Inspect current detections:

```bash
curl http://127.0.0.1:5000/api/detection/current
```

Inspect current events:

```bash
curl http://127.0.0.1:5000/api/events/current
```

Inspect session status:

```bash
curl http://127.0.0.1:5000/api/session/status
```

## Expected Outcome

At the end of the Raspberry test, the repository should prove that:

- replay/demo mode works on Raspberry
- the unified frame provider feeds the inference worker correctly
- detections, events and session metrics persist correctly
- the dashboard reads the full embedded inference pipeline end-to-end
