# Operator guide

How to run a data-collection mission with the EASY dashboard. Open the dashboard
through the Mac launcher (`~/easy_dashboard_mac.sh`, see
[Raspberry operations](raspberry-operations.md)).

## The normal workflow

1. **Live Overview** — confirm that both RGB feeds are current and the thermal
   sensor is ready.
2. **Mission** — read the pre-flight checklist, fill in the operator name and
   start a mission *before* saving any training data.
3. **Capture** — use *Capture paired set* to save RGB left, RGB right and thermal
   under one capture-set identifier.
4. **AI Analysis** — run the detector on the next frame of an RGB source.
5. **Archive & Snapshots** — review images and activity, validate and export the
   dataset.
6. End the mission when collection is complete.

## Reading the status

| Word | Meaning |
| --- | --- |
| `STREAMING` | Frames are arriving and are fresh (younger than 5 s). |
| `READY` | The device is present and idle, or waiting for its first frame. |
| `INITIALIZING` | Starting up or recovering; wait a few seconds. |
| `NOT_PRESENT` | Disabled or not detected. |
| `ERROR` | The device failed; open **System Diagnostics** for the exact reason. |

The two RGB panels are continuously live; their timestamps must keep changing.
**Refresh status** only refreshes metadata, it never restarts a camera. The
thermal sensor runs a persistent worker beside the RGB feeds; saving a thermal
snapshot does not interrupt RGB. Thermal values are relative sensor counts, not
temperatures.

## Missions

Starting a mission creates the session that indexes snapshots, inference runs,
detections and events. Starting a mission does **not** save frames by itself:
use the capture actions. A paired capture records the measured time skew
between RGB and thermal; the sensors are not hardware-synchronised.

## AI analysis

The deployed model (`easy_v3_aboships_640.onnx`, YOLOv8n, classes `boat`, `ship`,
`buoy`) accepts RGB images only, so the thermal source cannot be selected.
Inference runs on the Raspberry CPU and takes about one second per frame.

> **Limitation.** The model was trained on public datasets and has **not** been
> validated on open water: on the external MODD2 benchmark it finds only 3.9% of
> obstacles. Treat detections as assistance for data collection, not as a
> safety system. See [Project status](validation.md).

## Archive and dataset

Only *paired* samples (at least one usable RGB image and one usable thermal image)
can be exported. Export creates a ZIP with `dataset.json`, a deterministic
train/validation split (hash of the sample id; the validation share is capped at
50%) and a validation report. Labels are left empty: annotation is a separate step.

## Before an important collection

- Recent RGB frame timestamps are changing.
- Thermal availability is `READY` or `STREAMING`.
- The pre-flight checklist has no blocking item (free disk space, CPU below 80 °C).
- Start the mission, then check that the *capture sets* counter increases after
  each paired capture.

## Accounts and access

Authentication is optional. An Admin can create the first account from
**Users & Roles**, add users (`viewer`, `operator`, `admin`) and turn on sign-in.
Sensitive actions (changing users or security settings, restarting the hardware
services) ask for the password again.
