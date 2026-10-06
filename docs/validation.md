# Status and validation

## What works today

- Continuous monitoring of two RGB views and a persistent PureThermal (FLIR Lepton)
  thermal stream, both on one Raspberry Pi 4.
- Mission-based collection: paired RGB+thermal capture sets, AI detections and
  activity logs recorded in one manifest per mission.
- ONNX inference on RGB images (CPU only).
- Validation and export of datasets (deterministic train/validation split, ZIP).
- Searchable archive of captures and activity.
- Optional accounts, roles, step-up authentication and an audit log.
- Remote operation from a Mac: capture and storage stay on the Raspberry.

Camera and thermal availability in a deployment still depends on the connected
hardware, the USB/V4L2 state and the operating temperature of the Raspberry Pi.

## Model

The dashboard runs `runtime/models/easy_v3_aboships_640.onnx` (YOLOv8n, 640 px; classes
`boat`, `ship`, `buoy`). It is the same file, byte for byte, that the
[model repository](https://github.com/carminecoppola/easy-maritime-awareness) releases
and documents in its model card (SHA-256
`7b7caf0dd6990cccd4cbbc52ec71026ac1e6183b7df6bebfa1ff0d971f2b87c9`).

| Measure (sequence-safe internal test set) | Value |
| --- | ---: |
| Precision / recall | 0.699 / 0.592 |
| mAP50 / mAP50-95 | 0.627 / 0.314 |
| Buoy recall | 0.485 |

**Known limitations.** The model is not validated for open water: on the external MODD2
benchmark the best EASY model detects 3.87% of obstacles. Early EASY-v1 figures
(mAP50 0.942) were inflated by sequence-level data leakage and are superseded. The model
accepts RGB input only; thermal frames are collected for future work and are not
inference inputs. Details and sources:
[model repository](https://github.com/carminecoppola/easy-maritime-awareness).

## Runtime measurements (Raspberry Pi 4, laboratory)

Replay benchmark of 50 inference requests on a freshly started session: mean model time
593 ms, mean end-to-end request-pipeline latency 967 ms (the original paper measured
574 ms / 908 ms on the earlier model). Two hours of concurrent RGB and thermal
acquisition completed without lost RGB views or service restarts, at about 53% of one
CPU core and 450 MiB of memory; no throttling under CPU stress (77.4 °C peak). These
figures describe the laboratory prototype only. Sustained inference on both live RGB
views needs a dedicated, cooled field test, and the replay numbers do not claim it.
See the [benchmark protocol](runtime-benchmark.md).

A benchmark taken on a session that had been running unattended for 16+ hours showed
persistence latency growing from about 140 ms to 280-370 ms, because the session
manager rewrote the whole detections file on every request. It now appends to a journal
and compacts periodically. Start every benchmark from a freshly started session: session
length is a confound.

## Field readiness check (September 2026)

A combined-load pass (inference, temperature and memory sampled every ~18 s for about
five minutes) kept the temperature at 57.9-61.3 °C with no throttling event, memory
steady near 1.6 GB of 7.8 GB, 17 of 17 inference calls succeeding (0.96-1.5 s) and zero
errors in the service log. Twenty back-to-back thermal captures all succeeded.

**Open item before sea deployment.** `vcgencmd get_throttled` reported `0x50000`:
under-voltage and throttling have occurred since boot (not during the test). The likely
cause is a power supply or cable not rated for the combined camera and inference load:
check the official 5 V / 3 A supply, the cable and any USB hub sharing the rail.

Not testable on a bench: wave motion and vibration, real glare and lighting, and
detection against real open-water objects (the purpose of the planned acquisition
campaign).

## Runtime states

`/health` reports service viability; it does not require the thermal camera to hold a
continuous stream. Hardware payloads carry a `runtime_state`:

- `STREAMING`: a current frame is flowing.
- `READY`: detected and available for capture (the thermal idle state, by design).
- `INITIALIZING`: startup or recovery in progress.
- `NOT_PRESENT`: disabled or not detected.
- `ERROR`: capture or runtime failure requiring attention.

Run `scripts/validate_local_release.sh` for the full local check (build, unit tests,
smoke suite, browser tests) and `scripts/check_raspberry_runtime.py` on the Raspberry
for the camera and thermal contract.

## Next steps

1. Benchmark the 960 px model on the Raspberry Pi 4 and decide whether to deploy it.
2. Cooled endurance test of continuous RGB plus thermal capture, and sustained inference
   from both live RGB views.
3. Collect RGB and thermal samples with the EASY apparatus in the real operating domain.
4. Review and label them before adding them to a *versioned* dataset (never to a frozen
   baseline), with documented provenance, label policy and a sequence-safe split.
5. Evaluate fine-tuning and, separately, a thermal or multimodal model.
