from __future__ import annotations

import os
import unittest
from pathlib import Path

os.environ.setdefault("EASY_DASHBOARD_SKIP_GLOBAL_APP", "1")

from app import create_app


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class SnapshotPlaceholderGuardTests(unittest.TestCase):
    """Regression: a failed capture (no real frame available) used to be
    saved to the snapshot archive as if it were a genuine photo — a
    placeholder JPEG ("RGB_CAM_LEFT DETECTED — camera detected and ready" /
    "THERMAL STARTING — Waiting for thermal stream") permanently visible in
    the Snapshots gallery with no indication it wasn't a real capture.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.app = create_app(run_startup_checks=False, start_runtime_services=False)
        cls.app.testing = True
        cls.client = cls.app.test_client()

    def test_rgb_capture_snapshot_does_not_save_a_failed_capture(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        save_calls = []
        original_save = runtime.snapshot_store.save
        runtime.snapshot_store.save = lambda *a, **k: (save_calls.append(1) or original_save(*a, **k))
        try:
            frame, ok, snapshot_info, meta = runtime.capture_snapshot(
                "rgb_left", lambda: (b"placeholder-bytes", False), {"feed": "rgb_left"}
            )
            self.assertFalse(ok)
            self.assertIsNone(snapshot_info)
            self.assertEqual(len(save_calls), 0, "a failed capture must never reach snapshot_store.save()")
        finally:
            runtime.snapshot_store.save = original_save

    def test_rgb_capture_snapshot_still_saves_a_real_capture(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        saved = {}
        original_save = runtime.snapshot_store.save

        def fake_save(feed, frame, meta):
            saved["called"] = True
            return {"filename": "x.jpg", "url": "/x", "download_url": "/x", "meta": meta}

        runtime.snapshot_store.save = fake_save
        original_record = runtime.acquisition_manager.record_snapshot
        runtime.acquisition_manager.record_snapshot = lambda **k: None
        try:
            frame, ok, snapshot_info, meta = runtime.capture_snapshot(
                "rgb_left", lambda: (b"real-jpeg-bytes", True), {"feed": "rgb_left"}
            )
            self.assertTrue(ok)
            self.assertIsNotNone(snapshot_info)
            self.assertTrue(saved.get("called"))
        finally:
            runtime.snapshot_store.save = original_save
            runtime.acquisition_manager.record_snapshot = original_record

    def test_thermal_snapshot_route_rejects_placeholder_status(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        original_snapshot = runtime.thermal.snapshot
        save_calls = []
        original_save = runtime.snapshot_store.save
        runtime.snapshot_store.save = lambda *a, **k: (save_calls.append(1) or original_save(*a, **k))
        runtime.thermal.snapshot = lambda: (b"placeholder-bytes", {"status": "STARTING"})
        try:
            response = self.client.post("/thermal/snapshot")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(len(save_calls), 0, "a STARTING/ERROR placeholder must never be saved")
        finally:
            runtime.thermal.snapshot = original_snapshot
            runtime.snapshot_store.save = original_save

    def test_thermal_snapshot_route_saves_a_real_capture(self) -> None:
        runtime = self.app.easy_dashboard_runtime
        original_snapshot = runtime.thermal.snapshot
        original_save = runtime.snapshot_store.save
        original_record = runtime.acquisition_manager.record_snapshot
        runtime.thermal.snapshot = lambda: (b"real-thermal-bytes", {"status": "REAL"})
        runtime.snapshot_store.save = lambda feed, frame, meta: {
            "filename": "t.jpg",
            "url": "/t",
            "download_url": "/t",
            "meta": meta,
        }
        runtime.acquisition_manager.record_snapshot = lambda **k: None
        try:
            response = self.client.post("/thermal/snapshot")
            self.assertEqual(response.status_code, 200)
        finally:
            runtime.thermal.snapshot = original_snapshot
            runtime.snapshot_store.save = original_save
            runtime.acquisition_manager.record_snapshot = original_record


if __name__ == "__main__":
    unittest.main()
