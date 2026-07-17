from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from acquisition_manager import AcquisitionManager
from dataset_exporter import DatasetExporter
from session_manager import SessionManager


class SessionDatasetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.sessions_root = self.root / "sessions"
        self.exports_root = self.root / "exports"
        self.session_manager = SessionManager(self.sessions_root, hostname="test-host")
        self.acquisition = AcquisitionManager(session_manager=self.session_manager)
        self.exporter = DatasetExporter(session_manager=self.session_manager, export_root=self.exports_root)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _snapshot(self, feed: str, created_ts: float) -> dict:
        path = self.root / f"{feed}.jpg"
        path.write_bytes(f"test-{feed}".encode("utf-8"))
        return {
            "source": feed.upper(),
            "path": str(path),
            "url": f"/snapshots/{feed}/{path.name}",
            "filename": path.name,
            "created_ts": created_ts,
            "size_bytes": path.stat().st_size,
        }

    def test_snapshot_without_session_is_not_recorded(self) -> None:
        result = self.acquisition.record_snapshot(
            feed="rgb_left",
            snapshot=self._snapshot("rgb_left", 100.0),
            meta={"capture_ok": True},
        )
        self.assertTrue(result["ok"])
        self.assertFalse(result["recorded"])

    def test_synchronized_capture_validates_and_exports(self) -> None:
        started = self.session_manager.start_session(mode="capture", operator="test")
        session = started["session"]
        session_id = session["session_id"]
        capture_set_id = "capture-test-001"

        rgb_result = self.acquisition.record_snapshot(
            feed="rgb_left",
            snapshot=self._snapshot("rgb_left", 100.0),
            meta={"capture_ok": True, "capture_set_id": capture_set_id},
        )
        thermal_result = self.acquisition.record_snapshot(
            feed="thermal",
            snapshot=self._snapshot("thermal", 100.2),
            meta={"capture_ok": True, "capture_set_id": capture_set_id, "status": "REAL"},
        )
        self.assertTrue(rgb_result["recorded"])
        self.assertTrue(thermal_result["recorded"])

        manifest = self.session_manager.read_manifest(session_id)
        self.assertEqual(manifest["counts"]["items"], 2)
        self.assertEqual(manifest["counts"]["samples"], 1)
        self.assertEqual(manifest["counts"]["synchronized_samples"], 1)

        validation = self.exporter.validate(session_id)
        self.assertTrue(validation["valid"])
        self.assertEqual(validation["valid_samples"], 1)

        exported = self.exporter.export(session_id, validation_percent=20)
        self.assertTrue(exported["ok"])
        archive = Path(exported["archive_path"])
        dataset_path = Path(exported["path"]) / "dataset.json"
        self.assertTrue(archive.is_file())
        self.assertTrue(dataset_path.is_file())
        dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
        self.assertEqual(dataset["counts"]["samples"], 1)
        self.assertEqual(dataset["counts"]["images"], 2)

        stopped = self.session_manager.stop_session()
        self.assertEqual(stopped["session"]["status"], "STOPPED")
        self.assertFalse(self.session_manager.status()["running"])


if __name__ == "__main__":
    unittest.main()
