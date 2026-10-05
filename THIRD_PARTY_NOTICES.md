# Third-party notices

The code and documentation of this repository are © 2026 Carmine Coppola and EASY
contributors under the BSD 3-Clause License (see `LICENSE`). That licence does **not**
cover the third-party material below, whose own terms continue to apply.

## Detection model

`runtime/models/easy_v3_aboships_640.onnx` is a YOLOv8n model trained and exported with
**Ultralytics** (AGPL-3.0, or an Ultralytics enterprise licence; the ONNX metadata
records it) on SMD, SeaShips and **ABOships** (CC BY 4.0, Åbo Akademi University:
attribution required). The dashboard loads it with ONNX Runtime only and does not
import Ultralytics. Treat the weights as AGPL-3.0 material with the ABOships
attribution, and confirm the terms with the upstream owners before any commercial or
redistributed use (good-faith summary, not legal advice). Provenance, metrics and
checksum: the [model repository](https://github.com/carminecoppola/easy-maritime-awareness)
and its `models/MODEL_CARD.md`.

## Sample images

`runtime/replay/test_inference/` holds two images from the **SeaShips** dataset
(Shao et al., IEEE TMM 2018), used for tests and demos. Their terms are those of the
SeaShips dataset.

## Frontend code adapted from other projects

- `frontend/src/components/ui/loader.tsx`: adapted from the Aceternity UI loader
  (https://ui.aceternity.com/components/loader).
- The `easy-shimmer` text effect in `frontend/src/styles/global.css` follows the
  shimmer component of beautifului (https://www.beautifului.dev/r/shimmer.json).

## Runtime dependencies

Installed from PyPI and npm, each under its own licence (mostly MIT, BSD and Apache-2.0):
Flask, psutil, Pillow, NumPy, ONNX Runtime, OpenCV (headless), PyYAML; React, React
Router, Vite, Tailwind CSS, clsx, tailwind-merge, Vitest, Testing Library and Playwright.
`frontend/package-lock.json` and `requirements.txt` list the exact packages.
