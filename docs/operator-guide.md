# Operator guide

## The normal workflow

1. Open **Live** and confirm that the required feeds are current.
2. Open **Mission** and start a mission before saving training data.
3. Save a synchronized RGB and thermal capture set.
4. Open **Analysis** to run or monitor inference.
5. Open **Archive** to review images and activity.
6. End the mission when collection is complete.

The main navigation contains only these operator tasks. System diagnostics,
dataset export, source selection, replay controls, and raw detections remain
available in labelled advanced sections.

## Live and mission state

The two RGB panels are continuously live. **Refresh status** refreshes metadata;
it does not restart a camera. Their timestamps must continue to change. The
thermal panel is intentionally secondary and acquires one frame on request.
For PureThermal, **Ready** means that the device is detected and available;
**Streaming** appears only while a recent thermal frame is being handled.

Starting a mission creates the session that indexes snapshots, inference runs,
detections, and events. The synchronized capture action saves RGB left, RGB
right, and thermal with one capture-set identifier.

## Analysis

**Start analysis** opens a mission when needed and starts the inference worker.
Inference on Raspberry CPU is not instantaneous; the monitor shows running,
waiting, completed, or error state. The current RGB model does not accept the
thermal feed as an inference source.

## Archive and dataset

Archive separates saved photos from the activity log. Dataset validation only
accepts usable samples containing both RGB and thermal data. Export creates a
ZIP with deterministic train/validation assignment, `dataset.json`, and a
validation report.

## Before an important collection

- Confirm recent RGB frame timestamps.
- Confirm thermal `runtime_state.availability: READY`, then acquire one frame
  and verify that `frame_seq` increases.
- Start a mission before capture.
- Verify that synchronized sample counts increase.
- Check available disk space and recent errors.
