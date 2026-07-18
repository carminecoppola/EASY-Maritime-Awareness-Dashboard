from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from detection_manager import DetectionManager
from event_manager import EventManager


class RuntimePersistenceTests(unittest.TestCase):
    def test_detection_frame_is_persisted_once_and_events_are_batched(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir, patch("detection_manager.atomic_write_json") as write_json:
            event_manager = Mock()
            manager = DetectionManager(Path(temp_dir), event_manager=event_manager)
            write_json.reset_mock()

            manager.record_inference_result(
                {
                    "ok": True,
                    "source": "REPLAY_FOLDER",
                    "source_label": "Replay Folder",
                    "image_path": "/tmp/frame.jpg",
                    "updated_at": "2026-07-18T10:00:00Z",
                    "detections": [
                        {"class_name": "ship", "confidence": 0.9, "bbox": [1, 2, 3, 4]},
                        {"class_name": "boat", "confidence": 0.8, "bbox": [5, 6, 7, 8]},
                    ],
                }
            )

            self.assertEqual(write_json.call_count, 2)
            event_manager.record_detections.assert_called_once()
            self.assertEqual(len(event_manager.record_detections.call_args.args[0]), 2)

    def test_event_frame_syncs_only_the_affected_session_once(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir, patch("event_manager.atomic_write_json") as write_json:
            manager = EventManager(Path(temp_dir))
            write_json.reset_mock()

            records = manager.record_detections(
                [
                    {"id": "det-1", "class_name": "ship", "session_id": "session-a", "source": "replay"},
                    {"id": "det-2", "class_name": "boat", "session_id": "session-a", "source": "replay"},
                ]
            )

            self.assertEqual(len(records), 2)
            self.assertEqual(write_json.call_count, 3)


if __name__ == "__main__":
    unittest.main()
