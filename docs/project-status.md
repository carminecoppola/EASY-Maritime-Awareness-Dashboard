# Project status

EASY is being developed as a local maritime-awareness system running on a
Raspberry Pi. Its dashboard provides a single interface for viewing RGB and
FLIR/PureThermal feeds, organizing acquisition missions, running object
detection, and reviewing the resulting images and activity records.

## Current capabilities

- Live monitoring of two RGB inputs and one thermal input.
- Mission-based collection of photographs, AI detections, and activity logs.
- Structured session manifests and dataset validation/export.
- ONNX inference on RGB maritime images.
- Searchable archive of captures and activity, with CSV export for logs.
- Remote operation from a Mac while capture and storage remain on the Raspberry.

The camera and thermal integrations are implemented. Their availability during
a deployment still depends on the connected hardware, USB/V4L2 state, and the
operating temperature of the Raspberry Pi.

## Model and dataset

The dashboard uses `easy_v1_best_rgb.onnx`, exported from the model developed in
the [EASY Maritime Awareness model repository](https://github.com/carminecoppola/easy-maritime-awareness).
It is a YOLOv8n RGB detector trained to recognize three classes:

- `boat`
- `ship`
- `buoy`

The official training baseline is `EASY-v1-rgb3-buoy-rebalanced`. Its repository
records the following public sources:

- **Singapore Maritime Dataset (SMD)** — primary RGB maritime source.
- **SeaShips** — supporting RGB source for ship and boat imagery; see the
  [SeaShips paper](https://sites.ucmerced.edu/files/wdu/files/seaship.pdf).
- **MassMIND (Massachusetts Maritime Infrared Dataset)** — thermal maritime
  companion and reference for future thermal development; see the
  [MassMIND repository](https://github.com/uml-marine-robotics/MassMIND).

The deployed ONNX model is currently RGB-only. MassMIND and images acquired
from the FLIR sensor are not presented as inputs to the current RGB weights;
they form part of the planned thermal and multimodal extension.

## Operational workflow

The Analysis page currently supports inference on test/replay images from the
dataset. This verifies the complete preprocessing, ONNX execution, detection,
and presentation pipeline before analysis is moved to continuous live-camera
frames.

The Mission page groups one acquisition period into a session. While a mission
is active, EASY can associate captured images, inference results, detections,
and logs with the same manifest. The resulting material can then be reviewed,
validated, and exported for future dataset growth and fine-tuning.

The Archive page keeps saved images and activity records accessible after a
mission. Operators can filter the records and export logs in CSV format. The
Live page remains focused on the current camera feeds and their availability.

## Next steps

1. Complete controlled hardware validation of sustained PureThermal streaming.
2. Connect the proven ONNX pipeline to live RGB frames.
3. Collect new RGB and thermal samples with the EASY apparatus.
4. Review and label the acquired material before adding it to a versioned dataset.
5. Evaluate fine-tuning and, separately, a thermal or multimodal model extension.

New field data must not be added directly to the frozen EASY-v1 baseline. Any
future training dataset should have its own version, documented provenance,
label policy, and leakage-safe train/validation/test split.
