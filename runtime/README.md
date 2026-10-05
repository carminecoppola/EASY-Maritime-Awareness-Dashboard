# Runtime layout

Everything the dashboard needs at run time, independent of the model repository
([easy-maritime-awareness](https://github.com/carminecoppola/easy-maritime-awareness)).

| Path | Content | In git |
| --- | --- | --- |
| `models/` | ONNX detector (`easy_v3_aboships_640.onnx`) | yes |
| `config/` | `inference_config.json` (model path, thresholds, classes, folders), `frame_provider_config.yaml` | yes |
| `replay/test_inference/` | Two SeaShips sample images for replay and tests | yes |
| `sessions/` | Missions: metadata, manifests, detections, events, metrics, captures | no (generated) |
| `exports/` | Dataset archives produced by the exporter | no (generated) |
| `benchmarks/` | Raspberry benchmark runs | no (generated) |
| `logs/` | Runtime logs | no (generated) |

## Inference configuration

`config/inference_config.json`:

```json
{
  "model": { "preferred_path": "runtime/models/easy_v3_aboships_640.onnx", "type": "onnx" },
  "inference": { "confidence_threshold": 0.25, "iou_threshold": 0.45, "input_size": 640 },
  "classes": [ {"id": 0, "name": "boat"}, {"id": 1, "name": "ship"}, {"id": 2, "name": "buoy"} ]
}
```

The class list and the input size must match the model: they are fixed by the model
card in the model repository. To deploy a new model, copy the ONNX file here, check its
SHA-256 against the model card, point `preferred_path` at it and restart the service.
`EASY_ONNX_THREADS` sets the number of CPU threads (default: up to 4).
