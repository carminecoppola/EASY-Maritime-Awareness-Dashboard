# Validation report — 12 July 2026

## Mac regression

- Python compilation: PASS
- Dashboard smoke suite: PASS
- JavaScript syntax checks: PASS
- Shell syntax checks: PASS
- Desktop browser rendering for Live, Analysis, Archive, System, and Help: PASS
- Mobile viewport 390×844: PASS
- Duplicate DOM IDs: none
- Browser console errors: none

## Controlled Raspberry validation

- Code updated with `git pull --ff-only`: PASS
- `/health`: `ok: true`
- RGB left and right stream endpoints: HTTP 200
- Initial temperature: 66.2 °C
- Temperature after the short runtime window: 68.6 °C
- Temperature after service stop: 65.2 °C
- Final service state: inactive

## PureThermal result

The USB device is detected as PureThermal firmware 1.3.0 on `/dev/video0`, with
Y16 at 160×120 configured. During the controlled eight-second window it did not
deliver a frame:

```text
detected: true
streaming: false
frame_seq: 0
status: STARTING
```

This remains a hardware/firmware/UVC limitation. The dashboard now reports the
state accurately, times out silent capture, applies cooldown, and prevents
thermal capture above 78 °C.

## Deferred benchmark

The ONNX comparison was not repeated during this validation. Thermal streaming
failed and additional CPU load was not justified under the temperature safety
policy. The previous measured inference median remains approximately 4.1 s on
the Raspberry Pi 4 until a dedicated cooled benchmark is scheduled.
