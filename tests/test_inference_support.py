from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from inference_config import load_runtime_config, resolve_runtime_path
from inference_results import format_detections


class InferenceConfigurationTests(unittest.TestCase):
    def test_loads_json_and_records_source_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "inference.json"
            path.write_text(json.dumps({"model": {"type": "onnx"}}), encoding="utf-8")
            config = load_runtime_config(path)

        self.assertEqual(config["model"]["type"], "onnx")
        self.assertEqual(config["_loaded_from"], str(path))

    def test_runtime_paths_are_absolute(self) -> None:
        self.assertTrue(resolve_runtime_path("runtime/models/model.onnx").is_absolute())


class InferenceResultTests(unittest.TestCase):
    def test_preserves_public_detection_fields(self) -> None:
        detection = SimpleNamespace(
            class_id=1,
            class_name="ship",
            confidence=0.81861234,
            box_xyxy=(10.123, 20.456, 30.789, 40.111),
        )
        frame = SimpleNamespace(
            frame_id="frame-1",
            source_type="live_rgb",
            source_name="rgb_left",
            session_id="session-1",
        )

        payload = format_detections([detection], frame=frame)[0]

        self.assertEqual(payload["class_name"], "ship")
        self.assertEqual(payload["confidence"], 0.818612)
        self.assertEqual(payload["box_xyxy"], [10.12, 20.46, 30.79, 40.11])
        self.assertEqual(payload["frame_id"], "frame-1")
        self.assertTrue(payload["id"].startswith("det-"))


if __name__ == "__main__":
    unittest.main()
