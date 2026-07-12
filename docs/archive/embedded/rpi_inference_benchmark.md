# Raspberry Pi Inference Benchmark

Date: 2026-07-07

## Test Setup

- Input set: `runtime/replay/test_inference/`
- Runs: 30 consecutive ONNX inferences
- Model: `runtime/models/easy_v1_best_rgb.onnx`
- Pipeline path exercised:
  - preprocess
  - ONNX inference
  - postprocess / NMS
  - preview save
  - detection JSON save

## Results

- Total runtime: `39.806 s`
- Overall throughput: `0.75 FPS`
- Average inference time: `1326.70 ms`
- Minimum inference time: `740.08 ms`
- Maximum inference time: `2169.86 ms`
- P95 inference time: `1915.32 ms`

## System Load

- CPU before benchmark: `5.0%`
- CPU after benchmark: `21.8%`
- RAM before benchmark: `22.7%`
- RAM after benchmark: `25.2%`
- CPU temperature before benchmark: `61.8 C`
- CPU temperature after benchmark: `72.5 C`

## Output Artifacts

- Preview image: `runtime/sessions/current_detections.jpg`
- Detection JSON: `runtime/sessions/current_detections.json`

## Observations

- The ONNX model loaded correctly and produced stable detections across the replay set.
- The Raspberry Pi can run the pipeline end to end, but this benchmark shows that the current ONNX path is relatively heavy for sustained live operation.
- Thermal increase remained within normal validation bounds for a short benchmark run, but live deployment should be monitored closely.
